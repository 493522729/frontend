import { FileSystemIconLoader } from 'unplugin-icons/loaders'
import Icons from 'unplugin-icons/vite'

/**
 * 图标按需编译：用到的图标才打进包里，零运行时开销
 *
 * - ~icons/{collection}/{icon} 走 Iconify 在线集合（构建时下载一次，之后缓存）
 * - ~icons/custom/{icon} 走本地 src/assets/icons，放 Logo、业务专属图标
 */
export function icons() {
  return Icons({
    autoInstall: true,
    compiler: 'vue3',
    scale: 1,
    defaultClass: 'app-icon',
    customCollections: {
      custom: FileSystemIconLoader('src/assets/icons'),
    },
  })
}
