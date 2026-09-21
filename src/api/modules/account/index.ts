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

/*
 * ⚠️ 写入口刻意排除 `mine`：账户归属由**后端**按登录用户决定（AccountController.create 里 setUserId(uid)），
 *    前端传了也不认 —— 放进入参类型只会误导调用方去填一个无效字段。
 */

/**
 * 新增账户入参。
 *
 * `ownerUserId`（可选）= 归属人：省略即建给自己；指定为**本账本其他成员**时，
 * 后端会校验「调用者是 OWNER/ADMIN」且「该用户是本账本成员」（见 AccountController.create）。
 * 典型场景：共享账本里帮家人把他/她的卡录进来，避免算进自己的净资产。
 */
export type AccountCreateInput = Omit<Account, 'id' | 'mine'> & {
  /** 归属人 userId；不传 = 建给自己 */
  ownerUserId?: number
}

/** 新增账户 */
export function createAccount(input: AccountCreateInput): Promise<Account> {
  return http.post<Account>('/accounts', input)
}

/** 更新账户 */
export function updateAccount(id: number, patch: Partial<Omit<Account, 'id' | 'mine'>>): Promise<Account> {
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
