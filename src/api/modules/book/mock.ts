import type { Book, BookWithStats } from '@/types/book'
import { BOOK_SEEDS } from '@/api/mock-books'
import { mockListAccounts } from '@/api/modules/account/mock'
import { mockGetAllTransactions } from '@/api/modules/transaction/mock'

/**
 * 账本 mock 数据源（可写版本）
 * ====================================================================
 * 原实现只读 BOOK_SEEDS；现在账本管理页需要 CRUD，所以把种子铺成一块
 * 可变的 `_books` 内存表，CRUD 直接改它。统计摘要（笔数/账户数）仍实时
 * 由 transaction 模块算出，保证改了账本后切账本器里的数字跟着变。
 *
 * 依赖方向保持单向：book → transaction → mock-books，不反向。
 */
const _books: Book[] = []
let _nextId = 1

function init() {
  if (_books.length > 0)
    return
  for (const seed of BOOK_SEEDS) {
    _books.push({
      id: seed.id,
      name: seed.name,
      type: seed.type,
      currency: 'CNY',
      icon: seed.icon,
      isDefault: seed.isDefault,
    })
    _nextId = Math.max(_nextId, seed.id + 1)
  }
}

export function mockListBooks(): BookWithStats[] {
  init()
  return _books.map(b => ({
    ...b,
    // 笔数/账户数实时统计（非写死），新增账本从 0 开始、删交易后数字自减
    txnCount: mockGetAllTransactions(b.id).length,
    accountCount: mockListAccounts(b.id).length,
  }))
}

export function mockCreateBook(input: Omit<Book, 'id'>): Book {
  init()
  const created: Book = { ...input, id: _nextId++ }
  if (created.isDefault)
    unsetOthersDefault(created.id)
  _books.push(created)
  return created
}

export function mockUpdateBook(id: number, patch: Partial<Omit<Book, 'id'>>): Book {
  init()
  const idx = _books.findIndex(b => b.id === id)
  if (idx < 0)
    throw new Error(`Book ${id} not found`)
  const updated: Book = { ..._books[idx]!, ...patch, id }
  _books[idx] = updated
  if (patch.isDefault)
    unsetOthersDefault(id)
  return updated
}

export function mockDeleteBook(id: number): void {
  init()
  const idx = _books.findIndex(b => b.id === id)
  if (idx < 0)
    throw new Error(`Book ${id} not found`)
  _books.splice(idx, 1)
}

export function mockSetDefaultBook(id: number): void {
  init()
  const target = _books.find(b => b.id === id)
  if (!target)
    throw new Error(`Book ${id} not found`)
  target.isDefault = true
  unsetOthersDefault(id)
}

/** 取消除 exceptId 外所有账本的默认标记（默认账本全局唯一） */
function unsetOthersDefault(exceptId: number): void {
  for (const b of _books) {
    if (b.id !== exceptId)
      b.isDefault = false
  }
}
