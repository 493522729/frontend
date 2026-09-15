import type { Ref } from 'vue'
import { getCurrentInstance, onBeforeUnmount, ref } from 'vue'

/**
 * 媒体查询的响应式匹配结果 —— **首帧同步求值**
 * ====================================================================
 * 【为什么不用 @vueuse/core 的 useMediaQuery】
 * 它内部是 `if (!useSupported(...)) return`，而 useSupported = `useMounted() && ...`，
 * useMounted 在**挂载前恒为 false**。于是它的 watchEffect 首次直接 return，
 * 返回的 matches 停留在初始值 false —— 手机上首帧必然拿到 false，
 * 渲染成桌面版，挂载后才切回移动版，冷启动时肉眼可见地「闪一下」。
 *
 * 这里直接 `window.matchMedia(query).matches` 取初值，setup 阶段就是对的，
 * 后续靠 change 事件跟随系统缩放 / 跨屏拖窗口 / 手机横竖屏切换。
 *
 * query 支持逗号分隔的 media query list（等价于 or），matchMedia 原生支持。
 */
export function useMatchMedia(query: string): Ref<boolean> {
  const mql = window.matchMedia(query)
  const matches = ref(mql.matches)

  const onChange = (e: MediaQueryListEvent): void => {
    matches.value = e.matches
  }
  mql.addEventListener('change', onChange)

  // 只在组件上下文里注册清理，避免被当成普通函数调用时 Vue 告警
  if (getCurrentInstance())
    onBeforeUnmount(() => mql.removeEventListener('change', onChange))

  return matches
}
