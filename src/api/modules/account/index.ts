import type { Account } from '@/types/transaction'

/**
 * 账户模块 API —— 已切换到真实后端（账本隔离）。
 * 调用方（账户管理页 / dict store / 记账弹层 / 筛选面板）一行不用动。
 */
import { http } from '@/api/request'

/**
 * 账户列表（账本隔离）
 * 不传 bookId = 全部账本；传了 = 只给该账本下的账户。
 */
export function listAccounts(bookId?: number): Promise<Account[]> {
  return http.get<Account[]>('/accounts', bookId != null ? { bookId } : undefined)
}

/** 新增账户 */
export function createAccount(input: Omit<Account, 'id'>): Promise<Account> {
  return http.post<Account>('/accounts', input)
}

/** 更新账户 */
export function updateAccount(id: number, patch: Partial<Omit<Account, 'id'>>): Promise<Account> {
  return http.put<Account>(`/accounts/${id}`, patch)
}

/** 删除账户（仅删账户本体，交易迁移由调用方先走 reassignAccount） */
export function deleteAccount(id: number): Promise<void> {
  return http.delete<void>(`/accounts/${id}`)
}

/** 查同账本内的兜底账户（删除时默认迁移目标） */
export function findFallbackAccount(bookId: number, exceptId: number): Promise<Account | undefined> {
  return http.get<Account | null>(`/accounts/fallback?bookId=${bookId}&exceptId=${exceptId}`)
    .then(r => r ?? undefined)
}
