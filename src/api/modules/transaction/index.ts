/**
 * 交易模块 API
 * ====================================================================
 * 当前走本地 mock（src/api/modules/transaction/mock.ts）。
 * 后端 Spring Boot 就绪后，把每个 export 函数体里的 mockXxx 换成 http.post/get 即可，
 * 业务代码（views/transaction/*）一行不用动。
 */
import type {
  Account,
  Category,
  Transaction,
  TransactionListParams,
  TransactionListResult,
} from '@/types/transaction'
import {
  MOCK_LATENCY,
  simulateLatency,
} from '@/api/mock-latency'
import {
  mockBatchDeleteTransactions,
  mockBatchUpdateCategory,
  mockCreateTransaction,
  mockDeleteTransaction,
  mockListAccounts,
  mockListCategories,
  mockListTransactions,
  mockUpdateTransaction,
} from './mock'

/** 分类字典（前端缓存） */
export function listCategories(): Promise<Category[]> {
  return simulateLatency(mockListCategories())
}

/** 账户字典 */
export function listAccounts(): Promise<Account[]> {
  return simulateLatency(mockListAccounts())
}

/** 分页查交易 */
export function listTransactions(params: TransactionListParams): Promise<TransactionListResult> {
  return simulateLatency(mockListTransactions(params), MOCK_LATENCY.list)
}

/** 单笔更新（行内编辑 / 行编辑） */
export function updateTransaction(id: number, patch: Partial<Transaction>): Promise<Transaction> {
  return simulateLatency(mockUpdateTransaction(id, patch))
}

/** 单笔删除 */
export function deleteTransaction(id: number): Promise<void> {
  return simulateLatency(mockDeleteTransaction(id))
}

/** 批量删除 */
export function batchDeleteTransactions(ids: number[]): Promise<number> {
  return simulateLatency(mockBatchDeleteTransactions(ids))
}

/** 批量改分类 */
export function batchUpdateCategory(ids: number[], categoryId: number): Promise<number> {
  return simulateLatency(mockBatchUpdateCategory(ids, categoryId))
}

/** 新增一笔（快速记账弹层会调） */
export function createTransaction(input: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<Transaction> {
  return simulateLatency(mockCreateTransaction(input))
}
