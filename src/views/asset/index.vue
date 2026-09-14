<script setup lang="ts">
/**
 * 资产趋势页（PRD §7 分析 / P1）
 * ====================================================================
 * 仪表盘只给「当前净资产」一个数字，回答不了用户真正的问题：
 * 「这一年我是在攒钱还是在漏财？」—— 这一页就为回答它而存在。
 *
 * 三段式结构，从上到下是「总量 → 节奏 → 结构」：
 *   1. 指标卡：当前净值 / 区间净增 / 最高月 / 最大回撤（结论先给）
 *   2. 净值曲线 + 月度净增柱（过程：家底怎么变的、哪几个月在漏）
 *   3. 账户构成（结构：钱都放在哪、哪些账户在拖后腿）
 *
 * 数据全部来自 stats 的一次聚合（getNetWorthTrend），页面不做算术 ——
 * 口径统一放在 api 层，报表页将来复用时才不会算出另一套数字。
 */

import type { AmountTone } from '@/stores/modules/settings'
import type { NetWorthTrend } from '@/types/stats'
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AnimatedMoney from '@/components/base/animated-money/index.vue'
import EmptyState from '@/components/business/empty-state/index.vue'
import { useAccountStore } from '@/stores/modules/account'
import { useBookStore } from '@/stores/modules/book'
import { useSettingsStore } from '@/stores/modules/settings'
import { formatCents } from '@/utils/money'
import { monthLabel, parseMonth } from '@/utils/temporal'
import AccountComposition from './components/AccountComposition.vue'
import MonthlyChangeBar from './components/MonthlyChangeBar.vue'
import NetWorthLine from './components/NetWorthLine.vue'
import { RANGE_OPTIONS, useAssetTrend } from './composables/useAssetTrend'

const { trend, months, loading, error, load } = useAssetTrend()
const account = useAccountStore()
const book = useBookStore()
const settings = useSettingsStore()
const router = useRouter()

onMounted(() => load())

/** 空态里「去账户管理」：没账户就没有资产结构，引导用户先补数据 */
function goAccount(): void {
  void router.push('/account')
}

/** 区间切换按钮：6 / 12 / 24 月 */
const rangeOptions = RANGE_OPTIONS.map(m => ({ label: `近 ${m} 月`, value: m }))

const points = computed(() => trend.value?.points ?? [])

/** 金额符号：净增为正时手动补「+」，formatCents 不会替业务决定要不要加号 */
function signed(cents: number): string {
  return `${cents > 0 ? '+' : ''}${formatCents(cents, { withSymbol: true })}`
}

/** 百分比文本：+12.3% / -4.5% */
function percentText(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}

/**
 * 中性色卡用正文色而不是 info 蓝
 *
 * 语义色的 neutral 档（--lz-info）是给「转账」这类有明确中性语义的场景用的；
 * 「当前净资产」「最高月」只是没有涨跌倾向，不是要强调「中性」，
 * 染成蓝色会让人以为这一栏有额外含义。所以中性一律退回正文色。
 */
const NEUTRAL_VAR = 'var(--lz-text-primary)'

function toneColorVar(tone: AmountTone): string {
  return tone === 'neutral' ? NEUTRAL_VAR : settings.toneColor(tone)
}

/**
 * 4 张指标卡
 *
 * tone 走 settings.toneFor：尊重用户在设置页选的「收入红 / 绿」偏好，
 * 不在这一页 hardcode 颜色（否则设置页的开关对本页失效）。
 * toneVar 只是把色调换成卡片要用的 CSS 变量名，判定逻辑仍只有 toneFor 一份。
 */
interface Kpi {
  key: string
  label: string
  value: string
  /**
   * 金额卡的金额（分）；非金额卡（如「净资产最高月」是月份文案）传 null，
   * 模板据此决定走 AnimatedMoney 滚动还是静态文本
   */
  cents: number | null
  /** 金额卡是否带 +/− 号（净增要带，回撤天然为正不带） */
  withSign?: boolean
  sub: string
  /** 卡片顶部色条与主数字的颜色（CSS 变量名） */
  toneVar: string
}

const kpis = computed<Kpi[]>(() => {
  const t: NetWorthTrend | null = trend.value
  if (!t)
    return []

  const changeTone = t.change > 0
    ? settings.toneFor('income')
    : t.change < 0
      ? settings.toneFor('expense')
      : 'neutral'

  return [
    {
      key: 'net',
      label: '当前净资产',
      value: formatCents(t.endNetAssets, { withSymbol: true }),
      cents: t.endNetAssets,
      sub: `区间起点 ${formatCents(t.startNetAssets, { withSymbol: true })}`,
      // 存量数字没有正负倾向，用品牌主色做色条 —— 它是这一页的主角
      toneVar: 'var(--lz-primary-600)',
    },
    {
      key: 'change',
      label: `近 ${months.value} 个月净增`,
      value: signed(t.change),
      cents: t.change,
      withSign: true,
      sub: `${percentText(t.changePercent)} · 区间累计`,
      toneVar: toneColorVar(changeTone),
    },
    {
      key: 'peak',
      label: '净资产最高月',
      value: t.peak ? monthLabel(parseMonth(t.peak.month)) : '—',
      cents: null,
      sub: t.peak ? formatCents(t.peak.netAssets, { withSymbol: true }) : '暂无数据',
      toneVar: 'var(--lz-primary-600)',
    },
    {
      key: 'drawdown',
      label: '最大回撤',
      value: formatCents(t.maxDrawdown, { withSymbol: true }),
      cents: t.maxDrawdown,
      // 回撤 0 = 全程没跌破过前高，这比写「无」更明确
      sub: t.maxDrawdown > 0 && t.peak ? `自 ${monthLabel(parseMonth(t.peak.month))} 高点回落` : '区间内未出现回撤',
      toneVar: t.maxDrawdown > 0 ? toneColorVar(settings.toneFor('expense')) : NEUTRAL_VAR,
    },
  ]
})

/**
 * 顶部 eyebrow：把「区间多长、覆盖到哪个月」这层上下文放在标题之上
 *
 * 标题下面那行副标题已经承担了「哪个账本 + 这一页看什么」，
 * 再塞日期会让两行的信息密度都不够；日期区间本来就是「限定条件」，
 * 放 eyebrow 更符合它的语义层级。
 */
const rangeText = computed(() => {
  const base = `近 ${months.value} 个月`
  if (!points.value.length)
    return base
  const first = points.value[0]!.month
  const last = points.value[points.value.length - 1]!.month
  return `${base} · ${monthLabel(parseMonth(first))} — ${monthLabel(parseMonth(last))}`
})

/** 空态：账户都没建，曲线也没意义（引导去账户页，而不是在这儿记一笔） */
const isEmpty = computed(() => !loading.value && account.accounts.length === 0)
</script>

<template>
  <div class="asset-page">
    <header class="page-header">
      <div class="heading">
        <span class="page-eyebrow">{{ rangeText }}</span>
        <h1 class="page-title">
          资产趋势
        </h1>
        <p class="page-subtitle">
          {{ book.currentBook?.name ?? '当前账本' }} · 净资产怎么变的、钱都放在哪
        </p>
      </div>

      <!-- 区间切换：改它等于改变请求参数，取数在 composable 里 watch -->
      <div class="range-switch">
        <NRadioGroup v-model:value="months" size="small">
          <NRadioButton v-for="opt in rangeOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </NRadioButton>
        </NRadioGroup>
      </div>
    </header>

    <NAlert v-if="error" type="error" :title="error" class="page-error" closable />

    <!-- 指标卡 -->
    <section class="kpi-grid" aria-label="资产概览">
      <div
        v-for="kpi in kpis"
        :key="kpi.key"
        class="kpi-card"
        :style="{ '--card-tone': kpi.toneVar }"
      >
        <span class="kpi-label">{{ kpi.label }}</span>
        <NSkeleton v-if="loading" text width="60%" :height="32" />
        <span v-else class="kpi-value">
          <AnimatedMoney v-if="kpi.cents != null" :cents="kpi.cents" :with-sign="kpi.withSign ?? false" />
          <template v-else>{{ kpi.value }}</template>
        </span>
        <span v-if="!loading" class="kpi-sub">{{ kpi.sub }}</span>
      </div>

      <!-- 首屏还没数据时先占位，避免卡片从 0 张跳到 4 张造成布局跳动 -->
      <template v-if="!trend">
        <div v-for="i in 4 - kpis.length" :key="`ph-${i}`" class="kpi-card">
          <NSkeleton text width="56px" :height="16" />
          <NSkeleton text width="60%" :height="32" />
          <NSkeleton text width="72%" :height="14" />
        </div>
      </template>
    </section>

    <!-- 净值曲线 -->
    <section class="card">
      <div class="chart-head">
        <h2 class="card-title">
          净资产走势
        </h2>
        <span class="chart-sub">总资产 / 负债可在图例关闭</span>
      </div>
      <NSkeleton v-if="loading" class="chart-skeleton" height="320px" />
      <NetWorthLine v-else :points="points" />
    </section>

    <!-- 月度净增 + 账户构成 -->
    <section class="chart-grid">
      <div class="card">
        <div class="chart-head">
          <h2 class="card-title">
            月度净增
          </h2>
          <span class="chart-sub">向上攒钱 · 向下净流出</span>
        </div>
        <NSkeleton v-if="loading" class="chart-skeleton" height="280px" />
        <MonthlyChangeBar v-else :points="points" />
      </div>

      <div class="card">
        <div class="chart-head">
          <h2 class="card-title">
            账户构成
          </h2>
          <span class="chart-sub">向左为欠款</span>
        </div>
        <NSkeleton v-if="loading" class="chart-skeleton" height="280px" />
        <EmptyState
          v-else-if="isEmpty"
          variant="wallet"
          size="sm"
          title="还没有账户"
          desc="建一个账户，才能看到资产构成"
        >
          <NButton size="small" @click="goAccount">
            去账户管理
          </NButton>
        </EmptyState>
        <AccountComposition v-else :accounts="account.accounts" />
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.asset-page {
  max-width: 1600px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

// eyebrow：把「区间多长、覆盖到哪月」放在标题之上，标题就不必再兼职报区间
.page-eyebrow {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--lz-text-secondary);
  letter-spacing: 0.04em;
  margin-bottom: 2px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--lz-text-primary);
  margin: 0 0 4px;
}

.page-subtitle {
  font-size: 13px;
  color: var(--lz-text-secondary);
  margin: 0;
}

// 区间切换贴住右侧顶部：它是「限定条件」，不需要和标题抢垂直空间
.range-switch {
  flex-shrink: 0;
  padding-top: 2px;
}

.page-error {
  margin-bottom: 16px;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.kpi-card {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 18px 22px;
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  box-shadow: var(--lz-shadow-sm);
  min-width: 0;
  @include transition-paint();

  &:hover {
    box-shadow: var(--lz-shadow-md);
  }

  /**
   * 顶部语义色渐隐条
   *
   * 四张卡并排时长得一模一样，扫视时没有抓手。一条 2px 的色条向右淡出，
   * 既标出这张卡的语义（净增的涨 / 回撤的亏），又不会像整块色带那样压过数字。
   * 颜色由模板传下来的 --card-tone 决定，与设置页的金额配色同源。
   */
  &::before {
    content: '';
    position: absolute;
    inset: 0 0 auto;
    height: 2px;
    background: linear-gradient(90deg, var(--card-tone) 0%, transparent 72%);
  }
}

.kpi-label {
  font-size: 13px;
  color: var(--lz-text-secondary);
}

.kpi-value {
  @include tabular;

  font-size: 26px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.02em;
  // 等宽数字比无衬线宽约 8%，窄卡里「最大回撤」这类金额容易被挤到换行
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--card-tone, var(--lz-text-primary));
}

.kpi-sub {
  font-size: 12px;
  color: var(--lz-text-secondary);
}

.card {
  padding: 18px 20px;
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  box-shadow: var(--lz-shadow-sm);
  margin-bottom: 16px;
  min-width: 0;
}

// 图表卡头部：标题 + 口径说明（图例已经交代了序列名，这里补的是读法）
.chart-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--lz-text-primary);
  margin: 0;
}

.chart-sub {
  font-size: 12px;
  color: var(--lz-text-secondary);
  flex-shrink: 0;
}

.chart-grid {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  gap: 16px;
}

.chart-skeleton {
  border-radius: var(--lz-radius-lg);
}

// ── 响应式 ───────────────────────────────────────────────
// 等宽数字更占宽度，四卡并排在 1200px 以下会挤到省略号，提前收成 2×2
@media (max-width: 1199px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 991px) {
  .chart-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
  }
}

@media (max-width: 575px) {
  .kpi-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
