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
import { axisMoneyLabel, ensureECharts, tooltipStyle } from '@/utils/echarts'
import { formatCents } from '@/utils/money'
import { monthLabel, parseMonth } from '@/utils/temporal'

const props = defineProps<{
  points: NetWorthPoint[]
}>()

ensureECharts()

type BarOption = ComposeOption<BarSeriesOption | TooltipComponentOption | GridComponentOption>

const palette = useChartPalette()

const option = computed<BarOption>(() => {
  const p = palette.value
  return {
    tooltip: {
      trigger: 'axis',
      ...tooltipStyle(p),
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
        name: '月度净增',
        type: 'bar',
        barMaxWidth: 26,
        // 圆角只给上方：柱子从 0 轴长出，底部圆角会脱离基线显得浮空
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          // 回调参数用宽类型接：echarts 的 CallbackDataParams.value 可能是
          // 字符串 / 日期 / null（业务上不会，但类型是这么声明的），收窄成 number 会编译不过
          color: (params: { value?: unknown }) =>
            Number(params.value ?? 0) >= 0 ? p.income : p.expense,
        },
        data: props.points.map(pt => pt.netChange),
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
