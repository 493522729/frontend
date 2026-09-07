<script setup lang="ts">
import { useAppStore } from '@/stores/modules/app'
import BookSwitcher from './BookSwitcher.vue'

/**
 * 顶栏：侧边栏折叠开关 + 账本切换器 + 主题切换
 * Cmd/Ctrl+B 切换侧边栏（架构文档 4.2，useHotkey 落地后迁移过去）
 */
const appStore = useAppStore()

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
    e.preventDefault()
    appStore.toggleSidebar()
  }
})
</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <button
        class="icon-btn"
        :aria-label="appStore.sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
        :title="appStore.sidebarCollapsed ? '展开侧边栏 (⌘B)' : '折叠侧边栏 (⌘B)'"
        @click="appStore.toggleSidebar()"
      >
        <svg v-if="appStore.sidebarCollapsed" class="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <path d="M16 15l4-3-4-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <svg v-else class="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>

      <!-- 账本切换器：切的是全局「当前账本」，各页面 watch 到变化后自行重新取数 -->
      <BookSwitcher />
    </div>

    <div class="header-right">
      <button
        class="icon-btn"
        :aria-label="appStore.isDark ? '切换到亮色模式' : '切换到暗色模式'"
        :title="appStore.isDark ? '切换到亮色模式' : '切换到暗色模式'"
        @click="appStore.toggleDark()"
      >
        <svg v-if="appStore.isDark" class="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="5" fill="currentColor" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
        <svg v-else class="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor" />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped lang="scss">
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
  background: var(--lz-bg-card);
  border-bottom: 1px solid var(--lz-border);
  position: sticky;
  top: 0;
  z-index: 100; // 架构文档 3.6 header 层
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-svg {
  width: 20px;
  height: 20px;
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--lz-text-regular);
  font-size: 18px;
  cursor: pointer;
  transition: background-color 200ms, transform 200ms cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    background: var(--lz-primary-50);
    color: var(--lz-primary-600);
    // 仅图标按钮允许 hover 放大（架构文档 4.1）
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }

  &:focus-visible {
    outline: 2px solid var(--lz-primary-600);
    outline-offset: 2px;
  }
}
</style>
