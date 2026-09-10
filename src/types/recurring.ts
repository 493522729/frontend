/**
 * 周期账单（US-009）领域类型契约（前端单点真相）
 * ====================================================================
 * 一次配置「房租每月 1 号生成待确认流水」，之后系统按月派生出待确认项。
 * 与交易表同款约束：金额一律整数分；模板挂在账本下（bookId 隔离）。
 *
 * 周期账单只生成收入/支出，不产生转账 —— 转账需要两端账户，语义上不适用周期场景。
 */

import type { TransactionType } from '@/enums/transaction'

/** 周期账单类型：仅收入 / 支出（排除 transfer） */
export type RecurringType = Exclude<TransactionType, 'transfer'>

/** 周期账单模板（一次配置，按月生成待确认流水） */
export interface RecurringTemplate {
  id: number
  /** 所属账本 */
  bookId: number
  /** 类型：收入 / 支出 */
  type: RecurringType
  /** 金额（分） */
  amount: number
  /** 分类 ID */
  categoryId: number
  /** 账户 ID */
  accountId: number
  /** 备注 */
  note: string
  /** 起始日 YYYY-MM-DD（从该月起开始生成待确认项） */
  startDate: string
  /** 自动确认：生成当月即直接入账，不进待确认队列 */
  autoConfirm: boolean
  /** 是否启用（停用后不再生成） */
  active: boolean
}

/** 本月生成的待确认实例（不落库，由模板派生） */
export interface PendingRecurring {
  /** 稳定 key：模板 id + 月份，confirm / dismiss 时回写模板 id */
  key: string
  templateId: number
  bookId: number
  type: RecurringType
  /** 金额（分） */
  amount: number
  categoryId: number
  accountId: number
  note: string
  /** 计划入账日（取起始日的「日」部分落在当月；溢出月份则夹到 28 号） */
  dueDate: string
  /** 是否为「自动确认」模板（会被 store 自动入账，页面一般不再展示） */
  willAutoConfirm: boolean
}

/** 确认一笔的入参（可覆盖模板字段） */
export interface ConfirmRecurringOptions {
  bookId: number
  templateId: number
  /** 确认时覆盖金额（分） */
  amount?: number
  categoryId?: number
  accountId?: number
  note?: string
  /** 实际入账日（默认 dueDate） */
  transDate?: string
}

/** 新建模板入参（id 由 mock 分配） */
export type CreateRecurringTemplate = Omit<RecurringTemplate, 'id'>
