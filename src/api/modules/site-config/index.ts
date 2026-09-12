import type { SiteConfig, SiteConfigUpdate } from '@/types/site-config'
import { http } from '@/api/request'

/**
 * 站点配置 API：备案信息 / 全局页脚文案
 */

/** 获取当前站点配置 */
export function getSiteConfig(): Promise<SiteConfig> {
  return http.get<SiteConfig>('/site-config')
}

/** 更新站点配置 */
export function updateSiteConfig(input: SiteConfigUpdate): Promise<SiteConfig> {
  return http.put<SiteConfig>('/site-config', input)
}
