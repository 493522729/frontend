<script setup lang="ts">
/**
 * 本月支出分类占比环图（PRD 8.1）
 * ====================================================================
 * Top 6 分类 + 「其他」，颜色直接用分类字典的 color，保证与分类设置页一致。
 *
 * 两个刻意的设计：
 *   - 环心总额用 DOM 覆盖层而不是 echarts title：省一个 TitleComponent 的体积，
 *     而且 DOM 文字可被选中、对屏幕阅读器友好（canvas 里的字读不出来）
 *   - 标签默认隐藏、hover 才显示：分类名已经放在右侧图例里，
 *     再在扇区上标一遍会糊成一团
 */
import type { PieSeriesOption } from 'echarts/charts'
import type { LegendComponentOption, TooltipComponentOption } from 'echarts/components'
import type { ComposeOption } from 'echarts/core'
import type { CategorySlice } from '@/types/stats'
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { formatCents, sumCents } from '@/utils/money'
import { ensureECharts } from '../_echarts'
import { useChartPalette } from '../composables/useChartPalette'

const props = defineProps<{
  slices: CategorySlice[]
}>()

ensureECharts()

type PieOption = ComposeOption<PieSeriesOption | TooltipComponentOption | LegendComponentOption>

const palette = useChartPalette()

/** 环心展示的本月支出总额（分） */
const totalExpense = computed(() => sumCents(props.slices.map(s => s.amount)))

const option = computed<PieOption>(() => {
  const p = palette.value
  return {
    tooltip: {
      trigger: 'item',
      backgroundColor: p.card,
      borderColor: p.border,
      borderWidth: 1,
      textStyle: { color: p.text, fontSize: 12 },
      // 金额在 option 里是「分」，必须走 formatCents 转元展示，不能裸写 (v/100).toFixed(2)
      formatter: (raw: unknown) => {
        const item = raw as { name: string, value: number, percent?: number, marker?: string }
        return `${item.marker ?? ''}${item.name}  ${formatCents(item.value, { withSymbol: true })}（${item.percent ?? 0}%）`
      },
    },
    legend: {
      type: 'scroll',
      orient: 'vertical',
      right: 4,
      top: 'middle',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 12,
      icon: 'circle',
      textStyle: { color: p.textSecondary, fontSize: 12 },
    },
    series: [
      {
        type: 'pie',
        radius: ['54%', '78%'],
        // 左移给右侧图例留位置
        center: ['32%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderColor: p.card,
          borderWidth: 2,
          borderRadius: 4,
        },
        label: { show: false },
        emphasis: {
          scaleSize: 6,
          label: {
            show: true,
            position: 'center',
            fontSize: 18,
            fontWeight: 600,
            color: p.text,
            formatter: '{d}%',
          },
        },
        data: props.slices.map(s => ({
          name: s.name,
          value: s.amount,
          itemStyle: { color: s.color },
        })),
      },
    ],
  }
})
</script>

<template>
  <div class="category-pie">
    <VChart class="pie-canvas" :option="option" autoresize />
    <!-- 环心总额：DOM 覆盖，不进 canvas -->
    <div class="pie-center" aria-hidden="true">
      <span class="pie-center-label">本月支出</span>
      <span class="pie-center-value">{{ formatCents(totalExpense, { withSymbol: true }) }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.category-pie {
  position: relative;
  width: 100%;
  height: 300px;
}

.pie-canvas {
  width: 100%;
  height: 100%;
}

.pie-center {
  // 与 series.center 的 32% 对齐，且垂直居中
  position: absolute;
  left: 32%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  // 覆盖层不能吃掉扇区的 hover
  pointer-events: none;
}

.pie-center-label {
  font-size: 12px;
  color: var(--lz-text-secondary);
}

.pie-center-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--lz-text-primary);
  font-variant-numeric: tabular-nums;
}
</style>
