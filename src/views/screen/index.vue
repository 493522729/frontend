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
 *  2. **固定画布 1920×1080 + transform: scale 缩放铺满** —— 大屏屏比千奇百怪，
 *     用响应式布局会把设计稿拆散；这里横、纵各按 1920/1080 独立缩放，
 *     任何分辨率都严格撑满、无黑边（PC 端用户明确要求不留黑边；
 *     非等比在 16:10 等屏比下只有轻微纵向拉伸，大屏演示可接受）。
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
  text: '#e8f1ff',
  textSub: '#8fb0d6',
  grid: 'rgba(120, 170, 230, 0.12)',
  income: '#34e0a1',
  expense: '#ff6b81',
  primary: '#4ea8ff',
  primaryLight: '#9ecbff',
  warn: '#ffb454',
  purple: '#a78bfa',
  cyan: '#38e0d0',
} as const

/** ECharts 竖向渐变（柱体/面积用） */
function vgrad(c1: string, c2: string) {
  return {
    type: 'linear' as const,
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: c1 },
      { offset: 1, color: c2 },
    ],
  }
}

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

/** 铺满缩放：横纵各自对齐 1920×1080，四周预留 GAP 物理像素间隙，不留黑边也不顶边 */
const SCREEN_GAP = 24
const scale = ref({ x: 1, y: 1 })
function fit() {
  scale.value = {
    x: (window.innerWidth - SCREEN_GAP * 2) / 1920,
    y: (window.innerHeight - SCREEN_GAP * 2) / 1080,
  }
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
    { label: '本月收入', value: ov.income, color: SCREEN.income, icon: '💰', mom: ov.incomeMoM },
    { label: '本月支出', value: ov.expense, color: SCREEN.expense, icon: '💳', mom: ov.expenseMoM },
    { label: '本月结余', value: ov.balance, color: SCREEN.primaryLight, icon: '📊', mom: null },
    { label: '净资产', value: ov.netAssets, color: SCREEN.primary, icon: '🏦', mom: null },
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

/** 饼图中心合计（DOM 叠加层，避免额外注册 TitleComponent） */
const pieTotal = computed(() =>
  (overview.value?.categories ?? []).reduce((sum, c) => sum + c.amount, 0),
)

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

const tooltipBase = {
  backgroundColor: 'rgba(8, 18, 36, 0.92)',
  borderColor: 'rgba(120, 170, 230, 0.28)',
  borderWidth: 1,
  padding: [10, 14],
  textStyle: { color: SCREEN.text, fontSize: 13 },
  extraCssText: 'box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45); border-radius: 10px;',
}

const trendOption = computed<TrendOption>(() => {
  const pts: TrendPoint[] = overview.value?.trend ?? []
  return {
    tooltip: {
      trigger: 'axis',
      ...tooltipBase,
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(120,170,230,0.08)' } },
    },
    legend: {
      top: 6,
      right: 12,
      itemWidth: 14,
      itemHeight: 8,
      itemGap: 18,
      textStyle: { color: SCREEN.textSub, fontSize: 13 },
    },
    grid: { left: 8, right: 18, top: 52, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category',
      data: pts.map(p => `${Number(p.month.slice(5))}月`),
      ...axisBase,
      axisLine: { lineStyle: { color: SCREEN.grid } },
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
        barWidth: 16,
        barGap: '30%',
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: vgrad(SCREEN.income, 'rgba(52, 224, 161, 0.45)'),
          shadowColor: 'rgba(52, 224, 161, 0.45)',
          shadowBlur: 10,
        },
        data: pts.map(p => p.income / 100),
      },
      {
        name: '支出',
        type: 'bar',
        barWidth: 16,
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: vgrad(SCREEN.expense, 'rgba(255, 107, 129, 0.45)'),
          shadowColor: 'rgba(255, 107, 129, 0.45)',
          shadowBlur: 10,
        },
        data: pts.map(p => p.expense / 100),
      },
      {
        name: '结余',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        showSymbol: true,
        lineStyle: { width: 3, color: SCREEN.primaryLight, shadowColor: 'rgba(158, 203, 255, 0.6)', shadowBlur: 12 },
        itemStyle: { color: SCREEN.primaryLight, borderColor: '#fff', borderWidth: 1 },
        areaStyle: {
          color: {
            type: 'linear' as const,
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(158, 203, 255, 0.30)' },
              { offset: 1, color: 'rgba(158, 203, 255, 0)' },
            ],
          },
        },
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
      ...tooltipBase,
      formatter: (raw: unknown) => {
        const p = raw as { name: string, value: number, percent: number }
        return `${p.name}<br/>${formatCents(p.value * 100, { withSymbol: true })} · ${p.percent}%`
      },
    },
    legend: {
      bottom: 4,
      left: 'center',
      icon: 'circle',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 14,
      textStyle: { color: SCREEN.textSub, fontSize: 13 },
    },
    series: [
      {
        type: 'pie',
        radius: ['54%', '76%'],
        center: ['50%', '46%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderColor: '#0a1426',
          borderWidth: 3,
          shadowColor: 'rgba(0, 0, 0, 0.35)',
          shadowBlur: 8,
        },
        label: { color: SCREEN.textSub, fontSize: 12, formatter: '{b}\n{d}%' },
        labelLine: { lineStyle: { color: SCREEN.grid }, length: 10, length2: 12 },
        data: cats.map((c, i) => {
          // 用一组协调的强调色循环，保证环图层次清晰
          const palette = [SCREEN.primary, SCREEN.income, SCREEN.warn, SCREEN.purple, SCREEN.cyan, SCREEN.expense]
          // 索引访问在 noUncheckedIndexedAccess 下是 string|undefined，兜底到主色，避免 TS2345
          const base = c.color || palette[i % palette.length] || SCREEN.primary
          return {
            name: c.name,
            value: c.amount / 100,
            itemStyle: { color: vgrad(base, 'rgba(120,170,230,0.25)') },
          }
        }),
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
      ...tooltipBase,
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(120,170,230,0.08)' } },
      formatter: (raw: unknown) => {
        const arr = raw as { name: string, value: number }[]
        const it = arr[0]
        return it ? `${it.name}<br/>${formatCents(it.value * 100, { withSymbol: true })}` : ''
      },
    },
    grid: { left: 8, right: 72, top: 12, bottom: 4, containLabel: true },
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
        backgroundStyle: { color: 'rgba(120,170,230,0.08)', borderRadius: 7 },
        itemStyle: {
          borderRadius: 7,
          color: vgrad(SCREEN.primary, SCREEN.cyan),
          shadowColor: 'rgba(78, 168, 255, 0.5)',
          shadowBlur: 10,
        },
        label: {
          show: true,
          position: 'right',
          color: SCREEN.text,
          fontSize: 13,
          fontFamily: 'var(--lz-font-num)',
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
    <div class="screen-canvas" :style="{ transform: `translate(-50%, -50%) scale(${scale.x}, ${scale.y})` }">
      <!-- 四角装饰框 -->
      <span class="corner corner--tl" />
      <span class="corner corner--tr" />
      <span class="corner corner--bl" />
      <span class="corner corner--br" />

      <header class="screen-head">
        <div class="head-side">
          <span class="brand-mark">
            <img src="/logo.png" alt="简账" class="brand-logo">
          </span>
          <div class="brand-text">
            <span class="brand">简账 · 财务中枢</span>
            <span class="brand-sub">FINANCE COMMAND CENTER</span>
          </div>
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
          <article
            v-for="(k, i) in kpis"
            :key="k.label"
            class="kpi rise"
            :style="{ '--d': `${i * 0.08}s` }"
          >
            <span class="kpi-icon">{{ k.icon }}</span>
            <div class="kpi-body">
              <p class="kpi-label">
                {{ k.label }}
              </p>
              <p class="kpi-value" :style="{ color: k.color }">
                {{ formatCents(k.value, { withSymbol: true }) }}
              </p>
              <p v-if="k.mom !== null" class="kpi-mom" :class="k.mom >= 0 ? 'up' : 'down'">
                <span class="mom-arrow">{{ k.mom >= 0 ? '▲' : '▼' }}</span>
                环比 {{ k.mom >= 0 ? '+' : '' }}{{ k.mom }}%
              </p>
            </div>
          </article>
          <p v-if="!kpis.length" class="placeholder">
            数据加载中…
          </p>
        </section>

        <!-- 中：趋势 + 最近流水 -->
        <section class="col col--center">
          <div class="panel panel--trend rise" style="--d: 0.12s">
            <h2 class="panel-title">
              近 6 月收支趋势
            </h2>
            <VChart class="chart" :option="trendOption" />
          </div>

          <div class="panel panel--recent rise" style="--d: 0.2s">
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
          <div class="panel panel--pie rise" style="--d: 0.16s">
            <h2 class="panel-title">
              支出分类占比
            </h2>
            <div class="chart-wrap">
              <VChart class="chart" :option="pieOption" />
              <div class="pie-center">
                <span class="pie-center-value">{{ formatCents(pieTotal, { withSymbol: true }) }}</span>
                <span class="pie-center-label">支出合计</span>
              </div>
            </div>
          </div>

          <div class="panel panel--account rise" style="--d: 0.24s">
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
  background: #050b18;
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
  padding: 22px 30px 26px;
  transform-origin: center center;
  color: #e8f1ff;
  /* 多层背景：细网格 + 顶部光晕 + 纵向渐变 + 暗角 */
  background-color: #060d1a;
  background-image:
    linear-gradient(rgba(120, 170, 230, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(120, 170, 230, 0.045) 1px, transparent 1px),
    radial-gradient(ellipse 70% 55% at 50% -8%, rgb(78 168 255 / 26%), transparent 60%),
    radial-gradient(ellipse 90% 70% at 50% 118%, rgb(167 139 250 / 14%), transparent 55%),
    linear-gradient(180deg, #0a1730 0%, #060d1a 100%);
  background-size: 44px 44px, 44px 44px, 100% 100%, 100% 100%, 100% 100%;
}

/* ─── 四角装饰框 ─────────────────────────────────────── */
.corner {
  position: absolute;
  width: 26px;
  height: 26px;
  pointer-events: none;
  border-color: rgb(78 168 255 / 70%);
  border-style: solid;
  border-width: 0;

  &--tl { top: 10px; left: 10px; border-top-width: 2px; border-left-width: 2px; }
  &--tr { top: 10px; right: 10px; border-top-width: 2px; border-right-width: 2px; }
  &--bl { bottom: 10px; left: 10px; border-bottom-width: 2px; border-left-width: 2px; }
  &--br { bottom: 10px; right: 10px; border-bottom-width: 2px; border-right-width: 2px; }
}

/* ─── 头部 ─────────────────────────────────────────── */
.screen-head {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  height: 86px;
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgb(120 170 230 / 16%);

  &::after {
    /* 头部分隔线中央的菱形装饰 */
    content: '';
    position: absolute;
    left: 50%;
    bottom: -5px;
    width: 9px;
    height: 9px;
    transform: translateX(-50%) rotate(45deg);
    background: #4ea8ff;
    box-shadow: 0 0 12px 2px rgb(78 168 255 / 70%);
  }
}

.head-side {
  display: flex;
  align-items: center;
  gap: 12px;

  &--right {
    justify-content: flex-end;
  }
}

.brand-mark {
  display: grid;
  place-items: center;
}

.brand-logo {
  width: 36px;
  height: 36px;
  object-fit: contain;
  filter: drop-shadow(0 1px 3px rgb(0 0 0 / 35%));
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.brand {
  font-size: 17px;
  font-weight: 600;
  color: #dbe9ff;
  letter-spacing: 0.04em;
}

.brand-sub {
  font-size: 11px;
  letter-spacing: 0.22em;
  color: #6f8cb5;
}

.head-title {
  margin: 0;
  font-size: 40px;
  font-weight: 800;
  letter-spacing: 0.16em;
  line-height: 1.4;
  padding: 0.12em 0.3em;
  background: linear-gradient(180deg, #ffffff 0%, #9ecbff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 2px 10px rgb(78 168 255 / 35%));
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
  font-size: 28px;
  font-weight: 700;
  color: #e8f1ff;
  text-shadow: 0 0 14px rgb(78 168 255 / 35%);
}

.today {
  font-size: 13px;
  color: #8fb0d6;
}

.exit-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 22px;
  padding: 8px 15px;
  font-size: 14px;
  color: #cfe1f6;
  background: rgb(120 170 230 / 10%);
  border: 1px solid rgb(120 170 230 / 24%);
  border-radius: 9px;
  cursor: pointer;
  @include transition-paint;

  &:hover {
    color: #fff;
    background: rgb(78 168 255 / 30%);
    border-color: rgb(78 168 255 / 55%);
    box-shadow: 0 0 16px rgb(78 168 255 / 30%);
  }

  kbd {
    padding: 1px 6px;
    font-family: var(--lz-font-num);
    font-size: 11px;
    background: rgb(0 0 0 / 28%);
    border: 1px solid rgb(120 170 230 / 28%);
    border-radius: 4px;
  }
}

/* ─── 主体三栏 ─────────────────────────────────────── */
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
  align-items: center;
  gap: 18px;
  padding: 18px 22px;
  background:
    linear-gradient(135deg, rgb(120 170 230 / 10%), rgb(120 170 230 / 3%));
  border: 1px solid rgb(120 170 230 / 16%);
  border-radius: 14px;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 6%), 0 6px 18px rgb(0 0 0 / 22%);
  backdrop-filter: blur(4px);
  overflow: hidden;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 12%;
    bottom: 12%;
    width: 3px;
    border-radius: 3px;
    background: linear-gradient(180deg, #4ea8ff, #a78bfa);
  }
}

.kpi-icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  font-size: 26px;
  border-radius: 14px;
  background: rgb(120 170 230 / 10%);
  border: 1px solid rgb(120 170 230 / 20%);
}

.kpi-body {
  min-width: 0;
}

.kpi-label {
  margin: 0 0 4px;
  font-size: 15px;
  color: #8fb0d6;
  letter-spacing: 0.06em;
}

.kpi-value {
  margin: 0;
  font-family: var(--lz-font-num);
  font-variant-numeric: tabular-nums;
  font-size: 38px;
  font-weight: 800;
  line-height: 1.1;
  text-shadow: 0 0 18px currentColor;
  opacity: 0.96;
}

.kpi-mom {
  margin: 6px 0 0;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  display: flex;
  align-items: center;
  gap: 5px;

  &.up { color: #34e0a1; }
  &.down { color: #ff6b81; }

  .mom-arrow {
    font-size: 10px;
  }
}

.placeholder {
  margin: auto;
  color: #8fb0d6;
}

/* 面板（玻璃质感 + 四角装饰） */
.panel {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 16px 18px 14px;
  background: rgb(14 26 48 / 55%);
  border: 1px solid rgb(120 170 230 / 16%);
  border-radius: 14px;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 5%), 0 8px 24px rgb(0 0 0 / 26%);
  backdrop-filter: blur(6px);
  min-height: 0;

  &::before,
  &::after {
    content: '';
    position: absolute;
    width: 14px;
    height: 14px;
    pointer-events: none;
    border-color: rgb(78 168 255 / 80%);
    border-style: solid;
    border-width: 0;
  }

  &::before { top: -1px; left: -1px; border-top-width: 2px; border-left-width: 2px; }
  &::after { right: -1px; bottom: -1px; border-right-width: 2px; border-bottom-width: 2px; }
}

.panel-title {
  display: flex;
  align-items: center;
  margin: 0 0 10px;
  font-size: 17px;
  font-weight: 600;
  color: #dbe9ff;
  letter-spacing: 0.05em;

  &::before {
    content: '';
    display: inline-block;
    width: 4px;
    height: 16px;
    margin-right: 9px;
    border-radius: 2px;
    background: linear-gradient(180deg, #4ea8ff, #a78bfa);
    box-shadow: 0 0 8px rgb(78 168 255 / 60%);
  }
}

.chart {
  flex: 1;
  width: 100%;
  min-height: 0;
}

.chart-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
}

.pie-center {
  position: absolute;
  top: 46%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;

  &-value {
    font-family: var(--lz-font-num);
    font-variant-numeric: tabular-nums;
    font-size: 24px;
    font-weight: 800;
    color: #e8f1ff;
    text-shadow: 0 0 16px rgb(78 168 255 / 40%);
  }

  &-label {
    margin-top: 2px;
    font-size: 12px;
    letter-spacing: 0.1em;
    color: #8fb0d6;
  }
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
  /* 上下渐隐遮罩，让滚动更柔和 */
  -webkit-mask-image: linear-gradient(180deg, transparent, #000 12%, #000 88%, transparent);
  mask-image: linear-gradient(180deg, transparent, #000 12%, #000 88%, transparent);
}

.marquee-list {
  margin: 0;
  padding: 0;
  list-style: none;
  animation: roll 26s linear infinite;

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
  padding: 9px 10px;
  border-bottom: 1px dashed rgb(120 170 230 / 10%);
  font-size: 15px;
  transition: background-color 0.2s;

  &:hover {
    background: rgb(120 170 230 / 6%);
  }
}

.tx-date {
  font-family: var(--lz-font-num);
  font-variant-numeric: tabular-nums;
  color: #8fb0d6;
}

.tx-note {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: #dbe9ff;
}

.tx-amount {
  font-family: var(--lz-font-num);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

/* 入场动画 */
.rise {
  animation: rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: var(--d, 0s);
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .marquee-list,
  .rise {
    animation: none;
  }
}
</style>
