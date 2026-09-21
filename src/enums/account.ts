/**
 * 账户领域枚举
 * ====================================================================
 * 6 类账户对应不同 UI 与统计口径（信用卡有额度、现金不计利息、转账不出入分类）。
 */

/** 预设账户类型（新建账户时的快捷项） */
export const ACCOUNT_TYPES = ['cash', 'debit', 'credit', 'alipay', 'wechat', 'investment'] as const
/** 预设类型字面量联合 */
export type PresetAccountType = (typeof ACCOUNT_TYPES)[number]

/**
 * 账户类型 —— **允许自定义**（如「花呗」「公积金」）。
 *
 * 后端 `Account.type` 是普通字符串、不校验枚举（`AccountController.create` 只 require 非空），
 * 所以自定义类型名可以直接落库。因此这里**不能**再是封闭联合类型：
 * 任意字符串都要能通过；取展示名/图标一律走下面的 `accountTypeLabel/accountTypeIcon`（带兜底）。
 *
 * ⚠️ 语义上只有预设 `credit` 是「信用卡」（额度条、欠款为负）；自定义类型按普通账户处理。
 */
export type AccountType = string

/** 预设类型元信息（中文 / emoji 图标） */
export const ACCOUNT_TYPE_META: Record<PresetAccountType, { label: string, icon: string }> = {
  cash: { label: '现金', icon: '💵' },
  debit: { label: '储蓄卡', icon: '🏦' },
  credit: { label: '信用卡', icon: '💳' },
  alipay: { label: '支付宝', icon: '💙' },
  wechat: { label: '微信', icon: '💚' },
  investment: { label: '投资账户', icon: '📈' },
}

/** 取预设元信息（自定义类型返回 undefined） */
function metaOf(type: string): { label: string, icon: string } | undefined {
  return (ACCOUNT_TYPE_META as Record<string, { label: string, icon: string } | undefined>)[type]
}

/**
 * 类型 → 展示名。
 * ⚠️ 自定义类型（如「花呗」）没有元信息 ⇒ 兜底用 type 本身，绝不返回 undefined。
 */
export function accountTypeLabel(type: string): string {
  return metaOf(type)?.label ?? type
}

/** 类型 → 默认图标。自定义类型兜底 💰 */
export function accountTypeIcon(type: string): string {
  return metaOf(type)?.icon ?? '💰'
}

/** 是否信用卡语义（只有预设 credit 有额度/欠款逻辑） */
export function isCreditType(type: string): boolean {
  return type === 'credit'
}
