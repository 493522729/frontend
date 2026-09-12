/**
 * 周期账单 API —— 已切换到真实后端。
 * 调用方（store / 页面 / 配置弹层）一行不用动。
 * 与后端 RecurringController 对齐：
 *   GET  /api/recurring/templates        模板列表（含停用项）
 *   POST /api/recurring/templates        新建
 *   PUT  /api/recurring/templates/{id}   更新（部分字段）
 *   DEL  /api/recurring/templates/{id}   删除
 *   POST /api/recurring/templates/{id}/toggle-auto-confirm  切自动确认
 *   GET  /api/recurring/pending?bookId=  本月待确认项（派生）
 *   POST /api/recurring/{id}/confirm     确认（写交易）
 *   POST /api/recurring/{id}/dismiss     驳回（不写交易）
 */

import type {
  ConfirmRecurringOptions,
  PendingRecurring,
  RecurringTemplate,
} from '@/types/recurring'
import type { Transaction } from '@/types/transaction'
import { http } from '@/api/request'

/** 模板列表（配置页用，含停用项） */
export function listTemplates(bookId?: number): Promise<RecurringTemplate[]> {
  return http.get<RecurringTemplate[]>('/recurring/templates', bookId == null ? {} : { bookId })
}

/** 新建模板 */
export function createTemplate(input: Omit<RecurringTemplate, 'id'>): Promise<RecurringTemplate> {
  return http.post<RecurringTemplate>('/recurring/templates', input)
}

/** 更新模板（部分字段） */
export function updateTemplate(id: number, patch: Partial<Omit<RecurringTemplate, 'id'>>): Promise<RecurringTemplate> {
  return http.put<RecurringTemplate>(`/recurring/templates/${id}`, patch)
}

/** 删除模板 */
export function deleteTemplate(id: number): Promise<void> {
  return http.delete<void>(`/recurring/templates/${id}`)
}

/** 切换自动确认开关 */
export function toggleAutoConfirm(id: number): Promise<RecurringTemplate> {
  return http.post<RecurringTemplate>(`/recurring/templates/${id}/toggle-auto-confirm`)
}

/** 本月待确认项（派生，不落库） */
export function getPendingRecurring(bookId: number): Promise<PendingRecurring[]> {
  return http.get<PendingRecurring[]>('/recurring/pending', { bookId })
}

/** 确认一笔（写入 source='recurring' 交易）。templateId 走 path，其余字段走 body（可覆盖） */
export function confirmRecurring(options: ConfirmRecurringOptions): Promise<Transaction> {
  const { templateId, ...body } = options
  return http.post<Transaction>(`/recurring/${templateId}/confirm`, body)
}

/** 驳回一笔（不写交易，仅标记本月已处理） */
export function dismissRecurring(templateId: number, bookId: number): Promise<void> {
  return http.post<void>(`/recurring/${templateId}/dismiss`, { bookId })
}
