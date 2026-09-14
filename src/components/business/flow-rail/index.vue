<script setup lang="ts">
/**
 * 收支对比轨 —— 仪表盘 / 报表中心共用的「结构」可视化
 * ====================================================================
 * 数据卡只能给出「收入多少、支出多少」两个孤立的绝对值，看不出二者
 * 力量对比；这条轨补的就是缺掉的那一层：左段是收入占比、右段是支出占比，
 * 两段合计铺满整条轨道 —— 一眼能扫出「这个月花得比赚的多还是少」。
 *
 * 配色不在这里写死：走 settings.typeColor('income' / 'expense')，
 * 与页面金额、类型标签、ECharts 图表同源。用户在系统设置里切
 * 「金额配色偏好」，这条轨跟着一起翻，不需要任何额外分支。
 *
 * 无障碍：轨道本身 aria-hidden（没有可读信息），语义交给下面那行真实文本
 * —— 屏幕阅读器读「收入占比 58.8%，支出占比 41.2%」，而不是读一个空 div。
 */
import { computed, ref, watch } from 'vue'
import AnimatedMoney from '@/components/base/animated-money/index.vue'
import { useSettingsStore } from '@/stores/modules/settings'

const props = withDefaults(defineProps<{
  /** 收入合计（分） */
  income: number
  /** 支出合计（分） */
  expense: number
  /** 两端是否展示金额读数（报表汇总带要，仪表盘只展示比例时不要） */
  showValues?: boolean
  /** 轨道下方的说明文字 */
  caption?: string
  /**
   * 两端的名称（左、右）
   *
   * 默认是收支口径。账户页复用这条轨画「资产 / 负债」时传 ['资产', '负债'] ——
   * 结构关系是一样的（两段铺满 100%），只有叫法不同，没必要再抄一份组件。
   */
  labels?: [string, string]
  /** 无数据时的兜底文案（默认按收支口径写） */
  emptyText?: string
}>(), {
  showValues: false,
  caption: '收支结构',
  labels: () => ['收入', '支出'] as [string, string],
  emptyText: '暂时没有收支',
})

const settings = useSettingsStore()

const incomeColor = computed(() => settings.typeColor('income'))
const expenseColor = computed(() => settings.typeColor('expense'))

/** 负值没有意义（转账/冲销不该把轨道画反），统一夹到 0 */
const safeIncome = computed(() => Math.max(0, props.income))
const safeExpense = computed(() => Math.max(0, props.expense))
const total = computed(() => safeIncome.value + safeExpense.value)
const hasData = computed(() => total.value > 0)

/** 收入占比：数值用于布局，取整到 0.1 用于文案 */
const incomeRatio = computed(() => (hasData.value ? safeIncome.value / total.value : 0))
const incomePercent = computed(() => Math.round(incomeRatio.value * 1000) / 10)
/** 支出占比由收入占比反推，保证两者相加正好 100.0 —— 各自四舍五入会凑出 100.1 */
const expensePercent = computed(() => Math.round((100 - incomePercent.value) * 10) / 10)

/**
 * 首次拿到数据时让轨道「长」出来（0 → 目标宽度）。
 *
 * 只做这么一次一次性动效：挂载时宽度是 0%，下一帧置为真实占比，
 * 浏览器就看到了一次变化，于是走 CSS transition。
 * 之后数据再变（换筛选条件、切账本）是两个真实占比之间的过渡，
 * 轨道会平滑滑过去，不需要也不会重复「从 0 长出来」。
 *
 * 时长走 token，prefers-reduced-motion 下自动降到 1ms（等于不动）。
 */
const grown = ref(false)
watch(hasData, (v) => {
  if (v) {
    requestAnimationFrame(() => {
      grown.value = true
    })
  }
}, { immediate: true })

/**
 * 单个分段的样式。
 *
 * `minWidth` 是给「占比 <1%」准备的：那种宽度会退化成一个亚像素点、看起来
 * 像这一侧没有数据；给 2px 保证它「在」。但金额为 0 时不能给 ——
 * 否则会在那一侧留一小截假色块，等于画了假数据。
 *
 * @param ratio 该段占比 0~1
 * @param amount 该段金额（分），只用来判断「有没有数据」
 * @param color 该段颜色（token 变量名或解析后的色值）
 */
function segStyle(ratio: number, amount: number, color: string) {
  return {
    width: `${(grown.value ? ratio : 0) * 100}%`,
    minWidth: amount > 0 ? '2px' : '0',
    background: color,
  }
}
</script>

<template>
  <div class="flow-rail">
    <div v-if="showValues" class="rail-values">
      <span class="rail-figure">
        <span class="rail-figure__dot" :style="{ background: incomeColor }" />
        <span class="rail-figure__label">{{ props.labels[0] }}</span>
        <b class="rail-figure__value">
          <AnimatedMoney :cents="safeIncome" with-sign />
        </b>
      </span>
      <span class="rail-figure">
        <span class="rail-figure__label">{{ props.labels[1] }}</span>
        <b class="rail-figure__value">
          <AnimatedMoney :cents="-safeExpense" with-sign />
        </b>
        <span class="rail-figure__dot" :style="{ background: expenseColor }" />
      </span>
    </div>

    <div class="rail-track" aria-hidden="true">
      <span class="rail-seg" :style="segStyle(incomeRatio, safeIncome, incomeColor)" />
      <span class="rail-seg" :style="segStyle(1 - incomeRatio, safeExpense, expenseColor)" />
    </div>

    <p class="rail-caption">
      <span class="rail-caption__title">{{ caption }}</span>
      <span v-if="hasData" class="rail-legend">
        <span class="rail-legend__item">
          <i class="rail-legend__dot" :style="{ background: incomeColor }" />
          {{ props.labels[0] }} {{ incomePercent }}%
        </span>
        <span class="rail-legend__sep" aria-hidden="true">·</span>
        <span class="rail-legend__item">
          <i class="rail-legend__dot" :style="{ background: expenseColor }" />
          {{ props.labels[1] }} {{ expensePercent }}%
        </span>
      </span>
      <span v-else class="rail-legend rail-legend--empty">{{ props.emptyText }}</span>
    </p>
  </div>
</template>

<style scoped lang="scss">
.flow-rail {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

// 两端读数：收入靠左、支出靠右，与轨道的两段一一对应
.rail-values {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}

.rail-figure {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.rail-figure__dot {
  align-self: center;
  width: 6px;
  height: 6px;
  border-radius: var(--lz-radius-full);
  flex-shrink: 0;
}

.rail-figure__label {
  font-size: 12px;
  color: var(--lz-text-secondary);
}

.rail-figure__value {
  @include tabular;

  font-size: 16px;
  font-weight: 600;
  color: var(--lz-text-primary);
  letter-spacing: -0.01em;
}

// 轨道：底色用 border（在页面底色和卡片底色上都看得见），空态下也是一条刻度
.rail-track {
  display: flex;
  height: 10px;
  border-radius: var(--lz-radius-full);
  background: var(--lz-border);
  overflow: hidden;
}

.rail-seg {
  height: 100%;
  transition: width var(--lz-duration-slow) var(--lz-ease-decelerate);
}

.rail-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
  font-size: 12px;
  color: var(--lz-text-secondary);
}

.rail-caption__title {
  color: var(--lz-text-secondary);
}

.rail-legend {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  @include tabular;
}

.rail-legend__item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.rail-legend__dot {
  width: 6px;
  height: 6px;
  border-radius: var(--lz-radius-full);
}

.rail-legend__sep {
  opacity: 0.6;
}

.rail-legend--empty {
  color: var(--lz-text-placeholder);
}

// 窄屏：两端读数纵向堆叠，避免金额被挤到换行
@media (max-width: 575px) {
  .rail-values {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }

  .rail-figure {
    justify-content: space-between;
  }

  .rail-caption {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}
</style>
