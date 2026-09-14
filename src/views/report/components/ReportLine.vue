<script setup lang="ts">
/**
 * 报表折线图（收入/支出双线，按时间桶）
 * ====================================================================
 * 与柱状图同数据不同形态：US-007 验收要求「饼/柱/折线可切换」，
 * 柱看单期对比、折线看走势，数据一样、语义不同，所以拆两个组件
 * 而不是塞一个 type 开关进 option（分支一多 option 就没人读得懂了）。
 */
import type { LineSeriesOption } from 'echarts/charts'
import type { GridComponentOption, LegendComponentOption, TooltipComponentOption } from 'echarts/components'
import type { ComposeOption } from 'echarts/core'
import type { ReportBucket } from '@/types/report'
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { useChartPalette } from '@/composables/useChartPalette'
import { areaFade, axisMoneyLabel, ensureECharts, tooltipStyle, withAlpha } from '@/utils/echarts'
import { formatCents } from '@/utils/money'

const props = defineProps<{
  buckets: ReportBucket[]
}>()

const emit = defineEmits<{
  select: [key: string]
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
      axisPointer: { type: 'line', lineStyle: { color: withAlpha(p.border, 0.9), type: 'dashed' } },
      formatter: (raw: unknown) => {
        const items = raw as { name: string, seriesName: string, value: number, marker?: string }[]
        if (!items.length)
          return ''
        const rows = items.map(
          i => `${i.marker ?? ''}${i.seriesName}  ${formatCents(i.value, { withSymbol: true })}`,
        )
        return [items[0]!.name, ...rows].join('<br/>')
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
      data: props.buckets.map(b => b.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: p.textSecondary, fontSize: 12, margin: 14 },
    },
    yAxis: {
      type: 'value',
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
        // 桶多了（按日/按周）会点出一排圆点把线打碎，hover 才浮出来
        showSymbol: props.buckets.length <= 12,
        lineStyle: { width: 2.5, color: p.income },
        itemStyle: { color: p.income, borderColor: p.card, borderWidth: 2 },
        areaStyle: { color: areaFade(p.income, 0.16) },
        emphasis: { focus: 'series', scale: 1.4 },
        data: props.buckets.map(b => b.income),
      },
      {
        name: '支出',
        type: 'line',
        smooth: 0.35,
        symbol: 'circle',
        symbolSize: 7,
        showSymbol: props.buckets.length <= 12,
        lineStyle: { width: 2.5, color: p.expense },
        itemStyle: { color: p.expense, borderColor: p.card, borderWidth: 2 },
        areaStyle: { color: areaFade(p.expense, 0.16) },
        emphasis: { focus: 'series', scale: 1.4 },
        data: props.buckets.map(b => b.expense),
      },
    ],
  }
})

function onClick(params: { dataIndex?: number | unknown }): void {
  const b = props.buckets[Number(params.dataIndex)]
  if (b)
    emit('select', b.key)
}
</script>

<template>
  <VChart class="report-line" :option="option" autoresize @click="onClick" />
</template>

<style scoped lang="scss">
.report-line {
  width: 100%;
  height: 340px;
  cursor: pointer;
}
</style>
