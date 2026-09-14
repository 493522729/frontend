<script setup lang="ts">
/**
 * 仪表盘首页（PRD US-002 / 8.1）
 * ====================================================================
 * 「打开就能一眼看本月花哪了」—— 4 数据卡 + 环图 + 折线，一次接口拿全。
 *
 * 空状态是这里最容易被忽略的分支：新用户本月 0 笔交易时，
 * 环图渲染出来是一个空圆环 + 空图例，看着像"加载失败"。
 * 所以 0 笔时直接换成「记第一笔」引导，把用户导向 Cmd+K 那条主路径。
 */
import { computed, onMounted } from 'vue'
import EmptyState from '@/components/business/empty-state/index.vue'
import FlowRail from '@/components/business/flow-rail/index.vue'
import { useBookStore } from '@/stores/modules/book'
import { useQuickEntryStore } from '@/stores/modules/quickEntry'
import { formatCents } from '@/utils/money'
import { monthLabel, parseMonth } from '@/utils/temporal'
import CategoryPie from './components/CategoryPie.vue'
import StatCard from './components/StatCard.vue'
import TrendLine from './components/TrendLine.vue'
import { useDashboard } from './composables/useDashboard'

const { overview, totalNetAssets, currentBookNetAssets, loading, error, load } = useDashboard()
const quickEntry = useQuickEntryStore()
const book = useBookStore()

onMounted(() => load())

/** 「2026年9月」 */
const monthText = computed(() =>
  overview.value ? monthLabel(parseMonth(overview.value.month)) : '',
)

/** 本月是否有交易（空状态判断） */
const isEmpty = computed(() => !loading.value && (overview.value?.transactionCount ?? 0) === 0)

/** 环比卡：支出涨是坏事（红），跌是好事（绿） */
const momTone = computed<'income' | 'expense' | 'neutral'>(() => {
  const m = overview.value?.expenseMoM ?? 0
  if (m === 0)
    return 'neutral'
  return m > 0 ? 'expense' : 'income'
})

const momText = computed(() => {
  const m = overview.value?.expenseMoM ?? 0
  return `${m > 0 ? '+' : ''}${m.toFixed(1)}%`
})

function openQuickEntry(): void {
  quickEntry.open()
}
</script>

<template>
  <div class="dashboard">
    <header class="dash-header">
      <div class="dash-heading">
        <span class="page-eyebrow">{{ monthText }} · 本月收支</span>
        <h1 class="page-title">
          仪表盘
        </h1>
        <p class="page-subtitle">
          收支结构、分类占比与近半年趋势
        </p>
      </div>

      <!--
        资产净值：所有账户余额合计（PRD 8.1）
        刻意不做成两个带边框的盒子 —— 灰色描边的小卡片会和下面四张数据卡
        抢同一层视觉，反而把「最重要的存量数字」压低了。这里改成纯排版：
        一条竖分隔线划分「当前账本」与「跨账本合计」，靠字号和颜色分主次。
      -->
      <div class="net-block">
        <div class="net-item net-item--primary">
          <span class="net-label">资产净值</span>
          <NSkeleton v-if="loading" text width="120px" :height="30" />
          <span v-else class="net-value net-value--primary">
            {{ currentBookNetAssets == null ? '—' : formatCents(currentBookNetAssets, { withSymbol: true }) }}
          </span>
        </div>

        <span class="net-divider" aria-hidden="true" />

        <!-- 总资产净值：跨账本合计，切账本不变化，方便对账 -->
        <div class="net-item">
          <span class="net-label">总资产净值</span>
          <NSkeleton v-if="loading" text width="110px" :height="22" />
          <span v-else class="net-value">
            {{ totalNetAssets == null ? '—' : formatCents(totalNetAssets, { withSymbol: true }) }}
          </span>
          <span v-show="!loading" class="net-sub">全部 {{ book.books.length }} 个账本</span>
        </div>
      </div>
    </header>

    <NAlert v-if="error" type="error" :title="error" class="dash-error" closable />

    <!-- 4 数据卡 -->
    <section class="stat-grid" aria-label="本月概览">
      <StatCard
        label="本月收入"
        :value="overview?.income ?? 0"
        tone="income"
        :mom="overview?.incomeMoM ?? null"
        mom-good-when="up"
        :loading="loading"
      />
      <StatCard
        label="本月支出"
        :value="overview?.expense ?? 0"
        tone="expense"
        :mom="overview?.expenseMoM ?? null"
        mom-good-when="down"
        :loading="loading"
      />
      <StatCard
        label="本月结余"
        :value="overview?.balance ?? 0"
        tone="auto"
        :loading="loading"
      />
      <StatCard
        label="支出环比"
        :text="momText"
        :tone="momTone"
        :loading="loading"
      />
    </section>

    <!--
      收支结构带：四张卡只给了绝对额，看不出收入与支出的力量对比。
      这条轨把「比例」这层信息补上，充当四张卡与下方图表之间的过渡。
    -->
    <section class="flow-band" aria-label="本月收支结构">
      <FlowRail
        :income="overview?.income ?? 0"
        :expense="overview?.expense ?? 0"
        caption="本月收支结构"
      />
    </section>

    <!-- 环图 + 折线 -->
    <section class="chart-grid" aria-label="收支结构">
      <div class="chart-card">
        <div class="chart-head">
          <h2 class="chart-title">
            支出分类占比
          </h2>
          <span class="chart-sub">Top 6 + 其他</span>
        </div>

        <NSkeleton v-if="loading" class="chart-skeleton" height="300px" />

        <!-- 空状态：本月还没记账，引导走 Cmd+K 主路径 -->
        <EmptyState
          v-else-if="isEmpty"
          variant="chart"
          size="sm"
          title="本月还没有交易"
          desc="记下第一笔，这里就会长出你的收支结构"
        >
          <NButton type="primary" size="small" @click="openQuickEntry">
            记第一笔
          </NButton>
        </EmptyState>

        <CategoryPie v-else :slices="overview?.categories ?? []" />
      </div>

      <div class="chart-card">
        <div class="chart-head">
          <h2 class="chart-title">
            近 6 月收支趋势
          </h2>
          <!-- 图例只说了两条线的名字，这条虚线得单独交代一句 -->
          <span class="chart-sub">虚线为月均支出</span>
        </div>
        <NSkeleton v-if="loading" class="chart-skeleton" height="300px" />
        <TrendLine v-else :points="overview?.trend ?? []" />
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.dashboard {
  max-width: 1600px;
  margin: 0 auto;
}

.dash-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 20px;
}

// eyebrow：把「哪个月」这层上下文放在标题之上，标题就不必再兼职报月份
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

// 资产区：没有卡片外壳，靠竖分隔线 + 字号差建立主次
.net-block {
  display: flex;
  align-items: stretch;
  gap: 20px;
  flex-shrink: 0;
  padding-top: 2px;
}

.net-item {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.net-divider {
  width: 1px;
  background: var(--lz-border);
}

.net-label {
  font-size: 12px;
  color: var(--lz-text-secondary);
  letter-spacing: 0.02em;
}

.net-value {
  @include tabular;

  font-size: 18px;
  font-weight: 600;
  color: var(--lz-text-primary);
  letter-spacing: -0.01em;
  white-space: nowrap;
}

// 当前账本的净值才是主角，跨账本合计是参考值
.net-value--primary {
  font-size: 26px;
  letter-spacing: -0.025em;
}

.net-sub {
  font-size: 11px;
  color: var(--lz-text-secondary);
  opacity: 0.85;
}

.dash-error {
  margin-bottom: 16px;
}

// 4 卡：< 1200px 变 2×2（等宽数字比无衬线宽，断点比原来的 992 提前一档）
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

// 收支结构带：与数据卡同样式的外壳，保持一致的语言
.flow-band {
  padding: 16px 20px;
  margin-bottom: 16px;
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  box-shadow: var(--lz-shadow-sm);
}

// 环图窄、折线宽：折线要放 6 个月的 x 轴，需要更长的横向空间
.chart-grid {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: 16px;
}

.chart-card {
  padding: 18px 20px;
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  box-shadow: var(--lz-shadow-sm);
  min-width: 0; // grid 子项不设会撑破容器
}

// 图表卡头部：标题 + 口径说明（Top 6 + 其他 / 虚线含义）
.chart-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.chart-title {
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

.chart-skeleton {
  border-radius: var(--lz-radius-lg);
}

// ── 响应式 ────────────────────────────────────────────────
// 等宽数字占了更多横向空间，四卡并排在 1200px 以下会挤到省略号，提前收成 2×2
@media (max-width: 1199px) {
  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

// < 992px：图表上下排，资产区改左对齐
@media (max-width: 991px) {
  .chart-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .dash-header {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .net-block {
    gap: 16px;
  }

  .net-item {
    align-items: flex-start;
  }
}

@media (max-width: 575px) {
  .stat-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  // 资产区在窄屏下纵向堆叠，右侧竖分隔线换成横向留白
  .net-block {
    flex-direction: column;
    gap: 10px;
  }

  .net-divider {
    display: none;
  }

  .net-value--primary {
    font-size: 24px;
  }
}
</style>
