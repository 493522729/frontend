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
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
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

export function readPalette(): ChartPalette {
  return {
    income: readToken('--lz-success', '#15803d'),
    expense: readToken('--lz-danger', '#dc2626'),
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
 */
export function tooltipStyle(p: ChartPalette) {
  return {
    backgroundColor: p.card,
    borderColor: p.border,
    borderWidth: 1,
    textStyle: { color: p.text, fontSize: 12 },
    axisPointer: { type: 'line', lineStyle: { color: p.border } },
  } as const
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
