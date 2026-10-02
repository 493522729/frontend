/**
 * 资产趋势页取数（净值走势 + 账户构成，SWR 缓存版）
 * ====================================================================
 * 三个刷新时机，一个都不能少：
 *   1. 切账本 —— 数据是账本隔离的，换账本等于换一整套资产
 *   2. 改区间（6/12/24 月）—— 区间本身就是请求参数
 *   3. 记完一笔账 —— 曲线末端就是「现在」，流水变了却不动会明显失真
 *
 * 缓存（方案 B）：trend / months / 数据提升到模块作用域；进入页面有缓存则即时渲染、
 * 后台静默刷新，骨架屏仅真·首次出现。
 */

import type { NetWorthTrend } from '@/types/stats'
import { ref, watch } from 'vue'
import { getNetWorthTrend } from '@/api/modules/stats'
import { createBookCache } from '@/composables/useBookCache'
import { useAccountStore } from '@/stores/modules/account'
import { useBookStore } from '@/stores/modules/book'
import { useQuickEntryStore } from '@/stores/modules/quickEntry'

/** 可选回看区间（月）—— mock 数据跨过去 24 个月，最长就给到 24 */
export const RANGE_OPTIONS = [6, 12, 24] as const

// ── 模块级状态：组件销毁不清空 = 缓存 ──
const trend = ref<NetWorthTrend | null>(null)
/** 回看月数，默认 12（一年才看得出趋势，6 个月噪音太大） */
const months = ref<number>(12)
const error = ref('')

async function fetchAsset(bid: number): Promise<void> {
  const account = useAccountStore()
  error.value = ''
  try {
    await Promise.all([
      getNetWorthTrend({ bookId: bid, months: months.value }).then((t) => {
        trend.value = t
      }),
      account.ensureLoaded(true),
    ])
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : '资产趋势加载失败'
  }
}

const assetCache = createBookCache<{ trend: NetWorthTrend | null }>(
  'asset',
  fetchAsset,
  () => ({ trend: trend.value }),
  (snap) => { trend.value = snap.trend },
)

export function useAssetTrend() {
  const book = useBookStore()
  const quickEntry = useQuickEntryStore()

  watch([() => book.currentBookId, months], () => void assetCache.run())
  watch(() => quickEntry.dataChangedAt, () => void assetCache.run())

  return { trend, months, loading: assetCache.loading, error, load: assetCache.run }
}
