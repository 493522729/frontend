import AutoImport from 'unplugin-auto-import/vite'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'

/**
 * 自动导入：Vue / Router / Pinia / VueUse API + 项目 composables
 *
 * 刻意只自动导入「无业务语义」的 API 与 composables，
 * 业务组件（components/business）不在此列，一律显式 import —— 更好读、更好跳转。
 */
export function autoImport() {
  return AutoImport({
    imports: [
      'vue',
      'vue-router',
      'pinia',
      '@vueuse/core',
    ],
    dts: 'src/auto-imports.d.ts',
    dirs: ['src/composables'],
    // Naive UI 的函数式 API（useMessage / useDialog ...）按需导入
    resolvers: [NaiveUiResolver()],
    // 让 <template> 里也能直接用，不必在 script 里再 import 一次
    vueTemplate: true,
    eslintrc: { enabled: false },
  })
}
