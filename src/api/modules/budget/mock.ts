/**
 * 预算 mock（US-006）
 * ====================================================================
 * 数据落地内存，写入真实生效（与 transaction mock 同一套约定）。
 * 花费（spent）**不落库**，由流水现算 —— 预算模块只管「配额」，
 * 「用了多少」永远以流水为准。这样记账 / 改账 / 删账后进度条不需要
 * 任何同步动作就是对的新值，不存在「预算表和流水表对不上」的可能。
 *
 * 真后端落地时：
 *   - 预算 CRUD 就是 budget 表的 CRUD
 *   - spent 是一条「当月支出 group by 分类」的 SQL，或物化视图
 */

import type { Budget, BudgetOverview, BudgetProgress, BudgetQuery, BudgetUpsertInput } from '@/types/budget'
import { sumCents } from '@/utils/money'
import { formatMonth, parseMonth, today } from '@/utils/temporal'
import { mockListCategories } from '../category/mock'
import { mockGetAllTransactions } from '../transaction/mock'

/** 总预算的伪分类 ID（types/budget.ts 的口径，这里再引一次避免循环依赖） */
export const TOTAL_BUDGET_CATEGORY_ID = 0

// ── 内存数据 ─────────────────────────────────────────────
let _budgets: Budget[] = []
let _nextId = 1

/**
 * 种子（按分类**名字**声明，初始化时查字典换 ID —— 不硬编码分类 ID，
 * 分类种子的顺序以后变了预算也不会错挂到别的分类头上）
 */
const SEEDS: Array<{ categoryName: string, amount: number }> = [
  { categoryName: '餐饮', amount: 200_000 }, // 2000 元 —— US-006 验收场景的原话
  { categoryName: '购物', amount: 150_000 },
  { categoryName: '交通', amount: 80_000 },
  { categoryName: '居家', amount: 100_000 },
  { categoryName: '娱乐', amount: 120_000 },
]

/**
 * 种子：给默认账本（id=1）近 3 个月铺一套演示预算。
 *
 * 只给「日常账本」铺：装修 / 旅行账本让用户自己建，切过去是空态，
 * 正好演示「空态引导新建」这条路径。
 */
function init(): void {
  if (_budgets.length > 0)
    return
  const categories = mockListCategories()
  const byName = new Map(categories.map(c => [c.name, c.id]))
  const current = formatMonth(today().toPlainYearMonth())
  const months = [2, 1, 0].map(back =>
    formatMonth(today().toPlainYearMonth().subtract({ months: back })),
  )
  for (const month of months) {
    for (const seed of SEEDS) {
      const categoryId = byName.get(seed.categoryName)
      if (categoryId == null)
        continue
      _budgets.push({
        id: _nextId++,
        bookId: 1,
        month,
        categoryId,
        amount: seed.amount,
      })
    }
  }
  // 当月总预算先设 5000 元：演示「总卡已设置 + 分类可自由加」的组合
  _budgets.push({
    id: _nextId++,
    bookId: 1,
    month: current,
    categoryId: TOTAL_BUDGET_CATEGORY_ID,
    amount: 500_000,
  })
}

// ── 花费现算 ─────────────────────────────────────────────

/** 某账本某月「分类 → 支出合计」（转账 categoryId=0 且 type=transfer，天然不算） */
function categoryExpenseOfMonth(bookId: number, month: string): Map<number, number> {
  const spent = new Map<number, number>()
  for (const t of mockGetAllTransactions(bookId)) {
    if (t.type !== 'expense' || !t.transDate.startsWith(month))
      continue
    spent.set(t.categoryId, (spent.get(t.categoryId) ?? 0) + t.amount)
  }
  return spent
}

/** 组装一条进度（spent 由调用方按口径算好传入，测试可以直接喂假值对照） */
function toProgress(
  budget: Budget,
  spent: number,
  meta: { name: string, icon: string, color: string },
): BudgetProgress {
  return {
    budget,
    categoryName: meta.name,
    categoryIcon: meta.icon,
    categoryColor: meta.color,
    spent,
    remaining: budget.amount - spent,
    // amount=0 的预算没有「百分比」概念，返回 0 而不是 Infinity/NaN
    percent: budget.amount > 0 ? Math.round((spent / budget.amount) * 1000) / 10 : 0,
  }
}

// ── 公共 API（被 index.ts 包装出网络延迟） ───────────────

/** 预算总览：总卡 + 分类卡一次拿全（PRD 8.5 的页面结构就是这两块） */
export function mockGetBudgetOverview(query: BudgetQuery = {}): BudgetOverview {
  init()
  const bookId = query.bookId ?? 1
  const month = query.month ?? formatMonth(today().toPlainYearMonth())

  const monthBudgets = _budgets.filter(b => b.bookId === bookId && b.month === month)
  const expenses = categoryExpenseOfMonth(bookId, month)
  const totalSpent = sumCents([...expenses.values()])

  // 分类元数据一次查齐：进度条要显示「图标 + 名称 + 分类色」，
  // 在这里回填好，页面和预警 toast 都不用再查字典
  const categoryMap = new Map(mockListCategories().map(c => [c.id, c]))
  const metaOf = (categoryId: number) => {
    const c = categoryMap.get(categoryId)
    return { name: c?.name ?? '未分类', icon: c?.icon ?? '📦', color: c?.color ?? '#94A3B8' }
  }

  // 总卡：没有设置总预算时给一条 amount=0 的进度（spent 照算，percent=0）
  const totalBudget = monthBudgets.find(b => b.categoryId === TOTAL_BUDGET_CATEGORY_ID)
    ?? { id: 0, bookId, month, categoryId: TOTAL_BUDGET_CATEGORY_ID, amount: 0 }

  const items = monthBudgets
    .filter(b => b.categoryId !== TOTAL_BUDGET_CATEGORY_ID)
    .map(b => toProgress(b, expenses.get(b.categoryId) ?? 0, metaOf(b.categoryId)))
    // 最危险的排最前：超支的 > 逼近阈值的 > 安心的
    .sort((a, b) => b.percent - a.percent)

  return {
    month,
    total: toProgress(totalBudget, totalSpent, { name: '总预算', icon: '📊', color: '#64748B' }),
    items,
  }
}

/**
 * 设置预算（幂等 upsert）：同「账本 + 月份 + 分类」只会有一条记录
 *
 * 幂等是刻意的：页面上「新建」和「修改金额」是两个入口，但落库应该
 * 是同一个动作，否则连点两次新建会出现两条同分类预算，进度条就不知道听谁的。
 */
export function mockUpsertBudget(input: BudgetUpsertInput): Budget {
  init()
  if (input.amount <= 0)
    throw new Error('预算金额必须大于 0')
  const existing = _budgets.find(
    b => b.bookId === input.bookId
      && b.month === input.month
      && b.categoryId === input.categoryId,
  )
  if (existing) {
    existing.amount = input.amount
    return existing
  }
  const created: Budget = { id: _nextId++, ...input }
  _budgets.push(created)
  return created
}

/** 删除预算（不存在时报错，让调用方能感知异常而不是默默成功） */
export function mockDeleteBudget(id: number): void {
  init()
  const idx = _budgets.findIndex(b => b.id === id)
  if (idx === -1)
    throw new Error('预算不存在或已被删除')
  _budgets.splice(idx, 1)
}

/** 朴素对照用：某账本某月某分类的当月支出（测试 + 保存后预警共用） */
export function mockCategorySpent(bookId: number, month: string, categoryId: number): number {
  init()
  return sumCents(
    mockGetAllTransactions(bookId)
      .filter(t => t.type === 'expense' && t.transDate.startsWith(month) && t.categoryId === categoryId)
      .map(t => t.amount),
  )
}

/** 测试专用：重置内存数据（vitest 隔离用，业务代码禁止调用） */
export function mockResetBudgets(): void {
  _budgets = []
  _nextId = 1
}

/** 月份参数的兜底归一：'2026-9' 这类脏输入格式化成 '2026-09' */
export function normalizeMonth(month?: string): string {
  if (!month)
    return formatMonth(today().toPlainYearMonth())
  return formatMonth(parseMonth(month))
}
