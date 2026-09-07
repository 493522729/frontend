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
import {
  batchDeleteTransactions,
  batchUpdateCategory,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from '@/api/modules/transaction'
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

  function resetFilter() {
    filter.startDate = null
    filter.endDate = null
    filter.type = null
    filter.accountIds = []
    filter.categoryIds = []
    filter.keyword = ''
    page.value = 1
  }

  function applyFilter(patch: Partial<FilterState>) {
    Object.assign(filter, patch)
    page.value = 1
  }

  async function load() {
    loading.value = true
    try {
      const params = {
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
      if (debounceTimer)
        clearTimeout(debounceTimer)
      debounceTimer = setTimeout(load, 250)
    },
    { deep: true },
  )

  // ── 行内编辑（乐观更新）──
  async function saveRow(id: number, patch: Partial<Transaction>) {
    const idx = list.value.findIndex(t => t.id === id)
    if (idx < 0)
      return
    const before: Transaction = list.value[idx]!
    const optimistic: Transaction = { ...before, ...(patch as Partial<Transaction>) }
    list.value.splice(idx, 1, optimistic)
    try {
      const updated = await updateTransaction(id, patch)
      const i2 = list.value.findIndex(t => t.id === id)
      if (i2 >= 0)
        list.value.splice(i2, 1, updated)
    }
    catch (err) {
      const i2 = list.value.findIndex(t => t.id === id)
      if (i2 >= 0)
        list.value.splice(i2, 1, before)
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

  async function batchSetCategory(categoryId: number) {
    if (selectedIds.value.length === 0)
      return
    await batchUpdateCategory(selectedIds.value, categoryId)
    selectedIds.value = []
    await load()
  }

  // ── 初始化：先加载字典，再加载首屏 ──
  (async () => {
    await dict.ensureLoaded()
    await load()
  })()

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
    batchSetCategory,
  }
}
