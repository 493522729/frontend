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
import { axisMoneyLabel, ensureECharts, tooltipStyle, withAlpha } from '@/utils/echarts'
import { formatCents } from '@/utils/money'

const props = defineProps<{
  accounts: AccountWithBalance[]
}>()

ensureECharts()

/**
 * 横向柱体的填充渐变
 *
 * 横条的「根部」也在 0 轴上：正余额朝右长（尖端在右）、欠款朝左长（尖端在左），
 * 所以渐变方向要按符号分别给 —— 与 MonthlyChangeBar 的 barFill 同理，
 * 只是坐标系转了 90°（x=0 是左端、x=1 是右端）。
 * 统一让「尖端浓、贴 0 轴的根部淡」，视觉上才是钱从零线往外长出去。
 */
function barFill(color: string, positive: boolean) {
  const [from, to] = positive ? [0.62, 1] : [1, 0.62]
  return {
    type: 'linear' as const,
    x: 0,
    y: 0,
    x2: 1,
    y2: 0,
    colorStops: [
      { offset: 0, color: withAlpha(color, from) },
      { offset: 1, color: withAlpha(color, to) },
    ],
  }
}

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
    grid: { left: 4, right: 24, top: 8, bottom: 0, containLabel: true },
    xAxis: {
      type: 'value',
      // 横向条形靠竖向网格判断量级，这条网格不能省（与折线/柱状不同）
      splitLine: { lineStyle: { color: withAlpha(p.border, 0.7) } },
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: p.textSecondary, fontSize: 12, formatter: axisMoneyLabel },
    },
    yAxis: {
      type: 'category',
      data: rows.value.map(a => `${a.icon}  ${a.name}`),
      axisLine: { show: false },
      axisTick: { show: false },
      // 账户名可能是「招商银行储蓄卡（6225）」这种长名字，超 8 字截断 ——
      // 精确名字在 tooltip 里有，轴标签只要能认出是哪个账户
      axisLabel: {
        color: p.textSecondary,
        fontSize: 12,
        formatter: (name: string) => (name.length > 10 ? `${name.slice(0, 10)}…` : name),
      },
    },
    series: [
      {
        name: '账户余额',
        type: 'bar',
        barMaxWidth: 14,
        // 逐项给样式：颜色（正负异色）、渐变方向、圆角朝向、标签位置四件事
        // 都跟符号绑定，series 级的单一 itemStyle 表达不了
        data: rows.value.map(a => ({
          value: a.balance,
          itemStyle: {
            color: barFill(a.balance >= 0 ? p.income : p.expense, a.balance >= 0),
            // 尖端那一侧给圆角，贴 0 轴的一侧保持方角
            borderRadius: a.balance >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4],
          },
          // 正余额标在柱子右端、欠款标在左端（柱子朝左），都朝外不会压住柱子
          label: { position: a.balance >= 0 ? 'right' : 'left' },
        })),
        label: {
          show: true,
          fontSize: 12,
          color: p.textSecondary,
          formatter: (params: { value?: unknown }) =>
            formatCents(Number(params.value ?? 0), { withSymbol: true }),
        },
        emphasis: { focus: 'series' },
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
