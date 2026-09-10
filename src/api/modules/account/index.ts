import type { Account } from '@/types/transaction'

/**
 * 账户模块 API
 * ====================================================================
 * 当前走本地 mock（./mock.ts）。后端就绪后把每个函数体换成 http 调用即可，
 * 调用方（账户管理页 / dict store / 记账弹层 / 筛选面板）一行不用动。
 */
import { MOCK_LATENCY, simulateLatency } from '@/api/mock-latency'
import {
  mockCreateAccount,
  mockDeleteAccount,
  mockFindFallbackAccount,
  mockListAccounts,
  mockUpdateAccount,
} from './mock'

/**
 * 账户列表（账本隔离）
 *
 * 不传 bookId = 全部账本；传了 = 只给该账本下的账户。
 * 注意这里**不含余额**：余额是「期初 + 流水」推导出来的派生值，
 * 由 stats 模块的 listAccountBalances 单独给（口径见 stats/mock）。
 */
export function listAccounts(bookId?: number): Promise<Account[]> {
  return simulateLatency(mockListAccounts(bookId))
}

/** 新增账户（bookId / 期初余额 / 类型等必填项由调用方组装） */
export function createAccount(input: Omit<Account, 'id'>): Promise<Account> {
  return simulateLatency(mockCreateAccount(input), MOCK_LATENCY.write)
}

/** 更新账户 */
export function updateAccount(id: number, patch: Partial<Omit<Account, 'id'>>): Promise<Account> {
  return simulateLatency(mockUpdateAccount(id, patch), MOCK_LATENCY.write)
}

/**
 * 删除账户（仅删账户本体）
 *
 * 流水处理必须**先**由调用方走 transaction 的 reassignAccount 完成迁移，
 * 否则会留下指向不存在账户的孤儿流水。
 */
export function deleteAccount(id: number): Promise<void> {
  return simulateLatency(mockDeleteAccount(id), MOCK_LATENCY.write)
}

/** 查同账本内的兜底账户（删除时默认迁移目标） */
export function findFallbackAccount(bookId: number, exceptId: number): Promise<Account | undefined> {
  return simulateLatency(mockFindFallbackAccount(bookId, exceptId))
}
