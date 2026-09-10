/**
 * 预算页取数（US-006）
 * ====================================================================
 * 刷新时机与资产趋势页同一套约定：
 *   1. 切账本 —— 预算跟着账本走
 *   2. 换月份 —— 月份就是查询参数
 *   3. 记完账 —— 花费由流水现算，流水变了进度条必须实时回跑（US-006 验收项）
 */

import type { BudgetOverview } from '@/types/budget'
import { ref, watch } from 'vue'
import { getBudgetOverview } from '@/api/modules/budget'
import { useBookStore } from '@/stores/modules/book'
import { useQuickEntryStore } from '@/stores/modules/quickEntry'
import { formatMonth, today } from '@/utils/temporal'

export function useBudgets() {
  const book = useBookStore()
  const quickEntry = useQuickEntryStore()

  const overview = ref<BudgetOverview | null>(null)
  /** 正在查看的月份（YYYY-MM），默认当月 */
  const month = ref<string>(formatMonth(today().toPlainYearMonth()))
  const loading = ref(false)
  const error = ref('')

  async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      overview.value = await getBudgetOverview({ bookId: book.currentBookId, month: month.value })
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : '预算加载失败'
    }
    finally {
      loading.value = false
    }
  }

  watch([() => book.currentBookId, month], () => void load())
  watch(() => quickEntry.dataChangedAt, () => void load())

  return { overview, month, loading, error, load }
}
