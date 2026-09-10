/**
 * 图表色板 composable
 * ====================================================================
 * 解决两个真实问题：
 *
 * 1. canvas 读不到 CSS 变量 —— 只能读一次值喂给 option（见 utils/echarts.ts）
 * 2. 暗色切换的时序 —— app store 用 watchEffect 改 <html class="dark">，
 *    图表组件如果在同一轮 pre flush 里读 getComputedStyle，可能读到旧值。
 *    所以这里用 flush: 'post' 的 watch，确保 class 落定后再重读。
 *
 * 组件里只要 `const palette = useChartPalette()`，然后把它放进 computed 依赖即可，
 * 暗色切换后图表会自动用新色板重绘。
 */

import type { ChartPalette } from '@/utils/echarts'
import { nextTick, ref, watch } from 'vue'
import { useAppStore } from '@/stores/modules/app'
import { readPalette } from '@/utils/echarts'

export function useChartPalette() {
  const app = useAppStore()
  const palette = ref<ChartPalette>(readPalette())

  watch(
    () => app.isDark,
    () => {
      // post：等 <html class="dark"> 落定，读到的才是切换后的变量值
      void nextTick(() => {
        palette.value = readPalette()
      })
    },
    { flush: 'post' },
  )

  return palette
}
