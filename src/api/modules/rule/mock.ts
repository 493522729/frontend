/**
 * 规则引擎 mock（US-010）
 * ====================================================================
 * - 内存字典，刷新重置（mock 预期行为）
 * - 核心是纯函数 runRule(rule, txn)：无副作用，便于单测，UI 试算也走它
 * - CRUD 走最简单的 set/list，bookId 隔离等真实后端再说
 */
import type { Rule, RuleAction, RuleCondition, RuleExecution, RuleInput } from '@/types/rule'
import type { Transaction } from '@/types/transaction'
import { initAccounts } from '@/api/modules/account/mock'
import { mockGetAllTransactions } from '@/api/modules/transaction/mock'

// ── 内存表 ─────────────────────────────────────────────────
let _rules: Rule[] = []
let _nextId = 1

/** 幂等初始化：铺几条示例规则（演示用，真后端这里连数据库） */
function seedRules() {
  if (_rules.length > 0)
    return
  const now = Date.now()
  // 示例 1：备注含「星巴克」→ 分类到「咖啡」
  _rules.push({
    id: _nextId++,
    bookId: null,
    name: '星巴克 → 咖啡',
    conditions: [{ field: 'note', op: 'contains', value: '星巴克' }],
    actions: [{ type: 'setCategory', payload: { categoryId: 6 } }], // 6 是分类 mock 里「咖啡」之类
    trigger: 'onSave',
    active: true,
    createdAt: now,
    updatedAt: now,
  })
  // 示例 2：备注含「美团」→ 加 #外卖 标签
  _rules.push({
    id: _nextId++,
    bookId: null,
    name: '美团 → #外卖',
    conditions: [{ field: 'note', op: 'contains', value: '美团' }],
    actions: [{ type: 'addTag', payload: { tag: '外卖' } }],
    trigger: 'onSave',
    active: true,
    createdAt: now,
    updatedAt: now,
  })
  // 示例 3：金额 > 1 万 → 弹通知
  _rules.push({
    id: _nextId++,
    bookId: null,
    name: '大额支出提醒',
    conditions: [{ field: 'type', op: 'equals', value: 'expense' }, { field: 'amount', op: 'gt', value: 100000 }],
    actions: [{ type: 'notify', payload: { message: '检测到大额支出，请确认分类' } }],
    trigger: 'onSave',
    active: true,
    createdAt: now,
    updatedAt: now,
  })
}

seedRules()

// ── 纯函数：单条条件评估 ──────────────────────────────────
function evalCondition(cond: RuleCondition, txn: Transaction): boolean {
  // 简化：counterparty 暂时复用 note（业务上可从 note 解析对方）
  let fieldValue: string | number
  if (cond.field === 'note' || cond.field === 'counterparty')
    fieldValue = txn.note
  else if (cond.field === 'amount')
    fieldValue = txn.amount
  else if (cond.field === 'type')
    fieldValue = txn.type
  else if (cond.field === 'source')
    fieldValue = txn.source
  else
    return false

  const target = cond.value
  const s = String(fieldValue)
  switch (cond.op) {
    case 'contains':
      return s.includes(String(target))
    case 'equals':
      return fieldValue === target
    case 'gt':
      return Number(fieldValue) > Number(target)
    case 'lt':
      return Number(fieldValue) < Number(target)
    case 'gte':
      return Number(fieldValue) >= Number(target)
    case 'lte':
      return Number(fieldValue) <= Number(target)
    case 'startsWith':
      return s.startsWith(String(target))
    default:
      return false
  }
}

// ── 纯函数：单条动作应用 ──────────────────────────────────
function applyAction(action: RuleAction, txn: Transaction): Transaction {
  switch (action.type) {
    case 'setCategory': {
      const catId = Number(action.payload.categoryId)
      if (Number.isFinite(catId))
        return { ...txn, categoryId: catId }
      return txn
    }
    case 'appendNote': {
      const suffix = String(action.payload.suffix ?? '')
      if (!suffix)
        return txn
      return { ...txn, note: txn.note ? `${txn.note} ${suffix}` : suffix }
    }
    case 'addTag': {
      const tag = String(action.payload.tag ?? '').trim()
      if (!tag)
        return txn
      const formatted = `#${tag}`
      // 已存在则不重复加
      if (txn.note.includes(formatted))
        return txn
      return { ...txn, note: txn.note ? `${formatted} ${txn.note}` : formatted }
    }
    case 'notify':
      // 纯函数层面只标记；UI 层负责弹窗
      return txn
    default:
      return txn
  }
}

// ── 核心：跑一条规则 ───────────────────────────────────────
/**
 * 评估一条规则对一笔交易是否匹配，并依次应用动作。
 *
 * - `matched=false` 时 `appliedActions` 为空，`modifiedTxn` 与原交易相同
 * - 动作按数组顺序应用，前一个改了字段后一个能看到新值（chain 语义）
 * - 纯函数，不读 store，不写回
 */
export function runRule(rule: Rule, txn: Transaction): RuleExecution {
  const matchedConditions = rule.conditions.filter(c => evalCondition(c, txn))
  // match=any（OR）：任一条件满足即命中；缺省/all（AND）：需全部满足
  const matched = rule.match === 'any'
    ? matchedConditions.length > 0
    : matchedConditions.length === rule.conditions.length && rule.conditions.length > 0

  if (!matched) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      matched: false,
      matchedConditions: [],
      appliedActions: [],
      modifiedTxn: txn,
    }
  }

  let cur: Transaction = { ...txn }
  for (const a of rule.actions) {
    cur = applyAction(a, cur)
  }
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    matched: true,
    matchedConditions,
    appliedActions: [...rule.actions],
    modifiedTxn: cur,
  }
}

// ── 核心：批量评估 + 合并（冲突合并：后者覆盖前者字段） ───
/**
 * 给一笔交易跑所有启用的规则，返回「最终改完的交易」。
 * 冲突合并策略：后者规则的 setCategory 覆盖前者（顺序按 rule.id 升序）。
 * appendNote/addTag 是追加语义，不冲突。
 * notify 仅记录到 executions，不真正弹窗（由 UI 层消费）。
 */
export function applyRulesToTransaction(
  txn: Transaction,
  rules: readonly Rule[] = _rules.filter(r => r.active),
): { txn: Transaction, executions: RuleExecution[] } {
  let cur: Transaction = { ...txn }
  const executions: RuleExecution[] = []
  for (const rule of rules) {
    if (!rule.active)
      continue
    if (rule.trigger !== 'onSave')
      continue
    const exec = runRule(rule, cur)
    executions.push(exec)
    if (exec.matched)
      cur = exec.modifiedTxn
  }
  return { txn: cur, executions }
}

// ── CRUD（mock 标准接口） ──────────────────────────────────
export function mockListRules(bookId?: number): Rule[] {
  return bookId == null
    ? [..._rules]
    : _rules.filter(r => r.bookId == null || r.bookId === bookId)
}

export function mockCreateRule(input: RuleInput): Rule {
  const rule: Rule = { ...input, id: _nextId++, createdAt: Date.now(), updatedAt: Date.now() }
  _rules.unshift(rule)
  return rule
}

export function mockUpdateRule(id: number, patch: Partial<RuleInput>): Rule {
  const idx = _rules.findIndex(r => r.id === id)
  if (idx < 0)
    throw new Error(`Rule ${id} not found`)
  const updated: Rule = { ..._rules[idx]!, ...patch, id, updatedAt: Date.now() }
  _rules[idx] = updated
  return updated
}

export function mockDeleteRule(id: number): void {
  _rules = _rules.filter(r => r.id !== id)
}

/** 试算：拿最近一笔交易（或指定 id）跑所有规则，返回各规则的执行情况 */
export function mockPreviewRules(ruleId?: number, sampleTxnId?: number): RuleExecution[] {
  initAccounts()
  const rules = ruleId != null ? _rules.filter(r => r.id === ruleId) : _rules
  const txn: Transaction | undefined = sampleTxnId != null
    ? mockGetAllTransactions().find(t => t.id === sampleTxnId)
    : mockGetAllTransactions()[0]
  if (!txn)
    return []
  return rules.map(r => runRule(r, txn))
}
