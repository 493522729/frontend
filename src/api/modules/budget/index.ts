/**
 * 预算模块 API（US-006）
 * ====================================================================
 * mock 期走本地实现；后端就绪后把每个函数换成 http 调用，
 * 业务代码（views/budget/*、quick-entry）一行不用动。
 *
 * 总览刻意做成「一次请求拿全」（与仪表盘聚合同一条 ADR-14 约定）：
 * 页面 = 总卡 + 分类卡，拆两个请求只会多一次 RTT 和一次骨架屏闪烁。
 */
import type { Budget, BudgetOverview, BudgetQuery, BudgetUpsertInput } from '@/types/budget'
import { MOCK_LATENCY, simulateLatency } from '@/api/mock-latency'
import {
  mockDeleteBudget,
  mockGetBudgetOverview,
  mockUpsertBudget,
} from './mock'

/** 预算总览：总预算卡 + 各分类预算卡的完整数据 */
export function getBudgetOverview(query: BudgetQuery = {}): Promise<BudgetOverview> {
  return simulateLatency(mockGetBudgetOverview(query), MOCK_LATENCY.aggregate)
}

/** 设置预算（幂等 upsert：同账本+月份+分类只有一条） */
export function upsertBudget(input: BudgetUpsertInput): Promise<Budget> {
  return simulateLatency(mockUpsertBudget(input), MOCK_LATENCY.write)
}

/** 删除预算 */
export function deleteBudget(id: number): Promise<void> {
  return simulateLatency(mockDeleteBudget(id), MOCK_LATENCY.write)
}
