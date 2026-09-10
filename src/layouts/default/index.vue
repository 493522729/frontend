<script setup lang="ts">
import QuickEntry from '@/components/business/quick-entry/index.vue'
import { useQuickEntryStore } from '@/stores/modules/quickEntry'
import Header from './Header/index.vue'
import Sidebar from './Sidebar/index.vue'

/**
 * 默认布局：侧边栏 + 顶栏 + 内容区（架构文档 3.5 骨架尺寸）
 * 标签栏（Tabs）P1 期再上，目录已预留
 *
 * 快速记账（PRD 8.3）：挂全局弹层 + Cmd/Ctrl+K 快捷键 + 右下角悬浮按钮。
 * 弹层只挂在这里 —— 登录页（blank layout）不挂，未登录不该能记账。
 */
const quickEntry = useQuickEntryStore()

// Cmd/Ctrl+K 全局唤起记账（浏览器默认是聚焦地址栏，web app 里拦截为记账入口）
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    quickEntry.open()
  }
})
</script>

<template>
  <div class="app-layout">
    <Sidebar />
    <div class="layout-main">
      <Header />
      <main class="layout-content">
        <RouterView v-slot="{ Component }">
          <Transition name="fade-slide" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>
    </div>

    <!-- 全局悬浮记账按钮（右下角 FAB） -->
    <button
      class="fab"
      aria-label="快速记账"
      title="快速记账 (⌘K)"
      @click="quickEntry.open()"
    >
      <svg class="fab-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
      </svg>
    </button>

    <QuickEntry />
  </div>
</template>

<style scoped lang="scss">
.app-layout {
  display: flex;
  min-height: 100vh;
  background: var(--lz-bg-page);
}

.layout-main {
  flex: 1;
  min-width: 0; // 让内容区的表格可以正确收缩
  display: flex;
  flex-direction: column;
}

.layout-content {
  flex: 1;
  padding: 24px;
  position: relative; // 路由离场时旧页面 absolute 定位在此容器内
}

// 全局悬浮记账按钮：固定右下角，z 层低于 modal（--lz-z-modal: 400）
.fab {
  position: fixed;
  right: 28px;
  bottom: 28px;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border: none;
  border-radius: var(--lz-radius-full);
  background: var(--lz-primary-600);
  color: #fff;
  cursor: pointer;
  z-index: var(--lz-z-overlay);
  box-shadow: var(--lz-shadow-lg);
  transition: transform var(--lz-duration-base) var(--lz-ease-standard), background-color var(--lz-duration-base);

  &:hover {
    transform: scale(1.06);
    background: var(--lz-primary-700);
  }

  &:active {
    transform: scale(0.96);
  }

  &:focus-visible {
    outline: 2px solid var(--lz-primary-600);
    outline-offset: 3px;
  }
}

.fab-icon {
  width: 24px;
  height: 24px;
}
</style>
