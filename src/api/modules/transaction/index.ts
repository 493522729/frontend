/**
 * 交易模块 API
 * ====================================================================
 * 当前走本地 mock（src/api/modules/transaction/mock.ts）。
 * 后端 Spring Boot 就绪后，把每个 export 函数体里的 mockXxx 换成 http.post/get 即可，
 * 业务代码（views/transaction/*）一行不用动。
 */
import type {
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
  mockCountAccountUsage,
  mockCountCategoryUsage,
  mockCreateTransaction,
  mockDeleteTransaction,
  mockListTransactions,
  mockReassignAccount,
  mockReassignCategory,
  mockRestoreTransactions,
  mockUpdateTransaction,
} from './mock'

export { listAccounts } from '@/api/modules/account'
// 分类 / 账户字典归属各自模块，这里透传，保持旧的调用方（dict store）零改动
export { listCategories } from '@/api/modules/category'

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

/** 撤销删除：把交易原样放回（配合批量删除的 5s 撤销 toast） */
export function restoreTransactions(rows: Transaction[]): Promise<void> {
  return simulateLatency(mockRestoreTransactions(rows))
}

/** 批量改分类 */
export function batchUpdateCategory(ids: number[], categoryId: number): Promise<number> {
  return simulateLatency(mockBatchUpdateCategory(ids, categoryId))
}

/** 分类迁移：把某分类下的交易改挂目标分类（删除分类时调用） */
export function reassignCategory(fromId: number, toId: number): Promise<number> {
  return simulateLatency(mockReassignCategory(fromId, toId))
}

/** 统计某分类被多少笔交易引用（删除前提示用） */
export function countCategoryUsage(id: number): Promise<number> {
  return simulateLatency(mockCountCategoryUsage(id))
}

/**
 * 统计某账户被多少笔交易引用（删除账户前提示用）
 * @returns total 总笔数 / transfer 其中转账笔数（转账会被一并清掉，必须提前告知）
 */
export function countAccountUsage(id: number): Promise<{ total: number, transfer: number }> {
  return simulateLatency(mockCountAccountUsage(id))
}

/**
 * 账户迁移：把某账户下的收支改挂目标账户，转账笔直接删除
 * （转账两端都是账户，缺一端就成了「自己转给自己」的脏数据）
 */
export function reassignAccount(fromId: number, toId: number): Promise<{ migrated: number, removed: number }> {
  return simulateLatency(mockReassignAccount(fromId, toId), MOCK_LATENCY.write)
}

/** 新增一笔（快速记账弹层会调） */
export function createTransaction(input: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<Transaction> {
  return simulateLatency(mockCreateTransaction(input))
}
