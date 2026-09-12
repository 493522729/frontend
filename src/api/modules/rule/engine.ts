/**
 * 规则引擎纯函数（US-010）
 * ====================================================================
 * 从 mock.ts 抽出的无副作用核心逻辑，供「试算」UI 本地即时预览使用，
 * 不依赖任何 mock 数据，可独立单测。
 * 后端 /api/rules/preview 也复刻了这套语义（RuleController.runRule）。
 */
import type { Rule, RuleAction, RuleCondition, RuleExecution, RuleInput } from '@/types/rule'
import type { Transaction } from '@/types/transaction'

// ── 纯函数：单条条件评估 ──────────────────────────────────
function evalCondition(cond: RuleCondition, txn: Transaction): boolean {
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
      if (txn.note.includes(formatted))
        return txn
      return { ...txn, note: txn.note ? `${formatted} ${txn.note}` : formatted }
    }
    case 'notify':
      return txn
    default:
      return txn
  }
}

// ── 核心：跑一条规则 ───────────────────────────────────────
/**
 * 评估一条规则对一笔交易是否匹配，并依次应用动作。
 * - matched=false 时 appliedActions 为空，modifiedTxn 与原交易相同
 * - 动作按数组顺序应用，前一个改了字段后一个能看到新值（chain 语义）
 */
export function runRule(rule: Rule, txn: Transaction): RuleExecution {
  const matchedConditions = rule.conditions.filter(c => evalCondition(c, txn))
  const matched = matchedConditions.length === rule.conditions.length && rule.conditions.length > 0

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

// ── 核心：批量评估 + 合并 ──────────────────────────────────
/**
 * 给一笔交易跑所有规则，返回「最终改完的交易」。
 * 调用方应显式传入 rules（切真后端后不再依赖内存字典）。
 */
export function applyRulesToTransaction(
  txn: Transaction,
  rules: readonly Rule[] = [],
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

export type { RuleInput }
