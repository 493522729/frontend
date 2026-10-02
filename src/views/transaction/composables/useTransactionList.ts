import type { TransactionType } from '@/enums/transaction'
import type { Transaction, TransactionStatus } from '@/types/transaction'
import type { HumanizedError } from '@/utils/errorHumanizer'
import { NButton, useMessage, useNotification } from 'naive-ui'
import { h, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { applyRulesToTransaction } from '@/api/modules/rule'
import {
  batchDeleteTransactions,
  batchUpdateCategory,
  batchUpdateStatus,
  deleteTransaction,
  listTransactions,
  restoreTransactions,
  updateTransaction,
} from '@/api/modules/transaction'
import { createBookCache } from '@/composables/useBookCache'
import { withRetry } from '@/composables/useRetryable'
import { TRANSACTION_SOURCE_META, TRANSACTION_TYPE_META, TRANSACTION_TYPES } from '@/enums/transaction'
import { useBookStore } from '@/stores/modules/book'
import { useDictStore } from '@/stores/modules/dict'
import { useRuleStore } from '@/stores/modules/rule'
import { downloadCsv, safeFilePart } from '@/utils/csv'
import { humanizeError } from '@/utils/errorHumanizer'

/**
 * 交易列表状态管理 composable（SWR 缓存版）
 * ====================================================================
 * 把筛选、分页、加载、批量操作、行内编辑都收敛在这里，视图组件只负责渲染 + 触发回调。
 *
 * 设计原则：
 *   - 筛选 → 加载 是原子操作（防抖 250ms）
 *   - 行内编辑乐观更新：本地立即改 → 调接口 → 失败回滚
 *   - 批量操作完成后整体 reload 一次（mock 内存已变）
 *   - 字典（分类/账户）走 dict store 跨页面共享，本 composable 不重复加载
 *
 * 缓存（方案 B）：list / total / 筛选 / 分页等 state 提升到模块作用域（组件销毁不清空），
 * 进入页面有缓存则即时渲染旧列表、后台静默刷新，网格 loading 仅在真·首次出现。
 */
export interface FilterState {
  // DatePicker 的 v-model:formatted-value 用 null 代表「未选」，传 '' 会被当成非法日期解析抛 Invalid time value
  startDate: string | null
  endDate: string | null
  type: TransactionType | null
  accountIds: number[]
  categoryIds: number[]
  /** 标签筛选：任一命中（与 categoryIds 同样语义） */
  tagIds: number[]
  keyword: string
  /** 入账状态：all=全部 / pending=待确认 / confirmed=已记（PRD §15.2.2 状态筛选） */
  status: 'all' | TransactionStatus
}

// ── 模块级 state：组件销毁不清空 = 跨页面进入的缓存 ──
const list = ref<Transaction[]>([])
const total = ref(0)
const activeIndex = ref(-1)
// 加载失败后的可读错误（供页面渲染错误条 / 重试按钮读取）
const loadError = ref<HumanizedError | null>(null)
const filter = reactive<FilterState>({
  startDate: null,
  endDate: null,
  type: null,
  accountIds: [],
  categoryIds: [],
  tagIds: [],
  keyword: '',
  status: 'all',
})
const page = ref(1)
const pageSize = ref(50)
const selectedIds = ref<number[]>([])
// 最近一次批量删除的行（供「5s 撤销 toast」恢复用，mock 阶段直接放回内存表）
const lastRemoved = ref<Transaction[]>([])

/**
 * URL 里 pageSize 的合法上限（与分页器最大档对齐）。
 * 架构 §438 定的是「单页 > 200 行走 vxe 虚拟滚动」，分页器提供 200/500 档；
 * URL 支持同值只是把「用户选过的每页条数」带进分享链接，与 page 对称。
 * 上限卡 500 是防呆：手改 URL 塞个 10w 会一次拉全量，没必要拦在数据层之外。
 */
const MAX_URL_PAGE_SIZE = 500

// 这些实例必须在 setup 阶段取（composable 由页面 setup 内调用），否则拿不到 app 上下文。
// 用模块变量承接，保证模块级函数（exportCurrentView 等）在运行时能拿到。
let bookStore: ReturnType<typeof useBookStore>
let dictStore: ReturnType<typeof useDictStore>
let ruleStore: ReturnType<typeof useRuleStore>
let routeInst: ReturnType<typeof useRoute>
let routerInst: ReturnType<typeof useRouter>
let msg: ReturnType<typeof useMessage>
let notify: ReturnType<typeof useNotification>

function resetFilter() {
  filter.startDate = null
  filter.endDate = null
  filter.type = null
  filter.accountIds = []
  filter.categoryIds = []
  filter.tagIds = []
  filter.keyword = ''
  filter.status = 'all'
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
  const q = routeInst.query
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
  filter.tagIds = ids(q.tags)
  filter.keyword = str(q.keyword) ?? ''
  filter.status = q.status === 'pending' || q.status === 'confirmed' ? q.status : 'all'
  const p = Number(q.page)
  page.value = Number.isInteger(p) && p > 0 ? p : 1
  // 同 page 一样做安全降级；上限见 MAX_URL_PAGE_SIZE
  const ps = Number(q.pageSize)
  pageSize.value = Number.isInteger(ps) && ps > 0
    ? Math.min(ps, MAX_URL_PAGE_SIZE)
    : 50
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
    tags: filter.tagIds.length > 0 ? filter.tagIds.join(',') : undefined,
    keyword: filter.keyword || undefined,
    status: filter.status !== 'all' ? filter.status : undefined,
    page: page.value > 1 ? String(page.value) : undefined,
    // 只在非默认时写回，避免 URL 里挂一堆无意义的 pageSize=50
    pageSize: pageSize.value !== 50 ? String(pageSize.value) : undefined,
  }
  void routerInst.replace({ query: { ...routeInst.query, ...patch } })
}

/**
 * 组装查询参数（load 与 exportCurrentView 共用，避免两处各写一份、改筛选漏一处）
 * 注意 keyword 等空值统一转 undefined：后端/mock 靠「字段不存在」判断「不筛选」，
 * 传空字符串会被当成「匹配空串」。
 */
function buildParams(page: number, pageSize: number) {
  return {
    // 账本隔离：所有流水查询都带当前账本，切账本即换一套数据
    bookId: bookStore.currentBookId,
    startDate: filter.startDate || undefined,
    endDate: filter.endDate || undefined,
    types: filter.type ? [filter.type] : undefined,
    accountIds: filter.accountIds.length ? filter.accountIds : undefined,
    categoryIds: filter.categoryIds.length ? filter.categoryIds : undefined,
    tagIds: filter.tagIds.length ? filter.tagIds : undefined,
    keyword: filter.keyword || undefined,
    // 状态筛选：all 时不传，让 mock/后端走「不过滤」分支
    status: filter.status !== 'all' ? filter.status : undefined,
    page,
    pageSize,
  }
}

async function fetchTransaction(_bid: number): Promise<void> {
  loadError.value = null
  try {
    const params = buildParams(page.value, pageSize.value)
    // 网络异常自动重试 3 次（PRD 9.5）：withRetry 内部已做 2 次重试，
    // 仍失败才落到 catch，此时给用户一个带「重试」按钮的错误提示（PRD 9.2）。
    const result = await withRetry(() => listTransactions(params), { retries: 2, delay: 400 })
    list.value = result.list
    total.value = result.total
    selectedIds.value = []
    activeIndex.value = -1
  }
  catch (err) {
    const he = humanizeError(err)
    loadError.value = he
    notifyLoadError(he)
  }
}

const transactionCache = createBookCache<{ list: Transaction[], total: number }>(
  'transaction',
  fetchTransaction,
  () => ({ list: list.value, total: total.value }),
  (snap) => {
    list.value = snap.list
    total.value = snap.total
  },
)

/** 加载失败时弹统一错误通知，并附「重试」按钮（点一下重新走 load） */
function notifyLoadError(he: HumanizedError) {
  notify.error({
    title: he.title,
    content: he.detail ?? '请稍后重试',
    // duration:0 不自动消失，逼用户处理（重试或关掉）
    duration: 0,
    action: () => h(NButton, {
      size: 'tiny',
      quaternary: true,
      onClick: () => void transactionCache.run(),
    }, { default: () => '重试' }),
  })
}

async function reload() {
  await transactionCache.run()
}

/**
 * 外部入口（快速记账弹层等）新增数据后调用：
 * 回到第 1 页重载 —— 新记录排在前面，停在原页码看不到它
 */
async function reloadFromFirst() {
  page.value = 1
  await transactionCache.run()
}

function onPageChange(p: number) {
  page.value = p
  void transactionCache.run()
}

// 筛选变化自动 reload（防抖 250ms）
let debounceTimer: ReturnType<typeof setTimeout> | null = null
function onFilterChange() {
  page.value = 1
  syncToQuery()
  if (debounceTimer)
    clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => void transactionCache.run(), 250)
}

// 翻页也记进 URL（刷新后停在第 7 页而不是跳回第 1 页）
function onPageSync() {
  syncToQuery()
}

// ── 行内编辑（乐观更新）──
async function saveRow(id: number, patch: Partial<Transaction>) {
  const idx = list.value.findIndex(t => t.id === id)
  if (idx < 0)
    return
  const before: Transaction = list.value[idx]!
  const optimistic: Transaction = { ...before, ...(patch as Partial<Transaction>) }
  // 规则引擎钩子（US-010）：保存时按启用顺序跑规则链，规则改的字段并入 patch 一次性提交。
  const { txn: ruled, executions } = applyRulesToTransaction(optimistic, ruleStore.list)
  const ruleDelta: Partial<Transaction> = {}
  for (const k of Object.keys(optimistic) as (keyof Transaction)[]) {
    const a = optimistic[k]
    const b = ruled[k]
    if (!Object.is(a, b))
      (ruleDelta as Record<string, unknown>)[k] = b
  }
  const finalPatch = { ...patch, ...ruleDelta }
  const optimisticWithRules: Transaction = { ...optimistic, ...ruleDelta }
  // 必须用「新数组替换」而非 list.value.splice 原地改（详见原注释：vxe-grid 浅监听）
  list.value = list.value.map(t => (t.id === id ? optimisticWithRules : t))
  try {
    const updated = await updateTransaction(id, finalPatch)
    list.value = list.value.map(t => (t.id === id ? updated : t))
    for (const exec of executions) {
      if (!exec.matched)
        continue
      for (const action of exec.appliedActions) {
        if (action.type === 'notify' && action.payload.message) {
          notify.info({
            title: exec.ruleName,
            content: String(action.payload.message),
            duration: 4000,
          })
        }
      }
    }
  }
  catch (err) {
    list.value = list.value.map(t => (t.id === id ? before : t))
    throw err
  }
}

/**
 * 确认入账：把「待确认」流水转为「已记」。
 */
async function confirmRow(id: number) {
  const idx = list.value.findIndex(t => t.id === id)
  if (idx < 0)
    return
  const before = list.value[idx]!
  if (before.status === 'confirmed')
    return
  list.value = list.value.map(t => (t.id === id ? { ...t, status: 'confirmed' as const } : t))
  try {
    await updateTransaction(id, { status: 'confirmed' })
    msg.success('已确认入账')
  }
  catch {
    list.value = list.value.map(t => (t.id === id ? before : t))
    msg.error('确认失败')
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
    await transactionCache.run()
    throw err
  }
}

/**
 * 撤销最近一次批量删除：把 lastRemoved 原样放回内存表，再整体 reload。
 */
async function restoreLastRemoved() {
  if (lastRemoved.value.length === 0)
    return
  await restoreTransactions(lastRemoved.value)
  lastRemoved.value = []
  await transactionCache.run()
}

async function batchSetCategory(categoryId: number) {
  if (selectedIds.value.length === 0)
    return
  await batchUpdateCategory(selectedIds.value, categoryId)
  selectedIds.value = []
  await transactionCache.run()
}

/**
 * 批量确认入账（US-002 体验补强）：把选中的「待确认」流水一次性置为 confirmed。
 */
async function confirmBatch() {
  const ids = list.value.filter(t => selectedIds.value.includes(t.id) && t.status === 'pending').map(t => t.id)
  if (ids.length === 0)
    return
  await batchUpdateStatus(ids, 'confirmed')
  selectedIds.value = []
  await transactionCache.run()
}

/** 单次导出上限：超了就提示缩小范围，避免一次拉爆内存 / 卡住主线程 */
const EXPORT_MAX_ROWS = 100_000

/**
 * 导出当前筛选视图的**全部**流水（PRD §15.2.2「导出 Excel/CSV：当前视图导出」）
 */
async function exportCurrentView() {
  try {
    const probe = await listTransactions(buildParams(1, 1))
    if (probe.total === 0) {
      msg.warning('当前筛选没有可导出的数据')
      return
    }
    if (probe.total > EXPORT_MAX_ROWS) {
      msg.warning(`当前筛选有 ${probe.total} 条，超过单次上限 ${EXPORT_MAX_ROWS} 条，请缩小筛选范围`)
      return
    }
    const result = await listTransactions(buildParams(1, probe.total))
    const rows = [
      ['日期', '类型', '分类', '账户', '转入账户', '金额(元)', '状态', '来源', '备注'],
      ...result.list.map(t => [
        t.transDate,
        TRANSACTION_TYPE_META[t.type].label,
        dictStore.categoryMap.get(t.categoryId)?.name ?? '—',
        dictStore.accountMap.get(t.accountId)?.name ?? '—',
        t.toAccountId == null ? '' : dictStore.accountMap.get(t.toAccountId)?.name ?? '—',
        ((t.type === 'expense' ? -t.amount : t.amount) / 100).toFixed(2),
        t.status === 'pending' ? '待确认' : '已记',
        TRANSACTION_SOURCE_META[t.source]?.label ?? '',
        t.note,
      ]),
    ]
    const range = filter.startDate || filter.endDate
      ? `${filter.startDate ?? '最早'}_${filter.endDate ?? '至今'}`
      : '全部'
    downloadCsv(`流水_${safeFilePart(range)}.csv`, rows)
    msg.success(`已导出 ${result.list.length} 条流水`)
  }
  catch (err) {
    msg.error(humanizeError(err).title)
  }
}

export function useTransactionList() {
  bookStore = useBookStore()
  dictStore = useDictStore()
  ruleStore = useRuleStore()
  routeInst = useRoute()
  routerInst = useRouter()
  msg = useMessage()
  notify = useNotification()

  // ── 初始化：先定账本 → 再载字典（账户按账本过滤）→ 最后拉首屏 ──
  ;(async () => {
    await bookStore.ensureLoaded()
    await dictStore.ensureLoaded(bookStore.currentBookId)
    // 先按 URL 还原筛选，再拉数据 —— 顺序反了会先闪一下未筛选的全量列表
    restoreFromQuery()
    await transactionCache.run()
  })()

  // 筛选变化自动 reload（防抖 250ms）
  watch(
    () => [filter.startDate, filter.endDate, filter.type, filter.accountIds.length, filter.categoryIds.length, filter.tagIds.length, filter.keyword, filter.status],
    onFilterChange,
    { deep: true },
  )

  // 翻页也记进 URL（刷新后停在第 7 页而不是跳回第 1 页）
  watch(page, onPageSync)

  // 切账本：换一批账户字典 + 回第 1 页重查
  watch(
    () => bookStore.currentBookId,
    async (id) => {
      await dictStore.ensureLoaded(id)
      // 账户是账本隔离的，旧账本选中的账户在新账本里不存在 —— 留着会直接筛出空列表
      if (filter.accountIds.length > 0)
        filter.accountIds = []
      page.value = 1
      await transactionCache.run()
    },
  )

  // 注意：不显式声明返回类型，让 TS 推断；调用方解构时 Vue 自动 unwrap ref
  return {
    list,
    total,
    loading: transactionCache.loading,
    filter,
    page,
    pageSize,
    selectedIds,
    // 键盘导航当前高亮行 + 加载错误（供页面渲染错误条/重试）
    activeIndex,
    loadError,
    reload,
    reloadFromFirst,
    applyFilter,
    resetFilter,
    onPageChange,
    saveRow,
    confirmRow,
    removeOne,
    removeBatch,
    restoreLastRemoved,
    batchSetCategory,
    confirmBatch,
    exportCurrentView,
  }
}
