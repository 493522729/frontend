/**
 * 账户模块单测（US-004）
 * ====================================================================
 * 账户是「钱放在哪」，账本隔离与删除迁移是这里最容易出事的两处：
 *   - 串账本：A 账本看到 B 账本的账户，一保存就记错账
 *   - 删账户留孤儿流水：列表里出现「未知账户」，且转账会变成「自己转给自己」
 *
 * 断言结构与不变量，不写死具体金额/笔数（mock 数据随 seed 变化）。
 */
import { describe, expect, it } from 'vitest'
import { BOOK_SEEDS } from '@/api/mock-books'
import {
  mockCreateAccount,
  mockDeleteAccount,
  mockFindFallbackAccount,
  mockListAccounts,
} from '@/api/modules/account/mock'
import {
  mockCountAccountUsage,
  mockGetAllTransactions,
  mockReassignAccount,
} from '@/api/modules/transaction/mock'

describe('账户字典：账本隔离', () => {
  it('每个账户只属于一个账本', () => {
    for (const seed of BOOK_SEEDS) {
      const list = mockListAccounts(seed.id)
      expect(list.length).toBeGreaterThan(0)
      for (const a of list)
        expect(a.bookId).toBe(seed.id)
    }
  })

  it('新建 / 删除账户只影响目标账本', () => {
    const bookId = BOOK_SEEDS[0]!.id
    const before = mockListAccounts(bookId).length
    const created = mockCreateAccount({
      bookId,
      name: '测试账户',
      type: 'cash',
      icon: '🧪',
      initBalance: 12_345,
      creditLimit: 0,
    })
    expect(mockListAccounts(bookId).some(a => a.id === created.id)).toBe(true)
    expect(mockListAccounts(bookId)).toHaveLength(before + 1)

    mockDeleteAccount(created.id)
    expect(mockListAccounts(bookId)).toHaveLength(before)
  })

  it('兜底账户排除自身，且优先给非信用卡', () => {
    const bookId = BOOK_SEEDS[0]!.id
    const accounts = mockListAccounts(bookId)
    const credit = accounts.find(a => a.type === 'credit')
    if (credit) {
      const fallback = mockFindFallbackAccount(bookId, credit.id)
      expect(fallback).toBeDefined()
      expect(fallback!.id).not.toBe(credit.id)
    }
  })
})

describe('删除账户：流水迁移不留孤儿', () => {
  it('迁移后没有指向已删账户的流水，也不会出现自转账', () => {
    const bookId = BOOK_SEEDS[0]!.id
    const accounts = mockListAccounts(bookId)
    const from = accounts[0]!
    const to = accounts[1]!
    const before = mockGetAllTransactions(bookId).length
    const usage = mockCountAccountUsage(from.id)

    const { migrated, removed } = mockReassignAccount(from.id, to.id)

    // 迁移 + 清理的笔数必须等于该账户参与的全部流水
    expect(migrated + removed).toBe(usage.total)

    const after = mockGetAllTransactions(bookId)
    expect(after).toHaveLength(before - removed)

    for (const t of after) {
      expect(t.accountId).not.toBe(from.id)
      expect(t.toAccountId).not.toBe(from.id)
      // 转账两端必须不同：删掉一端后如果还留着，就成了「自己转给自己」的脏数据
      if (t.type === 'transfer')
        expect(t.toAccountId).not.toBe(t.accountId)
    }
  })
})
