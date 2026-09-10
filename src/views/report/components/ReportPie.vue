<script setup lang="ts">
/**
 * 报表分类构成饼图
 * ====================================================================
 * 数据源由页面决定（支出构成 / 收入构成），组件只负责画。
 * 点扇区 = 下钻该分类在当前筛选范围里的全部明细。
 * 环心总额用 DOM 覆盖层（与仪表盘环图同一手法：canvas 里的字读不出来，
 * DOM 文字可选中、对屏幕阅读器友好，还省一个 TitleComponent）。
 */
import type { PieSeriesOption } from 'echarts/charts'
import type { LegendComponentOption, TooltipComponentOption } from 'echarts/components'
import type { ComposeOption } from 'echarts/core'
import type { CategorySlice } from '@/types/stats'
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { useChartPalette } from '@/composables/useChartPalette'
import { ensureECharts, tooltipStyle } from '@/utils/echarts'
import { formatCents, sumCents } from '@/utils/money'

const props = defineProps<{
  slices: CategorySlice[]
}>()

const emit = defineEmits<{
  /** 点了某扇区，参数是该分类 ID（下钻锚点） */
  select: [categoryId: number]
}>()

ensureECharts()

type PieOption = ComposeOption<PieSeriesOption | TooltipComponentOption | LegendComponentOption>

const palette = useChartPalette()

const total = computed(() => sumCents(props.slices.map(s => s.amount)))

const option = computed<PieOption>(() => {
  const p = palette.value
  return {
    tooltip: {
      trigger: 'item',
      ...tooltipStyle(p),
      formatter: (raw: unknown) => {
        const item = raw as { name: string, value: number, percent: number, marker?: string }
        return [
          item.name,
          `${item.marker ?? ''}${formatCents(item.value, { withSymbol: true })}（${item.percent}%）`,
        ].join('<br/>')
      },
    },
    legend: {
      orient: 'vertical',
      right: 0,
      top: 'middle',
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { color: p.textSecondary, fontSize: 12 },
    },
    series: [
      {
        name: '分类构成',
        type: 'pie',
        radius: ['45%', '72%'],
        center: ['38%', '50%'],
        // 标签 hover 才显示：分类名已在右侧图例，扇区上再标一遍会糊
        label: { show: false },
        emphasis: { label: { show: true, formatter: '{b}', fontSize: 13 } },
        itemStyle: { borderColor: p.card, borderWidth: 2 },
        data: props.slices.map(s => ({
          name: `${s.icon} ${s.name}`,
          value: s.amount,
          itemStyle: { color: s.color },
        })),
      },
    ],
  }
})

function onClick(params: { dataIndex?: number | unknown }): void {
  const slice = props.slices[Number(params.dataIndex)]
  if (slice)
    emit('select', slice.categoryId)
}
</script>

<template>
  <div class="report-pie-host">
    <VChart class="report-pie" :option="option" autoresize @click="onClick" />
    <!-- 环心总额：DOM 覆盖层，center 与饼图 center 对齐 -->
    <div class="pie-center" :style="{ left: '38%' }">
      <span class="pie-center-label">{{ slices.length ? '合计' : '无数据' }}</span>
      <span class="pie-center-value">{{ formatCents(total, { withSymbol: true }) }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.report-pie-host {
  position: relative;
}

.report-pie {
  width: 100%;
  height: 340px;
  cursor: pointer;
}

.pie-center {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  pointer-events: none; // 让点击穿透到饼图，不能挡住扇区
}

.pie-center-label {
  font-size: 12px;
  color: var(--lz-text-secondary);
}

.pie-center-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--lz-text-primary);
  font-variant-numeric: tabular-nums;
}
</style>
