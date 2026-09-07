/**
 * 多账本数据隔离测试（US-005）
 * ====================================================================
 * 账本串数据是这类系统最恶劣的 bug —— 用户在装修账本看到日常账本的开销，
 * 会直接怀疑账记错了，而且极难自查。所以隔离不变量必须有测试守着。
 *
 * 断言的是**结构不变量**而非具体金额：mock 数据随 seed/时间变化，
 * 写死数字只会让测试脆，但「A 账本里绝不能出现 B 账本的数据」永远成立。
 */
import { describe, expect, it } from 'vitest'
import { BOOK_SEEDS } from '@/api/mock-books'
import { mockListBooks } from '@/api/modules/book/mock'
import {
  mockGetAllTransactions,
  mockListAccounts,
  mockListTransactions,
} from '@/api/modules/transaction/mock'

describe('多账本数据隔离', () => {
  it('每个账本查到的交易都只属于该账本', () => {
    for (const seed of BOOK_SEEDS) {
      const list = mockGetAllTransactions(seed.id)
      expect(list.length).toBeGreaterThan(0)
      expect(list.every(t => t.bookId === seed.id)).toBe(true)
    }
  })

  it('各账本笔数之和等于全量 —— 没有漏记也没有重复计', () => {
    const sum = BOOK_SEEDS.reduce((acc, s) => acc + mockGetAllTransactions(s.id).length, 0)
    expect(sum).toBe(mockGetAllTransactions().length)
  })

  it('分页查询带了 bookId 就不会串账本', () => {
    for (const seed of BOOK_SEEDS) {
      const { list, total } = mockListTransactions({ bookId: seed.id, page: 1, pageSize: 100 })
      expect(total).toBe(mockGetAllTransactions(seed.id).length)
      expect(list.every(t => t.bookId === seed.id)).toBe(true)
    }
  })

  it('账户按账本隔离', () => {
    for (const seed of BOOK_SEEDS) {
      const accounts = mockListAccounts(seed.id)
      expect(accounts.length).toBeGreaterThan(0)
      expect(accounts.every(a => a.bookId === seed.id)).toBe(true)
    }
    const sum = BOOK_SEEDS.reduce((acc, s) => acc + mockListAccounts(s.id).length, 0)
    expect(sum).toBe(mockListAccounts().length)
  })

  it('交易引用的账户一定属于它自己所在的账本（无跨账本引用）', () => {
    const accountBook = new Map(mockListAccounts().map(a => [a.id, a.bookId]))
    for (const t of mockGetAllTransactions()) {
      expect(accountBook.get(t.accountId)).toBe(t.bookId)
      if (t.toAccountId != null)
        expect(accountBook.get(t.toAccountId)).toBe(t.bookId)
    }
  })

  it('转账不会自己转给自己', () => {
    const transfers = mockGetAllTransactions().filter(t => t.type === 'transfer')
    expect(transfers.length).toBeGreaterThan(0)
    for (const t of transfers) {
      expect(t.toAccountId).not.toBeNull()
      expect(t.toAccountId).not.toBe(t.accountId)
    }
  })

  it('账本摘要里的笔数与真实数据一致', () => {
    const books = mockListBooks()
    expect(books).toHaveLength(BOOK_SEEDS.length)
    for (const b of books) {
      expect(b.txnCount).toBe(mockGetAllTransactions(b.id).length)
      expect(b.accountCount).toBe(mockListAccounts(b.id).length)
    }
  })

  it('切换器看到的各账本规模确实不同（否则切换效果看不出来）', () => {
    const counts = BOOK_SEEDS.map(s => mockGetAllTransactions(s.id).length)
    expect(new Set(counts).size).toBe(counts.length)
  })
})
