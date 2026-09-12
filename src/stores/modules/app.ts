import { usePreferredDark } from '@vueuse/core'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { STORAGE_KEYS } from '@/constants/storage-keys'

export type ThemeMode = 'light' | 'dark' | 'auto'

/**
 * 应用全局状态（setup store，架构文档 ADR-3）
 *
 * 只放「跨页面」的 UI 状态：侧边栏折叠、主题模式。
 * 页面自身的状态一律留在页面里 —— 页面态塞 Pinia 是后台项目最常见的腐化起点。
 *
 * 主题持久化走 localStorage（架构文档 3.4：默认跟随系统，手动选择后锁定），
 * 侧边栏折叠走 pinia-plugin-persistedstate，key 走 laozhao: 命名空间。
 */
export const useAppStore = defineStore('app', () => {
  // ── 主题 ──────────────────────────────────────────────
  const systemDark = usePreferredDark()

  /** 用户选择的模式；未选择过（首次访问）为 auto，跟随系统 */
  const storedMode = localStorage.getItem(STORAGE_KEYS.themeMode)
  const themeMode = ref<ThemeMode>(
    storedMode === 'light' || storedMode === 'dark' ? storedMode : 'auto',
  )

  /** 实际生效的暗色开关 */
  const isDark = computed(() =>
    themeMode.value === 'auto' ? systemDark.value : themeMode.value === 'dark',
  )

  // isDark 一变就同步 <html class="dark">；UnoCSS dark: 变体与 tokens.css 暗色档都挂在这个 class 上
  // （Naive 的暗色另由 n-config-provider 注入，见 src/App.vue / src/theme/naive.ts）
  watchEffect(() => {
    document.documentElement.classList.toggle('dark', isDark.value)
  })

  function setThemeMode(mode: ThemeMode) {
    themeMode.value = mode
    if (mode === 'auto')
      localStorage.removeItem(STORAGE_KEYS.themeMode)
    else
      localStorage.setItem(STORAGE_KEYS.themeMode, mode)
  }

  /**
   * 应用站点级默认主题（来自后端 SiteConfig）。
   * 仅当用户未手动选择过主题（localStorage 无记录）时才生效，
   * 已手动选过则保留个人偏好，站点默认不覆盖。
   */
  function applySiteTheme(mode: ThemeMode) {
    if (!localStorage.getItem(STORAGE_KEYS.themeMode))
      themeMode.value = mode
  }

  /** 主题切换按钮：当前生效暗色则切到 light，否则切到 dark */
  function toggleDark() {
    setThemeMode(isDark.value ? 'light' : 'dark')
  }

  // ── 侧边栏 ────────────────────────────────────────────
  const sidebarCollapsed = ref(false)
  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  return {
    isDark,
    themeMode,
    setThemeMode,
    applySiteTheme,
    toggleDark,
    sidebarCollapsed,
    toggleSidebar,
  }
}, {
  persist: {
    key: 'laozhao:app',
    pick: ['sidebarCollapsed'],
  },
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useAppStore, import.meta.hot))
