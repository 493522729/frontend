import type { Ref } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { BREAKPOINTS } from '@/constants/app'

/**
 * 是否处于 lg 断点以下（< 992px）
 *
 * 架构 §3.5：md（768–991）侧边栏折叠为图标条（64px）。
 * 用媒体查询而不是 resize 监听 —— 跟随系统缩放、跨屏拖窗口都自动正确，
 * 且 SSR / 首帧不会闪一下全宽侧边栏再收起。
 */
export function useBelowLg(): Ref<boolean> {
  return useMediaQuery(`(max-width: ${BREAKPOINTS.lg - 0.02}px)`)
}
