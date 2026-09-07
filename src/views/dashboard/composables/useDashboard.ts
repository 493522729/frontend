/**
 * 仪表盘数据编排
 * ====================================================================
 * 与 useTransactionList 同构：页面只管渲染，取数/loading/错误都收在这里。
 *
 * 一处联动：订阅 quickEntry.dataChangedAt。
 * 弹层挂在 layout 层、仪表盘是路由页，两者没有父子关系，
 * 记完一笔后靠这个 store 信号通知仪表盘重新聚合 —— 否则用户记完账
 * 回到仪表盘看到的还是旧数字（mock 数据存在内存里，不刷新就是脏的）。
 */
import type { DashboardOverview } from '@/types/stats'
import { ref, watch } from 'vue'
import { getDashboardOverview } from '@/api/modules/stats'
import { useQuickEntryStore } from '@/stores/modules/quickEntry'

export function useDashboard() {
  const overview = ref<DashboardOverview | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const quickEntry = useQuickEntryStore()

  async function load(month?: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      overview.value = await getDashboardOverview({ month })
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

  return { overview, loading, error, load }
}
