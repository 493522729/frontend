<script setup lang="ts">
/**
 * 净资产走势折线（资产趋势主页图）
 * ====================================================================
 * 三条序列：净资产（主色填充）/ 总资产（正向色）/ 负债（负向色），
 * 图例可单独关掉 —— 大多数时候用户只想看净值那一条。
 *
 * 两个刻意的选择：
 *   - 净资产用面积图：它是一条「家底的总量曲线」，填充后面积感 = 钱堆的高度，
 *     比单纯的线更能表达「变多变少」
 *   - x 轴只显示「9月」：跨年时才需要年份，放在 tooltip 里给全就够了，
 *     轴标签写「2026-09」会互相挤掉
 */
import type { LineSeriesOption } from 'echarts/charts'
import type { GridComponentOption, LegendComponentOption, TooltipComponentOption } from 'echarts/components'
import type { ComposeOption } from 'echarts/core'
import type { NetWorthPoint } from '@/types/stats'
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { useChartPalette } from '@/composables/useChartPalette'
import { axisMoneyLabel, ensureECharts, tooltipStyle } from '@/utils/echarts'
import { formatCents } from '@/utils/money'
import { monthLabel, parseMonth } from '@/utils/temporal'

const props = defineProps<{
  points: NetWorthPoint[]
}>()

ensureECharts()

type LineOption = ComposeOption<
  LineSeriesOption | TooltipComponentOption | LegendComponentOption | GridComponentOption
>

const palette = useChartPalette()

const option = computed<LineOption>(() => {
  const p = palette.value
  return {
    tooltip: {
      trigger: 'axis',
      ...tooltipStyle(p),
      formatter: (raw: unknown) => {
        const items = raw as { name: string, seriesName: string, value: number, marker?: string }[]
        if (!items.length)
          return ''
        const head = monthLabel(parseMonth(items[0]!.name))
        const rows = items.map(
          i => `${i.marker ?? ''}${i.seriesName}  ${formatCents(i.value, { withSymbol: true })}`,
        )
        return [head, ...rows].join('<br/>')
      },
    },
    legend: {
      top: 0,
      right: 0,
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { color: p.textSecondary, fontSize: 12 },
    },
    grid: { left: 4, right: 12, top: 36, bottom: 0, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: props.points.map(pt => `${Number(pt.month.slice(5))}月`),
      axisLine: { lineStyle: { color: p.border } },
      axisTick: { show: false },
      axisLabel: { color: p.textSecondary, fontSize: 12 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: p.border, type: 'dashed' } },
      axisLabel: { color: p.textSecondary, fontSize: 12, formatter: axisMoneyLabel },
    },
    series: [
      {
        name: '净资产',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2.5, color: p.primary },
        itemStyle: { color: p.primary },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${p.primary}44` },
              { offset: 1, color: `${p.primary}05` },
            ],
          },
        },
        data: props.points.map(pt => pt.netAssets),
      },
      {
        name: '总资产',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1.5, color: p.income, type: 'dashed' },
        itemStyle: { color: p.income },
        data: props.points.map(pt => pt.assets),
      },
      {
        name: '负债',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1.5, color: p.expense, type: 'dashed' },
        itemStyle: { color: p.expense },
        data: props.points.map(pt => pt.debt),
      },
    ],
  }
})
</script>

<template>
  <VChart class="net-worth-line" :option="option" autoresize />
</template>

<style scoped lang="scss">
.net-worth-line {
  width: 100%;
  height: 320px;
}
</style>
