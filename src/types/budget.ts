/**
 * 预算模块类型契约（US-006 预算超支预警）
 * ====================================================================
 * 预算是「账本 × 月份 × 分类」三维的配额：某账本某月给某个分类设上限。
 * 月度周期是 v1 唯一支持的周期（PRD 8.5 的「发工资到发工资」留给 v2）。
 *
 * 两个建模决策：
 *   - 金额一律「分」整数（架构 ADR-7，与流水同规）
 *   - **总预算也是一条预算记录**，用 categoryId = 0 标记：
 *     它和分类预算一样可编辑、可删、有进度，只是花费口径是「当月全部支出」。
 *     单独造一个 totalBudget 字段反而要多维护一套 CRUD，不值得。
 *
 * 阈值口径（写死在这里避免页面各自理解）：
 *   - percent = spent / amount × 100，允许 > 100（超支多少就显示多少）
 *   - < 80 安全（绿）、80 ~ 100 接近超支（橙）、> 100 已超支（红）
 */

/** 一条预算（月度） */
export interface Budget {
  id: number
  /** 账本隔离（US-005）：预算跟着账本走 */
  bookId: number
  /** 会计期间 YYYY-MM */
  month: string
  /** 分类 ID；0 = 总预算（口径 = 当月全部支出） */
  categoryId: number
  /** 预算金额（分） */
  amount: number
}

/** 预算进度（预算 × 当月实际花费 的聚合视图，派生值不落库） */
export interface BudgetProgress {
  budget: Budget
  /** 分类名（聚合时已回填，页面/预警 toast 不必再查字典）；总预算为「总预算」 */
  categoryName: string
  /** 分类图标；总预算固定 📊 */
  categoryIcon: string
  /** 分类色（进度条底色与分类设置页保持一致） */
  categoryColor: string
  /** 当月实际花费（分）：分类预算 = 该分类支出合计；总预算 = 全部支出合计 */
  spent: number
  /** 剩余额度（分，可为负 = 超支额） */
  remaining: number
  /** 使用百分比，允许 > 100；amount 为 0 时返回 0（不除零） */
  percent: number
}

/** 预算页一次请求拿全的总览（总卡 + 分类卡共用一份数据） */
export interface BudgetOverview {
  /** 统计的会计期间 YYYY-MM */
  month: string
  /** 总预算进度（categoryId = 0 的那条；未设置时 totalBudget 为 0，进度按 0 算） */
  total: BudgetProgress
  /** 分类预算进度（按 percent 降序 —— 最危险排最前） */
  items: BudgetProgress[]
}

/** 阈值色档位：进度条和卡片的边框色都从这里取 */
export type BudgetTone = 'safe' | 'warning' | 'over'

/** 预警阈值：用量达到 80% 开始橙色提醒（PRD US-006） */
export const BUDGET_WARN_PERCENT = 80

/** 按使用百分比给色档位 —— 进度条、卡片边框、预警 toast 共用这一个口径 */
export function budgetTone(percent: number): BudgetTone {
  if (percent > 100)
    return 'over'
  if (percent >= BUDGET_WARN_PERCENT)
    return 'warning'
  return 'safe'
}

/** 新建 / 修改预算的入参（不带 id —— 按 bookId+month+categoryId 幂等 upsert） */
export interface BudgetUpsertInput {
  bookId: number
  month: string
  categoryId: number
  amount: number
}

/** 预算页查询参数 */
export interface BudgetQuery {
  bookId?: number
  /** 会计期间 YYYY-MM，默认当月 */
  month?: string
}
