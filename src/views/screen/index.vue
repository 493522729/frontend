<script setup lang="ts">
/**
 * US-014 可视化大屏（PRD §5.3 P2 · 面试演示用）
 * ====================================================================
 * 定位：这不是"给用户的页面"，是**给面试官/演示场合看的一张海报**。
 * 所以它和普通页面的工程取向完全不同，有三条刻意的例外：
 *
 *  1. **固定深色，不跟主题明暗切换** —— 大屏永远在深色环境下演示（投影/暗室）。
 *     若跟随主题，亮色模式下投出来会是一片惨白。所以这里不用 useChartPalette，
 *     而是写死一份深色色板（见下面 SCREEN 常量）。
 *  2. **固定画布 1920×1080 + transform: scale 等比缩放** —— 大屏屏比千奇百怪，
 *     用响应式布局会把设计稿拆散；等比缩放是业界标准做法，一次适配所有分辨率。
 *     scale 只改视觉尺寸、不改布局尺寸，所以 ECharts 不需要跟着 resize。
 *  3. **不复用 default layout** —— 全屏沉浸，走 BlankLayout（路由在 router/index.ts 手写）。
 *
 * 数据源全部复用现有接口，没有为它新增任何后端契约：
 *   - getDashboardOverview → KPI + 趋势 + 分类占比
 *   - listAccountBalances  → 账户余额排行
 *   - listTransactions     → 最近流水滚动列表
 */
import type { BarSeriesOption, LineSeriesOption, PieSeriesOption } from 'echarts/charts'
import type { GridComponentOption, LegendComponentOption, TooltipComponentOption } from 'echarts/components'
import type { ComposeOption } from 'echarts/core'
import type { AccountBalance, DashboardOverview, TrendPoint } from '@/types/stats'
import type { Transaction } from '@/types/transaction'
import { useEventListener } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import VChart from 'vue-echarts'
import { useRouter } from 'vue-router'
import { getDashboardOverview, listAccountBalances } from '@/api/modules/stats'
import { listTransactions } from '@/api/modules/transaction'
import { useHotkey } from '@/composables/useHotkey'
import { useAccountStore } from '@/stores/modules/account'
import { useBookStore } from '@/stores/modules/book'
import { ensureECharts } from '@/utils/echarts'
import { formatCents } from '@/utils/money'

ensureECharts()

/** 大屏专用深色色板（不跟主题，理由见文件头第 1 条） */
const SCREEN = {
  text: '#e6eefb',
  textSub: '#8fa8c8',
  grid: 'rgba(148, 196, 234, 0.12)',
  income: '#34d399',
  expense: '#f87171',
  primary: '#5fa5de',
  primaryLight: '#94c4ea',
} as const

const book = useBookStore()
const accountStore = useAccountStore()
const router = useRouter()

/**
 * 退出大屏 —— 这是**必须有**的逃生口：
 * 大屏走 BlankLayout，没有侧边栏和 Header，进去之后如果不给出口就出不来了。
 * Esc 用 useHotkey 注册（输入态也让位规则统一）；按钮是给不习惯快捷键的人。
 */
function exit() {
  void router.push('/dashboard')
}
useHotkey('Escape', exit)

const overview = ref<DashboardOverview | null>(null)
const balances = ref<AccountBalance[]>([])
const recent = ref<Transaction[]>([])
const loading = ref(true)

const now = ref(new Date())

/** 等比缩放：以 1920×1080 为设计基准，取宽高缩放比的较小值 */
const scale = ref(1)
function fit() {
  scale.value = Math.min(window.innerWidth / 1920, window.innerHeight / 1080)
}
useEventListener(window, 'resize', fit)

async function load() {
  loading.value = true
  try {
    const bookId = book.currentBookId ?? undefined
    const [ov, bal, tx] = await Promise.all([
      getDashboardOverview({ bookId }),
      listAccountBalances(bookId),
      listTransactions({ bookId, page: 1, pageSize: 12 }),
    ])
    overview.value = ov
    balances.value = bal
    recent.value = tx.list
  }
  finally {
    loading.value = false
  }
}

let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  fit()
  void load()
  void accountStore.ensureLoaded()
  timer = setInterval(() => (now.value = new Date()), 1000)
})
onBeforeUnmount(() => {
  if (timer)
    clearInterval(timer)
})

const clock = computed(() =>
  now.value.toLocaleTimeString('zh-CN', { hour12: false }),
)
const today = computed(() =>
  now.value.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }),
)

/** 4 个 KPI：收入 / 支出 / 结余 / 净资产 */
const kpis = computed(() => {
  const ov = overview.value
  if (!ov)
    return []
  return [
    { label: '本月收入', value: ov.income, color: SCREEN.income, mom: ov.incomeMoM },
    { label: '本月支出', value: ov.expense, color: SCREEN.expense, mom: ov.expenseMoM },
    { label: '本月结余', value: ov.balance, color: SCREEN.primaryLight, mom: null },
    { label: '净资产', value: ov.netAssets, color: SCREEN.primary, mom: null },
  ]
})

/** 账户名要靠 accountStore 回填（AccountBalance 只有 accountId） */
const accountRows = computed(() => {
  const nameOf = (id: number) =>
    accountStore.accounts.find(a => a.id === id)?.name ?? `账户 ${id}`
  return [...balances.value]
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 6)
    .map(b => ({ name: nameOf(b.accountId), balance: b.balance }))
})

type TrendOption = ComposeOption<
  BarSeriesOption | LineSeriesOption | TooltipComponentOption
  | LegendComponentOption | GridComponentOption
>
type PieOption = ComposeOption<PieSeriesOption | TooltipComponentOption | LegendComponentOption>
type BarOption = ComposeOption<BarSeriesOption | TooltipComponentOption | GridComponentOption>

const axisBase = {
  axisLine: { lineStyle: { color: SCREEN.grid } },
  axisTick: { show: false },
  axisLabel: { color: SCREEN.textSub, fontSize: 13 },
}

const trendOption = computed<TrendOption>(() => {
  const pts: TrendPoint[] = overview.value?.trend ?? []
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(11, 22, 40, 0.92)',
      borderColor: SCREEN.grid,
      textStyle: { color: SCREEN.text, fontSize: 13 },
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(148,196,234,0.08)' } },
    },
    legend: {
      top: 4,
      right: 8,
      itemWidth: 16,
      itemHeight: 8,
      textStyle: { color: SCREEN.textSub, fontSize: 13 },
    },
    grid: { left: 8, right: 16, top: 48, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category',
      data: pts.map(p => `${Number(p.month.slice(5))}月`),
      ...axisBase,
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: SCREEN.grid, type: 'dashed' } },
      ...axisBase,
      axisLabel: {
        color: SCREEN.textSub,
        fontSize: 13,
        formatter: (v: number) => (Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}万` : `${v}`),
      },
    },
    series: [
      {
        name: '收入',
        type: 'bar',
        barWidth: 18,
        itemStyle: { color: SCREEN.income, borderRadius: [4, 4, 0, 0] },
        data: pts.map(p => p.income / 100),
      },
      {
        name: '支出',
        type: 'bar',
        barWidth: 18,
        itemStyle: { color: SCREEN.expense, borderRadius: [4, 4, 0, 0] },
        data: pts.map(p => p.expense / 100),
      },
      {
        name: '结余',
        type: 'line',
        smooth: true,
        symbolSize: 7,
        lineStyle: { width: 3, color: SCREEN.primaryLight },
        itemStyle: { color: SCREEN.primaryLight },
        data: pts.map(p => (p.income - p.expense) / 100),
      },
    ],
  }
})

const pieOption = computed<PieOption>(() => {
  const cats = overview.value?.categories ?? []
  return {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(11, 22, 40, 0.92)',
      borderColor: SCREEN.grid,
      textStyle: { color: SCREEN.text, fontSize: 13 },
      formatter: (raw: unknown) => {
        const p = raw as { name: string, value: number, percent: number }
        return `${p.name}<br/>${formatCents(p.value * 100, { withSymbol: true })} · ${p.percent}%`
      },
    },
    legend: {
      bottom: 0,
      left: 'center',
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { color: SCREEN.textSub, fontSize: 13 },
    },
    series: [
      {
        type: 'pie',
        radius: ['48%', '72%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderColor: '#0b1628',
          borderWidth: 3,
        },
        label: { color: SCREEN.textSub, fontSize: 13, formatter: '{b}\n{d}%' },
        labelLine: { lineStyle: { color: SCREEN.grid }, length: 12, length2: 12 },
        data: cats.map(c => ({
          name: c.name,
          value: c.amount / 100,
          itemStyle: { color: c.color },
        })),
      },
    ],
  }
})

const accountOption = computed<BarOption>(() => {
  const rows = accountRows.value
  const max = Math.max(1, ...rows.map(r => Math.abs(r.balance)))
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(11, 22, 40, 0.92)',
      borderColor: SCREEN.grid,
      textStyle: { color: SCREEN.text, fontSize: 13 },
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(148,196,234,0.08)' } },
      formatter: (raw: unknown) => {
        const arr = raw as { name: string, value: number }[]
        const it = arr[0]
        return it ? `${it.name}<br/>${formatCents(it.value * 100, { withSymbol: true })}` : ''
      },
    },
    grid: { left: 8, right: 60, top: 12, bottom: 4, containLabel: true },
    xAxis: { type: 'value', max: max / 100, show: false },
    yAxis: {
      type: 'category',
      inverse: true,
      data: rows.map(r => r.name),
      ...axisBase,
      axisLine: { show: false },
    },
    series: [
      {
        type: 'bar',
        barWidth: 14,
        showBackground: true,
        backgroundStyle: { color: 'rgba(148,196,234,0.08)', borderRadius: 7 },
        itemStyle: { color: SCREEN.primary, borderRadius: 7 },
        label: {
          show: true,
          position: 'right',
          color: SCREEN.text,
          fontSize: 13,
          fontFamily: 'var(--lz-font-num)',
          // 参数写成 `{ value?: unknown }` 而不是具体数字类型：ECharts 回调传入的
          // value 是 string | number | Date | … | null 的联合，标窄了会类型不兼容
          formatter: (p: { value?: unknown }) =>
            formatCents(Number(p.value ?? 0) * 100, { withSymbol: true }),
        },
        data: rows.map(r => r.balance / 100),
      },
    ],
  }
})

/** 滚动列表复制两份做无缝轮播 */
const marqueeRows = computed(() => [...recent.value, ...recent.value])

function amountText(t: Transaction) {
  const sign = t.type === 'income' ? '+' : '-'
  return `${sign}${formatCents(t.amount, { withSymbol: true })}`
}
function amountColor(t: Transaction) {
  return t.type === 'income' ? SCREEN.income : SCREEN.expense
}
</script>

<template>
  <div class="screen-root">
    <div class="screen-canvas" :style="{ transform: `translate(-50%, -50%) scale(${scale})` }">
      <header class="screen-head">
        <div class="head-side">
          <span class="dot" />
          <span class="brand">简账</span>
        </div>

        <h1 class="head-title">
          财务管理数据大屏
        </h1>

        <div class="head-side head-side--right">
          <div class="clock-text">
            <span class="clock">{{ clock }}</span>
            <span class="today">{{ today }}</span>
          </div>
          <button type="button" class="exit-btn" @click="exit">
            退出大屏<kbd>esc</kbd>
          </button>
        </div>
      </header>

      <main class="screen-body">
        <!-- 左：4 张 KPI -->
        <section class="col col--left">
          <article v-for="k in kpis" :key="k.label" class="kpi">
            <p class="kpi-label">
              {{ k.label }}
            </p>
            <p class="kpi-value" :style="{ color: k.color }">
              {{ formatCents(k.value, { withSymbol: true }) }}
            </p>
            <p v-if="k.mom !== null" class="kpi-mom" :class="k.mom >= 0 ? 'up' : 'down'">
              环比 {{ k.mom >= 0 ? '+' : '' }}{{ k.mom }}%
            </p>
          </article>
          <p v-if="!kpis.length" class="placeholder">
            加载中…
          </p>
        </section>

        <!-- 中：趋势 + 最近流水 -->
        <section class="col col--center">
          <div class="panel panel--trend">
            <h2 class="panel-title">
              近 6 月收支趋势
            </h2>
            <VChart class="chart" :option="trendOption" />
          </div>

          <div class="panel panel--recent">
            <h2 class="panel-title">
              最近流水
            </h2>
            <div class="marquee">
              <ul class="marquee-list">
                <li v-for="(t, i) in marqueeRows" :key="`${t.id}-${i}`" class="tx-row">
                  <span class="tx-date">{{ t.transDate }}</span>
                  <span class="tx-note">{{ t.note || '（无备注）' }}</span>
                  <span class="tx-amount" :style="{ color: amountColor(t) }">{{ amountText(t) }}</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <!-- 右：分类环图 + 账户排行 -->
        <section class="col col--right">
          <div class="panel panel--pie">
            <h2 class="panel-title">
              支出分类占比
            </h2>
            <VChart class="chart" :option="pieOption" />
          </div>

          <div class="panel panel--account">
            <h2 class="panel-title">
              账户余额排行
            </h2>
            <VChart class="chart" :option="accountOption" />
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped lang="scss">
.screen-root {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #060d1a;
}

.screen-canvas {
  /* 等比缩放必须「绝对定位居中 + translate(-50%,-50%) scale(s)」：
     如果靠 grid place-items center 居中一个 1920×1080 的超尺寸子项，
     溢出时的对齐行为不可靠（实测内容会偏向右下角）。
     绝对定位 50% + translate 回拉一半，任何 scale 值都严格居中。 */
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1920px;
  height: 1080px;
  display: flex;
  flex-direction: column;
  padding: 20px 24px 24px;
  transform-origin: center center;
  background:
    radial-gradient(ellipse at 50% -10%, rgb(59 135 206 / 22%), transparent 55%),
    linear-gradient(180deg, #0b1628 0%, #060d1a 100%);
  color: #e6eefb;
}

/* ─── 头部 ─────────────────────────────────────────────── */
.screen-head {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  height: 84px;
  margin-bottom: 16px;
  border-bottom: 1px solid rgb(148 196 234 / 14%);
}

.head-title {
  margin: 0;
  font-size: 38px;
  font-weight: 700;
  letter-spacing: 0.12em;
  line-height: 1.5;
  padding: 0.15em 0.2em;
  background: linear-gradient(180deg, #ffffff 0%, #94c4ea 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.head-side {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  color: #8fa8c8;
  letter-spacing: 0.06em;

  &--right {
    justify-content: flex-end;
  }
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #5fa5de;
  box-shadow: 0 0 12px 2px rgb(95 165 222 / 60%);
}

.brand {
  font-size: 17px;
  color: #cfe1f6;
}

.clock-text {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.3;
}

.clock {
  font-family: var(--lz-font-num);
  font-variant-numeric: tabular-nums;
  font-size: 26px;
  color: #e6eefb;
}

.today {
  font-size: 13px;
  color: #8fa8c8;
}

.exit-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 20px;
  padding: 7px 14px;
  font-size: 14px;
  color: #cfe1f6;
  background: rgb(148 196 234 / 8%);
  border: 1px solid rgb(148 196 234 / 22%);
  border-radius: 8px;
  cursor: pointer;
  @include transition-paint;

  &:hover {
    color: #fff;
    background: rgb(95 165 222 / 28%);
  }

  kbd {
    padding: 1px 5px;
    font-family: var(--lz-font-num);
    font-size: 11px;
    background: rgb(0 0 0 / 25%);
    border: 1px solid rgb(148 196 234 / 25%);
    border-radius: 4px;
  }
}

/* ─── 主体三栏 ─────────────────────────────────────────── */
.screen-body {
  flex: 1;
  display: grid;
  grid-template-columns: 400px 1fr 460px;
  gap: 20px;
  min-height: 0;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
}

/* KPI 卡 */
.kpi {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 20px 24px;
  background: rgb(148 196 234 / 6%);
  border: 1px solid rgb(148 196 234 / 16%);
  border-radius: 12px;
  border-left: 3px solid #5fa5de;
}

.kpi-label {
  margin: 0 0 6px;
  font-size: 15px;
  color: #8fa8c8;
  letter-spacing: 0.08em;
}

.kpi-value {
  margin: 0;
  font-family: var(--lz-font-num);
  font-variant-numeric: tabular-nums;
  font-size: 40px;
  font-weight: 700;
  line-height: 1.1;
}

.kpi-mom {
  margin: 6px 0 0;
  font-size: 13px;
  font-variant-numeric: tabular-nums;

  &.up { color: #34d399; }
  &.down { color: #f87171; }
}

.placeholder {
  margin: auto;
  color: #8fa8c8;
}

/* 面板 */
.panel {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 16px 18px;
  background: rgb(148 196 234 / 5%);
  border: 1px solid rgb(148 196 234 / 14%);
  border-radius: 12px;
  min-height: 0;
}

.panel-title {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 600;
  color: #cfe1f6;
  letter-spacing: 0.06em;

  &::before {
    content: '';
    display: inline-block;
    width: 4px;
    height: 15px;
    margin-right: 8px;
    vertical-align: -2px;
    border-radius: 2px;
    background: #5fa5de;
  }
}

.chart {
  flex: 1;
  width: 100%;
  min-height: 0;
}

.panel--trend { flex: 1.15; }
.panel--recent { flex: 1; }
.panel--pie { flex: 1.1; }
.panel--account { flex: 1; }

/* 流水滚动：复制两份 + translateY(-50%) 无缝轮播 */
.marquee {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.marquee-list {
  margin: 0;
  padding: 0;
  list-style: none;
  animation: roll 24s linear infinite;

  &:hover {
    animation-play-state: paused;
  }
}

@keyframes roll {
  from { transform: translateY(0); }
  to { transform: translateY(-50%); }
}

.tx-row {
  display: grid;
  grid-template-columns: 96px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 9px 8px;
  border-bottom: 1px dashed rgb(148 196 234 / 10%);
  font-size: 15px;
}

.tx-date {
  font-family: var(--lz-font-num);
  font-variant-numeric: tabular-nums;
  color: #8fa8c8;
}

.tx-note {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: #cfe1f6;
}

.tx-amount {
  font-family: var(--lz-font-num);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

@media (prefers-reduced-motion: reduce) {
  .marquee-list {
    animation: none;
  }
}
</style>
