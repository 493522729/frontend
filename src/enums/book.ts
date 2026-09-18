/**
 * 账本领域枚举
 * ====================================================================
 * 账本是「独立记账空间」（PRD 术语表）：同一笔钱在不同账本里互不干涉。
 * 类型只影响展示（图标 / 语义色），**不影响统计口径** —— 任何账本都是
 * 同样的收/支/转账三件套。
 *
 * 另含共享账本相关枚举：scope（个人/共享）、成员角色（见 共享账本技术设计.md）。
 */

/**
 * 账本类型：预设 12 类 + 任意自定义字符串（后端 Book.type 是自由 String，不校验）。
 *  ⚠️ 与小程序端 `api/book.ts` 的 BOOK_TYPE_LABELS 保持同一套预设，两端加类要一起加。
 */
export const BOOK_TYPES = [
  'daily',
  'renovation',
  'travel',
  'business',
  'family',
  'study',
  'health',
  'pet',
  'baby',
  'wedding',
  'saving',
  'project',
] as const
/** 类型下拉里「自定义」选项的哨兵值（不会入库，入库的是用户填的文本） */
export const BOOK_TYPE_CUSTOM = '__custom__'
export type BookType = string

/** 账本类型元信息（中文 / emoji 图标 / 语义色 token）——仅覆盖预设类型 */
export const BOOK_TYPE_META: Record<string, { label: string, icon: string, color: string }> = {
  daily: { label: '日常', icon: '🏠', color: 'var(--lz-primary-600)' },
  renovation: { label: '装修', icon: '🔨', color: 'var(--lz-warning)' },
  travel: { label: '旅行', icon: '✈️', color: 'var(--lz-success)' },
  business: { label: '生意', icon: '💼', color: 'var(--lz-info, var(--lz-primary-600))' },
  family: { label: '家庭', icon: '👨‍👩‍👧', color: 'var(--lz-danger)' },
  study: { label: '学习', icon: '🎓', color: 'var(--lz-info, var(--lz-primary-600))' },
  health: { label: '健康', icon: '💊', color: 'var(--lz-success)' },
  pet: { label: '宠物', icon: '🐱', color: 'var(--lz-warning)' },
  baby: { label: '育儿', icon: '👶', color: 'var(--lz-danger)' },
  wedding: { label: '婚礼', icon: '💒', color: 'var(--lz-primary-600)' },
  saving: { label: '储蓄', icon: '💰', color: 'var(--lz-success)' },
  project: { label: '项目', icon: '📌', color: 'var(--lz-warning)' },
}

/** 类型展示名：预设→中文；自定义→原样；空→兜底（渲染处绝不能崩） */
export function bookTypeLabel(type: string | null | undefined): string {
  return (type && BOOK_TYPE_META[type]?.label) ?? (type || '未分类')
}

/** 类型展示图标：预设→默认 emoji；自定义/未知→通用账本图标 */
export function bookTypeIcon(type: string | null | undefined): string {
  return (type && BOOK_TYPE_META[type]?.icon) ?? '📒'
}

/** 账本归属范围：个人 / 共享（与 Book.type 用途分类正交，见设计文档 §2） */
export const BOOK_SCOPES = ['PERSONAL', 'SHARED'] as const
export type BookScope = (typeof BOOK_SCOPES)[number]

/** 账本范围元信息 */
export const BOOK_SCOPE_META: Record<BookScope, { label: string, icon: string }> = {
  PERSONAL: { label: '个人', icon: '🙋' },
  SHARED: { label: '共享', icon: '👥' },
}

/** 共享账本成员角色（与后端 BookMember 常量一致） */
export const MEMBER_ROLES = ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]

/** 成员角色元信息：中文标签 + 语义色（owner 金、admin 蓝、editor 绿、viewer 灰） */
export const MEMBER_ROLE_META: Record<MemberRole, { label: string, color: string }> = {
  OWNER: { label: '所有者', color: 'var(--lz-warning)' },
  ADMIN: { label: '管理员', color: 'var(--lz-info, var(--lz-primary-600))' },
  EDITOR: { label: '可记账', color: 'var(--lz-success)' },
  VIEWER: { label: '仅查看', color: 'var(--lz-text-secondary)' },
}
