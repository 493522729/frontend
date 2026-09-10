import { useEventListener } from '@vueuse/core'

/**
 * 全局快捷键统一注册（架构文档 §4.2 铁律）
 * ====================================================================
 * 铁律原文：「统一走 composables/useHotkey.ts 注册，禁止组件内裸写
 * window.addEventListener」「输入框聚焦时全局快捷键自动失效（除 Esc / Cmd+Enter）」。
 *
 * 之前代码里三处裸写 addEventListener（layout 的 ⌘K 记账、Header 的 ⌘B 折叠、
 * 交易页的 ⌘K 聚焦搜索），各自实现一遍「输入态豁免」，规则还不一致 ——
 * 交易页那处因为没做输入态判断，与全局记账叠加，按一次 ⌘K 会同时触发两个动作。
 * 统一走这里，语义只写一遍。
 *
 * 两条默认约定（可被 options 覆盖）：
 *  1. 带 Cmd/Ctrl/Alt 的组合键在输入态**仍然生效** —— 与 VS Code 一致，
 *     ⌘K 记账、⌘⇧P 命令面板在搜索框里也能唤起（用户不会觉得"快捷键失灵"）。
 *  2. 单键（N、/、1~9）在输入态**让位给用户打字** —— 否则在输入框里打字母
 *     会误触发全局动作，这是最常见的快捷键事故。
 */

export interface HotkeyOptions {
  /** 输入态是否仍然生效；缺省按上面两条约定自动判断 */
  allowInInput?: boolean
}

export interface HotkeyCombo {
  /** 主键（统一小写，如 'k'、'p'、'/'） */
  key: string
  /** 是否要求 Cmd / Ctrl（两者等价，跨平台通用） */
  meta: boolean
  shift: boolean
  alt: boolean
}

/** 焦点是否在可输入元素里 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string')
    return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
}

/**
 * 解析组合键字符串：'Cmd+Shift+P' / 'Ctrl+K' / '/' / 'N'
 * Cmd 与 Ctrl 视为同一个修饰键 —— Mac 用 ⌘、Windows 用 Ctrl，写一处即可跨平台。
 */
export function parseCombo(combo: string): HotkeyCombo {
  const parts = combo.split('+').map(p => p.trim()).filter(Boolean)
  const key = (parts.at(-1) ?? '').toLowerCase()
  const mods = parts.slice(0, -1).map(p => p.toLowerCase())
  return {
    key,
    meta: mods.includes('cmd') || mods.includes('ctrl'),
    shift: mods.includes('shift'),
    alt: mods.includes('alt') || mods.includes('option'),
  }
}

/**
 * 注册一个全局快捷键，随组件作用域自动注销
 *
 * @param combo 组合键，如 'Cmd+Shift+P'
 * @param handler 命中时回调（已 preventDefault）
 * @param options 覆盖默认的输入态行为
 */
export function useHotkey(combo: string, handler: (e: KeyboardEvent) => void, options: HotkeyOptions = {}) {
  const wanted = parseCombo(combo)
  const allowInInput = options.allowInInput ?? (wanted.meta || wanted.alt)

  useEventListener(window, 'keydown', (e: KeyboardEvent) => {
    // 修饰键严格匹配：要求 ⌘⇧P 时，只按 ⌘P 不算；反之亦然
    if ((e.metaKey || e.ctrlKey) !== wanted.meta)
      return
    if (e.shiftKey !== wanted.shift)
      return
    if (e.altKey !== wanted.alt)
      return
    if (e.key.toLowerCase() !== wanted.key)
      return
    if (!allowInInput && isTypingTarget(e.target))
      return

    e.preventDefault()
    handler(e)
  })
}
