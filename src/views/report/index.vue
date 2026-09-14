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
import EmojiText from '@/components/business/emoji-text/index.vue'
import EmptyState from '@/components/business/empty-state/index.vue'
import FlowRail from '@/components/business/flow-rail/index.vue'
import { useAccountStore } from '@/stores/modules/account'
import { useBookStore } from '@/stores/modules/book'
import { useDictStore } from '@/stores/modules/dict'
import { useSettingsStore } from '@/stores/modules/settings'
import { downloadCsv, safeFilePart } from '@/utils/csv'
import { formatCents } from '@/utils/money'
import { emojiOption, renderEmojiLabel } from '@/utils/select-option'
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
  dict.categories.map(c => emojiOption(c.icon, c.name, c.id)),
)

const accountOptions = computed(() =>
  account.accounts.map(a => emojiOption(a.icon, a.name, a.id)),
)

/**
 * 区间净额（收入 − 支出）：汇总带的主数字。
 *
 * 比原来那行「收入 +¥x 支出 -¥y 笔数 n」三个平铺文本强的地方在于
 * 净额是**推导结论**，而收入/支出是**构成** —— 结论该有更大的字号，
 * 构成交给下面的收支结构轨去表达比例关系。带 withSign 是为了让
 * 颜色之外还有符号编码（架构 3.1：颜色永远不是唯一编码）。
 */
const netCents = computed(() => (result.value?.income ?? 0) - (result.value?.expense ?? 0))

const netTone = computed(() => settings.toneFor(
  netCents.value > 0 ? 'income' : netCents.value < 0 ? 'expense' : 'neutral',
))

const netText = computed(() => formatCents(netCents.value, { withSymbol: true, withSign: true }))

/** 当前粒度的中文标签，给图表卡标题做「口径提示」 */
const granularityLabel = computed(() =>
  GRANULARITY_OPTIONS.find(g => g.value === granularity.value)?.label ?? '按时间',
)

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
    width: 150,
    render: (row) => {
      const c = categoryMap.value.get(row.categoryId)
      return h(EmojiText, { icon: c?.icon, text: c?.name ?? '未分类', size: 16 })
    },
  },
  {
    title: '账户',
    key: 'accountId',
    width: 160,
    render: (row) => {
      const a = accountMap.value.get(row.accountId)
      return h(EmojiText, { icon: a?.icon, text: a?.name ?? '-', size: 16 })
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
  // 金额导出成「元」的纯数字：带 ¥ 或千分位的话 Excel 会当文本，没法直接求和。
  // 转义 / BOM / \r\n 行分隔都交给 utils/csv.ts 统一处理（以前这里是裸 join，备注含逗号会串列）
  const rows = [
    ['时间', '收入(元)', '支出(元)'],
    ...buckets.map(b => [b.label, (b.income / 100).toFixed(2), (b.expense / 100).toFixed(2)]),
    ['合计', ((result.value?.income ?? 0) / 100).toFixed(2), ((result.value?.expense ?? 0) / 100).toFixed(2)],
  ]
  downloadCsv(`报表_${safeFilePart(start.value)}_${safeFilePart(end.value)}.csv`, rows)
  message.success('已导出当前视图 CSV')
}
</script>

<template>
  <div class="report-page">
    <header class="page-header">
      <div class="heading">
        <h1 class="page-title">
          报表中心
        </h1>
        <p class="page-subtitle">
          {{ book.currentBook?.name ?? '当前账本' }} · 时间 × 分类 × 账户 交叉看收支
        </p>
      </div>
    </header>

    <NAlert v-if="error" type="error" :title="error" class="page-error" closable />

    <!-- 多维筛选条 -->
    <section class="lz-filter-bar report-filter-bar">
      <div class="lz-filter-group">
        <span class="lz-filter-label">粒度</span>
        <NRadioGroup v-model:value="granularity" size="small">
          <NRadioButton v-for="g in GRANULARITY_OPTIONS" :key="g.value" :value="g.value">
            {{ g.label }}
          </NRadioButton>
        </NRadioGroup>
      </div>

      <div class="lz-filter-divider" />

      <div class="lz-filter-group">
        <span class="lz-filter-label">时间</span>
        <NDatePicker
          v-model:formatted-value="start"
          type="date"
          value-format="yyyy-MM-dd"
          :clearable="false"
          size="small"
          style="width: 130px"
        />
        <span class="lz-filter-sep">~</span>
        <NDatePicker
          v-model:formatted-value="end"
          type="date"
          value-format="yyyy-MM-dd"
          :clearable="false"
          size="small"
          style="width: 130px"
        />
      </div>

      <div class="lz-filter-divider" />

      <div class="lz-filter-group">
        <span class="lz-filter-label">类型</span>
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

      <div class="lz-filter-divider" />

      <div class="lz-filter-group report-filter-dimensions">
        <NSelect
          v-model:value="categoryIds"
          multiple
          clearable
          size="small"
          placeholder="全部分类"
          :options="categoryOptions"
          :render-label="renderEmojiLabel"
          max-tag-count="responsive"
          :input-props="{ 'aria-label': '分类筛选' }"
          style="width: 180px"
        />
        <NSelect
          v-model:value="accountIds"
          multiple
          clearable
          size="small"
          placeholder="全部账户"
          :options="accountOptions"
          :render-label="renderEmojiLabel"
          max-tag-count="responsive"
          :input-props="{ 'aria-label': '账户筛选' }"
          style="width: 180px"
        />
      </div>
    </section>

    <!-- 区间汇总：净额（结论）+ 收支结构轨（构成），与仪表盘共用同一个组件 -->
    <section class="summary-band" aria-label="区间汇总">
      <div class="summary-net">
        <span class="summary-label">
          区间净额
        </span>
        <b class="summary-value" :style="{ color: settings.toneColor(netTone) }">{{ netText }}</b>
        <span class="summary-meta">共 {{ result?.count ?? 0 }} 笔</span>
      </div>

      <!-- 收支结构轨：与仪表盘共用同一个组件（比例这层信息原来完全缺失） -->
      <FlowRail
        :income="result?.income ?? 0"
        :expense="result?.expense ?? 0"
        show-values
        caption="区间收支结构"
      />
    </section>

    <!-- 图表区：柱 / 折线 / 饼 切换 -->
    <section class="card">
      <div class="chart-head">
        <!-- 标题带上当前口径（粒度 + 区间）：这里最容易「看到的图和以为的筛选不一致」 -->
        <div class="chart-head-main">
          <h2 class="card-title">
            收支走势
          </h2>
          <span class="chart-head-sub">{{ granularityLabel }} · {{ start }} ~ {{ end }}</span>
        </div>
        <div class="chart-head-actions">
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
      </div>

      <NSkeleton v-if="loading" class="chart-skeleton" height="340px" />
      <EmptyState
        v-else-if="!result || result.count === 0"
        variant="chart"
        size="sm"
        source="twemoji"
        title="当前筛选条件下没有收支数据"
        desc="换个时间范围或分类试试"
      />
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
        <h2 class="card-title">
          明细 · {{ drill.title }}
        </h2>
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
.report-filter-bar {
  margin-bottom: 14px;
  align-items: center;
}

.report-filter-dimensions {
  margin-left: auto;
}

// ── 区间汇总带 ───────────────────────────────────────────
// 左「结论」（净额）右「构成」（收支结构轨），中间一条竖线划分。
// 原来的三行小字把结论和构成摆在同一条水平线上，谁都不是重点。
.summary-band {
  display: grid;
  grid-template-columns: minmax(0, 200px) minmax(0, 1fr);
  align-items: center;
  gap: 24px;
  padding: 16px 20px;
  margin-bottom: 16px;
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  box-shadow: var(--lz-shadow-sm);
}

.summary-net {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 24px;
  border-right: 1px solid var(--lz-border);
  min-width: 0;
}

.summary-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--lz-text-secondary);
  letter-spacing: 0.02em;
}

.summary-value {
  @include tabular;

  font-size: 26px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.02em;
  // 颜色由内联 style 给（走 settings.toneColor），这里只定字形
  white-space: nowrap;
}

.summary-meta {
  font-size: 12px;
  color: var(--lz-text-secondary);
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
  gap: 16px;
  margin-bottom: 16px;
}

.chart-head-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.chart-head-sub {
  @include tabular;

  font-size: 12px;
  color: var(--lz-text-secondary);
}

.chart-head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.chart-skeleton {
  border-radius: var(--lz-radius-lg);
}

.chart-hint {
  margin: 10px 0 0;
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

@media (max-width: 860px) {
  .report-filter-bar {
    flex-direction: column;
    align-items: stretch;
    gap: var(--lz-space-3);
  }

  .report-filter-dimensions {
    margin-left: 0;
  }

  .lz-filter-divider {
    display: none;
  }

  // 汇总带在窄屏下改成上下排：净额在上、结构轨在下，竖线换成横线
  .summary-band {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }

  .summary-net {
    padding-right: 0;
    padding-bottom: 14px;
    border-right: none;
    border-bottom: 1px solid var(--lz-border);
  }
}
</style>
