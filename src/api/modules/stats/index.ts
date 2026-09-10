/**
 * 统计模块 API
 * ====================================================================
 * 当前走本地 mock（src/api/modules/stats/mock.ts）。
 * 后端 Spring Boot 就绪后，把 getDashboardOverview 换成 http.get('/stats/overview', { params })，
 * 业务代码（views/dashboard/*）一行不用动 —— 这也是把聚合放在服务端的原因。
 */
import type { AccountBalance, DashboardOverview, DashboardQuery, NetWorthQuery, NetWorthTrend } from '@/types/stats'
import { MOCK_LATENCY, simulateLatency } from '@/api/mock-latency'
import {
  mockGetAccountBalances,
  mockGetDashboardOverview,
  mockGetNetWorthTrend,
  mockGetTotalNetAssets,
} from './mock'

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
 * 账户余额表（账户管理页 / 记账弹层的余额提示共用一份口径）
 *
 * 与 getDashboardOverview 分开请求：仪表盘首屏不需要账户维度，
 * 硬塞进同一次聚合会让「看一眼收支」的请求变重。
 */
export function listAccountBalances(bookId?: number): Promise<AccountBalance[]> {
  return simulateLatency(mockGetAccountBalances(bookId), MOCK_LATENCY.aggregate)
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

/**
 * 资产趋势（净值走势）
 *
 * 同样是一次请求拿全：曲线、指标卡、柱状图用的是同一份按月聚合结果，
 * 拆成「曲线一个请求、柱子一个请求」只会让页面出现两次 loading。
 */
export function getNetWorthTrend(query: NetWorthQuery = {}): Promise<NetWorthTrend> {
  return simulateLatency(mockGetNetWorthTrend(query), MOCK_LATENCY.aggregate)
}
