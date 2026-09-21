import { describe, expect, it } from 'vitest'
import { mockGetAllTransactions } from '@/api/modules/transaction/mock'
import {
  mockConfirmRecurring,
  mockCreateTemplate,
  mockDeleteTemplate,
  mockDismissRecurring,
  mockGetPendingRecurring,
  mockListTemplates,
} from './mock'

/** 下个月第一天 YYYY-MM-DD（用于「起始日未来」用例） */
function nextMonthFirstDay(): string {
  const d = new Date()
  const y = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear()
  const m = d.getMonth() === 11 ? 1 : d.getMonth() + 2
  return `${y}-${String(m).padStart(2, '0')}-01`
}

function recurringCount(): number {
  return mockGetAllTransactions().filter(t => t.source === 'recurring').length
}

describe('recurring/mock', () => {
  it('种子模板存在且挂在日常账本', () => {
    const list = mockListTemplates(1)
    expect(list.length).toBeGreaterThanOrEqual(2)
    expect(list.every(t => t.bookId === 1)).toBe(true)
  })

  it('本月待确认项派生不漏不重：连续两次调用数量一致', () => {
    const a = mockGetPendingRecurring(1)
    const b = mockGetPendingRecurring(1)
    expect(b.length).toBe(a.length)
    expect(a.map(p => p.key)).toEqual(b.map(p => p.key))
  })

  it('确认一笔：写入交易(source=recurring) 且待确认减少', () => {
    const before = mockGetPendingRecurring(1).length
    const beforeCount = recurringCount()
    const t = mockListTemplates(1)[0]!
    const txn = mockConfirmRecurring({ bookId: 1, templateId: t.id })
    expect(txn.source).toBe('recurring')
    expect(txn.amount).toBe(t.amount)
    expect(recurringCount()).toBe(beforeCount + 1)
    expect(mockGetPendingRecurring(1).length).toBe(before - 1)
  })

  it('重复确认同模板同月抛错，防重复入账', () => {
    const t = mockListTemplates(1)[0]!
    // 上一个用例已确认过 t，再次确认应抛错
    expect(() => mockConfirmRecurring({ bookId: 1, templateId: t.id })).toThrow()
  })

  it('驳回一笔：待确认减少且不写流水', () => {
    const pending = mockGetPendingRecurring(1)
    const before = pending.length
    const beforeCount = recurringCount()
    const t2 = mockListTemplates(1)[1]!
    mockDismissRecurring(t2.id, 1)
    expect(mockGetPendingRecurring(1).length).toBe(before - 1)
    expect(recurringCount()).toBe(beforeCount) // 驳回不新增交易
  })

  it('账本隔离：非日常账本无模板、无待确认', () => {
    expect(mockListTemplates(2).length).toBe(0)
    expect(mockGetPendingRecurring(2).length).toBe(0)
  })

  it('自动确认模板在待确认队列中带 willAutoConfirm 标记', () => {
    const t = mockCreateTemplate({
      bookId: 1,
      type: 'expense',
      amount: 1000,
      categoryId: 8,
      accountId: 19,
      toAccountId: null,
      note: '自动账单',
      startDate: `${new Date().getFullYear()}-01-01`,
      autoConfirm: true,
      active: true,
    })
    const pending = mockGetPendingRecurring(1)
    const hit = pending.find(p => p.templateId === t.id)
    expect(hit?.willAutoConfirm).toBe(true)
  })

  it('起始日在未来月份：当月不生成待确认项', () => {
    const t = mockCreateTemplate({
      bookId: 1,
      type: 'expense',
      amount: 1000,
      categoryId: 8,
      accountId: 19,
      toAccountId: null,
      note: '未来账单',
      startDate: nextMonthFirstDay(),
      autoConfirm: false,
      active: true,
    })
    expect(mockGetPendingRecurring(1).some(p => p.templateId === t.id)).toBe(false)
  })

  it('停用模板：不生成待确认项', () => {
    const t = mockCreateTemplate({
      bookId: 1,
      type: 'expense',
      amount: 1000,
      categoryId: 8,
      accountId: 19,
      toAccountId: null,
      note: '停用账单',
      startDate: `${new Date().getFullYear()}-01-01`,
      autoConfirm: false,
      active: false,
    })
    expect(mockGetPendingRecurring(1).some(p => p.templateId === t.id)).toBe(false)
  })

  it('删除模板：其待确认项不再出现', () => {
    const t = mockCreateTemplate({
      bookId: 1,
      type: 'expense',
      amount: 1000,
      categoryId: 8,
      accountId: 19,
      toAccountId: null,
      note: '待删账单',
      startDate: `${new Date().getFullYear()}-01-01`,
      autoConfirm: false,
      active: true,
    })
    expect(mockGetPendingRecurring(1).some(p => p.templateId === t.id)).toBe(true)
    mockDeleteTemplate(t.id)
    expect(mockGetPendingRecurring(1).some(p => p.templateId === t.id)).toBe(false)
  })

  it('确认时可覆盖金额/分类/账户，覆盖值写入交易', () => {
    const t = mockCreateTemplate({
      bookId: 1,
      type: 'expense',
      amount: 1000,
      categoryId: 8,
      accountId: 19,
      toAccountId: null,
      note: '覆盖账单',
      startDate: `${new Date().getFullYear()}-01-01`,
      autoConfirm: false,
      active: true,
    })
    const beforeCount = recurringCount()
    const txn = mockConfirmRecurring({
      bookId: 1,
      templateId: t.id,
      amount: 8800,
      categoryId: 13,
      accountId: 20,
      note: '覆盖后备注',
    })
    expect(txn.amount).toBe(8800)
    expect(txn.categoryId).toBe(13)
    expect(txn.note).toBe('覆盖后备注')
    expect(recurringCount()).toBe(beforeCount + 1)
  })

  it('转账模板：待确认项带两端账户，确认后写入 transfer 流水', () => {
    const t = mockCreateTemplate({
      bookId: 1,
      type: 'transfer',
      amount: 500000,
      categoryId: 0,
      accountId: 19,
      toAccountId: 20,
      note: '每月给家人转账',
      startDate: `${new Date().getFullYear()}-01-01`,
      autoConfirm: false,
      active: true,
    })
    const pending = mockGetPendingRecurring(1).find(p => p.templateId === t.id)
    expect(pending?.toAccountId).toBe(20)

    const txn = mockConfirmRecurring({ bookId: 1, templateId: t.id })
    expect(txn.type).toBe('transfer')
    expect(txn.accountId).toBe(19)
    expect(txn.toAccountId).toBe(20)
    expect(txn.amount).toBe(500000)
  })
})
