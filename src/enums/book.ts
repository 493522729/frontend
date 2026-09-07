/**
 * 账本领域枚举
 * ====================================================================
 * 账本是「独立记账空间」（PRD 术语表）：同一笔钱在不同账本里互不干涉。
 * 类型只影响展示（图标 / 语义色），**不影响统计口径** —— 任何账本都是
 * 同样的收/支/转账三件套。
 */

/** 账本类型 */
export const BOOK_TYPES = ['daily', 'renovation', 'travel', 'business', 'family'] as const
export type BookType = (typeof BOOK_TYPES)[number]

/** 账本类型元信息（中文 / emoji 图标 / 语义色 token） */
export const BOOK_TYPE_META: Record<BookType, { label: string, icon: string, color: string }> = {
  daily: { label: '日常', icon: '🏠', color: 'var(--lz-primary-600)' },
  renovation: { label: '装修', icon: '🔨', color: 'var(--lz-warning)' },
  travel: { label: '旅行', icon: '✈️', color: 'var(--lz-success)' },
  business: { label: '生意', icon: '💼', color: 'var(--lz-info, var(--lz-primary-600))' },
  family: { label: '家庭', icon: '👨‍👩‍👧', color: 'var(--lz-danger)' },
}
