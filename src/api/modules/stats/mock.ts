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
import type { CategorySlice, DashboardOverview, DashboardQuery, TrendPoint } from '@/types/stats'
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
import { mockGetAllTransactions, mockListAccounts, mockListCategories } from '../transaction/mock'

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
