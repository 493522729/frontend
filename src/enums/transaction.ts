/**
 * 交易领域枚举
 * ====================================================================
 * 架构文档 2.2 节规定：枚举独立到 enums/，避免散落在 types/ 里。
 * 所有联合类型的字面量集合都来自这里，引用方写 `import type { TransactionType } from '@/enums/transaction'`。
 */

/** 交易类型 */
export const TRANSACTION_TYPES = ['income', 'expense', 'transfer'] as const
export type TransactionType = (typeof TRANSACTION_TYPES)[number]

/** 交易来源 */
export const TRANSACTION_SOURCES = ['manual', 'import', 'recurring'] as const
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number]

/** 交易类型元信息（中文 / Naive Tag 配色 / 排序权重） */
export const TRANSACTION_TYPE_META: Record<TransactionType, {
  label: string
  naiveTagType: 'success' | 'error' | 'info'
  sortOrder: number
}> = {
  expense: { label: '支出', naiveTagType: 'error', sortOrder: 0 },
  income: { label: '收入', naiveTagType: 'success', sortOrder: 1 },
  transfer: { label: '转账', naiveTagType: 'info', sortOrder: 2 },
}

/** 交易来源元信息 */
export const TRANSACTION_SOURCE_META: Record<TransactionSource, { label: string }> = {
  manual: { label: '手动' },
  import: { label: '导入' },
  recurring: { label: '周期' },
}
