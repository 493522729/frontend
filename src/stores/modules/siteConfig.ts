import type { SiteConfig, SiteConfigUpdate, ThemeMode } from '@/types/site-config'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref } from 'vue'
import { getSiteConfig, updateSiteConfig } from '@/api/modules/site-config'
import { useAppStore } from '@/stores/modules/app'

/**
 * 站点配置 store（备案信息 / 外观主题 / 金额配色）
 * ====================================================================
 * 数据来自后端，不持久化到 localStorage：
 *   - 后端是站点级配置的唯一直实来源；
 *   - 登录后全局页脚组件会自动拉取一次；
 *   - 设置页修改时即时保存并刷新缓存。
 *
 * 应用联动：
 *   - amountColorMode 由 settings store 的 toneFor 直接读取（决定收入/支出用 success/danger）；
 *   - themeMode 在 load/update 后通过 applyTheme() 同步给 app store（站点默认，个人手动选择会覆盖）。
 */
export const useSiteConfigStore = defineStore('siteConfig', () => {
  const config = ref<SiteConfig>({
    showFooter: true,
    icpNo: undefined,
    icpLink: undefined,
    // 初始不预置任何文案：加载前显示空页脚（而非过时的「备案中」），load() 后被后端值覆盖
    footerText: undefined,
    themeMode: undefined,
    amountColorMode: undefined,
    mpTemplateBudget: undefined,
    mpTemplateRemind: undefined,
  })
  const loading = ref(false)

  /** 把站点配置的 themeMode 同步给 app store（作为站点默认，用户本地手动选择优先） */
  function applyTheme() {
    const app = useAppStore()
    app.applySiteTheme((config.value.themeMode as ThemeMode) ?? 'auto')
  }

  /** 从后端拉取站点配置 */
  async function load() {
    loading.value = true
    try {
      const data = await getSiteConfig()
      config.value = {
        showFooter: data.showFooter ?? true,
        icpNo: data.icpNo,
        icpLink: data.icpLink,
        footerText: data.footerText,
        themeMode: data.themeMode,
        amountColorMode: data.amountColorMode,
        mpTemplateBudget: data.mpTemplateBudget,
        mpTemplateRemind: data.mpTemplateRemind,
      }
      applyTheme()
    }
    finally {
      loading.value = false
    }
  }

  /** 保存并更新本地缓存 */
  async function update(patch: SiteConfigUpdate) {
    const data = await updateSiteConfig(patch)
    config.value = {
      showFooter: data.showFooter ?? true,
      icpNo: data.icpNo,
      icpLink: data.icpLink,
      footerText: data.footerText,
      themeMode: data.themeMode,
      amountColorMode: data.amountColorMode,
      mpTemplateBudget: data.mpTemplateBudget,
      mpTemplateRemind: data.mpTemplateRemind,
    }
    applyTheme()
  }

  return { config, loading, load, update, applyTheme }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useSiteConfigStore, import.meta.hot))
