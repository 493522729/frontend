/**
 * localStorage key 集中管理
 * 命名空间 `laozhao:` 前缀，避免与其他应用 / 脚本注入的 key 冲突
 */
export const STORAGE_KEYS = {
  /** Pinia 持久化命名空间 */
  piniaPrefix: 'laozhao:',
  /** 表格列配置（key 含页面路径，如 laozhao:columns:/transaction） */
  columnsPrefix: 'laozhao:columns:',
  /** 主题锁定模式 */
  themeMode: 'theme-mode',
  /** 登录态（accessToken + refreshToken）持久化 key */
  auth: 'laozhao:auth',
  /** 快速记账默认值记忆（上次分类/账户）持久化 key */
  quickEntry: 'laozhao:quick-entry',
  /** 当前账本（US-005：刷新后仍停在原来那本） */
  book: 'laozhao:book',
} as const
