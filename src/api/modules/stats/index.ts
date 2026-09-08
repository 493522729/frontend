/**
 * 统计模块 API
 * ====================================================================
 * 当前走本地 mock（src/api/modules/stats/mock.ts）。
 * 后端 Spring Boot 就绪后，把 getDashboardOverview 换成 http.get('/stats/overview', { params })，
 * 业务代码（views/dashboard/*）一行不用动 —— 这也是把聚合放在服务端的原因。
 */
import type { DashboardOverview, DashboardQuery } from '@/types/stats'
import { MOCK_LATENCY, simulateLatency } from '@/api/mock-latency'
import { mockGetDashboardOverview, mockGetTotalNetAssets } from './mock'

/**
 * 仪表盘总览：一次请求拿全 4 数据卡 + 环图 + 折线需要的全部数据
 *
 * 刻意不做成「4 卡一个请求、环图一个、折线一个」：仪表盘首屏三个区域
 * 数据是同一份聚合的不同切面，拆开请求只会让首屏多两次 RTT 且出现
 * 「卡片先出来、图表后出来」的割裂感。
 */
export function getDashboardOverview(query: DashboardQuery = {}): Promise<DashboardOverview> {
  return simulateLatency(mockGetDashboardOverview(query), MOCK_LATENCY.aggregate)
}

/**
 * 全账本总资产净值（跨账本聚合，不随当前账本变化）
 *
 * 与 getDashboardOverview().netAssets 是不同视角：
 *   - 那个是「我正在看的那一本」，切账本它就变
 *   - 这个是「我全部的家底」，切账本它不动
 *
 * 切账本时不重新拉这份数据更省，但在仪表盘场景下调用方一致 load 就行，
 * 后续真后端如果是独立接口再单独优化。
 */
export function getTotalNetAssets(): Promise<number> {
  return simulateLatency(mockGetTotalNetAssets(), MOCK_LATENCY.aggregate)
}
