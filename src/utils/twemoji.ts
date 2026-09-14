/**
 * Twemoji 运行时工具（CDN 方案，无需 npm 包 / 本地资产）
 * ====================================================================
 * 把任意 emoji 字符串转成 jsDelivr 上的 Twemoji SVG 地址。
 * 覆盖多段代理对、肤色修饰、ZWJ 序列、变体选择符（FE0F）。
 *
 * 为什么不用 npm 包：本环境 pnpm store 软链在大小写路径上冲突装不上，
 * 而 CDN 零依赖、还能直接渲染数据库里已存的 emoji（分类图标 🍜🚇…），
 * 不需要任何数据迁移。
 */

const TWEMOJI_CDN = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/'

const cache = new Map<string, string | null>()

/**
 * emoji → Twemoji SVG 地址；非 emoji 返回 null（调用方回退原文本）
 */
export function twemojiSvgUrl(emoji: string): string | null {
  if (!emoji)
    return null
  if (cache.has(emoji))
    return cache.get(emoji) ?? null
  const url = convert(emoji)
  cache.set(emoji, url)
  return url
}

/**
 * 复刻 twemoji.convert.toCodePoint：把 emoji 串拆成 codepoint 并用 '-' 连接，
 * 同时剥掉变体选择符（U+FE0F）和零宽连接符（U+200D），与 Twemoji 文件名规则一致。
 */
function convert(emoji: string): string | null {
  const parts: string[] = []
  for (const ch of emoji) {
    const cp = ch.codePointAt(0)!
    if (cp === 0xFE0F || cp === 0x200D)
      continue
    parts.push(cp.toString(16))
  }
  if (parts.length === 0)
    return null
  return `${TWEMOJI_CDN}${parts.join('-')}.svg`
}
