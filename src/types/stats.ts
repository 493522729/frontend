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

/** 环图 / 折线图都可能用到的类型守卫：判断某笔交易是否计入收支 */
export function isIncomeOrExpense(type: TransactionType): boolean {
  return type === 'income' || type === 'expense'
}
