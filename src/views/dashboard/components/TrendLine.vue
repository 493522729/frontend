<script setup lang="ts">
/**
 * 近 6 月收支趋势折线（PRD 8.1）
 * ====================================================================
 * 双线：收入（绿）/ 支出（红），hover 显示该月精确值。
 *
 * 两个取舍：
 *   - x 轴只显示「9月」，完整「2026年9月」放 tooltip —— 轴标签太长会互相挤掉，
 *     而跨年时真正需要年份的场景是看详情，tooltip 里给全就够了
 *   - y 轴过万用「万」收口：6 位数字会把绘图区挤到只剩一半
 */
import type { LineSeriesOption } from 'echarts/charts'
import type { GridComponentOption, LegendComponentOption, TooltipComponentOption } from 'echarts/components'
import type { ComposeOption } from 'echarts/core'
import type { TrendPoint } from '@/types/stats'
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { formatCents } from '@/utils/money'
import { monthLabel, parseMonth } from '@/utils/temporal'
import { ensureECharts } from '../_echarts'
import { useChartPalette } from '../composables/useChartPalette'

const props = defineProps<{
  points: TrendPoint[]
}>()

ensureECharts()

type LineOption = ComposeOption<
  LineSeriesOption | TooltipComponentOption | LegendComponentOption | GridComponentOption
>

const palette = useChartPalette()

/** y 轴标签：分 → 元，过万收口成「x.x万」 */
function axisLabelFromCents(cents: number): string {
  const yuan = Math.round(cents / 100)
  if (Math.abs(yuan) >= 10_000)
    return `${(yuan / 10_000).toFixed(1)}万`
  return String(yuan)
}

const option = computed<LineOption>(() => {
  const p = palette.value
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: p.card,
      borderColor: p.border,
      borderWidth: 1,
      textStyle: { color: p.text, fontSize: 12 },
      axisPointer: { type: 'line', lineStyle: { color: p.border } },
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
      axisLabel: { color: p.textSecondary, fontSize: 12, formatter: axisLabelFromCents },
    },
    series: [
      {
        name: '收入',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: p.income },
        itemStyle: { color: p.income },
        areaStyle: { color: p.income, opacity: 0.08 },
        data: props.points.map(pt => pt.income),
      },
      {
        name: '支出',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: p.expense },
        itemStyle: { color: p.expense },
        areaStyle: { color: p.expense, opacity: 0.08 },
        data: props.points.map(pt => pt.expense),
      },
    ],
  }
})
</script>

<template>
  <VChart class="trend-line" :option="option" autoresize />
</template>

<style scoped lang="scss">
.trend-line {
  width: 100%;
  height: 300px;
}
</style>
