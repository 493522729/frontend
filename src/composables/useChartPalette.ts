/**
 * 图表色板 composable
 * ====================================================================
 * 解决三个真实问题：
 *
 * 1. canvas 读不到 CSS 变量 —— 只能读一次值喂给 option（见 utils/echarts.ts）
 * 2. 暗色切换的时序 —— app store 用 watchEffect 改 <html class="dark">，
 *    图表组件如果在同一轮 pre flush 里读 getComputedStyle，可能读到旧值。
 *    所以这里用 flush: 'post' 的 watch，确保 class 落定后再重读。
 * 3. 金额配色偏好（系统设置里的 A 股习惯开关）—— 图表里的「收入/支出」色必须
 *    和页面上的金额、类型标签同源，否则切一次偏好，只有表格变色、图表还是老配色。
 *    取色统一走 settings.typeColor，本 composable 只负责把它解析成具体色值并监听变化。
 *
 * 组件里只要 `const palette = useChartPalette()`，然后把它放进 computed 依赖即可，
 * 暗色切换 / 改配色偏好后图表会自动用新色板重绘。
 */

import type { ChartPalette } from '@/utils/echarts'
import { nextTick, ref, watch } from 'vue'
import { useAppStore } from '@/stores/modules/app'
import { useSettingsStore } from '@/stores/modules/settings'
import { readPalette } from '@/utils/echarts'

export function useChartPalette() {
  const app = useAppStore()
  const settings = useSettingsStore()

  /** 收入/支出谁绿谁红由 store 决定（typeColor 内部映射语义色调 + token） */
  function build(): ChartPalette {
    return readPalette({
      income: settings.typeColor('income'),
      expense: settings.typeColor('expense'),
    })
  }

  const palette = ref<ChartPalette>(build())

  watch(
    [() => app.isDark, () => settings.moneyColorMode],
    () => {
      // post：等 <html class="dark"> 落定，读到的才是切换后的变量值
      void nextTick(() => {
        palette.value = build()
      })
    },
    { flush: 'post' },
  )

  return palette
}
