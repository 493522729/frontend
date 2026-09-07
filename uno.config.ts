/**
 * UnoCSS 配置
 *
 * 分工（架构文档 ADR-6）：
 *   UnoCSS 原子类 → 布局 / 间距 / 字号
 *   scoped SCSS   → 复杂业务样式
 *   CSS 变量      → 主题 token（见 src/styles/tokens.css）
 *
 * 这里同时把设计系统的「间距 / 圆角 / 阴影 / 字号」注册进 theme，
 * 之后在模板里写 `p-md` `rounded-lg` `shadow-card` 就带上了设计系统的语义。
 */
import {
  defineConfig,
  presetIcons,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export default defineConfig({
  presets: [
    presetWind3(),
    presetIcons({
      scale: 1.2,
      warn: true,
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      },
    }),
  ],

  transformers: [
    // 支持在 <style> 里写 @apply / --uno: 等指令
    transformerDirectives(),
    // 支持 `hover:(bg-blue-500 text-white)` 这种分组写法
    transformerVariantGroup(),
  ],

  theme: {
    colors: {
      // 晨雾蓝主色阶（与 src/styles/tokens.css 一一对应，改这里必须同步改那边）
      'primary': {
        50: '#F2F7FC',
        100: '#E3EEF9',
        200: '#C3DDF3',
        300: '#94C4EA',
        400: '#5FA5DE',
        500: '#3B87CE',
        600: '#2A6BB4',
        700: '#205392',
        800: '#1B4376',
        900: '#183863',
      },
      // 语义色：文字/描边档（深色，保证白底对比度达标）
      'success': '#15803D',
      'danger': '#DC2626',
      'warning': '#B45309',
      'info': '#205392',
      // 语义色：填充档（浅色，做背景块）
      'success-bg': '#DCFCE7',
      'danger-bg': '#FEE2E2',
      'warning-bg': '#FEF3C7',
      'info-bg': '#E3EEF9',
      // 中性色
      'ink': {
        DEFAULT: '#1A2233',
        regular: '#3D4A5C',
        muted: '#64748B',
        disabled: '#A8B3C4',
      },
      'line': {
        DEFAULT: '#E2E8F0',
        light: '#EEF2F7',
      },
      'page': '#F5F7FA',
    },

    fontSize: {
      // 8px 基线；表格正文用 text-sm(13px)，比 Element Plus 默认 14px 更紧凑
      'xs': ['12px', '16px'],
      'sm': ['13px', '20px'],
      'base': ['14px', '22px'],
      'md': ['16px', '24px'],
      'lg': ['18px', '26px'],
      'xl': ['20px', '28px'],
      '2xl': ['24px', '32px'],
      '4xl': ['32px', '40px'],
      '5xl': ['48px', '56px'],
    },

    boxShadow: {
      sm: '0 1px 2px rgba(26,34,51,.04), 0 1px 3px rgba(26,34,51,.06)',
      md: '0 2px 4px rgba(26,34,51,.04), 0 4px 12px rgba(26,34,51,.08)',
      lg: '0 8px 24px rgba(26,34,51,.08), 0 2px 8px rgba(26,34,51,.04)',
    },
  },

  shortcuts: {
    // 卡片：整个后台里出现频率最高的容器
    'app-card': 'bg-white rounded-lg shadow-sm border border-line',
    // 金额/日期/编号：等宽数字，表格右对齐时不参差（财务表格专业感的关键）
    'num': 'tabular-nums',
    'num-right': 'tabular-nums text-right',
    // 图标按钮：统一尺寸与 hover 反馈
    'icon-btn': 'inline-flex items-center justify-center w-8 h-8 rounded-md text-ink-muted hover:text-primary-600 hover:bg-primary-50 transition-colors duration-200',
    // 焦点环：无障碍要求，禁止 outline: none（架构文档 4.6）
    'focus-ring': 'outline-none focus-visible:(ring-2 ring-primary-600 ring-offset-2)',
  },

  safelist: [
    // 金额正负色在运行时才知道，提前列出避免被摇掉
    'text-success',
    'text-danger',
    'bg-success-bg',
    'bg-danger-bg',
  ],
})
