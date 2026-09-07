import antfu from '@antfu/eslint-config'

/**
 * ESLint flat config（架构文档 ADR-10）
 *
 * 零心智：Vue / TS / UnoCSS / JSONC / YAML / Markdown 的规则全交给 @antfu/eslint-config。
 * 这里只补「项目特有」的几条，别把别人的偏好重复写一遍。
 */
export default antfu(
  {
    // 'app' 会开启更严格的应用级规则（相对 'lib'）
    type: 'app',
    vue: true,
    typescript: true,
    unocss: true,
    jsonc: true,
    yaml: true,
    markdown: true,

    stylistic: {
      // 单引号、无分号、2 空格缩进 —— 与 .editorconfig 保持一致
      quotes: 'single',
      semi: false,
      indent: 2,
      // JSX 我们不用，省一条规则
      jsx: false,
    },

    ignores: [
      'dist',
      'node_modules',
      'public',
      // 自动生成的类型声明，别 lint
      'src/auto-imports.d.ts',
      'src/components.d.ts',
      '**/*.min.*',
    ],
  },

  // 第二组：项目级自定义规则
  {
    rules: {
      // 财务系统里 console 一律走统一的 logger，别裸写
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // 金额的浮点坑太致命，见到裸 toFixed 就报警（金额必须走 utils/money.ts）
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression > MemberExpression[property.name="toFixed"] > CallExpression',
          message:
            '金额格式化请统一用 utils/money.ts 的 formatCents()，别裸写 toFixed —— 见架构文档 ADR-7',
        },
      ],

      // Vue：组件名多单词，避免与原生元素冲突
      'vue/multi-word-component-names': 'off',
      // 单文件组件里标签顺序稳定，diff 更干净
      'vue/block-order': ['error', {
        order: ['script', 'template', 'style'],
      }],
    },
  },

  // 第三组：测试文件放宽限制
  {
    files: ['**/*.{test,spec}.ts'],
    rules: {
      'no-console': 'off',
      'test/no-only-tests': 'error',
    },
  },
)
