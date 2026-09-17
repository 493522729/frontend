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

  /**
   * 小程序订阅消息 · 「预算超 80%」模板 ID（微信 MP 后台申请到的）。
   * 小程序端会把它拉到本地用于 wx.requestSubscribeMessage，所以这里是两端唯一的真相源。
   * 留空 = 后端回退 `laozhao.mp.template-budget` 环境变量。
   */
  mpTemplateBudget?: string
  /** 小程序订阅消息 · 「月初补记提醒」模板 ID（同上，留空回退环境变量） */
  mpTemplateRemind?: string
}

export type SiteConfigUpdate = Partial<SiteConfig>
