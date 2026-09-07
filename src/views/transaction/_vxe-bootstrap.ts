/**
 * vxe-table 局部注册器（架构 1.3 节实现）
 * ====================================================================
 * 架构文档明确要求：vxe-table 体积大，**只在交易大表页异步加载**，
 * 不能在 main.ts 全局注册（会把 700KB+ 打进主 chunk，破坏首屏预算）。
 *
 * 实现策略：
 *   - 在交易页 setup 时通过 `ensureVxeTable(app)` 注册到当前页面所在 app
 *   - 用闭包变量做幂等：多次调用只注册一次
 *   - 体积落在「交易大表」异步 chunk，其他页面（包括登录页、仪表盘）完全不感知
 *
 * 主题同步：
 *   vxe-table 的明暗切换 = html 上的 data-vxe-ui-theme 属性
 *   （暗色变量集内置在 style.css 的 [data-vxe-ui-theme=dark] 块）。
 *   但 components.js 在模块加载时写死 setTheme('light')，暗色下表格恒为白底，
 *   所以这里订阅全站 isDark 持续纠正。品牌色对齐见 styles/vxe.scss。
 */
import type { App } from 'vue'
import { watchEffect } from 'vue'
import VXETable, { setTheme } from 'vxe-table'
import { useAppStore } from '@/stores/modules/app'
import 'vxe-table/lib/style.css'

let installed = false

export function ensureVxeTable(app: App): void {
  if (!installed) {
    app.use(VXETable)
    installed = true
  }

  // 跟随全站主题。watchEffect 注册在调用方（交易页）组件作用域：
  // 进页面立即同步一次 + 之后实时跟随切换，离开页面自动清理，不会泄漏。
  const appStore = useAppStore()
  watchEffect(() => {
    setTheme(appStore.isDark ? 'dark' : 'light')
  })
}
