import type { Ref } from 'vue'
import { useMediaQuery } from '@vueuse/core'

/**
 * 是否处于「移动端布局」
 * ====================================================================
 * 与 useBelowLg 同一模式：媒体查询驱动，跟随系统缩放 / 跨屏拖窗口自动正确，
 * 首帧同步求值，不会闪一下 PC 版再切走。
 *
 * 两条命中任一即视为移动端：
 *   1. max-width: 768px —— 窄窗口（架构 §3.5 的 md 断点）
 *   2. pointer: coarse 且 ≤1024px —— 触屏为主的中窄设备（手机横屏 844/926、iPad 竖屏 810）。
 *      手机横屏宽度超过 768，但触屏上 vxe 大表的双击编辑 / 拖宽列依然不可用，
 *      所以触屏设备放宽到平板档，统一走移动布局。
 * 大屏触屏一体机（>1024px）不受影响，仍走 PC 版。
 *
 * 首个调用方：交易流水页 —— 移动端不加载 vxe-table（~700KB chunk），改用卡片列表。
 */
const MOBILE_QUERY = '(max-width: 768px), (pointer: coarse) and (max-width: 1024px)'

export function useIsMobile(): Ref<boolean> {
  return useMediaQuery(MOBILE_QUERY)
}
