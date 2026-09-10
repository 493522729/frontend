/**
 * 报表模块 API（US-007）
 * ====================================================================
 * 聚合一次拿全（ADR-14）；下钻明细复用交易列表接口（listTransactions），
 * 这里只透传 bucketRange —— 桶 key → 时间范围的换算必须和聚合是同一份代码。
 */
import type { ReportQuery, ReportResult } from '@/types/report'
import { MOCK_LATENCY, simulateLatency } from '@/api/mock-latency'
import { bucketRange, mockGetReport } from './mock'

export { bucketRange }

/**
 * 报表聚合：时间桶（柱/折线）+ 分类构成（饼）+ 汇总
 *
 * 筛选条件变化 → 页面 200ms 防抖后重新请求（PRD 9.1 报表筛选规格）。
 */
export function getReport(query: ReportQuery): Promise<ReportResult> {
  return simulateLatency(mockGetReport(query), MOCK_LATENCY.aggregate)
}
