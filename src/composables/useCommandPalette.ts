import { ref } from 'vue'

/**
 * 命令面板开关（US-011）
 *
 * 用**模块级 ref 做单例**，而不是 pinia store：
 * 面板只有一个实例、状态只有一个布尔值，且不需要持久化 / 时间旅行调试，
 * 开个 store 反而是仪式性开销。跨组件共享靠模块单例即可（与 useBelowLg 同款思路）。
 */
const visible = ref(false)

export function useCommandPalette() {
  return {
    visible,

    open() {
      visible.value = true
    },

    close() {
      visible.value = false
    },

    toggle() {
      visible.value = !visible.value
    },
  }
}
