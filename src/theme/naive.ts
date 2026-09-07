import type { GlobalThemeOverrides } from 'naive-ui'
import { darkTheme, lightTheme } from 'naive-ui'

/**
 * Naive UI 主题覆盖（晨雾蓝，与 src/styles/tokens.css 同源）
 *
 * 通过 <n-config-provider :theme :theme-overrides> 注入根组件（见 src/App.vue），
 * 不依赖任何全局 SCSS 覆盖——这是 Naive 主题系统优于 Element Plus 的核心：
 * 换肤只改 JS 对象，零样式层 hack。
 */

// ── 亮色档：主色用 primary-600（白底对比度 5.43:1，达到 AA 正文级）──
const lightOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#2a6bb4',
    primaryColorHover: '#205392',
    primaryColorPressed: '#1b4376',
    primaryColorSuppl: '#3b87ce',
    // 语义色与 tokens.css 对齐（收入绿 / 支出红 / 预算黄）
    successColor: '#15803d',
    errorColor: '#dc2626',
    warningColor: '#b45309',
    infoColor: '#205392',
    // 圆角：设计系统 6px（按钮 / 输入）；标签与药丸走组件自身 full
    borderRadius: '6px',
    // 字号：表格正文 13px（比 Naive 默认 14px 更紧凑，一屏多两行）
    fontSize: '14px',
    // 字体栈与 tokens.css 一致
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  },
}

// ── 暗色档：主色降一档用 primary-400（暗底上 primary-600 会发闷）；语义色降饱和一档防爆光 ──
const darkOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#5fa5de',
    primaryColorHover: '#94c4ea',
    primaryColorPressed: '#3b87ce',
    primaryColorSuppl: '#5fa5de',
    successColor: '#22c55e',
    errorColor: '#f87171',
    warningColor: '#fbbf24',
    infoColor: '#60a5fa',
  },
}

/** 按实际暗色开关返回 Naive 内置 light/dark 主题对象 */
export function resolveNaiveTheme(isDark: boolean) {
  return isDark ? darkTheme : lightTheme
}

/** 返回对应档位的晨雾蓝覆盖（主色 / 语义色 / 圆角 / 字号） */
export function resolveNaiveOverrides(isDark: boolean): GlobalThemeOverrides {
  return isDark ? darkOverrides : lightOverrides
}
