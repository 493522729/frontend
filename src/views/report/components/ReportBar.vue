<script setup lang="ts">
/**
 * 报表柱状图（收入/支出双系列，按时间桶）
 * ====================================================================
 * 点柱子 = 下钻该时间桶的明细（US-007 验收：底部可下钻到明细）。
 * 点击事件由 VChart 的 click 冒出来，这里只做 dataIndex → 桶 key 的换算。
 */
import type { BarSeriesOption } from 'echarts/charts'
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
  /** 点了某根柱子，参数是该时间桶的 key（下钻锚点） */
  select: [key: string]
}>()

ensureECharts()

type BarOption = ComposeOption<
  BarSeriesOption | TooltipComponentOption | LegendComponentOption | GridComponentOption
>

const palette = useChartPalette()

const option = computed<BarOption>(() => {
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
        type: 'bar',
        barMaxWidth: 22,
        itemStyle: { color: p.income, borderRadius: [4, 4, 0, 0] },
        data: props.buckets.map(b => b.income),
      },
      {
        name: '支出',
        type: 'bar',
        barMaxWidth: 22,
        itemStyle: { color: p.expense, borderRadius: [4, 4, 0, 0] },
        data: props.buckets.map(b => b.expense),
      },
    ],
  }
})

/** ECharts 的 value 可能是 string/Date 等宽类型，收窄成索引用 */
function bucketKeyOfIndex(index: number | unknown): string | null {
  const b = props.buckets[Number(index)]
  return b?.key ?? null
}

function onClick(params: { dataIndex?: number | unknown }): void {
  const key = bucketKeyOfIndex(params.dataIndex)
  if (key)
    emit('select', key)
}
</script>

<template>
  <VChart class="report-bar" :option="option" autoresize @click="onClick" />
</template>

<style scoped lang="scss">
.report-bar {
  width: 100%;
  height: 340px;
  cursor: pointer;
}
</style>
