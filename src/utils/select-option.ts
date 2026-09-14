/**
 * NSelect 选项「emoji 图标 + 文本」渲染助手
 * ====================================================================
 * 背景：分类 / 账户 / 账本的图标都存的是 emoji 字符（🍜🚇🏦），
 * 全站列表早已统一渲染成 Twemoji（见 components/business/twemoji-icon），
 * 但下拉选项是 naive-ui 直接渲染 label 字符串 —— emoji 会退回系统字体，
 * 和列表里的 Twemoji 风格对不上（同一分类在表格里是 Twemoji、在下拉里是苹果 emoji）。
 *
 * 解法：选项 label 仍保留纯字符串（形如「🍜 餐饮」），这样：
 *   1. filterable 的模糊搜索照常按名字匹配（naive-ui 只在 label 是字符串时才会搜索，
 *      一旦把 label 换成渲染函数，搜索会退化成匹配 value 数字，等于搜索失效）；
 *   2. 无障碍名称、复制粘贴出来的仍是可读文本；
 * 再额外挂一个 icon 字段，交给 renderEmojiLabel 渲染成 Twemoji。
 *
 * 用法：
 *   const options = computed(() => list.map(c => emojiOption(c.icon, c.name, c.id)))
 *   <NSelect :options="options" :render-label="renderEmojiLabel" />
 */

import type { VNodeChild } from 'vue'
import { h } from 'vue'
import TwemojiIcon from '@/components/business/twemoji-icon/index.vue'

/**
 * 带 emoji 图标的选项
 *
 * 为什么用 `type` 而不是 `interface`、还要显式写索引签名：
 * naive-ui 的 `SelectMixedOption` 里带 `[k: string]: unknown`，而 **interface 不会
 * 获得隐式索引签名**（只有类型别名 / 对象字面量类型才会），直接写 interface 会报
 * 「Property 'type' is missing in type 'X' but required in type 'SelectIgnoredOption'」
 * 这种指东打西的错。两处都补上，既过类型检查又保留自有字段的类型提示。
 */
export interface EmojiOption<V extends string | number = number> {
  value: V
  /** 纯文本 label，形如「🍜 餐饮」（子级用前导空格表示层级） */
  label: string
  /** 图标 emoji，渲染时交给 Twemoji */
  icon: string
  [key: string]: unknown
}

/**
 * 构造「emoji + 名称」选项
 * @param icon   图标 emoji（空串 / null 表示无图标）
 * @param name   名称
 * @param value  选项值
 * @param indent 层级缩进（0 = 一级，1 = 二级…），只在 label 里补前导空格
 */
export function emojiOption<V extends string | number>(
  icon: string | null | undefined,
  name: string,
  value: V,
  indent = 0,
): EmojiOption<V> {
  const ic = (icon ?? '').trim()
  return {
    value,
    icon: ic,
    label: `${' '.repeat(indent)}${ic ? `${ic} ` : ''}${name}`,
  }
}

/**
 * NSelect / NTreeSelect 的 render-label：
 * 把选项里的 emoji 换成 Twemoji SVG，文本部分保持不变。
 * 无 icon 字段（普通选项）时原样返回纯文本，所以可以放心地全站套用。
 */
export function renderEmojiLabel(option: unknown): VNodeChild {
  if (!option || typeof option !== 'object')
    return String(option ?? '')
  const { label, icon } = option as { label?: unknown, icon?: unknown }
  const text = typeof label === 'string' ? label : ''
  const ic = typeof icon === 'string' ? icon.trim() : ''
  // 没有图标 / label 里找不到这个 emoji → 走纯文本，不构造多余节点
  if (!ic || !text.includes(ic))
    return text

  // 前导空白代表子级缩进：HTML 会吞掉连续空格，转成 padding-left 才看得见
  const lead = /^[ \u3000]*/.exec(text)?.[0] ?? ''
  const indentPx = lead.replace(/\u3000/g, '  ').length * 4
  const rest = text.slice(lead.length).replace(`${ic} `, '').replace(ic, '')

  return h(
    'span',
    {
      class: 'lz-emoji-option',
      style: indentPx ? { paddingLeft: `${indentPx}px` } : undefined,
    },
    [
      h(TwemojiIcon, { emoji: ic, size: 15 }),
      h('span', { class: 'lz-emoji-option__text' }, rest),
    ],
  )
}

/** 带语义色点的选项（交易「类型」这类靠颜色区分语义的下拉）；索引签名原因同 EmojiOption */
export interface DotOption<V extends string | number = string> {
  value: V
  label: string
  /** CSS 颜色值，通常是 token 变量（如 var(--lz-danger)） */
  dot: string
  [key: string]: unknown
}

/**
 * 构造「色点 + 文本」选项
 * @param dot   色点颜色（CSS 值，建议传 token 变量）
 * @param label 文本
 * @param value 选项值
 */
export function dotOption<V extends string | number>(dot: string, label: string, value: V): DotOption<V> {
  return { value, label, dot }
}

/**
 * NSelect 的 render-label：渲染成「色点 + 文本」。
 * label 保持纯字符串，所以 filterable 搜索、无障碍名称都不受影响。
 */
export function renderDotLabel(option: unknown): VNodeChild {
  if (!option || typeof option !== 'object')
    return String(option ?? '')
  const { label, dot } = option as { label?: unknown, dot?: unknown }
  const text = typeof label === 'string' ? label : ''
  const color = typeof dot === 'string' ? dot : ''
  if (!color)
    return text

  return h('span', { class: 'lz-dot-option' }, [
    h('i', { class: 'lz-dot-option__dot', style: { background: color } }),
    h('span', { class: 'lz-dot-option__text' }, text),
  ])
}
