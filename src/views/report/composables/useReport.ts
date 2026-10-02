/**
 * 报表页取数 + 筛选状态（US-007，SWR 缓存版）
 * ====================================================================
 * 筛选条件变化用 200ms 防抖（PRD 9.1 报表筛选规格）：
 * 分类/账户多选连点几下只发最后一次请求，否则手速快一点就是请求风暴。
 * 切账本不走防抖 —— 账本级数据切换是硬边界，立即重取。
 *
 * 缓存（方案 B）：筛选条件与 result 提升到模块作用域；进入页面有缓存则即时渲染旧数据、
 * 后台静默刷新，骨架屏仅真·首次出现。筛选条件随模块保留，离开报表页再回来仍是上次的。
 */
import type { ReportGranularity, ReportResult } from '@/types/report'
import { watchDebounced } from '@vueuse/core'
import { ref, watch } from 'vue'
import { getReport } from '@/api/modules/report'
import { createBookCache } from '@/composables/useBookCache'
import { useBookStore } from '@/stores/modules/book'
import { useQuickEntryStore } from '@/stores/modules/quickEntry'
import { formatDate, today } from '@/utils/temporal'

/** 图表形态 */
export type ReportChartType = 'bar' | 'line' | 'pie'
/** 收支侧重：影响饼图数据源和下钻的类型过滤；柱/折线永远双系列 */
export type ReportFlowFilter = 'both' | 'expense' | 'income'

export const GRANULARITY_OPTIONS: Array<{ label: string, value: ReportGranularity }> = [
  { label: '日', value: 'day' },
  { label: '周', value: 'week' },
  { label: '月', value: 'month' },
  { label: '季', value: 'quarter' },
  { label: '年', value: 'year' },
]

// ── 模块级：筛选条件 + 数据 + 缓存 ──
const result = ref<ReportResult | null>(null)
const error = ref('')
const granularity = ref<ReportGranularity>('month')
/** 默认近 6 个整月 + 当月：报表的主场景是「看趋势」，默认太窄看不到形 */
const start = ref(formatDate(today().toPlainYearMonth().subtract({ months: 5 }).toPlainDate({ day: 1 })))
const end = ref(formatDate(today()))
const categoryIds = ref<number[]>([])
const accountIds = ref<number[]>([])
const flowType = ref<ReportFlowFilter>('both')

async function fetchReport(bid: number): Promise<void> {
  error.value = ''
  try {
    result.value = await getReport({
      bookId: bid,
      start: start.value,
      end: end.value,
      granularity: granularity.value,
      categoryIds: categoryIds.value,
      accountIds: accountIds.value,
    })
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : '报表加载失败'
  }
}

const reportCache = createBookCache<{ result: ReportResult | null }>(
  'report',
  fetchReport,
  () => ({ result: result.value }),
  (snap) => { result.value = snap.result },
)

export function useReport() {
  const book = useBookStore()
  const quickEntry = useQuickEntryStore()

  // 筛选条件 200ms 防抖；数组条件要 deep watch（多选是原地改数组）
  watchDebounced(
    [granularity, start, end, categoryIds, accountIds],
    () => void reportCache.run(),
    { debounce: 200, deep: true },
  )

  // 切账本立即重取（数据可见性边界，不走防抖）；记完账也要回跑
  watch(() => book.currentBookId, () => void reportCache.run())
  watch(() => quickEntry.dataChangedAt, () => void reportCache.run())

  return {
    result,
    loading: reportCache.loading,
    error,
    granularity,
    start,
    end,
    categoryIds,
    accountIds,
    flowType,
    load: reportCache.run,
  }
}
