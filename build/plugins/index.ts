import type { PluginOption } from 'vite'
import type { ViteEnv } from '../utils/env.ts'
import vue from '@vitejs/plugin-vue'
import vueDevtools from 'vite-plugin-vue-devtools'
import { autoImport } from './auto-import.ts'
import { components } from './components.ts'
import { compressionPlugin } from './compression.ts'
import { icons } from './icons.ts'
import { unocss } from './unocss.ts'
import { visualizerPlugin } from './visualizer.ts'

/**
 * 插件总入口
 *
 * vite.config.ts 里只留一行 createVitePlugins(...)，
 * 具体插件的取舍逻辑（哪些只在 build 生效）全部收敛在这里。
 *
 * @param env    类型化后的环境变量
 * @param isBuild 是否生产构建（`vite build` 时为 true）
 */
export function createVitePlugins(env: ViteEnv, isBuild: boolean): PluginOption[] {
  const plugins: PluginOption[] = [
    vue(),
    unocss(),
    autoImport(),
    components(),
    icons(),
  ]

  if (isBuild) {
    plugins.push(compressionPlugin())
    // 体积分析默认关，需要时跑 pnpm build:report
    if (env.VITE_REPORT)
      plugins.push(visualizerPlugin())
  }
  else {
    // Vue DevTools 只在开发时挂，不进生产包
    plugins.push(vueDevtools())
  }

  return plugins
}
