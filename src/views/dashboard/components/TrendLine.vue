<script setup lang="ts">
/**
 * 近 6 月收支趋势折线（PRD 8.1）
 * ====================================================================
 * 双线：收入（绿）/ 支出（红），hover 显示该月精确值。
 *
 * 四个取舍：
 *   - x 轴只显示「9月」，完整「2026年9月」放 tooltip —— 轴标签太长会互相挤掉，
 *     而跨年时真正需要年份的场景是看详情，tooltip 里给全就够了
 *   - y 轴过万用「万」收口：6 位数字会把绘图区挤到只剩一半
 *   - 面积走**纵向渐变**而不是纯色 + opacity：纯色面积是一块平板，
 *     渐变才有「从线往下雾化」的层次，折线图贵不贵就看这一下
 *   - 平时不画数据点（6 个月 × 2 条 = 12 个圆点会把线打碎），
 *     hover 时才浮出来放大，读数交给 tooltip
 */
import type { LineSeriesOption } from 'echarts/charts'
import type { GridComponentOption, LegendComponentOption, TooltipComponentOption } from 'echarts/components'
import type { ComposeOption } from 'echarts/core'
import type { TrendPoint } from '@/types/stats'
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { useChartPalette } from '@/composables/useChartPalette'
import { areaFade, averageOrNull, axisMoneyLabel, ensureECharts, tooltipStyle, withAlpha } from '@/utils/echarts'
import { formatCents } from '@/utils/money'
import { monthLabel, parseMonth } from '@/utils/temporal'

const props = defineProps<{
  points: TrendPoint[]
}>()

ensureECharts()

type LineOption = ComposeOption<
  LineSeriesOption | TooltipComponentOption | LegendComponentOption | GridComponentOption
>

const palette = useChartPalette()

/** 近 6 月平均支出（分），作为参考线；不足 2 个月时没有「平均」可言，不画 */
const avgExpense = computed(() =>
  props.points.length < 2 ? null : averageOrNull(props.points.map(pt => pt.expense)),
)

const option = computed<LineOption>(() => {
  const p = palette.value
  const avg = avgExpense.value
  return {
    tooltip: {
      trigger: 'axis',
      ...tooltipStyle(p),
      axisPointer: { type: 'line', lineStyle: { color: withAlpha(p.border, 0.9), type: 'dashed' } },
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
      itemGap: 16,
      icon: 'roundRect',
      textStyle: { color: p.textSecondary, fontSize: 12 },
    },
    grid: { left: 4, right: 12, top: 40, bottom: 0, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: props.points.map(pt => `${Number(pt.month.slice(5))}月`),
      // 去掉轴线与刻度：只剩标签，横向的「表格感」就没了
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: p.textSecondary, fontSize: 12, margin: 14 },
    },
    yAxis: {
      type: 'value',
      // 4 条就够了，5 条会把绘图区切得太碎
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: withAlpha(p.border, 0.7) } },
      axisLabel: { color: p.textSecondary, fontSize: 12, formatter: axisMoneyLabel },
    },
    series: [
      {
        name: '收入',
        type: 'line',
        smooth: 0.35,
        symbol: 'circle',
        symbolSize: 7,
        showSymbol: false,
        lineStyle: { width: 2.5, color: p.income },
        itemStyle: { color: p.income, borderColor: p.card, borderWidth: 2 },
        areaStyle: { color: areaFade(p.income, 0.18) },
        emphasis: { focus: 'series', scale: 1.4 },
        data: props.points.map(pt => pt.income),
      },
      {
        name: '支出',
        type: 'line',
        smooth: 0.35,
        symbol: 'circle',
        symbolSize: 7,
        showSymbol: false,
        lineStyle: { width: 2.5, color: p.expense },
        itemStyle: { color: p.expense, borderColor: p.card, borderWidth: 2 },
        areaStyle: { color: areaFade(p.expense, 0.18) },
        emphasis: { focus: 'series', scale: 1.4 },
        // 月均参考线：一条虚线回答「这个月是不是花超了」，不必心算 6 个月均值
        markLine: avg == null
          ? undefined
          : {
              silent: true,
              symbol: 'none',
              label: {
                show: true,
                position: 'insideEndTop',
                distance: 4,
                formatter: `月均支出 ${formatCents(Math.round(avg), { withSymbol: true })}`,
                color: p.expense,
                fontSize: 11,
              },
              lineStyle: { color: withAlpha(p.expense, 0.45), type: 'dashed', width: 1 },
              data: [{ yAxis: avg }],
            },
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
