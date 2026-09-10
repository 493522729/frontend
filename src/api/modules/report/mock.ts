/**
 * 报表聚合 mock（US-007 多维交叉）
 * ====================================================================
 * 「时间 × 分类 × 账户」三个维度交叉看收支分布。
 * 聚合一次请求拿全（ADR-14）：柱/折线的时间桶 + 饼图的分类构成 + 汇总。
 * 下钻明细不在聚合里 —— 点桶/扇区后用 listTransactions 按同筛选条件
 * + 桶时间范围查，一份明细接口两处用（大表已经在用）。
 *
 * 口径与仪表盘一致：转账不进任何统计。
 * 真后端落地：一条「group by 时间桶, 分类」的 SQL 即可。
 */

import type { ReportBucket, ReportGranularity, ReportQuery, ReportResult } from '@/types/report'
import type { CategorySlice } from '@/types/stats'
import type { PlainDate } from '@/utils/temporal'
import { percentOf, sumCents } from '@/utils/money'
import { formatDate, monthRange, parseDate, startOfWeek } from '@/utils/temporal'
import { mockListCategories } from '../category/mock'
import { mockGetAllTransactions } from '../transaction/mock'

/** 一个桶的累计器 —— 只含报表要呈现的字段；转账被前置过滤掉了 */
interface BucketAcc {
  income: number
  expense: number
}

/**
 * 取桶里特定字段的累计值（income/expense 之一）。
 * 写在这而不是用 `[t.type]` 索引：TransactionType 还有 'transfer'，
 * BucketAcc 里没有，索引访问会触发 noImplicitAny 之类报错，不如显式断言。
 */
function addTo(b: BucketAcc, type: 'income' | 'expense', amount: number): void {
  if (type === 'income')
    b.income += amount
  else
    b.expense += amount
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 某日期属于第几季度（1~4） */
function quarterOf(d: PlainDate): number {
  return Math.floor((d.month - 1) / 3) + 1
}

/** 交易日期 → 桶 key（types/report.ts 有各粒度的 key 约定） */
export function bucketKeyOf(d: PlainDate, g: ReportGranularity): string {
  switch (g) {
    case 'day':
      return formatDate(d)
    case 'week':
      return formatDate(startOfWeek(d)) // 周一日期即周桶的 key
    case 'month':
      return `${d.year}-${pad2(d.month)}`
    case 'quarter':
      return `${d.year}-Q${quarterOf(d)}`
    case 'year':
      return String(d.year)
  }
}

/** 桶 key → 图表 x 轴短标签 */
export function bucketLabelOf(key: string, g: ReportGranularity): string {
  switch (g) {
    case 'day':
    case 'week':
      return key.slice(5).replace('-', '/') // '09/05'
    case 'month':
      return `${Number(key.slice(5))}月`
    case 'quarter':
      return key.slice(5) // 'Q3'
    case 'year':
      return key
  }
}

/**
 * 从 start 开始按粒度步进，产出 [start, end] 内所有桶的 key（时间正序）
 *
 * 月/季/年的步进锚定在 1 号：PlainDate.add({ months:1 }) 在 31 号会溢出
 * （1/31 + 1月 = 3/3），锚定 1 号后月月相加才不会跳桶。
 */
function iterateBucketKeys(start: string, end: string, g: ReportGranularity): string[] {
  const s = parseDate(start)
  const e = parseDate(end)
  const keys: string[] = []

  if (g === 'day') {
    for (let d = s; formatDate(d) <= end; d = d.add({ days: 1 }))
      keys.push(formatDate(d))
    return keys
  }

  if (g === 'week') {
    // 对齐到周一，再按 7 天步进
    for (let d = startOfWeek(s); formatDate(d) <= end; d = d.add({ days: 7 }))
      keys.push(formatDate(d))
    return keys
  }

  // month / quarter / year：锚定 1 号步进
  let anchor = s.toPlainYearMonth().toPlainDate({ day: 1 })
  const stepMonths = g === 'month' ? 1 : g === 'quarter' ? 3 : 12
  while (formatDate(anchor) <= end) {
    keys.push(bucketKeyOf(anchor, g))
    anchor = anchor.add({ months: stepMonths })
  }
  // end 落在 anchor 之前的桶已覆盖；e 当月/季/年的桶由循环条件保证（<= end 比的是日期）
  void e
  return keys
}

/**
 * 桶 key → 时间范围（下钻用：点柱子查这个桶里的明细）
 *
 * 与 bucketKeyOf 互逆 —— 两处口径必须一致，否则「图表显示 8 月支出 1 万、
 * 点开一看只有 9 千」。所以下钻不走独立的日期计算，全部从这里出。
 */
export function bucketRange(key: string, g: ReportGranularity): { start: string, end: string } {
  switch (g) {
    case 'day':
      return { start: key, end: key }
    case 'week': {
      const monday = parseDate(key)
      return { start: key, end: formatDate(monday.add({ days: 6 })) }
    }
    case 'month': {
      const r = monthRange(parseDate(`${key}-01`).toPlainYearMonth())
      return { start: formatDate(r.start), end: formatDate(r.end) }
    }
    case 'quarter': {
      const [yearStr, q] = key.split('-Q') as [string, string]
      const firstMonth = (Number(q) - 1) * 3 + 1
      const startD = parseDate(`${yearStr}-${pad2(firstMonth)}-01`)
      const endD = startD.add({ months: 3 }).subtract({ days: 1 })
      return { start: formatDate(startD), end: formatDate(endD) }
    }
    case 'year':
      return { start: `${key}-01-01`, end: `${key}-12-31` }
  }
}

/** 分类构成：按 categoryId 聚合金额 → 降序切片（含图标/颜色/占比回填） */
function buildSlices(
  amounts: Map<number, number>,
  categories: ReturnType<typeof mockListCategories>,
): CategorySlice[] {
  const total = sumCents([...amounts.values()])
  return [...amounts.entries()]
    .map(([categoryId, amount]) => {
      const c = categories.find(x => x.id === categoryId)
      return {
        categoryId,
        name: c?.name ?? '未分类',
        icon: c?.icon ?? '📦',
        color: c?.color ?? '#94A3B8',
        amount,
        percent: percentOf(amount, total),
      }
    })
    .sort((a, b) => b.amount - a.amount)
}

export function mockGetReport(query: ReportQuery): ReportResult {
  const categories = mockListCategories()
  const g = query.granularity

  // 三维过滤：账本是数据可见性的第一道闸，分类/账户是可选收窄
  const categorySet = query.categoryIds?.length ? new Set(query.categoryIds) : null
  const accountSet = query.accountIds?.length ? new Set(query.accountIds) : null

  const inScope = mockGetAllTransactions(query.bookId).filter((t) => {
    if (t.type === 'transfer')
      return false // 转账不是赚也不是花，报表里没有它的位置
    if (t.transDate < query.start || t.transDate > query.end)
      return false
    if (categorySet && !categorySet.has(t.categoryId))
      return false
    if (accountSet && !accountSet.has(t.accountId))
      return false
    return true
  })

  // ── 时间桶 ────────────────────────────────────────────
  const acc = new Map<string, BucketAcc>()
  for (const t of inScope) {
    // inScope 已经把 transfer 过滤掉；这里再加守卫让 TS 知道 t.type 收窄
    if (t.type === 'transfer')
      continue
    const key = bucketKeyOf(parseDate(t.transDate), g)
    const b = acc.get(key) ?? { income: 0, expense: 0 }
    addTo(b, t.type, t.amount)
    acc.set(key, b)
  }

  // 空桶也占位：折线断成一截一截的比「0 的柱子」更让人困惑
  const buckets: ReportBucket[] = iterateBucketKeys(query.start, query.end, g).map((key) => {
    const b = acc.get(key)
    return {
      key,
      label: bucketLabelOf(key, g),
      income: b?.income ?? 0,
      expense: b?.expense ?? 0,
    }
  })

  // ── 分类构成 ──────────────────────────────────────────
  const expenseAmounts = new Map<number, number>()
  const incomeAmounts = new Map<number, number>()
  for (const t of inScope) {
    const m = t.type === 'expense' ? expenseAmounts : incomeAmounts
    m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + t.amount)
  }

  return {
    buckets,
    expenseCategories: buildSlices(expenseAmounts, categories),
    incomeCategories: buildSlices(incomeAmounts, categories),
    income: sumCents(inScope.filter(t => t.type === 'income').map(t => t.amount)),
    expense: sumCents(inScope.filter(t => t.type === 'expense').map(t => t.amount)),
    count: inScope.length,
  }
}
