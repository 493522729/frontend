<script setup lang="ts">
/**
 * 本月支出分类占比环图（PRD 8.1）
 * ====================================================================
 * Top 6 分类 + 「其他」，颜色直接用分类字典的 color，保证与分类设置页一致。
 *
 * 三个刻意的设计：
 *   - 环心总额用 DOM 覆盖层而不是 echarts title：省一个 TitleComponent 的体积，
 *     而且 DOM 文字可被选中、对屏幕阅读器友好（canvas 里的字读不出来）
 *   - **环心跟随 hover 联动**：鼠标停在扇区上，环心从「本月支出 / 总额」
 *     换成「该分类 / 该分类金额」。原来这里是用 echarts 的 emphasis.label
 *     在 canvas 正中央画 {d}%，结果和 DOM 总额叠在一起糊成一团 ——
 *     现在把环心交给 DOM 一处渲染，canvas 只负责扇区的缩放反馈
 *   - 图例直接带占比：占比是这个图最有信息量的部分，
 *     让用户必须 hover 才看得到是一种浪费
 */
import type { PieSeriesOption } from 'echarts/charts'
import type { LegendComponentOption, TooltipComponentOption } from 'echarts/components'
import type { ComposeOption } from 'echarts/core'
import type { CategorySlice } from '@/types/stats'
import { computed, ref } from 'vue'
import VChart from 'vue-echarts'
import { useChartPalette } from '@/composables/useChartPalette'
import { ensureECharts, tooltipStyle } from '@/utils/echarts'
import { formatCents, sumCents } from '@/utils/money'

const props = defineProps<{
  slices: CategorySlice[]
}>()

ensureECharts()

type PieOption = ComposeOption<PieSeriesOption | TooltipComponentOption | LegendComponentOption>

const palette = useChartPalette()

/** 环心展示的本月支出总额（分） */
const totalExpense = computed(() => sumCents(props.slices.map(s => s.amount)))

/** 当前 hover 的扇区序号；null = 没 hover，环心回到总额 */
const hoveredIndex = ref<number | null>(null)

const hoveredSlice = computed(() => {
  const i = hoveredIndex.value
  return i == null ? null : props.slices[i] ?? null
})

/** 各类占总额的百分比文案（图例与环心共用一份口径） */
function percentLabel(amount: number): string {
  const total = totalExpense.value
  // 占比不是金额，不能也不该走 formatCents（ADR-7 管的是金额）。
  // 先乘 1000 取整再除 10，避开 (a/b)*100 的浮点尾巴；再统一保留 1 位。
  const per = total > 0 ? Math.round((amount / total) * 1000) / 10 : 0
  return `${per.toFixed(1)}%`
}

const option = computed<PieOption>(() => {
  const p = palette.value
  return {
    tooltip: {
      trigger: 'item',
      ...tooltipStyle(p),
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
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 14,
      icon: 'circle',
      // 名称与占比分两栏排：名称定宽（超出截断），占比用等宽字体，纵向能对齐
      formatter: (name: string) => {
        const slice = props.slices.find(s => s.name === name)
        if (!slice)
          return name
        return `{n|${name}}{p|${percentLabel(slice.amount)}}`
      },
      textStyle: {
        color: p.textSecondary,
        fontSize: 12,
        rich: {
          n: {
            color: p.textSecondary,
            fontSize: 12,
            width: 66,
            overflow: 'truncate',
            ellipsis: '…',
          },
          p: {
            color: p.text,
            fontSize: 12,
            fontFamily: 'JetBrains Mono, SF Mono, Menlo, monospace',
          },
        },
      },
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
          borderRadius: 6,
        },
        // 标签一律交给环心与 tooltip，扇区上不写字
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          scaleSize: 8,
          // 环心已由 DOM 覆盖层联动，canvas 不再画字（否则两处文字重叠）
          label: { show: false },
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

/** canvas 事件里没有 dataIndex 的（容器自身的 mouseover）直接忽略 */
function onSliceHover(params: { dataIndex?: unknown }): void {
  const i = Number(params?.dataIndex)
  if (Number.isInteger(i) && i >= 0 && i < props.slices.length)
    hoveredIndex.value = i
}

function onSliceLeave(): void {
  hoveredIndex.value = null
}
</script>

<template>
  <div class="category-pie">
    <VChart
      class="pie-canvas"
      :option="option"
      autoresize
      @mouseover="onSliceHover"
      @mouseout="onSliceLeave"
    />

    <!-- 环心：默认本月支出总额，hover 扇区时换成该分类，不进 canvas -->
    <div class="pie-center" aria-hidden="true">
      <template v-if="hoveredSlice">
        <span class="pie-center-label pie-center-label--slice">
          <i class="pie-center-dot" :style="{ background: hoveredSlice.color }" />
          {{ hoveredSlice.name }}
        </span>
        <span class="pie-center-value pie-center-value--slice">
          {{ formatCents(hoveredSlice.amount, { withSymbol: true }) }}
        </span>
        <span class="pie-center-sub">{{ percentLabel(hoveredSlice.amount) }}</span>
      </template>
      <template v-else>
        <span class="pie-center-label">本月支出</span>
        <span class="pie-center-value">{{ formatCents(totalExpense, { withSymbol: true }) }}</span>
        <span class="pie-center-sub">{{ slices.length }} 个分类</span>
      </template>
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
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 96px;
  font-size: 12px;
  color: var(--lz-text-secondary);
  @include ellipsis;
}

.pie-center-label--slice {
  color: var(--lz-text-regular);
}

.pie-center-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--lz-radius-full);
  flex-shrink: 0;
}

.pie-center-value {
  @include tabular;

  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--lz-text-primary);
}

.pie-center-value--slice {
  font-size: 18px;
}

.pie-center-sub {
  @include tabular;

  font-size: 11px;
  color: var(--lz-text-secondary);
}
</style>
