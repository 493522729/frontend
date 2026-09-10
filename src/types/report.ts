/**
 * 报表中心类型契约（US-007 多维交叉）
 * ====================================================================
 * 「按时间 × 分类 × 账户交叉看支出分布」—— 聚合结果两种形状：
 *   - buckets：时间桶序列（柱状 / 折线图用）
 *   - categories：分类构成（饼图用）
 * 下钻明细**不在聚合里**：点某个桶/扇区后用 listTransactions 按同样的
 * 筛选条件 + 该桶的时间范围查询，一条接口两处用。
 *
 * 口径（与仪表盘一致）：收入 = income 求和、支出 = expense 求和、
 * 转账不进任何统计（它不是赚也不是花）。
 */

/** 时间粒度（US-007 验收：日 / 周 / 月 / 季 / 年） */
export type ReportGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year'

/** 报表查询参数（三维交叉：时间范围 × 分类 × 账户） */
export interface ReportQuery {
  bookId?: number
  /** 起止日期 YYYY-MM-DD（含端点） */
  start: string
  end: string
  granularity: ReportGranularity
  /** 限定分类；不传 / 空数组 = 全部分类 */
  categoryIds?: number[]
  /** 限定账户；不传 / 空数组 = 全部账户 */
  accountIds?: number[]
}

/** 一个时间桶的收支（柱状 / 折线图的一根柱子 / 一个点） */
export interface ReportBucket {
  /**
   * 桶标识，同时是下钻的范围锚点：
   *   day → 'YYYY-MM-DD'；week → 周一的 'YYYY-MM-DD'；
   *   month → 'YYYY-MM'；quarter → 'YYYY-Qn'；year → 'YYYY'
   */
  key: string
  /** 图表 x 轴短标签（如 '8月' / 'Q3' / '2026' / '09/01'） */
  label: string
  income: number
  expense: number
}

/** 分类构成切片（与仪表盘环图同一形状，颜色/图标来自分类字典） */
export interface CategorySlice {
  categoryId: number
  name: string
  icon: string
  color: string
  /** 金额（分） */
  amount: number
  /** 占同类总额百分比 0~100，2 位小数 */
  percent: number
}

/** 报表聚合结果（一次请求拿全：柱/折线 + 饼 + 汇总） */
export interface ReportResult {
  /** 时间桶序列（时间正序，覆盖 [start, end] 内所有非空桶） */
  buckets: ReportBucket[]
  /** 支出分类构成（降序；饼图默认数据源） */
  expenseCategories: CategorySlice[]
  /** 收入分类构成（降序；切到「收入」饼图时用） */
  incomeCategories: CategorySlice[]
  /** 区间收入合计（分） */
  income: number
  /** 区间支出合计（分） */
  expense: number
  /** 区间交易笔数（不含转账 —— 转账不进报表） */
  count: number
}
