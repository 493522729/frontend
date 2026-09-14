<script setup lang="ts">
/**
 * Twemoji 图标组件（CDN 版）
 * ====================================================================
 * 不依赖 npm 包，直接把 emoji 字符渲染成 Twemoji SVG（jsDelivr CDN）。
 * 支持数据库里已存的任意 emoji（分类/账户图标），也支持空态预设名。
 *
 * 用法：
 *   <TwemojiIcon emoji="🍜" :size="20" />
 *   <TwemojiIcon name="chart" :size="64" />
 */
import { computed } from 'vue'
import { twemojiSvgUrl } from '@/utils/twemoji'

export type TwemojiName
  = 'ledger'
    | 'search'
    | 'bank'
    | 'wallet'
    | 'rule'
    | 'recurring'
    | 'chart'
    | 'chart-up'
    | 'upload'
    | 'package'
    | 'inbox'
    | 'receipt'

const props = withDefaults(defineProps<{
  /** 直接传 emoji 字符（优先级高于 name） */
  emoji?: string
  /** 传语义名（空态场景） */
  name?: TwemojiName
  /** 渲染尺寸（px） */
  size?: number
  /** img alt 文本 */
  alt?: string
}>(), {
  size: 64,
  alt: '',
})

const TWEMOJI_MAP: Record<TwemojiName, string> = {
  'ledger': '📒',
  'search': '🔍',
  'bank': '🏦',
  'wallet': '👛',
  'rule': '⚙️',
  'recurring': '🔄',
  'chart': '📊',
  'chart-up': '📈',
  'upload': '📤',
  'package': '📦',
  'inbox': '📥',
  'receipt': '🧾',
}

const src = computed(() => {
  const emoji = props.emoji ?? (props.name ? TWEMOJI_MAP[props.name] : '')
  return twemojiSvgUrl(emoji ?? '')
})
</script>

<template>
  <img
    v-if="src"
    class="twemoji-icon"
    :src="src"
    :alt="alt"
    :style="{ width: `${size}px`, height: `${size}px` }"
    draggable="false"
  >
  <span v-else-if="emoji || name" class="twemoji-fallback">{{ emoji ?? (name ? TWEMOJI_MAP[name] : '') }}</span>
</template>

<style scoped lang="scss">
.twemoji-icon {
  display: inline-block;
  flex-shrink: 0;
  object-fit: contain;
  user-select: none;
  /* Twemoji SVG 自带完整配色，统一降一点饱和度让它和晨雾蓝界面更协调 */
  filter: saturate(0.92);
}

.twemoji-fallback {
  font-size: inherit;
  line-height: 1;
}
</style>
