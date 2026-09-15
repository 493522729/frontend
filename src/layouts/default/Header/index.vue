<script setup lang="ts">
import type { DropdownOption } from 'naive-ui'
import { NDropdown, useMessage } from 'naive-ui'
/**
 * 顶栏：侧边栏折叠开关 + 账本切换器 + 数据大屏入口 + 记账快捷键提示
 *      + 主题切换 + 用户菜单
 *
 * Cmd/Ctrl+B 切换侧边栏、Cmd/Ctrl+K 唤起记账（都由 useHotkey 统一注册，
 * 见 composables/useHotkey.ts；这里只负责把键位「显式地告诉用户」）。
 *
 * 用户菜单用 NDropdown 触发：显示昵称 + 退出登录 + 跳到设置（改密入口）。
 * 退出登录清 token + 跳 /login（带 redirect 让登录后回到原页面）。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useHotkey } from '@/composables/useHotkey'
import { iconPath } from '@/constants/icons'
import { useAppStore } from '@/stores/modules/app'
import { useAuthStore } from '@/stores/modules/auth'
import { useQuickEntryStore } from '@/stores/modules/quickEntry'
import BookSwitcher from './BookSwitcher.vue'

const appStore = useAppStore()
const auth = useAuthStore()
const quickEntry = useQuickEntryStore()
const router = useRouter()
const message = useMessage()

useHotkey('Cmd+B', () => appStore.toggleSidebar())

/** 图标路径：与侧边栏 route.meta.icon 同一份字典（constants/icons.ts） */
const SCREEN_ICON = iconPath('screen')

/** 进可视化大屏（blank layout 全屏沉浸，退出走 Esc / 大屏内按钮） */
function goScreen() {
  router.push('/screen')
}

/** 顶栏头像：取昵称首字，无头像时显示首字占位 */
const avatarText = computed(() => {
  const nick = auth.userInfo?.nickname || auth.userInfo?.username || ''
  return nick ? nick.charAt(0).toUpperCase() : '?'
})
const displayName = computed(() => auth.userInfo?.nickname || auth.userInfo?.username || '未登录')

/** 下拉菜单选项 —— key 用 NDropdown 支持的类型 */
const userMenuOptions: DropdownOption[] = [
  { key: 'account', label: '账号设置' },
  { key: 'settings', label: '系统设置' },
  { type: 'divider', key: 'd1' },
  { key: 'logout', label: '退出登录' },
]

/**
 * 选择菜单项。
 * 注意：传参是 `(key, option)`，key 是 string | number —— 这里固定是字符串，
 * 但 TS 类型需要断言；用 `as string` 即可，菜单 key 在 userMenuOptions 里写死。
 */
async function onUserMenuSelect(key: string | number) {
  const k = key as string
  if (k === 'account') {
    router.push('/profile')
  }
  else if (k === 'settings') {
    router.push('/settings')
  }
  else if (k === 'logout') {
    await auth.logout()
    message.success('已退出登录')
    router.replace({ path: '/login', query: { redirect: '/' } })
  }
}
</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <button
        class="sidebar-toggle icon-btn"
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
      <!-- 可视化大屏入口（US-014）：图标 + 文字，跳全屏沉浸大屏 -->
      <button
        type="button"
        class="screen-entry"
        title="打开数据大屏"
        @click="goScreen"
      >
        <svg class="icon-svg screen-entry__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path :d="SCREEN_ICON" fill="currentColor" />
        </svg>
        <span class="entry-text">数据大屏</span>
      </button>

      <!-- 记一笔：把 ⌘K 这条主路径显式摆到顶栏，点击同样能唤起（不止是提示） -->
      <button
        type="button"
        class="hotkey-hint"
        title="快速记账（⌘K 或 N）"
        aria-label="快速记账，快捷键 Command 加 K"
        @click="quickEntry.open()"
      >
        <kbd class="hotkey-hint__key">⌘</kbd>
        <kbd class="hotkey-hint__key">K</kbd>
        <span class="entry-text">记一笔</span>
      </button>

      <span class="header-divider" aria-hidden="true" />

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

      <!-- 用户下拉菜单：头像 + 昵称 + 退出 -->
      <NDropdown
        trigger="click"
        :options="userMenuOptions"
        placement="bottom-end"
        @select="onUserMenuSelect"
      >
        <button class="user-chip" :title="displayName">
          <span class="user-avatar">
            <img v-if="auth.userInfo?.avatar" :src="auth.userInfo.avatar" class="user-avatar-img" alt="头像">
            <template v-else>{{ avatarText }}</template>
          </span>
          <span class="user-name">{{ displayName }}</span>
          <svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
          </svg>
        </button>
      </NDropdown>
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

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
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
  transition: background-color var(--lz-duration-base), transform var(--lz-duration-base) var(--lz-ease-standard);

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

// 顶栏按钮的共享文字样式：窄屏统一隐藏，只留图标 / 键位
.entry-text {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

// 数据大屏入口：沿用 user-chip 的形状语言（36px 高、8px 圆角、1px 描边），
// 靠「图标用主色」把它和普通图标按钮区分开 —— 不额外加底色，避免顶栏花
.screen-entry {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--lz-border-light);
  border-radius: var(--lz-radius-lg);
  background: var(--lz-bg-card);
  color: var(--lz-text-regular);
  cursor: pointer;
  @include transition-paint();

  &:hover {
    border-color: var(--lz-primary-500);
    background: var(--lz-primary-50);
    color: var(--lz-primary-600);
  }

  &:focus-visible {
    outline: 2px solid var(--lz-primary-600);
    outline-offset: 2px;
  }
}

.screen-entry__icon {
  width: 18px;
  height: 18px;
  color: var(--lz-primary-600);
  flex-shrink: 0;
}

// 「记一笔」快捷键提示：本质是提示，所以不加描边、用次要色，
// 不跟右侧主题/用户按钮抢视觉；但它同时是可点入口，所以保留完整交互态
.hotkey-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 36px;
  padding: 0 10px;
  border: none;
  border-radius: var(--lz-radius-lg);
  background: transparent;
  color: var(--lz-text-secondary);
  cursor: pointer;
  @include transition-paint();

  .entry-text {
    margin-left: 2px;
  }

  &:hover {
    background: var(--lz-primary-50);
    color: var(--lz-primary-600);

    .hotkey-hint__key {
      border-color: var(--lz-primary-300);
      color: var(--lz-primary-600);
    }
  }

  &:focus-visible {
    outline: 2px solid var(--lz-primary-600);
    outline-offset: 2px;
  }
}

// 键位胶囊：等宽字体 + 下边多 1px 模拟键帽厚度
.hotkey-hint__key {
  display: inline-grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 4px;
  border: 1px solid var(--lz-border);
  border-bottom-width: 2px;
  border-radius: var(--lz-radius-sm);
  background: var(--lz-bg-page);
  color: var(--lz-text-regular);
  font-family: var(--lz-font-num);
  font-size: 11px;
  line-height: 1;
  @include transition-paint();
}

// 新增入口与原有控件之间的分隔，避免右侧五个元素糊成一片
.header-divider {
  width: 1px;
  height: 20px;
  margin: 0 4px;
  background: var(--lz-border);
}

// 窄屏：先收「记一笔」文字，再收「数据大屏」文字，键位与图标保留
@media (max-width: 1100px) {
  .hotkey-hint .entry-text {
    display: none;
  }
}

@media (max-width: 900px) {
  .screen-entry .entry-text {
    display: none;
  }

  .screen-entry {
    padding: 0 8px;
  }

  .header-divider {
    display: none;
  }
}

// 用户胶囊：头像 + 昵称 + 箭头（架构文档 3.6 header 右侧操作区）
.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 4px 4px;
  height: 36px;
  border: 1px solid var(--lz-border-light);
  border-radius: 999px;
  background: var(--lz-bg-card);
  color: var(--lz-text-regular);
  cursor: pointer;
  @include transition-paint();

  &:hover {
    border-color: var(--lz-primary-500);
    color: var(--lz-primary-600);
    background: var(--lz-primary-50);
  }

  &:focus-visible {
    outline: 2px solid var(--lz-primary-600);
    outline-offset: 2px;
  }
}

.user-avatar {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--lz-primary-500), var(--lz-primary-700));
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
}

.user-avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}

.user-name {
  font-size: 13px;
  font-weight: 500;
  // 超过 120px 截断，避免长昵称把布局挤坏
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// 窄屏隐藏昵称，只留头像
@media (max-width: 768px) {
  .user-name {
    display: none;
  }

  .user-chip {
    padding: 4px;
  }

  // 触屏/手机端：侧栏折叠按钮与 ⌘K 快捷键提示都是桌面交互——
  // 手机没有物理键盘，⌘K 无意义；侧栏在窄屏已自动收成图标条，折叠开关没有存在的场景。
  // 「记一笔」入口由页面右下角悬浮按钮承担，这里整颗隐藏。
  .sidebar-toggle,
  .hotkey-hint {
    display: none;
  }
}
</style>
