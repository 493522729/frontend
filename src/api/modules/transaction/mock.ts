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
  Category,
  Transaction,
  TransactionListParams,
  TransactionListResult,
} from '@/types/transaction'

// ── 字典：分类 ──────────────────────────────────────────
const EXPENSE_CATEGORIES: Omit<Category, 'id'>[] = [
  { type: 'expense', name: '餐饮', icon: '🍜', color: '#FF7A6B', parentId: null },
  { type: 'expense', name: '交通', icon: '🚇', color: '#5BA9FF', parentId: null },
  { type: 'expense', name: '购物', icon: '🛍️', color: '#FF9F45', parentId: null },
  { type: 'expense', name: '居家', icon: '🏠', color: '#A78BFA', parentId: null },
  { type: 'expense', name: '娱乐', icon: '🎮', color: '#3CC6BC', parentId: null },
  { type: 'expense', name: '医疗', icon: '💊', color: '#F87171', parentId: null },
  { type: 'expense', name: '学习', icon: '📚', color: '#60A5FA', parentId: null },
  { type: 'expense', name: '通讯', icon: '📱', color: '#818CF8', parentId: null },
  { type: 'expense', name: '其他', icon: '📦', color: '#94A3B8', parentId: null },
]
const INCOME_CATEGORIES: Omit<Category, 'id'>[] = [
  { type: 'income', name: '工资', icon: '💼', color: '#22C55E', parentId: null },
  { type: 'income', name: '奖金', icon: '🎁', color: '#10A6B0', parentId: null },
  { type: 'income', name: '理财', icon: '📈', color: '#0EA5E9', parentId: null },
  { type: 'income', name: '兼职', icon: '💻', color: '#84CC16', parentId: null },
  { type: 'income', name: '其他', icon: '💰', color: '#94A3B8', parentId: null },
]

// ── 字典：账户 ──────────────────────────────────────────
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
const MOCK = {
  seed: 42,
  /** 生成的总条数（虚拟滚动演示至少 1w+） */
  totalCount: 10_000,
  /** 当前默认账本 */
  bookId: 1,
}

// ── 字典初始化（带 ID） ────────────────────────────────
const _categories: Category[] = []
const _accounts: Account[] = []
let _transactions: Transaction[] = []

function init() {
  if (_categories.length > 0)
    return
  let id = 1
  for (const c of EXPENSE_CATEGORIES)
    _categories.push({ ...c, id: id++ })
  for (const c of INCOME_CATEGORIES)
    _categories.push({ ...c, id: id++ })
  for (const a of ACCOUNT_TEMPLATES)
    _accounts.push({ ...a, id: id++, bookId: MOCK.bookId })
}

function generateTransactions() {
  init()
  if (_transactions.length > 0)
    return
  const rand = mulberry32(MOCK.seed)
  const now = Date.now()
  const day = 24 * 3600 * 1000

  const expenseCats = _categories.filter(c => c.type === 'expense')
  const incomeCats = _categories.filter(c => c.type === 'income')
  const debitAccounts = _accounts.filter(a => a.type !== 'credit')
  const allAccounts = _accounts

  for (let i = 0; i < MOCK.totalCount; i++) {
    // 类型分布：85% 支出 / 12% 收入 / 3% 转账
    const r = rand()
    const type: TransactionType = r < 0.85 ? 'expense' : r < 0.97 ? 'income' : 'transfer'

    // 金额：支出对数正态（中位数 50 元）；收入固定偏高；转账较大
    let amount: number
    if (type === 'expense') {
      const log = Math.exp(rand() * 4 + 2) // ~7-740 元
      amount = Math.round(log * 100)
    }
    else if (type === 'income') {
      amount = Math.round((2000 + rand() * 8000) * 100)
    }
    else {
      amount = Math.round((500 + rand() * 5000) * 100)
    }

    const daysAgo = Math.floor(rand() * 730) // 过去 24 个月
    const transDate = new Date(now - daysAgo * day)
    const dateStr = transDate.toISOString().slice(0, 10)

    let accountId: number
    let toAccountId: number | null = null
    let categoryId: number

    if (type === 'expense') {
      accountId = debitAccounts[Math.floor(rand() * debitAccounts.length)]!.id
      categoryId = expenseCats[Math.floor(rand() * expenseCats.length)]!.id
    }
    else if (type === 'income') {
      accountId = debitAccounts[Math.floor(rand() * debitAccounts.length)]!.id
      categoryId = incomeCats[Math.floor(rand() * incomeCats.length)]!.id
    }
    else {
      // transfer：从非信用卡账户 A 转到非现金账户 B
      const a1 = debitAccounts.filter(a => a.type !== 'cash')
      const a2 = allAccounts.filter(a => a.type !== 'credit' && a.type !== 'cash')
      const from = a1[Math.floor(rand() * a1.length)]!
      let to = a2[Math.floor(rand() * a2.length)]!
      if (to.id === from.id)
        to = a2[(a2.indexOf(to) + 1) % a2.length]!
      accountId = from.id
      toAccountId = to.id
      categoryId = 0 // 转账不挂分类
    }

    const notePool = [
      '',
      '',
      '',
      '午餐外卖',
      '同事聚餐',
      '地铁通勤',
      '便利店',
      '咖啡',
      '奶茶',
      '超市采购',
      '周末买菜',
      '买书',
      '话费充值',
      '游戏月卡',
      '电影票',
      '打车回家',
      '健身月卡',
    ]
    const note = notePool[Math.floor(rand() * notePool.length)]!

    _transactions.push({
      id: i + 1,
      bookId: MOCK.bookId,
      type,
      amount,
      currency: 'CNY',
      accountId,
      toAccountId,
      categoryId,
      transDate: dateStr,
      note,
      source: rand() < 0.85 ? 'manual' : rand() < 0.95 ? 'import' : 'recurring',
      createdAt: now - daysAgo * day,
      updatedAt: now - daysAgo * day,
    })
  }
}

generateTransactions()

// ── 公共 API（被 src/api/modules/transaction/index.ts 包装） ──

export function mockListCategories(): Category[] {
  init()
  return _categories
}

export function mockListAccounts(): Account[] {
  init()
  return _accounts
}

/**
 * 全量交易（只读快照）—— 给 stats 等「聚合型」mock 模块用
 *
 * 真实后端里这类聚合是服务端一次 SQL group by 就出来的，前端不该拉全量。
 * mock 阶段没有服务端，就让下游模块直接读这份内存数据做聚合，
 * 保持「调用方只拿聚合结果」的接口形状不变 —— 将来换真接口时调用方零改动。
 */
export function mockGetAllTransactions(): readonly Transaction[] {
  generateTransactions()
  return _transactions
}

export function mockListTransactions(params: TransactionListParams): TransactionListResult {
  generateTransactions()
  const { startDate, endDate, categoryIds, accountIds, types, keyword, page, pageSize } = params

  let filtered = _transactions

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
    const catMap = new Map(_categories.map(c => [c.id, c.name]))
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

export function mockCreateTransaction(input: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Transaction {
  const now = Date.now()
  const id = Math.max(..._transactions.map(t => t.id), 0) + 1
  const tx: Transaction = { ...input, id, createdAt: now, updatedAt: now }
  _transactions.unshift(tx)
  return tx
}
