/**
 * 仪表盘聚合逻辑单测（架构 ADR-12：聚合计算必须有测试兜底）
 * ====================================================================
 * mock 数据的时间基准是 Date.now()，每次运行分布都不同，**断言不了具体金额**。
 * 所以这里测的是「口径不变量」+「用独立的朴素实现对照重算」：
 * 只要聚合的口径（转账不计收支、结余=收-支、占比合计 100%）是对的，
 * 无论数据怎么随机，这些等式都必须成立。
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { BOOK_SEEDS } from '@/api/mock-books'
import { sumCents } from '@/utils/money'
import { formatMonth, lastNMonths } from '@/utils/temporal'
import { mockListAccounts } from '../account/mock'
import { mockListBooks } from '../book/mock'
import { mockGetAllTransactions } from '../transaction/mock'
import {
  mockGetAccountBalances,
  mockGetDashboardOverview,
  mockGetNetWorthTrend,
  mockGetTotalNetAssets,
} from './mock'

/** 朴素重算：不复用被测代码的任何逻辑，独立实现一份用来对照 */
function naiveSumByMonth(month: string, type: 'income' | 'expense' | 'transfer'): number {
  return mockGetAllTransactions()
    .filter(t => t.transDate.startsWith(month) && t.type === type)
    .reduce((sum, t) => sum + t.amount, 0)
}

let currentMonth = ''

beforeAll(() => {
  const now = new Date()
  currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
})

describe('mockGetDashboardOverview —— 收支口径', () => {
  it('收入 / 支出与朴素重算一致', () => {
    const o = mockGetDashboardOverview()
    expect(o.income).toBe(naiveSumByMonth(currentMonth, 'income'))
    expect(o.expense).toBe(naiveSumByMonth(currentMonth, 'expense'))
  })

  it('结余 = 收入 - 支出', () => {
    const o = mockGetDashboardOverview()
    expect(o.balance).toBe(o.income - o.expense)
  })

  it('转账不计入收支：本月收支里不含任何 transfer 金额', () => {
    const o = mockGetDashboardOverview()
    const transferTotal = naiveSumByMonth(currentMonth, 'transfer')
    // 间接验证：如果转账被算进了收支，收入或支出必然 >= 转账额（数据足够大时）
    // 更直接的是口径断言 —— 收支只由同名类型构成，已由上一条测试的朴素重算锁定
    expect(o.income).toBe(naiveSumByMonth(currentMonth, 'income'))
    expect(o.expense).toBe(naiveSumByMonth(currentMonth, 'expense'))
    expect(transferTotal).toBeGreaterThanOrEqual(0)
  })

  it('资产净值 = Σ账户期初 + Σ收入 - Σ支出（转账一进一出，不影响净值）', () => {
    const o = mockGetDashboardOverview()
    const all = mockGetAllTransactions()
    const expected = sumCents(mockListAccounts().map(a => a.initBalance))
      + sumCents(all.filter(t => t.type === 'income').map(t => t.amount))
      - sumCents(all.filter(t => t.type === 'expense').map(t => t.amount))
    expect(o.netAssets).toBe(expected)
  })
})

describe('mockGetDashboardOverview —— 分类占比', () => {
  it('各切片金额之和 = 本月支出总额', () => {
    const o = mockGetDashboardOverview()
    expect(sumCents(o.categories.map(c => c.amount))).toBe(o.expense)
  })

  it('切片数量 ≤ 7（Top 6 + 其他）且按金额降序', () => {
    const o = mockGetDashboardOverview()
    expect(o.categories.length).toBeLessThanOrEqual(7)
    for (let i = 1; i < o.categories.length; i++)
      expect(o.categories[i - 1]!.amount).toBeGreaterThanOrEqual(o.categories[i]!.amount)
  })

  it('百分比合计 100（允许浮点误差）', () => {
    const o = mockGetDashboardOverview()
    if (o.categories.length === 0)
      return
    const total = o.categories.reduce((s, c) => s + c.percent, 0)
    expect(total).toBeCloseTo(100, 1)
  })

  it('转账（categoryId=0）不出现在分类切片里', () => {
    const o = mockGetDashboardOverview()
    // 「其他」聚合项也是 id 0，所以只断言：非「其他」的切片 id 都 > 0
    for (const c of o.categories) {
      if (c.name !== '其他')
        expect(c.categoryId).toBeGreaterThan(0)
    }
  })
})

describe('mockGetDashboardOverview —— 趋势与环比', () => {
  it('趋势固定 6 个月，最后一项是查询当月', () => {
    const o = mockGetDashboardOverview()
    expect(o.trend).toHaveLength(6)
    expect(o.trend[5]!.month).toBe(o.month)
  })

  it('环比：上月为 0 时返回 0，不做除零', () => {
    // mock 数据只覆盖过去 24 个月，查一个远古月份必然双月皆空
    const o = mockGetDashboardOverview({ month: '2000-01' })
    expect(o.expense).toBe(0)
    expect(o.lastMonthExpense).toBe(0)
    expect(o.expenseMoM).toBe(0)
    expect(o.incomeMoM).toBe(0)
  })

  it('环比公式：(本期 - 上期) / 上期', () => {
    const o = mockGetDashboardOverview()
    if (o.lastMonthExpense === 0)
      return
    const expected = Math.round(((o.expense - o.lastMonthExpense) / o.lastMonthExpense) * 10000) / 100
    expect(o.expenseMoM).toBe(expected)
  })
})

describe('mockGetDashboardOverview —— 空状态', () => {
  it('无交易的月份：各项归零、分类为空，供页面走「记第一笔」引导', () => {
    const o = mockGetDashboardOverview({ month: '2000-01' })
    expect(o.transactionCount).toBe(0)
    expect(o.income).toBe(0)
    expect(o.expense).toBe(0)
    expect(o.balance).toBe(0)
    expect(o.categories).toEqual([])
  })
})

describe('mockGetTotalNetAssets —— 全账本总资产', () => {
  it('总资产净值 = Σ所有账户期初 + Σ所有收入 - Σ所有支出（与单账本口径一致）', () => {
    const total = mockGetTotalNetAssets()
    const allTxns = mockGetAllTransactions()
    const expected = sumCents(mockListAccounts().map(a => a.initBalance))
      + sumCents(allTxns.filter(t => t.type === 'income').map(t => t.amount))
      - sumCents(allTxns.filter(t => t.type === 'expense').map(t => t.amount))
    expect(total).toBe(expected)
  })

  // 这条是「端到端」校验：总卡必须 = 各账本卡片加起来，
  // 否则仪表盘上「总卡 vs 当前账本卡」会出现数据不一致的玄学问题。
  it('总资产净值 = 各账本净值之和（与 mockGetDashboardOverview 聚合一致）', () => {
    const total = mockGetTotalNetAssets()
    const perBookTotal = mockListBooks().reduce(
      (sum, b) => sum + mockGetDashboardOverview({ bookId: b.id }).netAssets,
      0,
    )
    expect(total).toBe(perBookTotal)
  })
})

describe('mockGetAccountBalances —— 账户余额（US-004）', () => {
  // 这条是账户体系的「对账」底线：账户页显示的净资产，必须和仪表盘的
  // 资产净值分毫不差。两处口径一旦分叉，用户会看到「账户加起来 1 万、
  // 仪表盘显示 8 千」这种无法解释的差异，信任直接崩掉。
  it('账户余额合计 = 该账本净值（账户视角与全局视角自洽）', () => {
    for (const seed of BOOK_SEEDS) {
      const sum = sumCents(mockGetAccountBalances(seed.id).map(b => b.balance))
      expect(sum).toBe(mockGetDashboardOverview({ bookId: seed.id }).netAssets)
    }
  })

  it('每个账户都有余额记录（没有流水的账户余额 = 期初）', () => {
    const bookId = BOOK_SEEDS[0]!.id
    const accounts = mockListAccounts(bookId)
    const balances = mockGetAccountBalances(bookId)
    expect(balances).toHaveLength(accounts.length)
    for (const a of accounts)
      expect(balances.some(b => b.accountId === a.id)).toBe(true)
  })

  it('转账在两端一进一出，不改变任何账户余额合计', () => {
    const bookId = BOOK_SEEDS[0]!.id
    const transfers = mockGetAllTransactions(bookId).filter(t => t.type === 'transfer')
    // 用「朴素实现」独立重算一遍转账对每个账户的影响，再对照余额表
    const naive = new Map<number, number>()
    for (const t of transfers) {
      naive.set(t.accountId, (naive.get(t.accountId) ?? 0) - t.amount)
      if (t.toAccountId != null)
        naive.set(t.toAccountId, (naive.get(t.toAccountId) ?? 0) + t.amount)
    }
    for (const b of mockGetAccountBalances(bookId)) {
      const delta = (naive.get(b.accountId) ?? 0)
      expect(b.transferIn - b.transferOut).toBe(delta)
    }
  })
})

describe('mockGetNetWorthTrend —— 资产趋势（P1）', () => {
  const MONTHS = 12

  it('区间长度与月序：请求 N 个月就返回 N 个点，最后一点是当月', () => {
    const t = mockGetNetWorthTrend({ months: MONTHS })
    expect(t.points).toHaveLength(MONTHS)
    expect(t.points.map(p => p.month)).toEqual(lastNMonths(MONTHS).map(formatMonth))
  })

  // 对账底线：曲线末端必须就是仪表盘上那个「资产净值」。
  // 两页数字不一致时，用户不会怀疑算法，只会觉得这软件不可靠。
  it('末点净资产 = 仪表盘资产净值（趋势页与仪表盘是同一口径）', () => {
    const t = mockGetNetWorthTrend({ months: MONTHS })
    expect(t.endNetAssets).toBe(mockGetDashboardOverview().netAssets)
    expect(t.points.at(-1)!.netAssets).toBe(t.endNetAssets)
  })

  it('净资产 = 总资产 - 负债（拆分不能拆出对不上的账）', () => {
    const t = mockGetNetWorthTrend({ months: MONTHS })
    for (const p of t.points) {
      expect(p.netAssets).toBe(p.assets - p.debt)
      expect(p.assets).toBeGreaterThanOrEqual(0)
      expect(p.debt).toBeGreaterThanOrEqual(0)
    }
  })

  it('月度净增 = 当月收入 - 当月支出（与朴素重算一致，转账不参与）', () => {
    const t = mockGetNetWorthTrend({ months: MONTHS })
    for (const p of t.points) {
      const naive = naiveSumByMonth(p.month, 'income') - naiveSumByMonth(p.month, 'expense')
      expect(p.netChange).toBe(naive)
    }
  })

  it('区间净增 = 末点 - 起点，且等于各月净增之和', () => {
    const t = mockGetNetWorthTrend({ months: MONTHS })
    expect(t.change).toBe(t.endNetAssets - t.startNetAssets)
    expect(t.change).toBe(sumCents(t.points.map(p => p.netChange)))
  })

  it('峰值 / 谷值 / 最大回撤：回撤非负，且不超过峰谷差', () => {
    const t = mockGetNetWorthTrend({ months: MONTHS })
    expect(t.peak).not.toBeNull()
    expect(t.trough).not.toBeNull()
    for (const p of t.points) {
      expect(p.netAssets).toBeLessThanOrEqual(t.peak!.netAssets)
      expect(p.netAssets).toBeGreaterThanOrEqual(t.trough!.netAssets)
    }
    expect(t.maxDrawdown).toBeGreaterThanOrEqual(0)
    expect(t.maxDrawdown).toBeLessThanOrEqual(t.peak!.netAssets - t.trough!.netAssets)
  })

  // 账本隔离：看「装修账本」的曲线不该混入日常账本的家底
  it('账本隔离：每个账本曲线末端 = 该账本净值', () => {
    for (const seed of BOOK_SEEDS) {
      const t = mockGetNetWorthTrend({ bookId: seed.id, months: 6 })
      expect(t.endNetAssets).toBe(mockGetDashboardOverview({ bookId: seed.id }).netAssets)
    }
  })

  it('区间越长起点越早：24 月区间的首月早于 6 月区间（且覆盖它）', () => {
    const long = mockGetNetWorthTrend({ months: 24 })
    const short = mockGetNetWorthTrend({ months: 6 })
    // 月份是 'YYYY-MM' 字符串，字典序即时间序，但 toBeLessThan 只接受数字，故显式比较
    expect(long.points[0]!.month < short.points[0]!.month).toBe(true)
    expect(long.points).toContainEqual(short.points.at(-1))
  })
})
