/**
 * 预算页取数（US-006，SWR 缓存版）
 * ====================================================================
 * 刷新时机与资产趋势页同一套约定：
 *   1. 切账本 —— 预算跟着账本走
 *   2. 换月份 —— 月份就是查询参数
 *   3. 记完账 —— 花费由流水现算，流水变了进度条必须实时回跑（US-006 验收项）
 *
 * 缓存（方案 B）：overview / month 提升到模块作用域；进入页面有缓存则即时渲染、
 * 后台静默刷新，骨架屏仅真·首次出现。
 */

import type { BudgetOverview } from '@/types/budget'
import { ref, watch } from 'vue'
import { getBudgetOverview } from '@/api/modules/budget'
import { createBookCache } from '@/composables/useBookCache'
import { useBookStore } from '@/stores/modules/book'
import { useQuickEntryStore } from '@/stores/modules/quickEntry'
import { formatMonth, today } from '@/utils/temporal'

// ── 模块级状态：组件销毁不清空 = 缓存 ──
const overview = ref<BudgetOverview | null>(null)
/** 正在查看的月份（YYYY-MM），默认当月 */
const month = ref<string>(formatMonth(today().toPlainYearMonth()))
const error = ref('')

async function fetchBudget(bid: number): Promise<void> {
  error.value = ''
  try {
    overview.value = await getBudgetOverview({ bookId: bid, month: month.value })
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : '预算加载失败'
  }
}

const budgetCache = createBookCache<{ overview: BudgetOverview | null }>(
  'budget',
  fetchBudget,
  () => ({ overview: overview.value }),
  (snap) => { overview.value = snap.overview },
)

export function useBudgets() {
  const book = useBookStore()
  const quickEntry = useQuickEntryStore()

  watch([() => book.currentBookId, month], () => void budgetCache.run())
  watch(() => quickEntry.dataChangedAt, () => void budgetCache.run())

  return { overview, month, loading: budgetCache.loading, error, load: budgetCache.run }
}
