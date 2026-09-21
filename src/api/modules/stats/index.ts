/**
 * 统计模块 API
 * ====================================================================
 * - listAccountBalances：真实后端（账户余额 = 期初 + 流水，服务端现算）。
 * - getTotalNetAssets：真实后端（跨全部账本汇总账户余额）。
 * - getDashboardOverview：真实后端 GET /api/stats/dashboard（服务端一次聚合）。
 * - getNetWorthTrend：真实后端 GET /api/stats/net-worth-trend（服务端逐月聚合）。
 */
import type { AccountBalance, DashboardOverview, DashboardQuery, NetWorthQuery, NetWorthTrend } from '@/types/stats'
import { http } from '@/api/request'
import { listBooks } from '../book'

/**
 * 仪表盘总览：一次请求拿全 4 数据卡 + 环图 + 折线需要的全部数据
 * —— 真实后端：GET /api/stats/dashboard?bookId=&month=
 */
export function getDashboardOverview(query: DashboardQuery = {}): Promise<DashboardOverview> {
  const params: Record<string, number | string> = {}
  if (query.bookId != null)
    params.bookId = query.bookId
  if (query.month)
    params.month = query.month
  return http.get<DashboardOverview>('/stats/dashboard', params)
}

/**
 * 账户余额表（账户管理页 / 记账弹层的余额提示共用一份口径）
 * —— 真实后端：GET /api/accounts/balances?bookId=，余额由服务端现算。
 */
export function listAccountBalances(bookId?: number): Promise<AccountBalance[]> {
  return http.get<AccountBalance[]>('/accounts/balances', bookId != null ? { bookId } : undefined)
}

/**
 * 全账本总资产净值（跨账本聚合，不随当前账本变化）
 * —— 真实后端：拉全部账本，逐本汇总账户余额（余额由服务端现算），相加即总净值。
 * 信用卡负余额天然按负债扣减，无需额外处理。
 */
export async function getTotalNetAssets(): Promise<number> {
  const books = await listBooks()
  const balancesList = await Promise.all(books.map(b => listAccountBalances(b.id)))
  /*
   * 只算**自己的**账户（mine !== false）：共享账本里成员的账户可见，
   * 但那是别人的钱，不该进「我的」总资产（转账给对方账户后尤其明显）。
   * ⚠️ 旧后端不返回 mine ⇒ 全部保留，行为与改动前一致。
   */
  return balancesList.flat()
    .filter(x => x.mine !== false)
    .reduce((sum, x) => sum + x.balance, 0)
}

/** 资产趋势（净值走势）—— 真实后端 GET /api/stats/net-worth-trend?bookId=&months= */
export function getNetWorthTrend(query: NetWorthQuery = {}): Promise<NetWorthTrend> {
  const params: Record<string, number | string> = {}
  if (query.bookId != null)
    params.bookId = query.bookId
  if (query.months != null)
    params.months = query.months
  return http.get<NetWorthTrend>('/stats/net-worth-trend', params)
}
