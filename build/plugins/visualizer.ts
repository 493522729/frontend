import { visualizer } from 'rollup-plugin-visualizer'

/**
 * 构建体积分析：pnpm build:report 后打开 dist/stats.html
 * 重点盯三个大户：echarts（必须按需引入）、element-plus（走自动导入）、vxe-table（只在交易大表页异步加载）
 */
export function visualizerPlugin() {
  return visualizer({
    filename: 'dist/stats.html',
    open: false,
    gzipSize: true,
    brotliSize: true,
    template: 'treemap',
  })
}
