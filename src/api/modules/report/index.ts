/**
 * 报表模块 API（US-007）
 * ====================================================================
 * 已切换真实后端：聚合走 http，与后端 ReportController 对齐。
 * 下钻明细复用交易列表接口（listTransactions），这里只透传 bucketRange ——
 * 桶 key → 时间范围的换算必须和后端聚合是同一套口径（后端现算逻辑与之互逆）。
 */
import type { ReportQuery, ReportResult } from '@/types/report'
import { http } from '@/api/request'
import { bucketRange } from './mock'

export { bucketRange }

/**
 * 报表聚合：时间桶（柱/折线）+ 分类构成（饼）+ 汇总
 *
 * 数组参数（categoryIds / accountIds）以逗号分隔字符串传给后端，
 * 避免 axios 默认的 `ids[]=1&ids[]=2` 形式导致 Spring 收不到集合。
 */
export function getReport(query: ReportQuery): Promise<ReportResult> {
  const params: Record<string, unknown> = {
    bookId: query.bookId,
    start: query.start,
    end: query.end,
    granularity: query.granularity,
  }
  if (query.categoryIds && query.categoryIds.length)
    params.categoryIds = query.categoryIds.join(',')
  if (query.accountIds && query.accountIds.length)
    params.accountIds = query.accountIds.join(',')
  return http.get<ReportResult>('/reports/aggregate', params)
}
