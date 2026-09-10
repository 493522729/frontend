/**
 * 交易 mock 数据生成器
 * ====================================================================
 * 后端还没起来时，整个流水页用这份 mock 跑，10w 行虚拟滚动、筛选、行内编辑都能演示。
 * 真接口联调时只改 api/index.ts 的实现，调用方一行不用动。
 *
 * 设计要点：
 *   - 数据落地在内存（页面刷新重置）—— 这是 mock 的预期行为
 *   - 写入操作（增/改/删）会真实改动内存，让交互能完整跑通
 *   - 时间字段跨过去 24 个月，分布均匀；金额按类型生成不同分布（支出对数正态）
 */

import type { TransactionType } from '@/enums/transaction'
import type {
  Transaction,
  TransactionListParams,
  TransactionListResult,
} from '@/types/transaction'
import { BOOK_SEEDS } from '@/api/mock-books'
import { initAccounts, mockListAccounts } from '@/api/modules/account/mock'
// 分类种子与 CRUD 在 category/mock；账户种子与 CRUD 在 account/mock。
// 本模块只负责「用这两个字典生成流水 + 流水自身的增删改」，字典不再内联在这里。
import { mockListCategories } from '@/api/modules/category/mock'

// ── 简易确定性伪随机（mulberry32） ─────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 集中参数：调这里控制 mock 规模
// 总条数 / 账本归属已下放到 src/api/mock-books.ts 的 BOOK_SEEDS（US-005 多账本分片）
const MOCK = {
  seed: 42,
}

/** 各账本的备注词库 —— 让切账本时流水看起来确实属于那个场景 */
const NOTE_POOLS: Record<string, string[]> = {
  daily: ['', '', '', '午餐外卖', '同事聚餐', '地铁通勤', '便利店', '咖啡', '奶茶', '超市采购', '周末买菜', '买书', '话费充值', '游戏月卡', '电影票', '打车回家', '健身月卡'],
  renovation: ['', '瓷砖采购', '水电改造', '木工进场', '墙面油漆', '橱柜定制', '灯具安装', '地板铺装', '卫浴五金', '设计费', '垃圾清运', '甲醛治理'],
  travel: ['', '往返机票', '酒店住宿', '景区门票', '当地交通', '伴手礼', '旅行保险', '签证费', '租车', '导游小费'],
}

// ── 数据源初始化 ─────────────────────────────────────────
// 只在本模块内被整体替换一次（账户迁移时会 filter 重建），故用 let
let _transactions: Transaction[] = []

/**
 * 幂等初始化字典
 *
 * 账户种子已下放到 account/mock（与分类同款拆分），它内部会先 initCategories，
 * 所以这里一行就够 —— 但**必须调**：流水生成要用带 ID 的账户表。
 */
function init() {
  initAccounts()
}

function generateTransactions() {
  init()
  if (_transactions.length > 0)
    return
  const now = Date.now()
  const day = 24 * 3600 * 1000

  const expenseCats = mockListCategories().filter(c => c.type === 'expense')
  const incomeCats = mockListCategories().filter(c => c.type === 'income')

  let nextId = 1

  // 按账本分片生成：每个账本用错开的 seed 走独立随机流，
  // 于是数据规模 / 金额量级 / 收入占比都不同 —— 切账本时看得出区别。
  for (const seed of BOOK_SEEDS) {
    const rand = mulberry32(MOCK.seed + seed.id * 7919)
    // 账户只在**本账本**范围内挑：跨账本转账在业务上不存在
    const debitAccounts = mockListAccounts(seed.id).filter(a => a.type !== 'credit')
    const notePool = NOTE_POOLS[seed.type] ?? NOTE_POOLS.daily!

    for (let i = 0; i < seed.txnCount; i++) {
      // 类型分布：收入占比按账本配置（装修/旅行几乎只有支出），余下里 3% 是转账
      const r = rand()
      let type: TransactionType
      if (r < seed.incomeRatio)
        type = 'income'
      else if (r < seed.incomeRatio + 0.03)
        type = 'transfer'
      else
        type = 'expense'

      // 转账至少要 2 个可转账户（现金户之间转账无意义），不够就降级为支出，
      // 否则会生成「自己转给自己」这种脏数据
      const transferPool = debitAccounts.filter(a => a.type !== 'cash')
      if (type === 'transfer' && transferPool.length < 2)
        type = 'expense'

      // 金额：支出对数正态；收入偏高；转账较大
      //
      // 只有**支出**乘账本倍率：装修的瓷砖、家具单笔就是几千，但它的
      // 「收入」（退款、预算拨入）不会跟着材料价格一起膨胀，
      // 转账更是纯资金搬运 —— 都乘倍率会算出「装修账本月入 50 万」的荒唐数字。
      let amount: number
      if (type === 'expense') {
        const log = Math.exp(rand() * 4 + 2) // ~7-740 元
        amount = Math.round(log * 100 * seed.amountScale)
      }
      else if (type === 'income') {
        amount = Math.round((2000 + rand() * 8000) * 100)
      }
      else {
        amount = Math.round((500 + rand() * 5000) * 100)
      }

      const daysAgo = Math.floor(rand() * 730) // 过去 24 个月
      const dateStr = new Date(now - daysAgo * day).toISOString().slice(0, 10)

      let accountId: number
      let toAccountId: number | null = null
      let categoryId: number

      if (type === 'income') {
        accountId = debitAccounts[Math.floor(rand() * debitAccounts.length)]!.id
        categoryId = incomeCats[Math.floor(rand() * incomeCats.length)]!.id
      }
      else if (type === 'transfer') {
        const from = transferPool[Math.floor(rand() * transferPool.length)]!
        let to = transferPool[Math.floor(rand() * transferPool.length)]!
        if (to.id === from.id)
          to = transferPool[(transferPool.indexOf(to) + 1) % transferPool.length]!
        accountId = from.id
        toAccountId = to.id
        categoryId = 0 // 转账不挂分类
      }
      else {
        accountId = debitAccounts[Math.floor(rand() * debitAccounts.length)]!.id
        categoryId = expenseCats[Math.floor(rand() * expenseCats.length)]!.id
      }

      _transactions.push({
        id: nextId++,
        bookId: seed.id,
        type,
        amount,
        currency: 'CNY',
        accountId,
        toAccountId,
        categoryId,
        transDate: dateStr,
        note: notePool[Math.floor(rand() * notePool.length)]!,
        source: rand() < 0.85 ? 'manual' : rand() < 0.95 ? 'import' : 'recurring',
        createdAt: now - daysAgo * day,
        updatedAt: now - daysAgo * day,
      })
    }
  }
}

generateTransactions()

// ── 公共 API（被 src/api/modules/transaction/index.ts 包装） ──

/**
 * 全量交易（只读快照）—— 给 stats 等「聚合型」mock 模块用
 *
 * 真实后端里这类聚合是服务端一次 SQL group by 就出来的，前端不该拉全量。
 * mock 阶段没有服务端，就让下游模块直接读这份内存数据做聚合，
 * 保持「调用方只拿聚合结果」的接口形状不变 —— 将来换真接口时调用方零改动。
 */
export function mockGetAllTransactions(bookId?: number): readonly Transaction[] {
  generateTransactions()
  return bookId == null ? _transactions : _transactions.filter(t => t.bookId === bookId)
}

export function mockListTransactions(params: TransactionListParams): TransactionListResult {
  generateTransactions()
  const { bookId, startDate, endDate, categoryIds, accountIds, types, keyword, page, pageSize } = params

  let filtered = _transactions

  // 账本隔离（US-005）：这是数据可见性的第一道闸，漏了就会串账本
  if (bookId != null)
    filtered = filtered.filter(t => t.bookId === bookId)
  if (startDate)
    filtered = filtered.filter(t => t.transDate >= startDate)
  if (endDate)
    filtered = filtered.filter(t => t.transDate <= endDate)
  if (types && types.length > 0)
    filtered = filtered.filter(t => types.includes(t.type))
  if (accountIds && accountIds.length > 0)
    filtered = filtered.filter(t => accountIds.includes(t.accountId) || (t.toAccountId !== null && accountIds.includes(t.toAccountId)))
  if (categoryIds && categoryIds.length > 0)
    filtered = filtered.filter(t => categoryIds.includes(t.categoryId))
  if (keyword && keyword.trim()) {
    const kw = keyword.trim().toLowerCase()
    const catMap = new Map(mockListCategories().map(c => [c.id, c.name]))
    filtered = filtered.filter((t) => {
      if (t.note.toLowerCase().includes(kw))
        return true
      const catName = catMap.get(t.categoryId)
      return !!catName && catName.toLowerCase().includes(kw)
    })
  }

  // 默认按日期倒序
  filtered = [...filtered].sort((a, b) => b.transDate.localeCompare(a.transDate) || b.id - a.id)

  const total = filtered.length
  const start = (page - 1) * pageSize
  const list = filtered.slice(start, start + pageSize)
  return { list, total }
}

export function mockUpdateTransaction(id: number, patch: Partial<Omit<Transaction, 'id'>>): Transaction {
  const idx = _transactions.findIndex(t => t.id === id)
  if (idx < 0)
    throw new Error(`Transaction ${id} not found`)
  const updated: Transaction = { ..._transactions[idx]!, ...patch, updatedAt: Date.now() }
  _transactions[idx] = updated
  return updated
}

export function mockDeleteTransaction(id: number): void {
  _transactions = _transactions.filter(t => t.id !== id)
}

export function mockBatchDeleteTransactions(ids: number[]): number {
  const set = new Set(ids)
  const before = _transactions.length
  _transactions = _transactions.filter(t => !set.has(t.id))
  return before - _transactions.length
}

/**
 * 撤销用的「恢复」：把刚删除的交易原样放回内存表（id 不变）
 * —— 仅 mock 阶段支撑 5s 撤销 toast；真后端需要「软删除 + 回收站」接口，届时替换本函数即可。
 */
export function mockRestoreTransactions(rows: Transaction[]): void {
  for (const r of rows) {
    if (!_transactions.some(t => t.id === r.id))
      _transactions.push(r)
  }
}

export function mockBatchUpdateCategory(ids: number[], categoryId: number): number {
  let n = 0
  for (const t of _transactions) {
    if (ids.includes(t.id)) {
      t.categoryId = categoryId
      t.updatedAt = Date.now()
      n++
    }
  }
  return n
}

/**
 * 分类删除/合并时的「交易迁移」：把某分类下的所有交易改挂到目标分类。
 * 由分类管理页在删除前调用，避免在 category 模块里反向依赖 transaction。
 * @returns 受影响交易条数
 */
export function mockReassignCategory(fromId: number, toId: number): number {
  let n = 0
  for (const t of _transactions) {
    if (t.categoryId === fromId) {
      t.categoryId = toId
      t.updatedAt = Date.now()
      n++
    }
  }
  return n
}

/** 统计某分类被多少笔交易引用 —— 删除前用于提示「是否要迁移」 */
export function mockCountCategoryUsage(id: number): number {
  let n = 0
  for (const t of _transactions) {
    if (t.categoryId === id)
      n++
  }
  return n
}

/**
 * 统计某账户被多少笔交易引用（删除账户前提示用）
 *
 * 特意把「转账」单列出来：转账的两端都是账户，删掉其中一端后
 * 这笔记账就失去了意义（总不能变成「自己转给自己」），删除账户时
 * 这类流水会被一并清掉，UI 必须提前说清楚，否则用户会觉得账平白少了。
 */
export function mockCountAccountUsage(id: number): { total: number, transfer: number } {
  let total = 0
  let transfer = 0
  for (const t of _transactions) {
    if (t.accountId !== id && t.toAccountId !== id)
      continue
    total++
    if (t.type === 'transfer')
      transfer++
  }
  return { total, transfer }
}

/**
 * 账户迁移（删除账户时调用，语义见账户管理页）
 * ─────────────────────────────────────────────
 *  - 普通收支：转挂到目标账户，账户没了但账还在
 *  - 转账笔：两端都是账户，缺了一端就讲不通，直接删除（否则会出现 A→A 的脏数据）
 *
 * @returns migrated 迁移的收支笔数 / removed 一并删除的转账笔数
 */
export function mockReassignAccount(fromId: number, toId: number): { migrated: number, removed: number } {
  const now = Date.now()
  let migrated = 0
  const keep: Transaction[] = []
  let removed = 0

  for (const t of _transactions) {
    if (t.type === 'transfer' && (t.accountId === fromId || t.toAccountId === fromId)) {
      removed++
      continue
    }
    if (t.accountId === fromId) {
      keep.push({ ...t, accountId: toId, updatedAt: now })
      migrated++
    }
    else {
      keep.push(t)
    }
  }
  _transactions = keep
  return { migrated, removed }
}

export function mockCreateTransaction(input: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Transaction {
  const now = Date.now()
  const id = Math.max(..._transactions.map(t => t.id), 0) + 1
  const tx: Transaction = { ...input, id, createdAt: now, updatedAt: now }
  _transactions.unshift(tx)
  return tx
}
