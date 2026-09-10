import type { ReportGranularity } from '@/types/report'
/**
 * 报表聚合单测（US-007）
 * ====================================================================
 * 报表最容易错的是「桶的口径」：key 怎么算、范围怎么反推、空桶占不占位。
 * 核心不变量是**互逆性** —— bucketKeyOf(日期) 得到的 key，用 bucketRange
 * 反推出的范围必须包含原日期；违反它就会出现「图表显示 8 月支出 1 万、
 * 点开明细只有 9 千」这种对不上账的体验。
 */
import { describe, expect, it } from 'vitest'
import { BOOK_SEEDS } from '@/api/mock-books'
import { mockListCategories } from '@/api/modules/category/mock'
import { mockGetAllTransactions } from '@/api/modules/transaction/mock'
import { sumCents } from '@/utils/money'
import { parseDate } from '@/utils/temporal'
import { bucketKeyOf, bucketRange, mockGetReport } from './mock'

const BOOK_ID = BOOK_SEEDS[0]!.id
// 固定日期范围（不依赖 Date.now()），断言才可复现
const START = '2025-01-01'
const END = '2026-09-09'

const GRANULARITIES: ReportGranularity[] = ['day', 'week', 'month', 'quarter', 'year']

describe('mockGetReport —— 分桶口径', () => {
  for (const g of GRANULARITIES) {
    it(`[${g}] 桶 key 与 bucketRange 互逆：每笔范围内交易都落在唯一且包含它的桶里`, () => {
      const r = mockGetReport({ bookId: BOOK_ID, start: START, end: END, granularity: g })
      const keys = new Set(r.buckets.map(b => b.key))

      for (const t of mockGetAllTransactions(BOOK_ID)) {
        if (t.type === 'transfer' || t.transDate < START || t.transDate > END)
          continue
        const key = bucketKeyOf(parseDate(t.transDate), g)
        // 交易所属的桶必须存在（不会算出一个图表上没有的桶）
        expect(keys.has(key)).toBe(true)
        // 桶范围必须包含交易日期（点柱子下钻不会漏笔）
        const range = bucketRange(key, g)
        expect(t.transDate >= range.start && t.transDate <= range.end).toBe(true)
      }
    })

    it(`[${g}] Σ桶收支 = 区间明细合计（转账不进报表）`, () => {
      const r = mockGetReport({ bookId: BOOK_ID, start: START, end: END, granularity: g })
      const all = mockGetAllTransactions(BOOK_ID).filter(t => t.transDate >= START && t.transDate <= END)

      const naiveExpense = sumCents(all.filter(t => t.type === 'expense').map(t => t.amount))
      const naiveIncome = sumCents(all.filter(t => t.type === 'income').map(t => t.amount))
      const naiveCount = all.filter(t => t.type !== 'transfer').length

      expect(sumCents(r.buckets.map(b => b.expense))).toBe(naiveExpense)
      expect(sumCents(r.buckets.map(b => b.income))).toBe(naiveIncome)
      expect(r.expense).toBe(naiveExpense)
      expect(r.income).toBe(naiveIncome)
      expect(r.count).toBe(naiveCount)
    })
  }

  it('月粒度空桶也占位：区间内没有交易的月份也在桶序列里（折线不断档）', () => {
    const r = mockGetReport({ bookId: BOOK_ID, start: '2020-01-01', end: '2020-06-30', granularity: 'month' })
    expect(r.buckets.map(b => b.key)).toEqual([
      '2020-01',
      '2020-02',
      '2020-03',
      '2020-04',
      '2020-05',
      '2020-06',
    ])
    // 远古区间没有任何交易：全 0 但桶齐全
    expect(r.expense).toBe(0)
    expect(r.count).toBe(0)
  })

  it('季度 key 形如 YYYY-Qn，范围正好覆盖一个季度', () => {
    const range = bucketRange('2026-Q3', 'quarter')
    expect(range.start).toBe('2026-07-01')
    expect(range.end).toBe('2026-09-30')
    expect(bucketKeyOf(parseDate('2026-08-15'), 'quarter')).toBe('2026-Q3')
  })
})

describe('mockGetReport —— 分类构成与过滤', () => {
  it('支出构成合计 = 区间支出；收入构成合计 = 区间收入', () => {
    const r = mockGetReport({ bookId: BOOK_ID, start: START, end: END, granularity: 'month' })
    expect(sumCents(r.expenseCategories.map(s => s.amount))).toBe(r.expense)
    expect(sumCents(r.incomeCategories.map(s => s.amount))).toBe(r.income)
    // 切片降序 + 分类元数据已回填
    for (let i = 1; i < r.expenseCategories.length; i++)
      expect(r.expenseCategories[i - 1]!.amount).toBeGreaterThanOrEqual(r.expenseCategories[i]!.amount)
    for (const s of r.expenseCategories) {
      const c = mockListCategories().find(x => x.id === s.categoryId)
      expect(s.name).toBe(c?.name ?? '未分类')
      expect(s.color).toBe(c?.color ?? '#94A3B8')
    }
  })

  it('限定分类后：支出不大于全量、count 同步收窄', () => {
    const full = mockGetReport({ bookId: BOOK_ID, start: START, end: END, granularity: 'month' })
    const target = full.expenseCategories[0]!.categoryId
    const filtered = mockGetReport({
      bookId: BOOK_ID,
      start: START,
      end: END,
      granularity: 'month',
      categoryIds: [target],
    })
    expect(filtered.expense).toBeLessThanOrEqual(full.expense)
    expect(filtered.expense).toBeGreaterThan(0)
    // 构成里只剩这一个分类
    expect(filtered.expenseCategories).toHaveLength(1)
    expect(filtered.expenseCategories[0]!.categoryId).toBe(target)
  })

  it('账本隔离：限定分类属于全局字典，但金额只统计指定账本', () => {
    const cat = mockListCategories().find(c => c.type === 'expense')!
    const single = mockGetReport({ bookId: BOOK_SEEDS[1]!.id, start: START, end: END, granularity: 'month', categoryIds: [cat.id] })
    const naive = sumCents(
      mockGetAllTransactions(BOOK_SEEDS[1]!.id)
        .filter(t => t.type === 'expense' && t.categoryId === cat.id && t.transDate >= START && t.transDate <= END)
        .map(t => t.amount),
    )
    expect(single.expense).toBe(naive)
  })
})
