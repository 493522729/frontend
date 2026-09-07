/**
 * ECharts 按需注册器 + 主题 token 桥接
 * ====================================================================
 * 与 vxe-table 完全相同的局部加载策略（架构 1.3 节）：
 * echarts 全量 1MB+，仪表盘只用到环图和折线，就只 use 这两个 chart，
 * 绝不进 main.ts 全局注册 —— 主包体积不受图表库影响（预算 350KB gzip）。
 *
 * 主题桥接（这里是最容易踩的坑）：
 *   图表画在 canvas 里，不是 DOM，**读不到 CSS 变量**。如果 option 里
 *   hardcode 色值，暗色模式下图表就是一块白底黑字，跟页面割裂。
 *   所以渲染前用 getComputedStyle 把 tokens.css 的当前值读出来喂给 option：
 *   - 色值仍然只有 tokens.css 一个真相源（不复制第二份色板）
 *   - 暗色切换后重新读一次即可跟随
 */

import { LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { LabelLayout } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'

let installed = false

/** 幂等注册：只注册仪表盘用到的模块 */
export function ensureECharts(): void {
  if (installed)
    return
  use([
    PieChart,
    LineChart,
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
  /** 收入 */
  income: string
  /** 支出 */
  expense: string
  /** 品牌主色 */
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
