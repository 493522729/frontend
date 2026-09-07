/**
 * 日期工具层 —— 基于 Temporal（ES2026 Stage 3 提案，财务系统的正确选择）
 *
 * 为什么用 Temporal 而不是 Date：
 * 1. Date 的月份从 0 开始、时区处理靠猜，金融场景（会计期间、跨月统计）用它就是埋雷；
 * 2. PlainDate / PlainYearMonth 是「无时区」类型，天然对应「2026-09 这个月」这种业务概念；
 * 3. temporal-polyfill 提供纯命名导入，不污染 globalThis，将来浏览器原生支持后
 *    只需把 `import { Temporal } from 'temporal-polyfill'` 换成原生全局即可（见文末 TODO）。
 *
 * 注意：类型来自 temporal-spec（temporal-polyfill 的传递依赖，直接可用）。
 */
import { Temporal } from 'temporal-polyfill'

export type PlainDate = Temporal.PlainDate
export type PlainYearMonth = Temporal.PlainYearMonth

/** 今天（本地日历日，无时分秒、无时区烦恼） */
export function today(): PlainDate {
  return Temporal.Now.plainDateISO()
}

/**
 * 把 'YYYY-MM-DD' 解析为 PlainDate，非法输入抛错（由调用方决定兜底策略）
 */
export function parseDate(s: string): PlainDate {
  return Temporal.PlainDate.from(s)
}

/**
 * 把 'YYYY-MM' 解析为会计期间
 */
export function parseMonth(s: string): PlainYearMonth {
  return Temporal.PlainYearMonth.from(s)
}

/** '2026-09' */
export function formatMonth(m: PlainYearMonth): string {
  return m.toString({ calendarName: 'never' })
}

/** '2026-09-06' */
export function formatDate(d: PlainDate): string {
  return d.toString({ calendarName: 'never' })
}

/**
 * 某会计期间的首尾日期（做区间查询用：>= start 且 <= end）
 */
export function monthRange(m: PlainYearMonth): { start: PlainDate, end: PlainDate } {
  return {
    start: m.toPlainDate({ day: 1 }),
    end: m.toPlainDate({ day: m.daysInMonth }),
  }
}

/**
 * 近 n 个月（含当月）的 PlainYearMonth 数组，按时间正序。
 *
 * [ES2025 Iterator Helpers] 这里刻意用了生成器 + `.take()` 组合：
 * - `yield*` 产出无限月份序列（从当月起不断 subtract 一个月）
 * - `.take(n)` 截取前 n 个 —— 以前这种「无限流 + 截断」要手写计数器
 *
 * 图表「近 6 月收支趋势」的 x 轴数据就靠它。
 */
export function lastNMonths(n: number, anchor: PlainYearMonth = today().toPlainYearMonth()): PlainYearMonth[] {
  if (!Number.isInteger(n) || n <= 0)
    throw new RangeError(`n 必须为正整数，收到 ${n}`)

  function* pastMonths(): Generator<PlainYearMonth> {
    let cur = anchor
    while (true) {
      yield cur
      cur = cur.subtract({ months: 1 })
    }
  }

  // Iterator.prototype.take —— ES2025 正式特性，Node 22+ / 现代浏览器均已支持
  return pastMonths().take(n).toArray().reverse()
}

/**
 * 月份的中文标签（图表 tooltip / 筛选器下拉用）
 */
export function monthLabel(m: PlainYearMonth): string {
  return `${m.year}年${m.month}月`
}

/**
 * 两个会计期间之间隔了几个月（含端点）。
 * 例：between('2026-01', '2026-03') === 3 —— Q1 有三个月。
 */
export function monthsBetween(from: PlainYearMonth, to: PlainYearMonth): number {
  // 不用 until().total()：月份天数不定，Duration 换算成月需要 relativeTo。
  // 「年*12+月」的整数序号才是会计期间的唯一正确度量，精确且无歧义。
  const fromIndex = from.year * 12 + (from.month - 1)
  const toIndex = to.year * 12 + (to.month - 1)
  return Math.abs(toIndex - fromIndex) + 1
}

/**
 * 周起点（周一）。
 * 图表做「本周消费」统计时需要先把日期对齐到周一。
 */
export function startOfWeek(d: PlainDate): PlainDate {
  // dayOfWeek: 1=周一 ... 7=周日（ISO 8601，比 Date.getDay() 的 0=周日 直观得多）
  return d.subtract({ days: d.dayOfWeek - 1 })
}

/**
 * 年度累计区间的起止。
 */
export function yearRange(d: PlainDate): { start: PlainDate, end: PlainDate } {
  const y = d.toPlainYearMonth().toPlainDate({ day: 1 })
  const start = y.with({ month: 1 })
  const end = start.with({ month: 12, day: start.with({ month: 12 }).daysInMonth })
  return { start, end }
}

/**
 * [ES2025 Promise.withResolvers] 虽然跟日期无关，但说明一点工具层约定：
 * 项目里凡是「异步初始化 + 外部 resolve」的场景（如主题加载完再渲染图表），
 * 优先用 Promise.withResolvers() 替代 new Promise(resolve => {...}) 反模式。
 * 该特性 Node 22+ 原生支持（见 utils/feature-detect 不再需要探测）。
 */
export { Temporal }

/**
 * TODO（浏览器 Temporal 原生支持后）：Chrome 139+ / Safari 26+ 已陆续原生支持。
 * 届时 main.ts 里加一行 `import 'temporal-polyfill/global'` 的探测逻辑换成
 * 原生 globalThis.Temporal，本文件的导入语句同步删除即可，调用方零改动。
 */
