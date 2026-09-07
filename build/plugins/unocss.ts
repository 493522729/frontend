import UnoCSS from 'unocss/vite'

/**
 * UnoCSS：负责布局 / 间距 / 字号这类原子样式
 * 复杂业务样式仍写在组件的 scoped SCSS 里（见架构文档 ADR-6 三轨并行）
 */
export function unocss() {
  return UnoCSS()
}
