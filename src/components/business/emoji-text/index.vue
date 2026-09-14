<script setup lang="ts">
/**
 * Emoji + 文本 行内渲染（Twemoji 版）
 * ====================================================================
 * 解决「分类/账户列表里 emoji 在各平台显示不一致」的问题。
 * 数据库存的还是 emoji 字符串（🍜🚇），组件负责把它转成 Twemoji SVG。
 *
 * 用法：
 *   <EmojiText :icon="category.icon" :text="category.name" />
 *   <EmojiText icon="🍜">餐饮</EmojiText>
 */
import TwemojiIcon from '@/components/business/twemoji-icon/index.vue'

withDefaults(defineProps<{
  /** emoji 字符 */
  icon?: string | null
  /** 文字内容（也可直接用默认插槽） */
  text?: string
  /** 图标尺寸（px） */
  size?: number
}>(), {
  icon: '',
  text: '',
  size: 16,
})
</script>

<template>
  <span class="emoji-text">
    <TwemojiIcon
      v-if="icon"
      class="emoji-text-icon"
      :emoji="icon"
      :size="size"
      :alt="text"
    />
    <span class="emoji-text-label">
      <slot>{{ text }}</slot>
    </span>
  </span>
</template>

<style scoped lang="scss">
.emoji-text {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  vertical-align: middle;
}

.emoji-text-icon {
  flex-shrink: 0;
}

.emoji-text-label {
  line-height: 1;
}
</style>
