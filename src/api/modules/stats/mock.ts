/**
 * 仪表盘聚合 mock
 * ====================================================================
 * 从 transaction mock 的全量 10k 数据里做聚合，模拟服务端一次 group by 出结果。
 * 真接口就绪后整个文件可以直接删掉，index.ts 换成 http.get 即可，调用方零改动。
 *
 * 统计口径（与 types/stats.ts 的约定保持一致）：
 *   - 收入 = type income 求和；支出 = type expense 求和
 *   - 转账不进收支，也不进分类占比（它只是资金在自己账户间搬运）
 *   - 资产净值 = Σ账户期初 + Σ收入 - Σ支出（转账一进一出，净值不变）
 */

import type { TransactionType } from '@/enums/transaction'
import type {
  AccountBalance,
  CategorySlice,
  DashboardOverview,
  DashboardQuery,
  NetWorthPoint,
  NetWorthQuery,
  NetWorthTrend,
  TrendPoint,
} from '@/types/stats'
import type { Category, Transaction } from '@/types/transaction'
import { percentOf, sumCents } from '@/utils/money'
import {
  formatDate,
  formatMonth,
  lastNMonths,
  monthRange,
  parseMonth,
  today,
} from '@/utils/temporal'
import { mockListAccounts } from '../account/mock'
import { mockListCategories } from '../category/mock'
import { mockGetAllTransactions } from '../transaction/mock'

/** 环图取前 N 个分类，其余合并为「其他」 */
const TOP_N = 6
/** 折线图回溯月数 */
const TREND_MONTHS = 6

/** 按类型求和（只读 amount，整数分） */
function sumByType(list: readonly Transaction[], type: TransactionType): number {
  return sumCents(list.filter(t => t.type === type).map(t => t.amount))
}

/** 某笔交易是否落在 [start, end] 闭区间内（ISO 日期字符串字典序 = 时间序） */
function inRange(t: Transaction, start: string, end: string): boolean {
  return t.transDate >= start && t.transDate <= end
}

/** 环比：(本期 - 上期) / 上期 × 100，上期为 0 时返回 0（避免除零出 Infinity） */
function momPercent(current: number, previous: number): number {
  if (previous === 0)
    return 0
  return Math.round(((current - previous) / previous) * 10000) / 100
}

/**
 * 变化百分比：(现值 - 基值) / |基值| × 100
 *
 * 分母刻意取绝对值：净资产为负（资不抵债）时，用负数做分母会算出
 * 「明明又亏了却显示 +30%」这种符号相反的荒唐结果。
 * 基值为 0 时返回 0 —— 从 0 到有是无穷大，展示出来没有意义。
 */
function percentChange(current: number, baseValue: number): number {
  if (baseValue === 0)
    return 0
  return Math.round(((current - baseValue) / Math.abs(baseValue)) * 10000) / 100
}

/**
 * 站在**转出端账户**视角，这笔流水让它余额变动多少（正 = 增加）
 *
 * 转账在这里是 -amount（钱离开了这个账户）；转入端在调用处单独 +amount，
 * 因为一笔转账同时影响两个账户，不是一个变量能表达完的。
 */
function signedAmount(t: Transaction, accountId: number): number {
  if (t.type === 'income')
    return t.amount
  if (t.type === 'expense')
    return -t.amount
  return accountId === t.accountId ? -t.amount : t.amount
}

/**
 * 分类占比：本月支出按分类聚合，降序取 Top N，其余合并「其他」
 *
 * percent 用 percentOf 算（分母为 0 时返回 0），保证百分比加起来是 100 而不是 NaN。
 */
function buildCategorySlices(
  monthTxns: readonly Transaction[],
  categories: readonly Category[],
): CategorySlice[] {
  // 只统计支出；转账的 categoryId 是 0，会被这里的 filter 自然排除
  const grouped = new Map<number, number[]>()
  for (const t of monthTxns) {
    if (t.type !== 'expense' || t.categoryId === 0)
      continue
    const bucket = grouped.get(t.categoryId)
    if (bucket)
      bucket.push(t.amount)
    else
      grouped.set(t.categoryId, [t.amount])
  }

  const sorted = [...grouped.entries()]
    .map(([categoryId, amounts]) => ({ categoryId, amount: sumCents(amounts) }))
    .sort((a, b) => b.amount - a.amount)

  const totalExpense = sumCents(sorted.map(s => s.amount))
  const categoryMap = new Map(categories.map(c => [c.id, c]))

  const toSlice = (categoryId: number, amount: number): CategorySlice => {
    const cat = categoryMap.get(categoryId)
    return {
      categoryId,
      name: cat?.name ?? '未分类',
      icon: cat?.icon ?? '📦',
      color: cat?.color ?? '#94A3B8',
      amount,
      percent: percentOf(amount, totalExpense),
    }
  }

  const top = sorted.slice(0, TOP_N).map(s => toSlice(s.categoryId, s.amount))
  const rest = sorted.slice(TOP_N)

  if (rest.length === 0)
    return top

  const restAmount = sumCents(rest.map(s => s.amount))

  // 「其他」是聚合出来的伪分类，不对应任何字典条目（categoryId 用 0 标记）。
  // 图标和颜色复用字典里支出类「其他」的那一套，视觉上与真实分类保持一致。
  const otherMeta = categories.find(c => c.type === 'expense' && c.name === '其他')
  const other: CategorySlice = {
    categoryId: 0,
    name: '其他',
    icon: otherMeta?.icon ?? '📦',
    color: otherMeta?.color ?? '#94A3B8',
    amount: restAmount,
    percent: percentOf(restAmount, totalExpense),
  }

  // 「其他」也必须参与降序：它是剩余分类之和，完全可能大于第 6 名。
  // 无脑追加到末尾会让环图顺序错乱 —— 最大的一块反而排在最后，
  // 而环图的全部意义就是「一眼看出哪块最大」。
  return [...top, other].sort((a, b) => b.amount - a.amount)
}

export function mockGetDashboardOverview(query: DashboardQuery = {}): DashboardOverview {
  // 账本隔离（US-005）：收支、趋势、净值都只算当前账本。
  // 净值尤其不能跨账本 —— 把「装修」和「日常」的余额加在一起没有意义
  const all = mockGetAllTransactions(query.bookId)
  const categories = mockListCategories()
  const accounts = mockListAccounts(query.bookId)

  // 统计锚点：默认当月，传了 month 就查历史月份
  const anchorMonth = query.month ? parseMonth(query.month) : today().toPlainYearMonth()
  const { start, end } = monthRange(anchorMonth)
  const startStr = formatDate(start)
  const endStr = formatDate(end)

  const monthTxns = all.filter(t => inRange(t, startStr, endStr))

  const income = sumByType(monthTxns, 'income')
  const expense = sumByType(monthTxns, 'expense')

  // 上月同期：anchor 减一个月
  const prevMonth = anchorMonth.subtract({ months: 1 })
  const prevRange = monthRange(prevMonth)
  const prevTxns = all.filter(t => inRange(t, formatDate(prevRange.start), formatDate(prevRange.end)))
  const lastMonthIncome = sumByType(prevTxns, 'income')
  const lastMonthExpense = sumByType(prevTxns, 'expense')

  // 近 6 月趋势（以锚点月为终点往前推）
  const months = lastNMonths(TREND_MONTHS, anchorMonth)
  const trend: TrendPoint[] = months.map((m) => {
    const r = monthRange(m)
    const s = formatDate(r.start)
    const e = formatDate(r.end)
    const inMonth = all.filter(t => inRange(t, s, e))
    return {
      month: formatMonth(m),
      income: sumByType(inMonth, 'income'),
      expense: sumByType(inMonth, 'expense'),
    }
  })

  // 资产净值：账户期初 + 全部收入 - 全部支出（转账一进一出抵消，不参与）
  const netAssets = sumCents(accounts.map(a => a.initBalance))
    + sumByType(all, 'income')
    - sumByType(all, 'expense')

  return {
    month: formatMonth(anchorMonth),
    income,
    expense,
    balance: income - expense,
    lastMonthExpense,
    lastMonthIncome,
    expenseMoM: momPercent(expense, lastMonthExpense),
    incomeMoM: momPercent(income, lastMonthIncome),
    categories: buildCategorySlices(monthTxns, categories),
    trend,
    netAssets,
    transactionCount: monthTxns.length,
  }
}

/**
 * 账户余额表（US-004 账户体系的核心派生数据）
 * ====================================================================
 * 余额**不落库**，由「期初 + 流水」现算 —— 这样改一笔流水、删一笔转账，
 * 余额立刻跟着变，不存在「账户表和流水表对不上账」的可能。
 *
 * 口径：余额 = 期初 + 收入 - 支出 - 转出 + 转入
 *   - 信用卡没有期初，支出让它变负（负余额 = 欠款），可用额度 = 额度 + 余额
 *   - 转账在转出端记 -、转入端记 +：单账户视角钱真的走了，全账本视角一进一出抵消
 *
 * 真后端落地时这是一条 group by 的 SQL（或账户表冗余字段 + 流水触发器），
 * 前端调用方不需要知道它是算出来的还是查出来的。
 */
export function mockGetAccountBalances(bookId?: number): AccountBalance[] {
  const accounts = mockListAccounts(bookId)
  const all = mockGetAllTransactions(bookId)

  // 先给每个账户铺零值：即使一笔流水都没有，也要返回余额（= 期初），
  // 否则新建的账户在页面上会"不存在"，而不是显示 0。
  const stats = new Map<number, { income: number, expense: number, transferIn: number, transferOut: number, txnCount: number }>()
  for (const a of accounts)
    stats.set(a.id, { income: 0, expense: 0, transferIn: 0, transferOut: 0, txnCount: 0 })

  for (const t of all) {
    const from = stats.get(t.accountId)
    if (from) {
      from.txnCount++
      if (t.type === 'income')
        from.income += t.amount
      else if (t.type === 'expense')
        from.expense += t.amount
      else
        from.transferOut += t.amount // 转账：钱离开转出账户
    }
    if (t.toAccountId != null) {
      const to = stats.get(t.toAccountId)
      if (to) {
        to.txnCount++
        to.transferIn += t.amount // 转账：钱进入转入账户
      }
    }
  }

  return accounts.map((a) => {
    const s = stats.get(a.id)!
    return {
      accountId: a.id,
      balance: a.initBalance + s.income - s.expense - s.transferOut + s.transferIn,
      income: s.income,
      expense: s.expense,
      transferIn: s.transferIn,
      transferOut: s.transferOut,
      txnCount: s.txnCount,
    }
  })
}

/**
 * 全账本总资产净值（跨账本聚合，不受 bookId 过滤）
 * ====================================================================
 *
 * 与 mockGetDashboardOverview().netAssets 口径完全一致：
 *   Σ所有账户期初 + Σ所有收入 - Σ所有支出
 * 只是把范围从「当前账本」扩到「全部账本」。
 *
 * 不传 bookId 的 helper（mockGetAllTransactions / mockListAccounts）会返回全量数据，
 * 所以这里能一次性拉全账本统计；将来真后端落地时改成一条「全账本聚合」SQL 即可。
 */
export function mockGetTotalNetAssets(): number {
  const allTxns = mockGetAllTransactions()
  const allAccounts = mockListAccounts()
  return sumCents(allAccounts.map(a => a.initBalance))
    + sumByType(allTxns, 'income')
    - sumByType(allTxns, 'expense')
}

/**
 * 资产趋势（净值走势）
 * ====================================================================
 * 把「当前净资产」这一个数字，按月摊成一条曲线 —— 用户真正想知道的是
 * 「我这一年是攒下钱了还是在漏财」，一个时点值回答不了。
 *
 * 算法：一次遍历流水 → 落到「账户 × 月份」的变动矩阵 → 按月累加出每月末的
 * 账户余额 → 汇总成总资产 / 负债 / 净资产。
 *   为什么不是每个月 filter 一遍全量流水：那是 O(月数 × 流水数)，
 *   24 个月 × 1w 笔就是 24w 次比较；做成矩阵是 O(流水数 + 月数 × 账户数)。
 *
 * 两个必须守住的口径（都有单测盯着）：
 *   1. 最后一个点 === mockGetDashboardOverview().netAssets（两页数字必须同一个）
 *   2. 净资产 === 总资产 - 负债（拆分不能拆出对不上的账）
 *
 * 真后端落地时这是一条「按月 group by + 窗口函数」的 SQL，前端照样只拿结果。
 */
export function mockGetNetWorthTrend(query: NetWorthQuery = {}): NetWorthTrend {
  const months = Math.max(1, Math.trunc(query.months ?? 12))
  const accounts = mockListAccounts(query.bookId)
  const all = mockGetAllTransactions(query.bookId)

  // 时间轴：以当月为终点往前推 months 个月（正序）
  const list = lastNMonths(months)
  const monthIndex = new Map<string, number>(list.map((m, i) => [formatMonth(m), i]))
  const monthKeys = list.map(m => formatMonth(m))
  const firstMonthStart = formatDate(monthRange(list[0]!).start)

  // 账户维度：base = 期初 + 区间之前发生的流水；delta = 每个月的净变动
  const zeros = (): number[] => Array.from<number>({ length: months }).fill(0)

  const base = new Map<number, number>()
  const delta = new Map<number, number[]>()
  for (const a of accounts) {
    base.set(a.id, a.initBalance)
    delta.set(a.id, zeros())
  }

  // 收支维度：柱状图用，纯当月发生额（不含转账 —— 转账不增不减净值）
  const monthlyIncome = zeros()
  const monthlyExpense = zeros()

  for (const t of all) {
    const idx = monthIndex.get(t.transDate.slice(0, 7))

    // 区间之前的流水：全部压进基线，这样曲线起点才是「真实的历史家底」，
    // 而不是「账户期初」这个不随时间变化的值
    if (idx == null) {
      if (t.transDate >= firstMonthStart)
        continue // 未来月（mock 不会生成，真数据可能存在）不计入任何桶
      const b = base.get(t.accountId)
      if (b != null)
        base.set(t.accountId, b + signedAmount(t, t.accountId))
      if (t.toAccountId != null) {
        const to = base.get(t.toAccountId)
        if (to != null)
          base.set(t.toAccountId, to + t.amount)
      }
      continue
    }

    const d = delta.get(t.accountId)
    if (d != null)
      d[idx]! += signedAmount(t, t.accountId)
    if (t.toAccountId != null) {
      const to = delta.get(t.toAccountId)
      if (to != null)
        to[idx]! += t.amount // 转账：钱进入转入账户
    }

    if (t.type === 'income')
      monthlyIncome[idx]! += t.amount
    else if (t.type === 'expense')
      monthlyExpense[idx]! += t.amount
  }

  // ── 按月累加：月末时点快照 ────────────────────────────
  const running = new Map<number, number>(base)
  const points: NetWorthPoint[] = []
  let prevNet = sumCents([...running.values()]) // 区间起点净资产（第一个月的上月末）
  const startNetAssets = prevNet

  for (let i = 0; i < months; i++) {
    let assets = 0
    let debt = 0
    for (const a of accounts) {
      const id = a.id
      const next = running.get(id)! + delta.get(id)![i]!
      running.set(id, next)
      // 信用卡刷爆时余额为负：那不是「负资产」，是负债。
      // 分开设总资产和负债，净资产 = 总资产 - 负债 才讲得通。
      if (next >= 0)
        assets += next
      else
        debt += -next
    }

    const netAssets = assets - debt
    points.push({
      month: monthKeys[i]!,
      netAssets,
      assets,
      debt,
      // 净增取曲线上的真实差值：比 income-expense 更稳（真数据出现跨账本
      // 转账等脏数据时，曲线仍然自洽）
      netChange: netAssets - prevNet,
      income: monthlyIncome[i]!,
      expense: monthlyExpense[i]!,
    })
    prevNet = netAssets
  }

  // ── 区间摘要（页面不再自己算，避免各页面口径漂移）──────
  const endNetAssets = points.at(-1)?.netAssets ?? startNetAssets
  let peak: NetWorthPoint | null = null
  let trough: NetWorthPoint | null = null
  let maxDrawdown = 0
  let runningMax = Number.NEGATIVE_INFINITY

  for (const p of points) {
    if (!peak || p.netAssets > peak.netAssets)
      peak = p
    if (!trough || p.netAssets < trough.netAssets)
      trough = p
    // 最大回撤：站在历史最高点往下看，最深的一次跌幅
    runningMax = Math.max(runningMax, p.netAssets)
    maxDrawdown = Math.max(maxDrawdown, runningMax - p.netAssets)
  }

  return {
    points,
    startNetAssets,
    endNetAssets,
    change: endNetAssets - startNetAssets,
    changePercent: percentChange(endNetAssets, startNetAssets),
    peak,
    trough,
    maxDrawdown,
  }
}
