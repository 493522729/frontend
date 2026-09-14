<script setup lang="ts">
/**
 * 报表分类构成饼图
 * ====================================================================
 * 数据源由页面决定（支出构成 / 收入构成），组件只负责画。
 * 点扇区 = 下钻该分类在当前筛选范围里的全部明细。
 *
 * 与仪表盘环图同一套手法：
 *   - 环心用 DOM 覆盖层（canvas 里的字读不出来，DOM 文字可选中、
 *     对屏幕阅读器友好，还省一个 TitleComponent）
 *   - 环心**跟随 hover 联动**：停在扇区上时换成「该分类 / 该分类金额 / 占比」。
 *     原来这里是让 echarts 在 canvas 正中央画 emphasis.label，结果和 DOM
 *     总额叠在一起 —— 现在文字只在 DOM 一处渲染
 *   - 图例直接带占比：占比是这个图最有信息量的部分，不该藏在 hover 里
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

const emit = defineEmits<{
  /** 点了某扇区，参数是该分类 ID（下钻锚点） */
  select: [categoryId: number]
}>()

ensureECharts()

type PieOption = ComposeOption<PieSeriesOption | TooltipComponentOption | LegendComponentOption>

const palette = useChartPalette()

const total = computed(() => sumCents(props.slices.map(s => s.amount)))

/** 当前 hover 的扇区序号；null = 没 hover，环心回到合计 */
const hoveredIndex = ref<number | null>(null)

const hoveredSlice = computed(() => {
  const i = hoveredIndex.value
  return i == null ? null : props.slices[i] ?? null
})

/** 占比文案（保留 1 位小数）；图例与环心共用一份口径 */
function percentLabel(amount: number): string {
  const t = total.value
  // 占比不是金额，不能也不该走 formatCents（ADR-7 管的是金额）。
  // 先乘 1000 取整再除 10，避开 (a / b) * 100 的浮点尾巴；再统一保留 1 位。
  const per = t > 0 ? Math.round((amount / t) * 1000) / 10 : 0
  return `${per.toFixed(1)}%`
}

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
      type: 'scroll',
      orient: 'vertical',
      right: 0,
      top: 'middle',
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 14,
      icon: 'circle',
      // 名称与占比分两栏：名称定宽截断，占比用等宽字体，纵向能对齐成一列
      formatter: (name: string) => {
        const slice = props.slices.find(s => `${s.icon} ${s.name}` === name)
        if (!slice)
          return name
        return `{n|${slice.icon} ${slice.name}}{p|${percentLabel(slice.amount)}}`
      },
      textStyle: {
        color: p.textSecondary,
        fontSize: 12,
        rich: {
          n: {
            color: p.textSecondary,
            fontSize: 12,
            width: 72,
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
        name: '分类构成',
        type: 'pie',
        radius: ['45%', '72%'],
        center: ['38%', '50%'],
        // 标签一律交给环心与 tooltip，扇区上不写字
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: p.card, borderWidth: 2, borderRadius: 6 },
        emphasis: {
          scaleSize: 8,
          // 环心已由 DOM 覆盖层联动，canvas 不再画字（否则两处文字重叠）
          label: { show: false },
        },
        data: props.slices.map(s => ({
          name: `${s.icon} ${s.name}`,
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

function onClick(params: { dataIndex?: number | unknown }): void {
  const slice = props.slices[Number(params.dataIndex)]
  if (slice)
    emit('select', slice.categoryId)
}
</script>

<template>
  <div class="report-pie-host">
    <VChart
      class="report-pie"
      :option="option"
      autoresize
      @click="onClick"
      @mouseover="onSliceHover"
      @mouseout="onSliceLeave"
    />

    <!-- 环心：默认合计，hover 扇区时换成该分类，不进 canvas -->
    <div class="pie-center" :style="{ left: '38%' }" aria-hidden="true">
      <template v-if="hoveredSlice">
        <span class="pie-center-label">
          <i class="pie-center-dot" :style="{ background: hoveredSlice.color }" />
          {{ hoveredSlice.name }}
        </span>
        <span class="pie-center-value pie-center-value--slice">
          {{ formatCents(hoveredSlice.amount, { withSymbol: true }) }}
        </span>
        <span class="pie-center-sub">{{ percentLabel(hoveredSlice.amount) }}</span>
      </template>
      <template v-else>
        <span class="pie-center-label">{{ slices.length ? '合计' : '无数据' }}</span>
        <span class="pie-center-value">{{ formatCents(total, { withSymbol: true }) }}</span>
        <span class="pie-center-sub">{{ slices.length }} 个分类</span>
      </template>
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
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 92px;
  font-size: 12px;
  color: var(--lz-text-secondary);
  @include ellipsis;
}

.pie-center-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--lz-radius-full);
  flex-shrink: 0;
}

.pie-center-value {
  @include tabular;

  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--lz-text-primary);
}

.pie-center-value--slice {
  font-size: 17px;
}

.pie-center-sub {
  @include tabular;

  font-size: 11px;
  color: var(--lz-text-secondary);
}
</style>
