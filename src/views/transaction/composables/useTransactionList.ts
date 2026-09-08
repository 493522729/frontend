import type { TransactionType } from '@/enums/transaction'
/**
 * 交易列表状态管理 composable
 * ====================================================================
 * 把筛选、分页、加载、批量操作、行内编辑都收敛在这里，
 * 视图组件只负责渲染 + 触发回调。
 *
 * 设计原则：
 *   - 筛选 → 加载 是原子操作（防抖 250ms）
 *   - 行内编辑乐观更新：本地立即改 → 调接口 → 失败回滚
 *   - 批量操作完成后整体 reload 一次（mock 内存已变）
 *   - 字典（分类/账户）走 dict store 跨页面共享，本 composable 不重复加载
 *
 * 类型说明：本 composable 不显式声明 return 类型，让 vue-tsc 推断，
 * 调用方解构时 Vue 自动 unwrap（运行时通过 Proxy 实现）。这是 Vue 3
 * setup-style composable 的标准模式。
 */
import type { Transaction } from '@/types/transaction'
import { reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  batchDeleteTransactions,
  batchUpdateCategory,
  deleteTransaction,
  listTransactions,
  restoreTransactions,
  updateTransaction,
} from '@/api/modules/transaction'
import { TRANSACTION_TYPES } from '@/enums/transaction'
import { useBookStore } from '@/stores/modules/book'
import { useDictStore } from '@/stores/modules/dict'

export interface FilterState {
  // DatePicker 的 v-model:formatted-value 用 null 代表「未选」，传 '' 会被当成非法日期解析抛 Invalid time value
  startDate: string | null
  endDate: string | null
  type: TransactionType | null
  accountIds: number[]
  categoryIds: number[]
  keyword: string
}

export function useTransactionList() {
  const dict = useDictStore()
  const book = useBookStore()
  const route = useRoute()
  const router = useRouter()

  // ── 数据 ──
  const list = ref<Transaction[]>([])
  const total = ref(0)
  const loading = ref(false)

  // ── 筛选 + 分页 ──
  const filter = reactive<FilterState>({
    startDate: null,
    endDate: null,
    type: null,
    accountIds: [],
    categoryIds: [],
    keyword: '',
  })
  const page = ref(1)
  const pageSize = ref(50)

  // ── 多选 ──
  const selectedIds = ref<number[]>([])

  // 最近一次批量删除的行（供「5s 撤销 toast」恢复用，mock 阶段直接放回内存表）
  const lastRemoved = ref<Transaction[]>([])

  function resetFilter() {
    filter.startDate = null
    filter.endDate = null
    filter.type = null
    filter.accountIds = []
    filter.categoryIds = []
    filter.keyword = ''
    page.value = 1
    syncToQuery()
  }

  function applyFilter(patch: Partial<FilterState>) {
    Object.assign(filter, patch)
    page.value = 1
  }

  // ── URL 查询串同步（US-005：切账本 / 刷新都不丢筛选条件） ──────────
  /**
   * 从 URL 恢复筛选条件
   *
   * URL 是用户可编辑的，所有取值都要**安全降级**：类型不对、枚举值非法、
   * 页码是负数，一律回落到默认值，不能让手改的 URL 把页面搞崩。
   */
  function restoreFromQuery(): void {
    const q = route.query
    const str = (v: unknown): string | null =>
      typeof v === 'string' && v.length > 0 ? v : null
    const ids = (v: unknown): number[] =>
      typeof v === 'string' && v.length > 0
        ? v.split(',').map(Number).filter(n => Number.isInteger(n) && n > 0)
        : []

    filter.startDate = str(q.startDate)
    filter.endDate = str(q.endDate)
    const t = str(q.type)
    filter.type = (TRANSACTION_TYPES as readonly string[]).includes(t ?? '')
      ? t as FilterState['type']
      : null
    filter.accountIds = ids(q.accounts)
    filter.categoryIds = ids(q.categories)
    filter.keyword = str(q.keyword) ?? ''
    const p = Number(q.page)
    page.value = Number.isInteger(p) && p > 0 ? p : 1
  }

  /**
   * 写回 URL
   *
   * 用 replace 而不是 push —— 每敲一个筛选字符就多一条历史记录，
   * 用户按返回键要按十几次才能退出页面，那是灾难。
   * 值为空的参数整个移除，避免留一堆 `type=&keyword=` 的脏 query。
   */
  function syncToQuery(): void {
    const patch: Record<string, string | undefined> = {
      startDate: filter.startDate ?? undefined,
      endDate: filter.endDate ?? undefined,
      type: filter.type ?? undefined,
      accounts: filter.accountIds.length > 0 ? filter.accountIds.join(',') : undefined,
      categories: filter.categoryIds.length > 0 ? filter.categoryIds.join(',') : undefined,
      keyword: filter.keyword || undefined,
      page: page.value > 1 ? String(page.value) : undefined,
    }
    void router.replace({ query: { ...route.query, ...patch } })
  }

  async function load() {
    loading.value = true
    try {
      const params = {
        // 账本隔离：所有流水查询都带当前账本，切账本即换一套数据
        bookId: book.currentBookId,
        startDate: filter.startDate || undefined,
        endDate: filter.endDate || undefined,
        types: filter.type ? [filter.type] : undefined,
        accountIds: filter.accountIds.length ? filter.accountIds : undefined,
        categoryIds: filter.categoryIds.length ? filter.categoryIds : undefined,
        keyword: filter.keyword || undefined,
        page: page.value,
        pageSize: pageSize.value,
      }
      const result = await listTransactions(params)
      list.value = result.list
      total.value = result.total
      selectedIds.value = []
    }
    finally {
      loading.value = false
    }
  }

  async function reload() {
    await load()
  }

  /**
   * 外部入口（快速记账弹层等）新增数据后调用：
   * 回到第 1 页重载 —— 新记录排在前面，停在原页码看不到它
   */
  async function reloadFromFirst() {
    page.value = 1
    await load()
  }

  function onPageChange(p: number) {
    page.value = p
    load()
  }

  // 筛选变化自动 reload（防抖 250ms）
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    () => [filter.startDate, filter.endDate, filter.type, filter.accountIds.length, filter.categoryIds.length, filter.keyword],
    () => {
      page.value = 1
      syncToQuery()
      if (debounceTimer)
        clearTimeout(debounceTimer)
      debounceTimer = setTimeout(load, 250)
    },
    { deep: true },
  )

  // 翻页也记进 URL（刷新后停在第 7 页而不是跳回第 1 页）
  watch(page, () => syncToQuery())

  // ── 行内编辑（乐观更新）──
  async function saveRow(id: number, patch: Partial<Transaction>) {
    const idx = list.value.findIndex(t => t.id === id)
    if (idx < 0)
      return
    const before: Transaction = list.value[idx]!
    const optimistic: Transaction = { ...before, ...(patch as Partial<Transaction>) }
    // 必须用「新数组替换」而非 list.value.splice 原地改：
    // vxe-grid 对 data 的 watcher 是浅监听（只比对引用），原地 splice 不触发它的
    // handleDataChange，单元格显示态会一直读 vxe 内部的旧快照，导致「改了和没改一样」。
    // 换成新引用后 gridOptions computed 重算、v-bind 重新下发，vxe 才重渲染拿到新值。
    list.value = list.value.map(t => (t.id === id ? optimistic : t))
    try {
      const updated = await updateTransaction(id, patch)
      list.value = list.value.map(t => (t.id === id ? updated : t))
    }
    catch (err) {
      list.value = list.value.map(t => (t.id === id ? before : t))
      throw err
    }
  }

  // ── 单删 / 批量 ──
  async function removeOne(id: number) {
    const before = list.value.find(t => t.id === id)
    list.value = list.value.filter(t => t.id !== id)
    total.value -= 1
    try {
      await deleteTransaction(id)
    }
    catch (err) {
      if (before)
        list.value.unshift(before)
      total.value += 1
      throw err
    }
  }

  async function removeBatch() {
    if (selectedIds.value.length === 0)
      return
    const set = new Set(selectedIds.value)
    const removed = list.value.filter(t => set.has(t.id))
    lastRemoved.value = removed
    list.value = list.value.filter(t => !set.has(t.id))
    total.value -= removed.length
    try {
      await batchDeleteTransactions(selectedIds.value)
      selectedIds.value = []
    }
    catch (err) {
      await load()
      throw err
    }
  }

  /**
   * 撤销最近一次批量删除：把 lastRemoved 原样放回内存表，再整体 reload。
   * 配合页面上的 5s 撤销 toast 使用（PRD 4.3：破坏性操作给撤销窗口）。
   */
  async function restoreLastRemoved() {
    if (lastRemoved.value.length === 0)
      return
    await restoreTransactions(lastRemoved.value)
    lastRemoved.value = []
    await load()
  }

  async function batchSetCategory(categoryId: number) {
    if (selectedIds.value.length === 0)
      return
    await batchUpdateCategory(selectedIds.value, categoryId)
    selectedIds.value = []
    await load()
  }

  // ── 初始化：先定账本 → 再载字典（账户按账本过滤）→ 最后拉首屏 ──
  (async () => {
    await book.ensureLoaded()
    await dict.ensureLoaded(book.currentBookId)
    // 先按 URL 还原筛选，再拉数据 —— 顺序反了会先闪一下未筛选的全量列表
    restoreFromQuery()
    await load()
  })()

  // 切账本：换一批账户字典 + 回第 1 页重查
  watch(
    () => book.currentBookId,
    async (id) => {
      await dict.ensureLoaded(id)
      // 账户是账本隔离的，旧账本选中的账户在新账本里不存在 ——
      // 留着会直接筛出空列表。其余条件（日期/类型/关键词）跨账本仍成立，保留
      if (filter.accountIds.length > 0)
        filter.accountIds = []
      page.value = 1
      await load()
    },
  )

  // 注意：不显式声明返回类型，让 TS 推断；调用方解构时 Vue 自动 unwrap ref
  return {
    list,
    total,
    loading,
    filter,
    page,
    pageSize,
    selectedIds,
    reload,
    reloadFromFirst,
    applyFilter,
    resetFilter,
    onPageChange,
    saveRow,
    removeOne,
    removeBatch,
    restoreLastRemoved,
    batchSetCategory,
  }
}
