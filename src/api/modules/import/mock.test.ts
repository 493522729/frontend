import type { ParsedImportTxn, RawRow } from '@/types/import'
import type { Transaction } from '@/types/transaction'
import { describe, expect, it } from 'vitest'
import {
  detectDirection,
  mockAutoDetectColumns,
  mockBuildPreview,
  mockCommitImport,
  mockDetectDuplicates,
  mockParseRows,
  mockSuggestCategory,
  parseAmount,
  parseDate,
} from './mock'

function baseTx(over: Partial<Transaction>): Transaction {
  return ({
    id: 0,
    bookId: 1,
    type: 'expense',
    amount: 0,
    currency: 'CNY',
    accountId: 1,
    toAccountId: null,
    categoryId: 0,
    transDate: '2024-01-01',
    note: '',
    source: 'manual',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }) as Transaction
}

describe('parseAmount', () => {
  it('千分位 + 货币符号', () => expect(parseAmount('¥1,234.56')).toBe(123456))
  it('括号负取绝对值', () => expect(parseAmount('(88.00)')).toBe(8800))
  it('纯数字', () => expect(parseAmount(12.5)).toBe(1250))
  it('空与非法', () => {
    expect(parseAmount('')).toBe(0)
    expect(parseAmount('abc')).toBe(0)
    expect(parseAmount(undefined)).toBe(0)
  })
})

describe('parseDate', () => {
  it('斜杠', () => expect(parseDate('2024/03/05')).toBe('2024-03-05'))
  it('点分隔', () => expect(parseDate('2024.03.05')).toBe('2024-03-05'))
  it('年月日', () => expect(parseDate('2024年03月05日')).toBe('2024-03-05'))
  it('iSO 带时间', () => expect(parseDate('2024-03-05 14:22')).toBe('2024-03-05'))
  it('excel 序列号返回标准格式', () => expect(parseDate(45200)).toMatch(/^\d{4}-\d{2}-\d{2}$/))
  it('空', () => expect(parseDate(undefined)).toBe(''))
})

describe('detectDirection', () => {
  it('收/工资 → income', () => {
    expect(detectDirection('收入')).toBe('income')
    expect(detectDirection('工资')).toBe('income')
  })
  it('支/消费 → expense', () => {
    expect(detectDirection('支出')).toBe('expense')
    expect(detectDirection('消费')).toBe('expense')
  })
  it('缺失默认支出', () => expect(detectDirection(undefined)).toBe('expense'))
})

describe('mockAutoDetectColumns', () => {
  it('招行表头全识别', () => {
    const headers = ['交易日期', '交易金额', '收支类型', '账户余额', '对方户名', '摘要说明']
    const { mapping, unmapped } = mockAutoDetectColumns(headers)
    expect(mapping.date).toBe('交易日期')
    expect(mapping.amount).toBe('交易金额')
    expect(mapping.type).toBe('收支类型')
    expect(mapping.balance).toBe('账户余额')
    expect(mapping.counterparty).toBe('对方户名')
    expect(mapping.remark).toBe('摘要说明')
    expect(unmapped).toHaveLength(0)
  })
})

describe('mockSuggestCategory', () => {
  const existing = [baseTx({ id: 1, type: 'expense', amount: 3500, note: '星巴克咖啡', categoryId: 3 })]
  it('历史相同备注命中', () => {
    expect(mockSuggestCategory('星巴克咖啡', 'expense', existing)).toBe(3)
  })
  it('分类名关键词命中', () => {
    expect(mockSuggestCategory('美团外卖订单', 'expense')).toBeDefined()
  })
  it('无备注返回 undefined', () => {
    expect(mockSuggestCategory('', 'expense', existing)).toBeUndefined()
  })
})

describe('mockParseRows + mockDetectDuplicates', () => {
  const mapping = { date: 'date', amount: 'amount', type: 'type', remark: 'remark' }
  const rows: RawRow[] = [
    { date: '2024-03-01', amount: '12.00', type: '支出', remark: '午餐' },
    { date: '2024-03-01', amount: '12.00', type: '支出', remark: '午餐' },
  ]
  it('解析方向与金额', () => {
    const parsed = mockParseRows(rows, mapping)
    expect(parsed).toHaveLength(2)
    expect(parsed[0]!.amount).toBe(1200)
    expect(parsed[0]!.direction).toBe('expense')
  })
  it('本批内重复互标', () => {
    const parsed = mockParseRows(rows, mapping)
    const dup = mockDetectDuplicates(parsed)
    expect(dup[0]!.isDuplicate).toBe(true)
    expect(dup[1]!.isDuplicate).toBe(true)
  })
  it('与本地重复标记（先写入再检测）', () => {
    const single: RawRow[] = [{ date: '2024-05-09', amount: '99.00', type: '支出', remark: '测试本地重复' }]
    const once = mockParseRows(single, mapping)
    mockCommitImport(once, { accountId: 1, bookId: 1, keepDuplicates: true, categoryOverrides: {}, fallbackCategoryId: 13 })
    const again = mockParseRows(single, mapping)
    const dup = mockDetectDuplicates(again, 1)
    expect(dup[0]!.isDuplicate).toBe(true)
  })
})

describe('mockBuildPreview', () => {
  it('统计重复笔数', () => {
    const mapping = { date: 'date', amount: 'amount', type: 'type', remark: 'remark' }
    const rows: RawRow[] = [
      { date: '2024-08-01', amount: '30.00', type: '支出', remark: '午餐' },
      { date: '2024-08-01', amount: '30.00', type: '支出', remark: '午餐' },
    ]
    const preview = mockBuildPreview(rows, mapping)
    expect(preview.total).toBe(2)
    expect(preview.duplicateCount).toBe(2)
  })
})

describe('mockCommitImport', () => {
  const mapping = { date: 'date', amount: 'amount', type: 'type', remark: 'remark' }
  it('跳过重复，正常写入', () => {
    const rows: RawRow[] = [
      { date: '2024-06-01', amount: '10.00', type: '支出', remark: 'AAA' },
      { date: '2024-06-02', amount: '20.00', type: '收入', remark: 'BBB' },
    ]
    const parsed = mockParseRows(rows, mapping)
    const marked: ParsedImportTxn[] = parsed.map((p, i) => (i === 0 ? { ...p, isDuplicate: true } : p))
    const res = mockCommitImport(marked, { accountId: 1, bookId: 1, keepDuplicates: false, categoryOverrides: {}, fallbackCategoryId: 13 })
    expect(res.inserted).toBe(1)
    expect(res.skipped).toBe(1)
    expect(res.total).toBe(2)
  })
  it('keepDuplicates=true 全写入', () => {
    const rows: RawRow[] = [{ date: '2024-07-01', amount: '5.00', type: '支出', remark: 'CCC' }]
    const parsed = mockParseRows(rows, mapping).map(p => ({ ...p, isDuplicate: true }))
    const res = mockCommitImport(parsed, { accountId: 1, bookId: 1, keepDuplicates: true, categoryOverrides: {}, fallbackCategoryId: 13 })
    expect(res.inserted).toBe(1)
    expect(res.skipped).toBe(0)
  })
})
