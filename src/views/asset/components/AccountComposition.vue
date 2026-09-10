<script setup lang="ts">
/**
 * 账户余额构成（横向条形）
 * ====================================================================
 * 回答「我的钱都放在哪」—— 净值曲线给的是总量，这张图给的是结构。
 *
 * 用横向条形而不是环图：
 *   - 账户余额**可能为负**（信用卡欠款），环图放不下负数，硬塞会算出负百分比
 *   - 账户名有长有短，横条能容纳「招商银行储蓄卡（6225）」这种名字，环图图例会撑破
 *
 * 零线（0 轴）在中间：正余额向右、欠款向左，一眼看出「哪些账户在拖后腿」。
 */
import type { BarSeriesOption } from 'echarts/charts'
import type { GridComponentOption, TooltipComponentOption } from 'echarts/components'
import type { ComposeOption } from 'echarts/core'
import type { AccountWithBalance } from '@/types/transaction'
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { useChartPalette } from '@/composables/useChartPalette'
import { axisMoneyLabel, ensureECharts, tooltipStyle } from '@/utils/echarts'
import { formatCents } from '@/utils/money'

const props = defineProps<{
  accounts: AccountWithBalance[]
}>()

ensureECharts()

type BarOption = ComposeOption<BarSeriesOption | TooltipComponentOption | GridComponentOption>

const palette = useChartPalette()

/**
 * 展示顺序：余额从高到低
 *
 * ECharts 的类目轴**自下而上**渲染，所以要把降序数组 reverse 一次，
 * 否则余额最大的账户会跑到最底下 —— 而「最大的是谁」正是这张图要说的第一件事。
 */
const rows = computed(() =>
  [...props.accounts]
    .sort((a, b) => b.balance - a.balance)
    .reverse(),
)

/** 图表高度随账户数变化：写死高度会在账户多时被压扁、账户少时留大片空白 */
const chartHeight = computed(() => Math.max(180, rows.value.length * 34 + 40))

const option = computed<BarOption>(() => {
  const p = palette.value
  return {
    tooltip: {
      trigger: 'item',
      ...tooltipStyle(p),
      formatter: (raw: unknown) => {
        const item = raw as { name: string, value: number, marker?: string, dataIndex: number }
        const acc = rows.value[item.dataIndex]
        if (!acc)
          return ''
        const lines = [
          `${acc.icon} ${acc.name}`,
          `余额  ${formatCents(acc.balance, { withSymbol: true })}`,
        ]
        // 信用卡单独给一行可用额度：余额为负时用户真正关心的是「还能刷多少」
        if (acc.type === 'credit')
          lines.push(`可用额度  ${formatCents(acc.creditLimit + acc.balance, { withSymbol: true })}`)
        return lines.join('<br/>')
      },
    },
    grid: { left: 4, right: 16, top: 8, bottom: 0, containLabel: true },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: p.border, type: 'dashed' } },
      axisLabel: { color: p.textSecondary, fontSize: 12, formatter: axisMoneyLabel },
    },
    yAxis: {
      type: 'category',
      data: rows.value.map(a => `${a.icon}  ${a.name}`),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: p.textSecondary, fontSize: 12 },
    },
    series: [
      {
        name: '账户余额',
        type: 'bar',
        barMaxWidth: 18,
        itemStyle: {
          borderRadius: 4,
          color: (params: { value?: unknown }) =>
            Number(params.value ?? 0) >= 0 ? p.income : p.expense,
        },
        label: {
          show: true,
          // 正余额标在柱子右端、欠款标在左端（柱子朝左），都朝外不会压住柱子
          position: 'right',
          fontSize: 12,
          color: p.textSecondary,
          formatter: (params: { value?: unknown }) =>
            formatCents(Number(params.value ?? 0), { withSymbol: true }),
        },
        data: rows.value.map(a => a.balance),
      },
    ],
  }
})
</script>

<template>
  <VChart class="account-composition" :style="{ height: `${chartHeight}px` }" :option="option" autoresize />
</template>

<style scoped lang="scss">
.account-composition {
  width: 100%;
}
</style>
