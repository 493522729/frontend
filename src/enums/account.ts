/**
 * 账户领域枚举
 * ====================================================================
 * 6 类账户对应不同 UI 与统计口径（信用卡有额度、现金不计利息、转账不出入分类）。
 */

/** 账户类型 */
export const ACCOUNT_TYPES = ['cash', 'debit', 'credit', 'alipay', 'wechat', 'investment'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

/** 账户类型元信息（中文 / emoji 图标） */
export const ACCOUNT_TYPE_META: Record<AccountType, { label: string, icon: string }> = {
  cash: { label: '现金', icon: '💵' },
  debit: { label: '储蓄卡', icon: '🏦' },
  credit: { label: '信用卡', icon: '💳' },
  alipay: { label: '支付宝', icon: '💙' },
  wechat: { label: '微信', icon: '💚' },
  investment: { label: '投资账户', icon: '📈' },
}
