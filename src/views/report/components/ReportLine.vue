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
import { axisMoneyLabel, ensureECharts, tooltipStyle } from '@/utils/echarts'
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
      textStyle: { color: p.textSecondary, fontSize: 12 },
    },
    grid: { left: 4, right: 12, top: 36, bottom: 0, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: props.buckets.map(b => b.label),
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
        name: '收入',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: p.income },
        itemStyle: { color: p.income },
        areaStyle: { color: p.income, opacity: 0.06 },
        data: props.buckets.map(b => b.income),
      },
      {
        name: '支出',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: p.expense },
        itemStyle: { color: p.expense },
        areaStyle: { color: p.expense, opacity: 0.06 },
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
