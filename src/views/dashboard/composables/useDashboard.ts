/**
 * 仪表盘数据编排
 * ====================================================================
 * 与 useTransactionList 同构：页面只管渲染，取数/loading/错误都收在这里。
 *
 * 两处联动：
 * 1. quickEntry.dataChangedAt —— 弹层挂在 layout 层、仪表盘是路由页，
 *    两者没有父子关系，记完一笔后靠这个 store 信号通知仪表盘重新聚合，
 *    否则用户记完账回到仪表盘看到的还是旧数字。
 * 2. book.currentBookId —— 切账本等于换一整套数据，整屏重算（US-005）。
 */
import type { DashboardOverview } from '@/types/stats'
import { ref, watch } from 'vue'
import { getDashboardOverview, getTotalNetAssets, listAccountBalances } from '@/api/modules/stats'
import { useBookStore } from '@/stores/modules/book'
import { useQuickEntryStore } from '@/stores/modules/quickEntry'

export function useDashboard() {
  const overview = ref<DashboardOverview | null>(null)
  /** 全账本总资产净值（切账本不变化）—— 真实后端：跨全部账本汇总账户余额 */
  const totalNetAssets = ref<number | null>(null)
  /** 当前账本净值（随账本切换变化）—— 真实后端：当前账本账户余额之和（替代原 mock overview.netAssets） */
  const currentBookNetAssets = ref<number | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const quickEntry = useQuickEntryStore()
  const book = useBookStore()

  async function load(month?: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      // 先确保账本已定（持久化的 ID 可能已失效，ensureLoaded 会兜底回默认账本）
      await book.ensureLoaded()
      // 两份数据并发拉，但互不阻塞：总卡挂了不能让「当前账本」主视图也白屏。
      // allSettled 让总卡失败时只把它置 null，主卡继续展示。
      const [overviewResult, totalResult, currentResult] = await Promise.allSettled([
        getDashboardOverview({ month, bookId: book.currentBookId }),
        getTotalNetAssets(),
        listAccountBalances(book.currentBookId),
      ])
      if (overviewResult.status === 'rejected')
        throw overviewResult.reason
      overview.value = overviewResult.value
      totalNetAssets.value = totalResult.status === 'fulfilled' ? totalResult.value : null
      // 当前账本净值：该账本账户余额之和（真实后端现算，替代原 mock overview.netAssets）
      currentBookNetAssets.value = currentResult.status === 'fulfilled'
        ? currentResult.value.reduce((s, x) => s + x.balance, 0)
        : null
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : '仪表盘数据加载失败'
    }
    finally {
      loading.value = false
    }
  }

  // 记账 / 撤销后自动重新聚合（0 = 本次会话还没变更过，跳过首次触发）
  watch(
    () => quickEntry.dataChangedAt,
    (at) => {
      if (at > 0)
        void load()
    },
  )

  // 切账本：整屏数据换一套
  watch(
    () => book.currentBookId,
    () => void load(),
  )

  return { overview, totalNetAssets, currentBookNetAssets, loading, error, load }
}
