/**
 * 预算模块 API（US-006）
 * ====================================================================
 * 已切换真实后端：总览 / upsert / 删除全部走 http，与后端 BudgetController 对齐。
 * 业务代码（views/budget/*）零改动。
 *
 * 总览刻意一次请求拿全（与仪表盘聚合同一条 ADR-14 约定），避免多一次 RTT 与骨架屏闪烁。
 */
import type { Budget, BudgetOverview, BudgetQuery, BudgetUpsertInput } from '@/types/budget'
import { http } from '@/api/request'

/** 预算总览：总预算卡 + 各分类预算卡的完整数据（spent/percent 服务端现算） */
export function getBudgetOverview(query: BudgetQuery = {}): Promise<BudgetOverview> {
  return http.get<BudgetOverview>('/budgets/overview', {
    bookId: query.bookId,
    month: query.month,
  })
}

/** 设置预算（幂等 upsert：同账本+月份+分类只有一条） */
export function upsertBudget(input: BudgetUpsertInput): Promise<Budget> {
  return http.post<Budget>('/budgets', input)
}

/** 删除预算 */
export function deleteBudget(id: number): Promise<void> {
  return http.delete<void>(`/budgets/${id}`)
}
