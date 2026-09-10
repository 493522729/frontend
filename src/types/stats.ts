/**
 * 仪表盘聚合数据类型契约（前端单点真相）
 * ====================================================================
 * 这里是「聚合结果」的形状，不是交易明细 —— 明细看 types/transaction.ts。
 * 后端联调时若聚合口径调整（比如结余要不要含转账），只动这里 + stats/mock.ts。
 *
 * 铁律（架构 ADR-7）：所有金额字段一律「分」整数，禁止出现 元 的小数。
 *
 * 统计口径（P0 约定，写死在这里避免各页面理解不一）：
 *   - 收入 = type==='income' 求和
 *   - 支出 = type==='expense' 求和
 *   - 转账【不】计入收支：它只是资金在自己账户间搬运，不是赚了也不是花了
 *   - 结余 = 收入 - 支出
 *   - 资产净值 = Σ账户期初 + Σ收入 - Σ支出（转账在各账户间一进一出，净值不变）
 */
import type { TransactionType } from '@/enums/transaction'

/** 单月收支汇总 */
export interface MonthlySummary {
  /** 会计期间 YYYY-MM */
  month: string
  /** 收入合计（分） */
  income: number
  /** 支出合计（分） */
  expense: number
  /** 结余 = 收入 - 支出（分，可为负） */
  balance: number
}

/** 分类占比切片（环图单项） */
export interface CategorySlice {
  categoryId: number
  /** 分类名（聚合时已回填，前端不必再查字典） */
  name: string
  icon: string
  /** 分类色（来自字典，环图直接用，保证与分类设置一致） */
  color: string
  /** 金额（分） */
  amount: number
  /** 占本月支出总额百分比 0~100，保留 2 位 */
  percent: number
}

/** 趋势点（折线图 x 轴一月） */
export interface TrendPoint {
  /** YYYY-MM */
  month: string
  income: number
  expense: number
}

/** 仪表盘总览（一次请求拿全，避免页面发 4 个请求） */
export interface DashboardOverview {
  /** 当前统计的会计期间 YYYY-MM */
  month: string

  /** 本月收入（分） */
  income: number
  /** 本月支出（分） */
  expense: number
  /** 本月结余 = 收入 - 支出（分） */
  balance: number

  /** 上月支出（分），环比的分母 */
  lastMonthExpense: number
  /** 上月收入（分） */
  lastMonthIncome: number
  /** 支出环比 %：正数=比上月多花，负数=少花。上月为 0 时返回 0（不做除零） */
  expenseMoM: number
  /** 收入环比 % */
  incomeMoM: number

  /** 本月支出分类占比（Top6 + 其他，已按金额降序） */
  categories: CategorySlice[]

  /** 近 6 月收支趋势（含当月，时间正序） */
  trend: TrendPoint[]

  /** 资产净值：所有账户余额合计（分） */
  netAssets: number

  /** 本月交易笔数（空状态判断用：0 笔 → 引导记第一笔） */
  transactionCount: number
}

/** 仪表盘查询参数 */
export interface DashboardQuery {
  bookId?: number
  /** 统计的会计期间 YYYY-MM，默认当月 */
  month?: string
}

/**
 * 单个账户的余额与构成（派生值，不是存储字段）
 * ====================================================================
 * 余额口径（与 DashboardOverview.netAssets 完全自洽，两者必须能对上账）：
 *   余额 = 期初 + 收入 - 支出 - 转出 + 转入
 * 转账在这里**要算**：站在单个账户的视角，钱确实流出/流进了这个账户，
 * 只是站在「我全部家底」的视角它一进一出抵消，所以不影响净值。
 */
export interface AccountBalance {
  accountId: number
  /** 当前余额（分，信用卡为负 = 欠款） */
  balance: number
  /** 累计收入（分） */
  income: number
  /** 累计支出（分） */
  expense: number
  /** 累计转入（分） */
  transferIn: number
  /** 累计转出（分） */
  transferOut: number
  /** 参与的流水笔数（转账在两端各计一次 —— 两个账户都"参与"了这笔） */
  txnCount: number
}

/**
 * 资产趋势（净值走势）数据契约
 * ====================================================================
 * 仪表盘只有「当前净值」一个数字，用户看不到"钱在变多还是变少"。
 * 这里按月给出**月末时点快照**，把净值变成一条曲线。
 *
 * 口径（必须与 DashboardOverview.netAssets 对得上账，否则页面间数字打架）：
 *   - 净资产 = 总资产 - 负债 = Σ账户余额（转账一进一出抵消，不影响净值）
 *   - 总资产 = Σ正余额账户；负债 = Σ负余额账户取正（信用卡欠款）
 *   - 月度净增 = 当月收入 - 当月支出（收入让净值涨、支出让净值跌）
 *   - 趋势最后一个点 = 当前净资产（与仪表盘净值卡同一个值）
 */

/** 资产趋势查询参数 */
export interface NetWorthQuery {
  bookId?: number
  /** 回看月数（6 / 12 / 24），默认 12 */
  months?: number
}

/** 单月资产快照（月末时点值，不是当月发生额） */
export interface NetWorthPoint {
  /** YYYY-MM */
  month: string
  /** 净资产 = 总资产 - 负债（分，可为负 = 资不抵债） */
  netAssets: number
  /** 总资产 = Σ正余额账户（分） */
  assets: number
  /** 负债 = Σ负余额账户取正（信用卡欠款，分） */
  debt: number
  /** 当月净增 = 当月收入 - 当月支出（分，可为负） */
  netChange: number
  /** 当月收入（分） */
  income: number
  /** 当月支出（分） */
  expense: number
}

/** 资产趋势聚合结果（一次请求拿全，页面不再自己做算术） */
export interface NetWorthTrend {
  /** 时间正序的月末快照 */
  points: NetWorthPoint[]
  /** 区间起点净资产 = 第一个月的**上月月末**值，算区间涨跌的分母 */
  startNetAssets: number
  /** 区间终点净资产 = 最后一个点 = 当前净资产 */
  endNetAssets: number
  /** 区间净增 = 终点 - 起点（分） */
  change: number
  /** 区间涨幅 %（起点为 0 时返回 0，不除零） */
  changePercent: number
  /** 区间内净资产最高的月份 */
  peak: NetWorthPoint | null
  /** 区间内净资产最低的月份 */
  trough: NetWorthPoint | null
  /** 最大回撤：峰值之后最深的一次跌幅（分，正数；全程上涨则为 0） */
  maxDrawdown: number
}

/** 环图 / 折线图都可能用到的类型守卫：判断某笔交易是否计入收支 */
export function isIncomeOrExpense(type: TransactionType): boolean {
  return type === 'income' || type === 'expense'
}
