/**
 * localStorage key 集中管理
 * 命名空间 `laozhao:` 前缀，避免与其他应用 / 脚本注入的 key 冲突
 */
export const STORAGE_KEYS = {
  /** Pinia 持久化命名空间 */
  piniaPrefix: 'laozhao:',
  /** 金额配色偏好（收入红/绿切换，见架构文档 3.1） */
  moneyColorMode: 'laozhao:money-color-mode',
  /** 表格列配置（key 含页面路径，如 laozhao:columns:/transaction） */
  columnsPrefix: 'laozhao:columns:',
  /** 主题锁定模式 */
  themeMode: 'theme-mode',
  /** 登录态（accessToken + refreshToken）持久化 key */
  auth: 'laozhao:auth',
} as const
