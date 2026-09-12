/**
 * 交易模块 API —— 已切换到真实后端（Spring Boot）。
 * 业务代码（views/transaction/*）一行不用动：所有函数签名与原 mock 版完全一致。
 */
import type {
  Transaction,
  TransactionListParams,
  TransactionListResult,
  TransactionStatus,
} from '@/types/transaction'
import { http } from '@/api/request'

// 分类 / 账户字典归属各自模块，这里透传，保持旧的调用方（dict store）零改动
export { listAccounts } from '@/api/modules/account'
export { listCategories } from '@/api/modules/category'

/** 分页查交易（数组参数转逗号串，对齐后端 @RequestParam 解析） */
export function listTransactions(params: TransactionListParams): Promise<TransactionListResult> {
  const q: Record<string, unknown> = {
    page: params.page,
    pageSize: params.pageSize,
  }
  if (params.bookId != null)
    q.bookId = params.bookId
  if (params.startDate)
    q.startDate = params.startDate
  if (params.endDate)
    q.endDate = params.endDate
  if (params.keyword)
    q.keyword = params.keyword
  if (params.status)
    q.status = params.status
  if (params.categoryIds?.length)
    q.categoryIds = params.categoryIds.join(',')
  if (params.accountIds?.length)
    q.accountIds = params.accountIds.join(',')
  if (params.types?.length)
    q.types = params.types.join(',')
  return http.get<TransactionListResult>('/transactions', q)
}

/** 单笔更新（行内编辑 / 行编辑） */
export function updateTransaction(id: number, patch: Partial<Transaction>): Promise<Transaction> {
  return http.put<Transaction>(`/transactions/${id}`, patch)
}

/** 单笔删除 */
export function deleteTransaction(id: number): Promise<void> {
  return http.delete<void>(`/transactions/${id}`)
}

/** 批量删除 */
export function batchDeleteTransactions(ids: number[]): Promise<number> {
  return http.post<number>('/transactions/batch-delete', { ids })
}

/** 撤销删除：把交易原样放回（配合批量删除的 5s 撤销 toast） */
export function restoreTransactions(rows: Transaction[]): Promise<void> {
  const payload = rows.map(r => ({
    bookId: r.bookId,
    type: r.type,
    amount: r.amount,
    currency: r.currency,
    accountId: r.accountId,
    toAccountId: r.toAccountId,
    categoryId: r.categoryId,
    transDate: r.transDate,
    note: r.note,
    source: r.source,
    status: r.status,
  }))
  return http.post<void>('/transactions/restore', { rows: payload })
}

/** 批量改分类 */
export function batchUpdateCategory(ids: number[], categoryId: number): Promise<number> {
  return http.post<number>('/transactions/batch-category', { ids, categoryId })
}

/** 批量改状态（待确认 / 已记） */
export function batchUpdateStatus(ids: number[], status: TransactionStatus): Promise<number> {
  return http.post<number>('/transactions/batch-status', { ids, status })
}

/** 分类迁移：把某分类下的交易改挂目标分类（删除分类时调用） */
export function reassignCategory(fromId: number, toId: number): Promise<number> {
  return http.post<number>('/transactions/reassign-category', { fromId, toId })
}

/** 统计某分类被多少笔交易引用（删除前提示用） */
export function countCategoryUsage(id: number): Promise<number> {
  return http.get<number>(`/transactions/count-category?categoryId=${id}`)
}

/** 统计某账户被多少笔交易引用（删除账户前提示用） */
export function countAccountUsage(id: number): Promise<{ total: number, transfer: number }> {
  return http.get<{ total: number, transfer: number }>(`/transactions/count-account?accountId=${id}`)
}

/** 账户迁移：把某账户下的收支改挂目标账户，转账笔直接删除 */
export function reassignAccount(fromId: number, toId: number): Promise<{ migrated: number, removed: number }> {
  return http.post<{ migrated: number, removed: number }>('/transactions/reassign-account', { fromId, toId })
}

/** 新增一笔（快速记账弹层会调） */
export function createTransaction(input: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<Transaction> {
  return http.post<Transaction>('/transactions', input)
}
