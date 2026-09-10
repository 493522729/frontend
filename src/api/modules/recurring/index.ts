/**
 * 周期账单 API（mock-first）
 * ====================================================================
 * 业务层只调用这里，不碰 mock 细节；真接口联调时整体替换本文件实现即可。
 * 延迟用 simulateLatency 包裹，让列表 / 确认 / 驳回的 loading 状态在开发期可见。
 */

import type {
  ConfirmRecurringOptions,
  PendingRecurring,
  RecurringTemplate,
} from '@/types/recurring'
import type { Transaction } from '@/types/transaction'
import { MOCK_LATENCY, simulateLatency } from '@/api/mock-latency'
import {
  mockConfirmRecurring,
  mockCreateTemplate,
  mockDeleteTemplate,
  mockDismissRecurring,
  mockGetPendingRecurring,
  mockListTemplates,
  mockToggleAutoConfirm,
  mockUpdateTemplate,
} from './mock'

/** 模板列表（配置页用） */
export function listTemplates(bookId?: number): Promise<RecurringTemplate[]> {
  return simulateLatency(mockListTemplates(bookId))
}

/** 新建模板 */
export function createTemplate(input: Omit<RecurringTemplate, 'id'>): Promise<RecurringTemplate> {
  return simulateLatency(mockCreateTemplate(input), MOCK_LATENCY.write)
}

/** 更新模板 */
export function updateTemplate(id: number, patch: Partial<Omit<RecurringTemplate, 'id'>>): Promise<RecurringTemplate> {
  return simulateLatency(mockUpdateTemplate(id, patch), MOCK_LATENCY.write)
}

/** 删除模板 */
export function deleteTemplate(id: number): Promise<void> {
  return simulateLatency(mockDeleteTemplate(id), MOCK_LATENCY.write)
}

/** 切换自动确认开关 */
export function toggleAutoConfirm(id: number): Promise<RecurringTemplate> {
  return simulateLatency(mockToggleAutoConfirm(id), MOCK_LATENCY.write)
}

/** 本月待确认项（派生） */
export function getPendingRecurring(bookId: number): Promise<PendingRecurring[]> {
  return simulateLatency(mockGetPendingRecurring(bookId), MOCK_LATENCY.list)
}

/** 确认一笔（写入交易） */
export function confirmRecurring(options: ConfirmRecurringOptions): Promise<Transaction> {
  return simulateLatency(mockConfirmRecurring(options), MOCK_LATENCY.write)
}

/** 驳回一笔（不写交易） */
export function dismissRecurring(templateId: number, bookId: number): Promise<void> {
  return simulateLatency(mockDismissRecurring(templateId, bookId), MOCK_LATENCY.write)
}
