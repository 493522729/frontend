/**
 * 周期账单 mock 数据源（模板 + 衍生待确认项）
 * ====================================================================
 * 依赖方向单向：recurring/mock → transaction/mock（confirm 时写 Transaction）
 *                            → account/mock / category/mock（seed 解析真实 ID）
 * recurring 绝不反向被依赖。
 *
 * 待确认项是「派生」的：不落库，每次按「当前月 + 模板」现算。
 * 因为确认 / 驳回是逐月发生的，落库反而要对账——mock 阶段保持内存派生更直观。
 * 当月「已处理」（确认或驳回）状态用 _resolved 集合记录（key = 模板id|YYYY-MM）。
 *
 * 数据落地在内存（刷新重置）—— 这是 mock 的预期行为，真接口联调时整体替换本文件。
 */

import type {
  ConfirmRecurringOptions,
  PendingRecurring,
  RecurringTemplate,
} from '@/types/recurring'
import { mockListAccounts } from '@/api/modules/account/mock'
import { mockListCategories } from '@/api/modules/category/mock'
import { mockCreateTransaction } from '@/api/modules/transaction/mock'

/** 内存中的模板表 */
const _templates: RecurringTemplate[] = []
/** 全局自增 ID */
let _nextId = 1
/** 当月已处理的模板（确认或驳回都算），key = `${templateId}|${YYYY-MM}` */
const _resolved = new Set<string>()

/** 当前年月（YYYY-MM） */
function currentYM(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** 计划入账日：取起始日的「日」部分，溢出月份则夹到 28 号 */
function dueDateOf(t: RecurringTemplate, d: Date = new Date()): string {
  const day = Math.min(28, Number(t.startDate.slice(8, 10)) || 1)
  return `${currentYM(d)}-${String(day).padStart(2, '0')}`
}

/** 幂等种子：用真实分类 / 账户 ID 造两条日常账本的周期账单 */
function ensureSeed(): void {
  if (_templates.length > 0)
    return
  const cats = mockListCategories()
  const rentCat = cats.find(c => c.name === '居家')
  const salaryCat = cats.find(c => c.name === '工资')
  const accts = mockListAccounts(1)
  const debit = accts.find(a => a.type === 'debit') ?? accts[0]
  if (!rentCat || !salaryCat || !debit)
    return
  const firstOfMonth = `${currentYM()}-01`
  _templates.push(
    { id: _nextId++, bookId: 1, type: 'expense', amount: 300000, categoryId: rentCat.id, accountId: debit.id, note: '房租', startDate: firstOfMonth, autoConfirm: false, active: true },
    { id: _nextId++, bookId: 1, type: 'income', amount: 2500000, categoryId: salaryCat.id, accountId: debit.id, note: '工资', startDate: firstOfMonth, autoConfirm: false, active: true },
  )
}

/** 模板列表：不传 bookId = 全部账本；传了 = 仅该账本（含停用，供配置页编辑） */
export function mockListTemplates(bookId?: number): RecurringTemplate[] {
  ensureSeed()
  return bookId == null ? [..._templates] : _templates.filter(t => t.bookId === bookId)
}

export function mockCreateTemplate(input: Omit<RecurringTemplate, 'id'>): RecurringTemplate {
  ensureSeed()
  const created: RecurringTemplate = { ...input, id: _nextId++ }
  _templates.push(created)
  return created
}

export function mockUpdateTemplate(id: number, patch: Partial<Omit<RecurringTemplate, 'id'>>): RecurringTemplate {
  ensureSeed()
  const idx = _templates.findIndex(t => t.id === id)
  if (idx < 0)
    throw new Error(`RecurringTemplate ${id} not found`)
  const updated: RecurringTemplate = { ..._templates[idx]!, ...patch, id }
  _templates[idx] = updated
  return updated
}

export function mockDeleteTemplate(id: number): void {
  ensureSeed()
  const idx = _templates.findIndex(t => t.id === id)
  if (idx < 0)
    throw new Error(`RecurringTemplate ${id} not found`)
  _templates.splice(idx, 1)
  // 清掉该模板在所有月份的已处理记录，避免脏 key 残留
  for (const key of [..._resolved]) {
    if (key.startsWith(`${id}|`))
      _resolved.delete(key)
  }
}

export function mockToggleAutoConfirm(id: number): RecurringTemplate {
  ensureSeed()
  const t = _templates.find(x => x.id === id)
  if (!t)
    throw new Error(`RecurringTemplate ${id} not found`)
  t.autoConfirm = !t.autoConfirm
  return t
}

/**
 * 本月待确认项（派生，不落库）
 * 过滤条件：当前账本 + 启用 + 起始月 ≤ 本月 + 本月未处理。
 * 自动确认模板也返回（willAutoConfirm=true），由 store 在加载时自动入账（见 store.ensureLoaded）。
 */
export function mockGetPendingRecurring(bookId: number): PendingRecurring[] {
  ensureSeed()
  const ym = currentYM()
  return _templates
    .filter(t => t.bookId === bookId && t.active && t.startDate.slice(0, 7) <= ym)
    .filter(t => !_resolved.has(`${t.id}|${ym}`))
    .map(t => ({
      key: `${t.id}|${ym}`,
      templateId: t.id,
      bookId: t.bookId,
      type: t.type,
      amount: t.amount,
      categoryId: t.categoryId,
      accountId: t.accountId,
      note: t.note,
      dueDate: dueDateOf(t),
      willAutoConfirm: t.autoConfirm,
    }))
}

/**
 * 确认一笔：写入 Transaction（source='recurring'）+ 标记本月已处理。
 * 覆盖字段（金额 / 分类 / 账户 / 备注 / 入账日）可选，不传则用模板值。
 * 重复确认（同一模板同一月）抛错 —— 防止自动确认后又手动确认导致重复入账。
 */
export function mockConfirmRecurring(options: ConfirmRecurringOptions) {
  ensureSeed()
  const t = _templates.find(x => x.id === options.templateId && x.bookId === options.bookId)
  if (!t)
    throw new Error(`RecurringTemplate ${options.templateId} not found`)
  const key = `${t.id}|${currentYM()}`
  if (_resolved.has(key))
    throw new Error('本月已处理该周期账单')
  const txn = mockCreateTransaction({
    bookId: t.bookId,
    type: t.type,
    amount: options.amount ?? t.amount,
    currency: 'CNY',
    accountId: options.accountId ?? t.accountId,
    toAccountId: null,
    categoryId: options.categoryId ?? t.categoryId,
    transDate: options.transDate ?? dueDateOf(t),
    note: options.note ?? t.note,
    source: 'recurring',
  })
  _resolved.add(key)
  return txn
}

/** 驳回一笔：标记本月已处理，但不写流水 */
export function mockDismissRecurring(templateId: number, _bookId: number): void {
  ensureSeed()
  _resolved.add(`${templateId}|${currentYM()}`)
}
