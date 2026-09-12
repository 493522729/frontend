/**
 * 站点配置类型（备案信息 / 外观主题 / 金额配色）
 */
export type ThemeMode = 'light' | 'dark' | 'auto'
export type AmountColorMode = 'income-green' | 'income-red'

export interface SiteConfig {
  /** 是否展示全局页脚 */
  showFooter: boolean
  /** 备案号，如：京ICP备12345678号-1 */
  icpNo?: string
  /** 工信部备案查询链接 */
  icpLink?: string
  /** 页脚文案 */
  footerText?: string
  /** 站点默认外观主题：light / dark / auto（可作为站点级默认，个人手动切换会覆盖） */
  themeMode?: ThemeMode
  /** 金额配色模式：income-green（收入绿·支出红）/ income-red（收入红·支出绿，A 股习惯） */
  amountColorMode?: AmountColorMode
}

export type SiteConfigUpdate = Partial<SiteConfig>
