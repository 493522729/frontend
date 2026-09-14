<script setup lang="ts">
/**
 * 月度净增柱状图
 * ====================================================================
 * 用柱子而不是折线：净增是**每个月独立的发生额**（有正有负），
 * 折线会暗示「月与月之间连续变化」，语义是错的。
 *
 * 正负异色（攒下钱=正向色、净流出=负向色）是这张图唯一的重点，
 * 所以用 itemStyle 回调逐柱上色 —— 不要用单一色，否则一眼看不出哪几个月在漏财。
 */
import type { BarSeriesOption } from 'echarts/charts'
import type { GridComponentOption, TooltipComponentOption } from 'echarts/components'
import type { ComposeOption } from 'echarts/core'
import type { NetWorthPoint } from '@/types/stats'
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { useChartPalette } from '@/composables/useChartPalette'
import { axisMoneyLabel, ensureECharts, tooltipStyle, withAlpha } from '@/utils/echarts'
import { formatCents } from '@/utils/money'
import { monthLabel, parseMonth } from '@/utils/temporal'

const props = defineProps<{
  points: NetWorthPoint[]
}>()

ensureECharts()

/**
 * 柱体渐变：正柱向上长、负柱向下长，两者的「根部」都在 0 轴上
 *
 * ECharts 的渐变坐标系（global: false）绑的是**每根柱子自己的 bbox**，
 * y=0 是柱顶、y=1 是柱底。正柱的柱顶就是尖端，所以尖端浓、根部淡；
 * 负柱正好相反 —— 它的柱顶贴在 0 轴上、柱底才是尖端，所以要把渐变翻过来，
 * 否则会出现「所有柱子的浓端都朝上」，负柱看着像被截断了一截。
 */
function barFill(color: string, positive: boolean) {
  const [near, far] = positive ? [1, 0.66] : [0.66, 1]
  return {
    type: 'linear' as const,
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: withAlpha(color, near) },
      { offset: 1, color: withAlpha(color, far) },
    ],
  }
}

type BarOption = ComposeOption<BarSeriesOption | TooltipComponentOption | GridComponentOption>

const palette = useChartPalette()

const option = computed<BarOption>(() => {
  const p = palette.value
  return {
    tooltip: {
      trigger: 'axis',
      ...tooltipStyle(p),
      // 柱状图用 shadow 指示器：整列底色变深，比一条细线更容易对上「哪个月」
      axisPointer: { type: 'shadow', shadowStyle: { color: withAlpha(p.border, 0.4) } },
      formatter: (raw: unknown) => {
        const items = raw as { name: string, value: number, marker?: string }[]
        const first = items[0]
        if (!first)
          return ''
        const net = first.value
        const sign = net > 0 ? '+' : ''
        return [
          monthLabel(parseMonth(first.name)),
          `净增  ${sign}${formatCents(net, { withSymbol: true })}`,
        ].join('<br/>')
      },
    },
    grid: { left: 4, right: 12, top: 16, bottom: 0, containLabel: true },
    xAxis: {
      type: 'category',
      data: props.points.map(pt => `${Number(pt.month.slice(5))}月`),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: p.textSecondary, fontSize: 12 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: withAlpha(p.border, 0.7) } },
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: p.textSecondary, fontSize: 12, formatter: axisMoneyLabel },
    },
    series: [
      {
        name: '月度净增',
        type: 'bar',
        barMaxWidth: 22,
        /**
         * 逐柱给 itemStyle：把「正负异色」和「圆角朝哪」一起定下来
         *
         * 之所以不用 itemStyle.color 回调 —— 回调只能返回颜色，圆角仍是
         * series 级的一份配置；而正柱要 [6,6,0,0]（顶部圆角）、负柱要
         * [0,0,6,6]（底部圆角），写死任一个方向都会有一半柱子的圆角长在
         * 贴着 0 轴的那一端，看着像悬浮。逐项给 data 才分得开。
         */
        data: props.points.map(pt => ({
          value: pt.netChange,
          itemStyle: {
            color: barFill(pt.netChange >= 0 ? p.income : p.expense, pt.netChange >= 0),
            borderRadius: pt.netChange >= 0 ? [6, 6, 0, 0] : [0, 0, 6, 6],
          },
        })),
        emphasis: { focus: 'series' },
      },
    ],
  }
})
</script>

<template>
  <VChart class="monthly-bar" :option="option" autoresize />
</template>

<style scoped lang="scss">
.monthly-bar {
  width: 100%;
  height: 280px;
}
</style>
