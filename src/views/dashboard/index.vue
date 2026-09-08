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
import { useBookStore } from '@/stores/modules/book'
import { useQuickEntryStore } from '@/stores/modules/quickEntry'
import { formatCents } from '@/utils/money'
import { monthLabel, parseMonth } from '@/utils/temporal'
import CategoryPie from './components/CategoryPie.vue'
import StatCard from './components/StatCard.vue'
import TrendLine from './components/TrendLine.vue'
import { useDashboard } from './composables/useDashboard'

const { overview, totalNetAssets, loading, error, load } = useDashboard()
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
        <h2 class="page-title">
          {{ monthText }} · 仪表盘
        </h2>
        <p class="page-subtitle">
          本月收支、分类占比与近半年趋势
        </p>
      </div>

      <!-- 资产净值：所有账户余额合计（PRD 8.1） -->
      <div class="net-assets-group">
        <div class="net-assets">
          <span class="net-label">资产净值</span>
          <NSkeleton v-if="loading" text width="120px" :height="26" />
          <span v-else class="net-value">
            {{ formatCents(overview?.netAssets ?? 0, { withSymbol: true }) }}
          </span>
        </div>

        <!-- 总资产净值：跨账本合计，切账本不变化，方便对账 -->
        <div class="net-assets">
          <span class="net-label">总资产净值</span>
          <NSkeleton v-if="loading" text width="120px" :height="26" />
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

    <!-- 环图 + 折线 -->
    <section class="chart-grid" aria-label="收支结构">
      <div class="chart-card">
        <h3 class="chart-title">
          支出分类占比
        </h3>

        <NSkeleton v-if="loading" class="chart-skeleton" height="300px" />

        <!-- 空状态：本月还没记账，引导走 Cmd+K 主路径 -->
        <div v-else-if="isEmpty" class="chart-empty">
          <span class="empty-icon" aria-hidden="true">📊</span>
          <p class="empty-text">
            本月还没有交易
          </p>
          <NButton type="primary" size="small" @click="openQuickEntry">
            记第一笔
          </NButton>
        </div>

        <CategoryPie v-else :slices="overview?.categories ?? []" />
      </div>

      <div class="chart-card">
        <h3 class="chart-title">
          近 6 月收支趋势
        </h3>
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
  gap: 16px;
  margin-bottom: 20px;
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

.net-assets-group {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}

.net-assets {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  padding: 10px 18px;
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  box-shadow: var(--lz-shadow-sm);
  flex-shrink: 0;
}

.net-label {
  font-size: 12px;
  color: var(--lz-text-secondary);
}

.net-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--lz-text-primary);
  font-variant-numeric: tabular-nums;
}

.net-sub {
  font-size: 11px;
  color: var(--lz-text-secondary);
  opacity: 0.85;
}

.dash-error {
  margin-bottom: 16px;
}

// 4 卡：< 992px 变 2×2（PRD 8.1 响应式规格）
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
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

.chart-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--lz-text-primary);
  margin: 0 0 8px;
}

.chart-skeleton {
  border-radius: var(--lz-radius-lg);
}

.chart-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 300px;
}

.empty-icon {
  font-size: 40px;
  opacity: 0.6;
}

.empty-text {
  font-size: 13px;
  color: var(--lz-text-secondary);
  margin: 0;
}

// ── 响应式：< 992px 卡片 2×2、图表上下排 ──────────────
@media (max-width: 991px) {
  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .chart-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .dash-header {
    flex-direction: column;
    align-items: stretch;
  }

  .net-assets {
    align-items: flex-start;
  }
}

@media (max-width: 575px) {
  .stat-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  // 两张资产卡在窄屏下纵向堆叠，避免横向被挤到换行
  .net-assets-group {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
