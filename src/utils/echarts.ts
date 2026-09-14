/**
 * ECharts 按需注册器 + 主题 token 桥接（ADR-13）
 * ====================================================================
 * 与 vxe-table 完全相同的局部加载策略（架构 1.3 节）：
 * echarts 全量 1MB+，仪表盘 / 资产趋势只用到环图、折线、柱状，
 * 就只 use 这三类 chart，绝不进 main.ts 全局注册 —— 主包体积不受图表库影响
 * （预算 350KB gzip）。
 *
 * 放在 utils 而不是某个 views 下：资产趋势页和仪表盘页都要画图，
 * 各放一份就会出现两套注册逻辑、两套色板读取，暗色跟随的行为迟早分叉。
 *
 * 主题桥接（这里是最容易踩的坑）：
 *   图表画在 canvas 里，不是 DOM，**读不到 CSS 变量**。如果 option 里
 *   hardcode 色值，暗色模式下图表就是一块白底黑字，跟页面割裂。
 *   所以渲染前用 getComputedStyle 把 tokens.css 的当前值读出来喂给 option：
 *   - 色值仍然只有 tokens.css 一个真相源（不复制第二份色板）
 *   - 暗色切换后重新读一次即可跟随（见 composables/useChartPalette.ts）
 */

import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { LabelLayout } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'

let installed = false

/** 幂等注册：只注册业务真正用到的模块 */
export function ensureECharts(): void {
  if (installed)
    return
  use([
    PieChart,
    LineChart,
    // 柱状：资产趋势的「月度净增」用正负异色柱表现涨跌，比折线更直观
    BarChart,
    TooltipComponent,
    LegendComponent,
    GridComponent,
    // 月均参考线：趋势图上一条虚线就能回答「这个月是不是花超了」，
    // 比让用户自己心算 6 个月的平均值有用得多（体积 ~2KB gzip，可接受）
    MarkLineComponent,
    // 饼图标签防重叠（分类多时不会叠成一坨）
    LabelLayout,
    CanvasRenderer,
  ])
  installed = true
}

/**
 * 读 tokens.css 变量的当前值
 *
 * 暗色模式下 documentElement 会被加上 dark 类名/属性，同名变量取到的是
 * dark 那份色值 —— 所以这里不需要分支判断，读就对了。
 *
 * @param name CSS 变量名（如 `--lz-primary-600`）
 * @param fallback SSR / 变量缺失时的兜底，保证图表不会渲染成透明
 */
export function readToken(name: string, fallback: string): string {
  if (typeof window === 'undefined')
    return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/** 图表色板：从 tokens.css 实时读取，语义与业务一致（收入绿 / 支出红） */
export interface ChartPalette {
  /** 收入 / 正向（资产） */
  income: string
  /** 支出 / 负向（负债） */
  expense: string
  /** 品牌主色（净资产主序列） */
  primary: string
  /** 主文本 */
  text: string
  /** 次要文本（轴标签、图例） */
  textSecondary: string
  /** 分割线 */
  border: string
  /** 卡片背景（tooltip 底色） */
  card: string
}

/**
 * 把 `var(--lz-x)` 解析成当前主题下的真实色值
 *
 * canvas 读不到 CSS 变量，图表拿到必须是具体色值；而调用方（store）给的是
 * token 变量名 —— 在这里做一次解析，色值真相源仍然只有 tokens.css 一份。
 */
function resolveVar(value: string | undefined, fallback: string): string {
  if (!value)
    return fallback
  const name = /^var\((--[\w-]+)\)$/.exec(value.trim())?.[1]
  return name ? readToken(name, fallback) : value
}

/**
 * @param tone 收入 / 支出的语义色（可选）。
 *   不传 = 默认「收入绿 · 支出红」；
 *   传 `settings.typeColor('income')` / `typeColor('expense')` 就能让图表跟随
 *   「系统设置 → 金额配色偏好」（A 股习惯时收入红、支出绿），
 *   和页面上金额、类型标签用同一套语义 —— 偏好判定逻辑只在 store 里写一次。
 * @param tone.income 收入色：`var(--lz-*)` 或直接给具体色值
 * @param tone.expense 支出色：同上
 */
export function readPalette(tone: { income?: string, expense?: string } = {}): ChartPalette {
  return {
    income: resolveVar(tone.income, readToken('--lz-success', '#15803d')),
    expense: resolveVar(tone.expense, readToken('--lz-danger', '#dc2626')),
    primary: readToken('--lz-primary-600', '#2a6bb4'),
    text: readToken('--lz-text-primary', '#1a2233'),
    textSecondary: readToken('--lz-text-secondary', '#64748b'),
    border: readToken('--lz-border', '#e2e8f0'),
    card: readToken('--lz-bg-card', '#ffffff'),
  }
}

/**
 * 通用 tooltip 外壳：所有图表共用同一套卡片样式
 *
 * 每个图表各写一遍 backgroundColor / borderColor / textStyle 的结果是
 * 「某个图忘了跟暗色」，所以收口成一个工厂函数。
 *
 * extraCssText 那个空子是这里唯一能用 CSS 变量的地方：ECharts 把它
 * 拼进 tooltip 容器的 inline style，而 inline style 里的 var() 会
 * 沿 DOM 继承链解析 —— 于是阴影仍然只有 tokens.css 一个真相源，
 * 暗色档自动跟着换。canvas 里就没有这个便利，只能靠 readToken。
 */
export function tooltipStyle(p: ChartPalette) {
  return {
    backgroundColor: p.card,
    borderColor: p.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    extraCssText: 'box-shadow: var(--lz-shadow-md);',
    textStyle: { color: p.text, fontSize: 12, lineHeight: 18 },
    axisPointer: { type: 'line', lineStyle: { color: p.border } },
  } as const
}

/**
 * hex → rgba(…, alpha)
 *
 * 图表的面积渐变 / 参考线都需要「同色不同透明度」，而 canvas 里既不能用
 * `color-mix()` 也不能用 CSS 变量，只能拿到具体色值再手工拼 alpha。
 * 认不出来（rgb()/hsl()/令牌兜底值）时原样返回：宁可少一层渐变，
 * 也不要因为解析失败把图表画成透明。
 *
 * @param color `#rgb` / `#rrggbb`，或任意无法解析的颜色字符串
 * @param alpha 0~1
 */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim()
  const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(hex)
  const long = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)
  const parts = long
    ? [long[1], long[2], long[3]]
    : short
      ? [short[1]!.repeat(2), short[2]!.repeat(2), short[3]!.repeat(2)]
      : null
  if (!parts)
    return color
  const [r, g, b] = parts.map(v => Number.parseInt(v!, 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * 面积渐变的配置对象（上浓下透）
 *
 * 折线的 areaStyle 如果只给一个纯色 + opacity，视觉上就是一块平板；
 * 改成垂直渐变后线条与面积之间才有「从线往下雾化」的层次，
 * 这是折线图看起来「贵」和「便宜」的分水岭。
 *
 * @param color 线的颜色（hex）
 * @param top 顶部不透明度（线的位置），默认 0.22
 */
export function areaFade(color: string, top = 0.22) {
  return {
    type: 'linear' as const,
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: withAlpha(color, top) },
      { offset: 1, color: withAlpha(color, 0) },
    ],
  }
}

/**
 * 柱状渐变的配置对象（上浓下淡）
 *
 * 纯色柱体在密集的柱状图里容易连成一整块色带；纵向渐变给每根柱子一点
 * 层次，也让「柱子从基线长出来」这件事更清楚。渐变的坐标系绑的是**每根柱子
 * 自己的 bbox**，所以 offset 0 = 柱子顶端、offset 1 = 柱子底部。
 *
 * @param color 柱色（hex）
 * @param bottom 底端不透明度，默认 0.68
 */
export function barFade(color: string, bottom = 0.68) {
  return {
    type: 'linear' as const,
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: withAlpha(color, 1) },
      { offset: 1, color: withAlpha(color, bottom) },
    ],
  }
}

/**
 * 一组数值的平均值，用作趋势图的月均参考线
 *
 * 空数组返回 null（不给参考线），避免 0 被当成一条贴着 x 轴的假线画出来。
 *
 * @param values 原始数值序列（分）
 */
export function averageOrNull(values: number[]): number | null {
  if (!values.length)
    return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * y 轴金额标签：分 → 元，过万收口成「x.x万」
 *
 * 6 位数字会把绘图区挤掉一半宽度，图表不是为了精确读数（精确值在 tooltip 里），
 * 轴标签只要能比较量级就够。
 */
export function axisMoneyLabel(cents: number): string {
  const yuan = Math.round(cents / 100)
  if (Math.abs(yuan) >= 10_000)
    return `${(yuan / 10_000).toFixed(1)}万`
  return String(yuan)
}
