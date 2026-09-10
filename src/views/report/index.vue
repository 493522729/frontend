<script setup lang="ts">
import type { DataTableColumns } from 'naive-ui'
/**
 * 报表中心（PRD US-007）
 * ====================================================================
 * 「时间 × 分类 × 账户」三维交叉看收支：
 *   顶部多维筛选条（粒度 / 起止 / 类型 / 分类 / 账户，200ms 防抖）
 *   → 中部图表区（柱 / 折线 / 饼可切换）
 *   → 底部下钻明细（点柱子 = 该时间桶；点扇区 = 该分类）。
 *
 * 下钻不是重新聚合：图表数据来自 getReport（聚合），
 * 明细来自 listTransactions（列表接口带同样的筛选条件），
 * 桶 key → 时间范围的换算走 bucketRange，与聚合共用同一份口径代码。
 */
import type { TransactionType } from '@/enums/transaction'
import type { CategorySlice } from '@/types/stats'
import type { Transaction } from '@/types/transaction'
import { NButton, NDataTable, NRadioButton, NRadioGroup, NSelect, NTag, useMessage } from 'naive-ui'
import { computed, h, onMounted, ref, watch } from 'vue'
import { bucketRange } from '@/api/modules/report'
import { listTransactions } from '@/api/modules/transaction'
import { useAccountStore } from '@/stores/modules/account'
import { useBookStore } from '@/stores/modules/book'
import { useDictStore } from '@/stores/modules/dict'
import { useSettingsStore } from '@/stores/modules/settings'
import { formatCents } from '@/utils/money'
import ReportBar from './components/ReportBar.vue'
import ReportLine from './components/ReportLine.vue'
import ReportPie from './components/ReportPie.vue'
import { GRANULARITY_OPTIONS, useReport } from './composables/useReport'

const report = useReport()
const book = useBookStore()
const dict = useDictStore()
const account = useAccountStore()
const settings = useSettingsStore()
const message = useMessage()

const {
  result,
  loading,
  error,
  granularity,
  start,
  end,
  categoryIds,
  accountIds,
  flowType,
  load,
} = report

onMounted(() => {
  void load()
  void dict.ensureCategories()
  void account.ensureLoaded()
})

const categoryOptions = computed(() =>
  dict.categories.map(c => ({ label: `${c.icon} ${c.name}`, value: c.id })),
)

const accountOptions = computed(() =>
  account.accounts.map(a => ({ label: `${a.icon} ${a.name}`, value: a.id })),
)

/** 汇总数（筛选后的区间合计）；手动带 +/- 号：汇总条上「收入 ¥x / 支出 ¥y」比裸数字更可读 */
const incomeText = computed(() => `+${formatCents(result.value?.income ?? 0, { withSymbol: true })}`)
const expenseText = computed(() => `-${formatCents(result.value?.expense ?? 0, { withSymbol: true })}`)

// ── 图表切换 ─────────────────────────────────────────────
type ChartKind = 'bar' | 'line' | 'pie'
const chartKind = ref<ChartKind>('bar')

/** 饼图数据源：收入侧重时用收入构成，其余用支出构成（与仪表盘口径一致） */
const pieSlices = computed<CategorySlice[]>(() => {
  if (!result.value)
    return []
  return flowType.value === 'income' ? result.value.incomeCategories : result.value.expenseCategories
})

// ── 下钻明细 ─────────────────────────────────────────────
interface DrillState {
  title: string
  start: string
  end: string
  categoryIds?: number[]
  types: TransactionType[]
}

const drill = ref<DrillState | null>(null)
const drillRows = ref<Transaction[]>([])
const drillTotal = ref(0)
const drillPage = ref(1)
const DRILL_PAGE_SIZE = 10
const drillLoading = ref(false)

/** 点柱/折线上的点：下钻该时间桶，筛选条件沿用当前的分类/账户/类型 */
function drillBucket(key: string): void {
  const r = bucketRange(key, granularity.value)
  const label = result.value?.buckets.find(b => b.key === key)?.label ?? key
  drill.value = {
    title: `${label}（${r.start} ~ ${r.end}）`,
    start: r.start,
    end: r.end,
    categoryIds: categoryIds.value.length ? [...categoryIds.value] : undefined,
    types: flowType.value === 'both' ? ['income', 'expense'] : [flowType.value],
  }
  drillPage.value = 1
}

/** 点饼图扇区：下钻该分类在整个筛选区间里的明细 */
function drillCategory(categoryId: number): void {
  const slice = pieSlices.value.find(s => s.categoryId === categoryId)
  drill.value = {
    title: `${slice?.icon ?? ''} ${slice?.name ?? '分类'} 明细`,
    start: start.value,
    end: end.value,
    categoryIds: [categoryId],
    types: [flowType.value === 'income' ? 'income' : 'expense'],
  }
  drillPage.value = 1
}

// drill 变了或翻页都重新拉明细
watch([drill, drillPage], () => void loadDrill())

function onDrillPageChange(page: number): void {
  drillPage.value = page
}

function drillCountPrefix(info: { itemCount: number | undefined }): string {
  return `共 ${info.itemCount ?? 0} 笔`
}

async function loadDrill(): Promise<void> {
  const d = drill.value
  if (!d)
    return
  drillLoading.value = true
  try {
    const res = await listTransactions({
      bookId: book.currentBookId,
      startDate: d.start,
      endDate: d.end,
      categoryIds: d.categoryIds,
      types: d.types,
      page: drillPage.value,
      pageSize: DRILL_PAGE_SIZE,
    })
    drillRows.value = res.list
    drillTotal.value = res.total
  }
  catch {
    message.error('明细加载失败')
  }
  finally {
    drillLoading.value = false
  }
}

// ── 明细表格列 ───────────────────────────────────────────
const categoryMap = computed(() => new Map(dict.categories.map(c => [c.id, c])))
const accountMap = computed(() => account.accountMap)

const drillColumns = computed<DataTableColumns<Transaction>>(() => [
  { title: '日期', key: 'transDate', width: 110 },
  {
    title: '类型',
    key: 'type',
    width: 76,
    render: row => h(NTag, {
      size: 'small',
      bordered: false,
      type: row.type === 'income' ? 'success' : 'error',
    }, { default: () => (row.type === 'income' ? '收入' : '支出') }),
  },
  {
    title: '分类',
    key: 'categoryId',
    width: 130,
    render: (row) => {
      const c = categoryMap.value.get(row.categoryId)
      return `${c?.icon ?? '📦'} ${c?.name ?? '未分类'}`
    },
  },
  {
    title: '账户',
    key: 'accountId',
    width: 140,
    render: (row) => {
      const a = accountMap.value.get(row.accountId)
      return `${a?.icon ?? '·'} ${a?.name ?? '-'}`
    },
  },
  {
    title: '金额',
    key: 'amount',
    width: 130,
    render: (row) => {
      const tone = settings.toneFor(row.type === 'income' ? 'income' : 'expense')
      const cls = tone === 'success' ? 'cell-success' : 'cell-danger'
      return h('span', { class: cls }, formatCents(row.amount, { withSymbol: true }))
    },
  },
  { title: '备注', key: 'note', ellipsis: { tooltip: true } },
])

// ── 导出 CSV（当前视图的时间桶）──────────────────────────
function exportCsv(): void {
  const buckets = result.value?.buckets ?? []
  if (!buckets.length) {
    message.warning('当前区间没有可导出的数据')
    return
  }
  // BOM 让 Excel 正确识别 UTF-8 中文
  const lines = [
    ['时间', '收入(元)', '支出(元)'],
    ...buckets.map(b => [b.label, (b.income / 100).toFixed(2), (b.expense / 100).toFixed(2)]),
    ['合计', ((result.value?.income ?? 0) / 100).toFixed(2), ((result.value?.expense ?? 0) / 100).toFixed(2)],
  ]
  const csv = `\uFEFF${lines.map(r => r.join(',')).join('\n')}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `报表_${start.value}_${end.value}.csv`
  a.click()
  URL.revokeObjectURL(url)
  message.success('已导出当前视图 CSV')
}
</script>

<template>
  <div class="report-page">
    <header class="page-header">
      <div class="heading">
        <h2 class="page-title">
          报表中心
        </h2>
        <p class="page-subtitle">
          {{ book.currentBook?.name ?? '当前账本' }} · 时间 × 分类 × 账户 交叉看收支
        </p>
      </div>
    </header>

    <NAlert v-if="error" type="error" :title="error" class="page-error" closable />

    <!-- 多维筛选条 -->
    <section class="filter-card">
      <div class="filter-row">
        <NRadioGroup v-model:value="granularity" size="small">
          <NRadioButton v-for="g in GRANULARITY_OPTIONS" :key="g.value" :value="g.value">
            {{ g.label }}
          </NRadioButton>
        </NRadioGroup>

        <div class="filter-dates">
          <NDatePicker
            v-model:formatted-value="start"
            type="date"
            value-format="yyyy-MM-dd"
            :clearable="false"
            size="small"
          />
          <span class="date-sep">~</span>
          <NDatePicker
            v-model:formatted-value="end"
            type="date"
            value-format="yyyy-MM-dd"
            :clearable="false"
            size="small"
          />
        </div>

        <NRadioGroup v-model:value="flowType" size="small">
          <NRadioButton value="both">
            全部
          </NRadioButton>
          <NRadioButton value="expense">
            支出
          </NRadioButton>
          <NRadioButton value="income">
            收入
          </NRadioButton>
        </NRadioGroup>
      </div>

      <div class="filter-row">
        <NSelect
          v-model:value="categoryIds"
          multiple
          clearable
          size="small"
          placeholder="全部分类"
          :options="categoryOptions"
          max-tag-count="responsive"
          class="filter-select"
        />
        <NSelect
          v-model:value="accountIds"
          multiple
          clearable
          size="small"
          placeholder="全部账户"
          :options="accountOptions"
          max-tag-count="responsive"
          class="filter-select"
        />
      </div>
    </section>

    <!-- 汇总条 -->
    <section class="summary-row" aria-label="区间汇总">
      <span class="summary-item">收入 <b class="tone-income">{{ incomeText }}</b></span>
      <span class="summary-item">支出 <b class="tone-expense">{{ expenseText }}</b></span>
      <span class="summary-item">笔数 <b>{{ result?.count ?? 0 }}</b></span>
    </section>

    <!-- 图表区：柱 / 折线 / 饼 切换 -->
    <section class="card">
      <div class="chart-head">
        <NRadioGroup v-model:value="chartKind" size="small">
          <NRadioButton value="bar">
            柱状
          </NRadioButton>
          <NRadioButton value="line">
            折线
          </NRadioButton>
          <NRadioButton value="pie">
            饼图
          </NRadioButton>
        </NRadioGroup>
        <NButton size="small" quaternary @click="exportCsv">
          导出 CSV
        </NButton>
      </div>

      <NSkeleton v-if="loading" class="chart-skeleton" height="340px" />
      <div v-else-if="!result || result.count === 0" class="chart-empty">
        <span class="empty-icon" aria-hidden="true">📉</span>
        <p class="empty-text">
          当前筛选条件下没有收支数据
        </p>
      </div>
      <template v-else>
        <ReportBar v-if="chartKind === 'bar'" :buckets="result.buckets" @select="drillBucket" />
        <ReportLine v-else-if="chartKind === 'line'" :buckets="result.buckets" @select="drillBucket" />
        <ReportPie v-else :slices="pieSlices" @select="drillCategory" />
        <p class="chart-hint">
          点击柱 / 点 / 扇区可下钻到对应明细
        </p>
      </template>
    </section>

    <!-- 下钻明细 -->
    <section v-if="drill" class="card">
      <div class="drill-head">
        <h3 class="card-title">
          明细 · {{ drill.title }}
        </h3>
        <NButton size="tiny" quaternary @click="drill = null">
          收起
        </NButton>
      </div>
      <NDataTable
        :columns="drillColumns"
        :data="drillRows"
        :loading="drillLoading"
        :row-key="(r: Transaction) => r.id"
        size="small"
        :bordered="false"
        remote
        :pagination="{
          page: drillPage,
          pageSize: DRILL_PAGE_SIZE,
          itemCount: drillTotal,
          onChange: onDrillPageChange,
          prefix: drillCountPrefix,
        }"
      />
    </section>
  </div>
</template>

<style scoped lang="scss">
.report-page {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 16px;
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

.page-error {
  margin-bottom: 16px;
}

// ── 筛选条 ───────────────────────────────────────────────
.filter-card {
  padding: 14px 18px;
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  box-shadow: var(--lz-shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-dates {
  display: flex;
  align-items: center;
  gap: 6px;
}

.date-sep {
  color: var(--lz-text-secondary);
}

.filter-select {
  min-width: 220px;
  flex: 1;
  max-width: 420px;
}

// ── 汇总条 ───────────────────────────────────────────────
.summary-row {
  display: flex;
  gap: 24px;
  margin-bottom: 14px;
  font-size: 13px;
  color: var(--lz-text-secondary);

  b {
    font-size: 16px;
    font-variant-numeric: tabular-nums;
  }
}

.tone-income {
  color: var(--lz-success);
}

.tone-expense {
  color: var(--lz-danger);
}

// ── 图表 / 明细卡 ────────────────────────────────────────
.card {
  padding: 18px 20px;
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  box-shadow: var(--lz-shadow-sm);
  margin-bottom: 16px;
  min-width: 0;
}

.chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
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

.chart-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--lz-text-secondary);
  text-align: center;
}

.drill-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--lz-text-primary);
  margin: 0;
}

:deep(.cell-success) {
  color: var(--lz-success);
  font-variant-numeric: tabular-nums;
}

:deep(.cell-danger) {
  color: var(--lz-danger);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 575px) {
  .filter-row {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-select {
    max-width: none;
  }
}
</style>
