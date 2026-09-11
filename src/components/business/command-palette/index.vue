<script setup lang="ts">
import type { CommandItem } from '@/utils/commands'
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useCommandPalette } from '@/composables/useCommandPalette'
import { useHotkey } from '@/composables/useHotkey'
import { useBookStore } from '@/stores/modules/book'
import { useQuickEntryStore } from '@/stores/modules/quickEntry'
import { filterCommands } from '@/utils/commands'

/**
 * 命令面板（US-011 / 架构 §4.2「键盘优先」）
 * ====================================================================
 * 三类命令源：
 *  1. 跳转 —— 直接复用路由 meta（与侧边栏同一份数据，不维护第二份菜单）
 *  2. 操作 —— 高频动作入口（目前只有「记一笔」，架构点名的三个之一）
 *  3. 账本 —— 切换账本（架构点名的三个之一）
 *
 * 匹配与排序交给 utils/commands.ts 的纯函数，这里只管交互与渲染。
 */

const { visible, close, toggle } = useCommandPalette()
const router = useRouter()
const quickEntry = useQuickEntryStore()
const bookStore = useBookStore()

// ⌘⇧P / Ctrl+Shift+P：架构 §3.6 里 z-index command 层就是给它留的
useHotkey('Cmd+Shift+P', toggle)

const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<{ focus: () => void } | null>(null)
const listRef = ref<HTMLElement | null>(null)

const commands = computed<CommandItem[]>(() => {
  // 跳转：与侧边栏同款过滤（排除根路径 / 隐藏页 / 无标题页），按 meta.order 排序
  const pages: CommandItem[] = router
    .getRoutes()
    .filter(r => r.path !== '/' && !r.meta.hidden && r.meta.title)
    .toSorted((a, b) => (a.meta.order ?? 99) - (b.meta.order ?? 99))
    .map(r => ({
      id: `go:${r.path}`,
      title: r.meta.title as string,
      group: '跳转',
      run: () => {
        router.push(r.path)
      },
    }))

  // 操作：记一笔（⌘K 仍是直达键，这里给个可搜索的入口，架构 §4.2「命令可查」）
  const actions: CommandItem[] = [
    {
      id: 'act:quick-entry',
      title: '记一笔',
      subtitle: '⌘K',
      group: '操作',
      keywords: ['jyb', 'jizhang', 'add', '记账'],
      run: () => quickEntry.open(),
    },
  ]

  // 账本：切换（当前账本标注出来，避免用户切到已经在用的账本）
  const books: CommandItem[] = bookStore.books.map(b => ({
    id: `book:${b.id}`,
    title: `切换到「${b.name}」`,
    subtitle: b.id === bookStore.currentBookId ? '当前账本' : `${b.txnCount} 笔`,
    group: '账本',
    keywords: ['book', 'qiezhangben'],
    run: () => bookStore.switchBook(b.id),
  }))

  return [...actions, ...pages, ...books]
})

const results = computed(() => filterCommands(commands.value, query.value))

/** 分组标题：与上一项 group 不同时插一行 */
const rows = computed(() =>
  results.value.map((cmd, i) => ({
    cmd,
    showGroup: i === 0 || results.value[i - 1]?.group !== cmd.group,
  })),
)

function move(delta: number) {
  const n = results.value.length
  if (!n)
    return
  activeIndex.value = (activeIndex.value + delta + n) % n
}

function exec(cmd?: CommandItem) {
  const target = cmd ?? results.value[activeIndex.value]
  if (!target)
    return
  close()
  target.run()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    move(1)
  }
  else if (e.key === 'ArrowUp') {
    e.preventDefault()
    move(-1)
  }
  else if (e.key === 'Enter') {
    e.preventDefault()
    exec()
  }
  else if (e.key === 'Escape') {
    e.preventDefault()
    // 阻止冒泡到 window：否则页面级 Esc（如交易页「清空筛选」）会被同时触发
    e.stopPropagation()
    close()
  }
}

// 打开时重置状态并聚焦输入框（面板是"用完即走"的，不留上次搜索词）
watch(visible, async (open) => {
  if (!open)
    return
  query.value = ''
  activeIndex.value = 0
  // 聚焦要兜两次：nextTick 时弹层 DOM 已插入但淡入动画未开始，
  // 此刻 focus() 会被随后的 transform/visibility 变化打断；动画下一帧再补一次。
  await nextTick()
  inputRef.value?.focus()
  requestAnimationFrame(() => inputRef.value?.focus())
})

// 搜索词变了，选中项回到第一条
watch(query, () => {
  activeIndex.value = 0
})

// 键盘移动时把选中项滚进可视区
watch(activeIndex, async () => {
  await nextTick()
  listRef.value
    ?.querySelector('.palette-item.active')
    ?.scrollIntoView({ block: 'nearest' })
})
</script>

<template>
  <NModal
    :show="visible"
    :z-index="500"
    :auto-focus="false"
    @update:show="v => !v && close()"
  >
    <div class="palette" role="dialog" aria-modal="true" aria-label="命令面板">
      <div class="palette-input">
        <NInput
          ref="inputRef"
          v-model:value="query"
          size="large"
          placeholder="搜索页面 / 命令 / 账本…"
          :input-props="{
            'aria-label': '搜索命令',
            'aria-controls': 'palette-list',
            'aria-activedescendant': `palette-opt-${activeIndex}`,
            'aria-autocomplete': 'list',
          }"
          @keydown="onKeydown"
        />
      </div>

      <div
        v-if="results.length"
        id="palette-list"
        ref="listRef"
        class="palette-list"
        role="listbox"
        aria-label="命令结果"
      >
        <template v-for="(row, i) in rows" :key="row.cmd.id">
          <div v-if="row.showGroup" class="palette-group">
            {{ row.cmd.group }}
          </div>
          <div
            :id="`palette-opt-${i}`"
            class="palette-item"
            role="option"
            :aria-selected="i === activeIndex"
            :class="{ active: i === activeIndex }"
            @mouseenter="activeIndex = i"
            @click="exec(row.cmd)"
          >
            <span class="palette-title">{{ row.cmd.title }}</span>
            <span v-if="row.cmd.subtitle" class="palette-sub">{{ row.cmd.subtitle }}</span>
          </div>
        </template>
      </div>

      <div v-else class="palette-empty">
        没有匹配的命令
      </div>

      <div class="palette-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
        <span><kbd>⏎</kbd> 执行</span>
        <span><kbd>esc</kbd> 关闭</span>
      </div>
    </div>
  </NModal>
</template>

<style scoped lang="scss">
.palette {
  width: 560px;
  max-width: calc(100vw - 32px);
  overflow: hidden;
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  box-shadow: var(--lz-shadow-lg);
}

.palette-input {
  padding: 12px 16px;
  border-bottom: 1px solid var(--lz-border-light);
}

.palette-list {
  padding: 8px;
  max-height: 360px;
  overflow-y: auto;
}

.palette-group {
  padding: 8px 10px 4px;
  font-size: 12px;
  color: var(--lz-text-secondary);
}

.palette-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 10px;
  border-radius: var(--lz-radius-md);
  color: var(--lz-text-regular);
  font-size: 14px;
  cursor: pointer;
  @include transition-paint;

  &.active {
    background: var(--lz-bg-hover);
    color: var(--lz-primary-600);
  }
}

.palette-title {
  @include ellipsis;
}

.palette-sub {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--lz-text-secondary);
  font-variant-numeric: tabular-nums;
}

.palette-empty {
  padding: 32px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--lz-text-secondary);
}

.palette-foot {
  display: flex;
  gap: 16px;
  padding: 8px 16px;
  border-top: 1px solid var(--lz-border-light);
  font-size: 12px;
  color: var(--lz-text-secondary);

  kbd {
    display: inline-block;
    min-width: 18px;
    margin-right: 2px;
    padding: 1px 4px;
    font-family: var(--lz-font-num);
    font-size: 11px;
    text-align: center;
    background: var(--lz-bg-page);
    border: 1px solid var(--lz-border);
    border-radius: var(--lz-radius-sm);
  }
}
</style>
