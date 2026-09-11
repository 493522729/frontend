/**
 * 规则引擎类型契约（US-010）
 * ====================================================================
 * 简历用「规则引擎」亮点：把"if X then Y"做成可配置、可单测的纯函数链。
 * 真实后端把这部分用 drools / easy-rules 重做即可，前端形状保持兼容。
 *
 * 设计原则：
 *   - 条件 DSL 简单到「非技术人员能读懂」：一组 {字段, 操作符, 值}，AND 组合。
 *   - 动作是函数式 chain：每个动作一个 type + payload，按顺序应用，前一个改了字段后一个看到新值。
 *   - 纯函数 runRule(rule, txn) 返回 { matched, actions, modifiedTxn }，不写 store，方便单测。
 */
import type { TransactionType } from '@/enums/transaction'
import type { Transaction } from '@/types/transaction'

/** 条件字段：只支持「明面上的」字段，便于 UI 渲染下拉 */
export type RuleField
  = | 'note' // 备注关键词
    | 'amount' // 金额（分）
    | 'type' // 类型
    | 'counterparty' // 对方（note 中提取，目前简化用 note 代替）
    | 'source' // 来源

/** 操作符：每个字段支持的子集在 UI 层做约束 */
export type RuleOperator
  = | 'contains' // 字符串包含
    | 'equals' // 相等
    | 'gt' // 大于
    | 'lt' // 小于
    | 'gte'
    | 'lte'
    | 'startsWith'

/** 单条条件 */
export interface RuleCondition {
  field: RuleField
  op: RuleOperator
  value: string | number
}

/** 动作类型 */
export type RuleActionType
  = | 'setCategory' // 改分类
    | 'appendNote' // 备注后追加
    | 'addTag' // 备注前加 #tag（空格分隔）
    | 'notify' // 弹通知（仅 UI 层执行，纯函数只标记 'notified'）

export interface RuleAction {
  type: RuleActionType
  /**
   * 各类动作需要的载荷：
   *  - setCategory: { categoryId: number }
   *  - appendNote: { suffix: string }
   *  - addTag: { tag: string }
   *  - notify: { message: string }
   */
  payload: Record<string, string | number>
}

/** 触发时机 */
export type RuleTrigger = 'onSave' // 交易保存后跑（最常用）

/** 规则主结构 */
export interface Rule {
  id: number
  bookId: number | null // null = 全账本
  name: string
  /** 条件数组（AND 组合；OR 在 v2 用 conditionGroups 扩展） */
  conditions: RuleCondition[]
  actions: RuleAction[]
  trigger: RuleTrigger
  active: boolean
  createdAt: number
  updatedAt: number
}

/** 规则执行结果（纯函数返回） */
export interface RuleExecution {
  ruleId: number
  ruleName: string
  matched: boolean
  /** 命中的条件明细（调试用，UI 可折叠展示） */
  matchedConditions: RuleCondition[]
  /** 执行的动作（matched=false 时为空数组） */
  appliedActions: RuleAction[]
  /** 应用动作后的交易副本（matched=false = 原始交易） */
  modifiedTxn: Transaction
}

/** 创建/编辑规则入参（不带 id / 时间戳） */
export type RuleInput = Omit<Rule, 'id' | 'createdAt' | 'updatedAt'>

/** 类型约束辅助：金额操作符只能用金额单位 */
export const AMOUNT_OPERATORS: RuleOperator[] = ['equals', 'gt', 'lt', 'gte', 'lte']
export const STRING_OPERATORS: RuleOperator[] = ['contains', 'equals', 'startsWith']
export const TYPE_OPERATORS: RuleOperator[] = ['equals']

/** 操作符默认所需字段类型提示（用于 UI 校验） */
export function operatorsForField(field: RuleField): RuleOperator[] {
  if (field === 'amount')
    return AMOUNT_OPERATORS
  if (field === 'type' || field === 'source')
    return TYPE_OPERATORS
  return STRING_OPERATORS
}

/** 字段默认值（UI 选字段时自动填示例 value） */
export const FIELD_DEFAULTS: Record<RuleField, string> = {
  note: '星巴克',
  amount: '5000', // 50 元
  type: 'expense',
  counterparty: '美团',
  source: 'import',
}

/** 类型约束：UI select 可选值 */
export const RULE_FIELDS: { label: string, value: RuleField }[] = [
  { label: '备注', value: 'note' },
  { label: '金额（分）', value: 'amount' },
  { label: '类型', value: 'type' },
  { label: '对方', value: 'counterparty' },
  { label: '来源', value: 'source' },
]

export const RULE_ACTIONS: { label: string, value: RuleActionType, hint: string }[] = [
  { label: '修改分类', value: 'setCategory', hint: '改挂到指定分类' },
  { label: '追加备注', value: 'appendNote', hint: '在备注末尾追加文本' },
  { label: '加标签', value: 'addTag', hint: '在备注前加 #tag' },
  { label: '弹通知', value: 'notify', hint: '触发后弹通知（纯函数仅标记）' },
]

export const TRANSACTION_TYPE_OPTIONS: { label: string, value: TransactionType }[] = [
  { label: '支出', value: 'expense' },
  { label: '收入', value: 'income' },
  { label: '转账', value: 'transfer' },
]

/** 操作符中文映射（UI 下拉与摘要展示用，底层仍存英文 key） */
export const OPERATOR_LABELS: Record<RuleOperator, string> = {
  contains: '包含',
  equals: '等于',
  startsWith: '开头是',
  gt: '大于',
  lt: '小于',
  gte: '大于等于',
  lte: '小于等于',
}
