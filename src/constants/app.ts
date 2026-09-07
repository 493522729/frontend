/**
 * 布局与全局常量 —— 尺寸值与架构文档 3.5 节一一对应
 * 改这里必须同步改 docs/frontend-architecture.md，单一真相源
 */

/** 应用标题（构建期由 .env 注入的 __APP_TITLE__ 兜底） */
export const APP_TITLE: string = typeof __APP_TITLE__ === 'string' ? __APP_TITLE__ : '老赵财务中台'

/** 侧边栏展开宽度（px） */
export const SIDEBAR_WIDTH = 240

/** 侧边栏折叠宽度（px），md 断点以下也用这个值 */
export const SIDEBAR_COLLAPSED_WIDTH = 64

/** 顶栏高度（px） */
export const HEADER_HEIGHT = 56

/** 内容区内边距（px），移动端减半 */
export const CONTENT_PADDING = 24

/** UnoCSS 断点（与 uno.config.ts 对齐，仅作 JS 侧参考用） */
export const BREAKPOINTS = {
  'md': 768,
  'lg': 992,
  'xl': 1200,
  '2xl': 1600,
} as const
