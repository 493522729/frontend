import IconsResolver from 'unplugin-icons/resolver'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import Components from 'unplugin-vue-components/vite'

/**
 * 组件按需引入
 *
 * dirs 只放 components/base —— 无业务的通用组件自动导入；
 * components/business（带业务字段名）一律显式 import，避免"这个 TransactionTable 哪来的"。
 */
export function components() {
  return Components({
    dts: 'src/components.d.ts',
    dirs: ['src/components/base'],
    resolvers: [
      // Naive UI 按需引入；主题（晨雾蓝）通过 n-config-provider + themeOverrides 注入（见 src/theme/naive.ts）
      NaiveUiResolver(),
      // 图标：~icons/{collection}/{name}；custom 集合指向 src/assets/icons
      IconsResolver({
        customCollections: ['custom'],
        componentPrefix: 'i',
      }),
    ],
    // 第三方组件库的子目录也扫描（Naive UI 的 NButton 之类）
    deep: false,
  })
}
