/**
 * 资产趋势页取数（净值走势 + 账户构成）
 * ====================================================================
 * 三个刷新时机，一个都不能少：
 *   1. 切账本 —— 数据是账本隔离的，换账本等于换一整套资产
 *   2. 改区间（6/12/24 月）—— 区间本身就是请求参数
 *   3. 记完一笔账 —— 曲线末端就是「现在」，流水变了却不动会明显失真
 *
 * 第 3 点最容易被漏：别的页面（流水页）改了数据，本页没订阅就一直是旧曲线，
 * 用户会以为「我刚记的这笔没算进去」。所以订阅 quickEntry.dataChangedAt 这个
 * 跨页刷新信号（架构约定的做法，见 stores/modules/quickEntry.ts）。
 */

import type { NetWorthTrend } from '@/types/stats'
import { ref, watch } from 'vue'
import { getNetWorthTrend } from '@/api/modules/stats'
import { useAccountStore } from '@/stores/modules/account'
import { useBookStore } from '@/stores/modules/book'
import { useQuickEntryStore } from '@/stores/modules/quickEntry'

/** 可选回看区间（月）—— mock 数据跨过去 24 个月，最长就给到 24 */
export const RANGE_OPTIONS = [6, 12, 24] as const

export function useAssetTrend() {
  const book = useBookStore()
  const account = useAccountStore()
  const quickEntry = useQuickEntryStore()

  const trend = ref<NetWorthTrend | null>(null)
  /** 回看月数，默认 12（一年才看得出趋势，6 个月噪音太大） */
  const months = ref<number>(12)
  const loading = ref(false)
  const error = ref('')

  async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      await Promise.all([
        getNetWorthTrend({ bookId: book.currentBookId, months: months.value }).then((t) => {
          trend.value = t
        }),
        account.ensureLoaded(true),
      ])
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : '资产趋势加载失败'
    }
    finally {
      loading.value = false
    }
  }

  watch([() => book.currentBookId, months], () => void load())
  watch(() => quickEntry.dataChangedAt, () => void load())

  return { trend, months, loading, error, load }
}
