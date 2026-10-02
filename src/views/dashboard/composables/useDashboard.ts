/**
 * 仪表盘数据编排（SWR 缓存版）
 * ====================================================================
 * 与 useTransactionList 同构：页面只管渲染，取数/loading/错误都收在这里。
 *
 * 两处联动：
 * 1. quickEntry.dataChangedAt —— 弹层挂在 layout 层、仪表盘是路由页，
 *    两者没有父子关系，记完一笔后靠这个 store 信号通知仪表盘重新聚合，
 *    否则用户记完账回到仪表盘看到的还是旧数字。
 * 2. book.currentBookId —— 切账本等于换一整套数据，整屏重算（US-005）。
 *
 * 缓存（方案 B）：overview / 净资产等 state 提升到模块作用域，组件销毁不清空；
 * 进入页面若当前账本已有缓存则立即渲染旧数据、后台静默刷新，骨架屏仅真·首次出现。
 */
import type { DashboardOverview } from '@/types/stats'
import { ref, watch } from 'vue'
import { getDashboardOverview, getTotalNetAssets, listAccountBalances } from '@/api/modules/stats'
import { createBookCache } from '@/composables/useBookCache'
import { useBookStore } from '@/stores/modules/book'
import { useQuickEntryStore } from '@/stores/modules/quickEntry'

// ── 模块级状态：组件销毁不清空 = 跨页面进入的缓存 ──
const overview = ref<DashboardOverview | null>(null)
const totalNetAssets = ref<number | null>(null)
const currentBookNetAssets = ref<number | null>(null)
const error = ref<string | null>(null)

interface DashSnap {
  overview: DashboardOverview | null
  totalNetAssets: number | null
  currentBookNetAssets: number | null
}

async function fetchDashboard(bid: number): Promise<void> {
  const book = useBookStore()
  error.value = null
  try {
    // 先确保账本已定（持久化的 ID 可能已失效，ensureLoaded 会兜底回默认账本）
    await book.ensureLoaded()
    // 两份数据并发拉，但互不阻塞：总卡挂了不能让「当前账本」主视图也白屏。
    const [overviewResult, totalResult, currentResult] = await Promise.allSettled([
      getDashboardOverview({ bookId: bid }),
      getTotalNetAssets(),
      listAccountBalances(bid),
    ])
    if (overviewResult.status === 'rejected')
      throw overviewResult.reason
    overview.value = overviewResult.value
    totalNetAssets.value = totalResult.status === 'fulfilled' ? totalResult.value : null
    // 当前账本「我的净资产」：只合计自己的账户（mine !== false）—— 成员账户是别人的钱，不计入
    currentBookNetAssets.value = currentResult.status === 'fulfilled'
      ? currentResult.value.filter(x => x.mine !== false).reduce((s, x) => s + x.balance, 0)
      : null
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : '仪表盘数据加载失败'
  }
}

const dashboardCache = createBookCache<DashSnap>(
  'dashboard',
  fetchDashboard,
  () => ({
    overview: overview.value,
    totalNetAssets: totalNetAssets.value,
    currentBookNetAssets: currentBookNetAssets.value,
  }),
  (snap) => {
    overview.value = snap.overview
    totalNetAssets.value = snap.totalNetAssets
    currentBookNetAssets.value = snap.currentBookNetAssets
  },
)

export function useDashboard() {
  const quickEntry = useQuickEntryStore()
  const book = useBookStore()

  // 记账 / 撤销后自动重新聚合（0 = 本次会话还没变更过，跳过首次触发）
  watch(
    () => quickEntry.dataChangedAt,
    (at) => {
      if (at > 0)
        void dashboardCache.run()
    },
  )

  // 切账本：整屏数据换一套
  watch(
    () => book.currentBookId,
    () => void dashboardCache.run(),
  )

  return {
    overview,
    totalNetAssets,
    currentBookNetAssets,
    loading: dashboardCache.loading,
    error,
    load: dashboardCache.run,
  }
}
