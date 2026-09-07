import type { BookWithStats } from '@/types/book'
/**
 * 账本 mock 数据源
 * ====================================================================
 * 账本定义在 src/api/mock-books.ts（共享层），交易/账户分片在
 * transaction/mock.ts。这里只负责把它们拼成「账本 + 摘要」给 UI 用。
 *
 * 依赖方向刻意是单向的：book → transaction → mock-books，
 * 如果把种子放进 book/mock 就会和 transaction/mock 形成循环依赖。
 */
import { BOOK_SEEDS } from '@/api/mock-books'
import { mockGetAllTransactions } from '@/api/modules/transaction/mock'

export function mockListBooks(): BookWithStats[] {
  return BOOK_SEEDS.map((seed) => {
    // 笔数实时统计（不是写死种子值）—— 新增/删除交易后切换器里的数字要跟着变
    const txnCount = mockGetAllTransactions(seed.id).length
    return {
      id: seed.id,
      name: seed.name,
      type: seed.type,
      currency: 'CNY' as const,
      icon: seed.icon,
      isDefault: seed.isDefault,
      txnCount,
      accountCount: seed.accountTemplateIndexes.length,
    }
  })
}
