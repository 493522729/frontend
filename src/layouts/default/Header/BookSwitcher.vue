<script setup lang="ts">
/**
 * 顶栏账本切换器（US-005）
 * ====================================================================
 * 切的是「当前账本」这个全局状态，切完各业务页面自己 watch 重新取数。
 *
 * 下拉里带笔数摘要：装修账本 2500 笔、旅行 1500 笔，
 * 用户一眼能认出自己在哪一本，不用来回切着确认。
 */
import type { SelectOption } from 'naive-ui'
import { NSelect } from 'naive-ui'
import { computed, h, onMounted } from 'vue'
import { bookTypeIcon } from '@/enums/book'
import { useBookStore } from '@/stores/modules/book'

const book = useBookStore()

onMounted(() => book.ensureLoaded())

const options = computed<SelectOption[]>(() =>
  book.books.map(b => ({
    label: b.name,
    value: b.id,
  })),
)

function renderLabel(option: SelectOption) {
  const b = book.books.find(x => x.id === option.value)
  if (!b)
    return String(option.label ?? '')
  const children = [
    h('span', { class: 'book-option__icon' }, b.icon || bookTypeIcon(b.type)),
    h('span', { class: 'book-option__name' }, b.name),
  ]
  if (b.scope === 'SHARED') {
    children.push(h('span', { class: 'book-option__shared' }, '👥'))
  }
  children.push(h('span', { class: 'book-option__count' }, `${b.txnCount} 笔`))
  return h('div', { class: 'book-option' }, children)
}

function onUpdate(id: number) {
  book.switchBook(id)
}
</script>

<template>
  <div class="book-switcher">
    <NSelect
      :value="book.currentBookId"
      :options="options"
      :render-label="renderLabel"
      :loading="book.loading"
      size="small"
      class="book-switcher__select"
      aria-label="切换账本"
      @update:value="onUpdate"
    />
  </div>
</template>

<style scoped lang="scss">
.book-switcher {
  display: flex;
  align-items: center;
}

.book-switcher__select {
  width: 188px;
}
</style>

<style lang="scss">
// 下拉项挂在 body 上，scoped 穿透不到，用全局样式 + 专属类名收口
.book-option {
  display: flex;
  align-items: center;
  gap: 8px;
}

.book-option__icon {
  font-size: 15px;
  line-height: 1;
}

.book-option__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.book-option__count {
  flex-shrink: 0;
  color: var(--lz-text-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.book-option__shared {
  flex-shrink: 0;
  font-size: 13px;
  line-height: 1;
}
</style>
