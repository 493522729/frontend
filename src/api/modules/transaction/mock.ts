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
  Account,
  Transaction,
  TransactionListParams,
  TransactionListResult,
} from '@/types/transaction'
import { BOOK_SEEDS } from '@/api/mock-books'
// 分类种子与 CRUD 抽到 category/mock 统一维护；这里只取「已带 ID 的分类表」与 ID 序列起点
import { initCategories, mockListCategories, peekNextCategoryId } from '@/api/modules/category/mock'

// ── 字典：账户（分类种子见 @/api/modules/category/mock，此处不再重复） ──
const ACCOUNT_TEMPLATES: Omit<Account, 'id' | 'bookId'>[] = [
  { name: '招商储蓄卡', type: 'debit', icon: '🏦', initBalance: 5000000, creditLimit: 0 },
  { name: '支付宝', type: 'alipay', icon: '💙', initBalance: 200000, creditLimit: 0 },
  { name: '微信', type: 'wechat', icon: '💚', initBalance: 100000, creditLimit: 0 },
  { name: '现金', type: 'cash', icon: '💵', initBalance: 50000, creditLimit: 0 },
  { name: '招商信用卡', type: 'credit', icon: '💳', initBalance: 0, creditLimit: 5000000 },
]

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

// ── 字典初始化（带 ID） ────────────────────────────────
const _accounts: Account[] = []
let _transactions: Transaction[] = []

function init() {
  if (_accounts.length > 0)
    return
  // 分类种子在 category/mock 里初始化，并独占 1..N 的 ID 段；
  // 账户从这里接着排，保证两类字典 ID 全局不冲突。
  initCategories()
  let id = peekNextCategoryId()
  // 账户按账本**各实例化一份**：每个账本有自己独立的账户，ID 全局唯一。
  // 「装修账本的招商卡」和「日常账本的招商卡」是两条不同记录，余额互不相干。
  for (const seed of BOOK_SEEDS) {
    for (const idx of seed.accountTemplateIndexes) {
      const tpl = ACCOUNT_TEMPLATES[idx]
      if (tpl)
        _accounts.push({ ...tpl, id: id++, bookId: seed.id })
    }
  }
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
    const debitAccounts = _accounts.filter(a => a.bookId === seed.id && a.type !== 'credit')
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

export function mockListAccounts(bookId?: number): Account[] {
  init()
  // 不传 = 全部账本（字典类用途）；传了 = 只给该账本下的账户。
  // 切账本后筛选面板/记账弹层的账户下拉必须只剩本账本的，否则会选出别账本的账户。
  return bookId == null ? _accounts : _accounts.filter(a => a.bookId === bookId)
}

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

export function mockCreateTransaction(input: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Transaction {
  const now = Date.now()
  const id = Math.max(..._transactions.map(t => t.id), 0) + 1
  const tx: Transaction = { ...input, id, createdAt: now, updatedAt: now }
  _transactions.unshift(tx)
  return tx
}
