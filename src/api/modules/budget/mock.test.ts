/**
 * 预算聚合与 CRUD 单测（架构 ADR-12：口径必须有测试兜底）
 * ====================================================================
 * 预算的数字正确性只有两个来源：花费口径（spent 怎么算）和进度口径
 * （percent 怎么算）。这里用「朴素重算对照」锁死它们，
 * mock 数据随机变化也不影响 —— 不变量才是要测的东西。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { BOOK_SEEDS } from '@/api/mock-books'
import { mockListCategories } from '@/api/modules/category/mock'
import { mockGetAllTransactions } from '@/api/modules/transaction/mock'
import { sumCents } from '@/utils/money'
import { formatMonth, today } from '@/utils/temporal'
import {
  mockCategorySpent,
  mockDeleteBudget,
  mockGetBudgetOverview,
  mockResetBudgets,
  mockUpsertBudget,
  TOTAL_BUDGET_CATEGORY_ID,
} from './mock'

const BOOK_ID = BOOK_SEEDS[0]!.id
const currentMonth = formatMonth(today().toPlainYearMonth())

beforeEach(() => {
  mockResetBudgets()
})

describe('mockGetBudgetOverview —— 花费与进度口径', () => {
  it('总卡花费 = 当月全部支出（朴素重算对照）', () => {
    const o = mockGetBudgetOverview({ bookId: BOOK_ID, month: currentMonth })
    const naive = sumCents(
      mockGetAllTransactions(BOOK_ID)
        .filter(t => t.type === 'expense' && t.transDate.startsWith(currentMonth))
        .map(t => t.amount),
    )
    expect(o.total.spent).toBe(naive)
  })

  it('分类卡花费 = 该分类当月支出，percent = spent / amount（允许 > 100）', () => {
    const o = mockGetBudgetOverview({ bookId: BOOK_ID, month: currentMonth })
    expect(o.items.length).toBeGreaterThan(0)
    for (const item of o.items) {
      expect(item.spent).toBe(mockCategorySpent(BOOK_ID, currentMonth, item.budget.categoryId))
      expect(item.remaining).toBe(item.budget.amount - item.spent)
      const expected = Math.round((item.spent / item.budget.amount) * 1000) / 10
      expect(item.percent).toBe(expected)
      // 口径允许超 100（超支多少显示多少），但绝不允许负百分比
      expect(item.percent).toBeGreaterThanOrEqual(0)
    }
  })

  it('分类卡按 percent 降序（最危险的排最前）', () => {
    const o = mockGetBudgetOverview({ bookId: BOOK_ID, month: currentMonth })
    for (let i = 1; i < o.items.length; i++)
      expect(o.items[i - 1]!.percent).toBeGreaterThanOrEqual(o.items[i]!.percent)
  })

  it('未设置总预算的月份：amount=0 时 percent=0，不除零', () => {
    // 远古月份没有任何预算种子
    const o = mockGetBudgetOverview({ bookId: BOOK_ID, month: '2020-01' })
    expect(o.total.budget.amount).toBe(0)
    expect(o.total.percent).toBe(0)
    expect(o.items).toEqual([])
  })
})

describe('mockUpsertBudget —— 幂等写入', () => {
  it('同「账本+月份+分类」两次 upsert 仍是一条记录，金额以最后一次为准', () => {
    const dining = mockListCategories().find(c => c.name === '餐饮')!
    mockUpsertBudget({ bookId: BOOK_ID, month: currentMonth, categoryId: dining.id, amount: 111 })
    mockUpsertBudget({ bookId: BOOK_ID, month: currentMonth, categoryId: dining.id, amount: 222 })

    const o = mockGetBudgetOverview({ bookId: BOOK_ID, month: currentMonth })
    const rows = o.items.filter(i => i.budget.categoryId === dining.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.budget.amount).toBe(222)
  })

  it('金额 <= 0 直接拒绝（预算没有「负额度」的语义）', () => {
    const dining = mockListCategories().find(c => c.name === '餐饮')!
    expect(() =>
      mockUpsertBudget({ bookId: BOOK_ID, month: currentMonth, categoryId: dining.id, amount: 0 }),
    ).toThrow()
    expect(() =>
      mockUpsertBudget({ bookId: BOOK_ID, month: currentMonth, categoryId: dining.id, amount: -100 }),
    ).toThrow()
  })

  it('总预算（categoryId=0）走同一条 upsert 通道，进度用全部支出', () => {
    const before = mockGetBudgetOverview({ bookId: BOOK_ID, month: currentMonth })
    mockUpsertBudget({
      bookId: BOOK_ID,
      month: currentMonth,
      categoryId: TOTAL_BUDGET_CATEGORY_ID,
      amount: before.total.spent + 100,
    })
    const after = mockGetBudgetOverview({ bookId: BOOK_ID, month: currentMonth })
    expect(after.total.budget.amount).toBe(before.total.spent + 100)
    // 刻意造成「刚好差 100」的状态：percent 必须小于 100，但 remaining = 100
    expect(after.total.remaining).toBe(100)
    // percent 保留 1 位小数：巨额支出下 100 分的差距会被四舍五入到 100.0，
    // 所以这里只断言不超 100（精度敏感的断言是上面的 remaining）
    expect(after.total.percent).toBeLessThanOrEqual(100)
  })
})

describe('mockDeleteBudget —— 删除', () => {
  it('删除后总览里不再出现该分类（已花的钱不受影响：spent 口径只看流水）', () => {
    const o1 = mockGetBudgetOverview({ bookId: BOOK_ID, month: currentMonth })
    const first = o1.items[0]!
    const spentBefore = first.spent

    mockDeleteBudget(first.budget.id)

    const o2 = mockGetBudgetOverview({ bookId: BOOK_ID, month: currentMonth })
    expect(o2.items.some(i => i.budget.id === first.budget.id)).toBe(false)
    // 该分类的当月支出照旧 —— 删预算不删账
    expect(mockCategorySpent(BOOK_ID, currentMonth, first.budget.categoryId)).toBe(spentBefore)
  })

  it('删除不存在的预算报错（让调用方感知异常而不是默默成功）', () => {
    expect(() => mockDeleteBudget(999_999)).toThrow()
  })
})

describe('预算账本隔离（US-005）', () => {
  it('种子预算只属于日常账本：其他账本看不到，互不串', () => {
    const other = BOOK_SEEDS[1]!.id
    const mine = mockGetBudgetOverview({ bookId: BOOK_ID, month: currentMonth })
    const theirs = mockGetBudgetOverview({ bookId: other, month: currentMonth })

    expect(mine.items.length).toBeGreaterThan(0)
    expect(theirs.items).toEqual([])
    // 在别的账本设预算，不影响本账本
    mockUpsertBudget({ bookId: other, month: currentMonth, categoryId: 7, amount: 500 })
    expect(mockGetBudgetOverview({ bookId: BOOK_ID, month: currentMonth }).items.length)
      .toBe(mine.items.length)
  })
})
