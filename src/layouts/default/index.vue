<script setup lang="ts">
import CommandPalette from '@/components/business/command-palette/index.vue'
import QuickEntry from '@/components/business/quick-entry/index.vue'
import { useHotkey } from '@/composables/useHotkey'
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
// 走 useHotkey 统一注册：带 ⌘ 的组合在输入态也生效，语义不在这里重复实现
useHotkey('Cmd+K', () => quickEntry.open())
// N：架构 §4.2 规定的记账别名（单键，输入态自动豁免，不会打断打字）
useHotkey('N', () => quickEntry.open())
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
    <!-- 命令面板（⌘⇧P）：与记账弹层同层挂载，登录页不挂 -->
    <CommandPalette />
  </div>
</template>

<style scoped lang="scss">
.app-layout {
  display: flex;
  // 关键：锁死视口高度并裁掉整体滚动，只让内容区内部滚动，
  // 这样左侧菜单栏 / 顶栏固定不动，不会跟着右侧页面滚。
  height: 100vh;
  overflow: hidden;
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
  overflow-y: auto; // 内容区独立滚动，菜单栏不再跟着滚
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
