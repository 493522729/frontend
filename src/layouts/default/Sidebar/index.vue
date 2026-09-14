<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useBelowLg } from '@/composables/useBelowLg'
import { SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_WIDTH } from '@/constants/app'
import { iconPath } from '@/constants/icons'
import { useAppStore } from '@/stores/modules/app'

/**
 * 侧边栏：菜单完全由路由 meta 生成（ADR-5），此处不维护第二份菜单数据
 */
const appStore = useAppStore()
const route = useRoute()
const router = useRouter()

// 架构 §3.5：md（768–991）侧边栏 → 图标条。
// 「窄屏强制折叠」与「用户手动折叠」是两个来源，用 || 合成有效态 ——
// 不写回 store，避免窄屏的自动折叠污染用户在桌面端保存的展开偏好。
const belowLg = useBelowLg()
const collapsed = computed(() => appStore.sidebarCollapsed || belowLg.value)

// 菜单图标映射来自 constants/icons.ts（与顶栏共用同一份 path 字典）
// 不依赖 @iconify-json/mdi，避免当前 pnpm 信任策略阻塞

// 过滤 hidden、按 order 排序 —— 菜单数据只有一个来源：路由表
const menus = computed(() => {
  return router
    .getRoutes()
    .filter(r => r.path !== '/' && !r.meta.hidden && r.meta.title)
    .toSorted((a, b) => (a.meta.order ?? 99) - (b.meta.order ?? 99))
})
</script>

<template>
  <aside
    class="app-sidebar"
    :style="{ width: collapsed ? `${SIDEBAR_COLLAPSED_WIDTH}px` : `${SIDEBAR_WIDTH}px` }"
  >
    <!-- Logo 区 -->
    <div class="sidebar-logo" :title="$route.meta.title">
      <span class="logo-icon">
        <img src="/logo.png" alt="简账" class="logo-img">
      </span>
      <Transition name="fade">
        <span v-if="!collapsed" class="logo-text">简账</span>
      </Transition>
    </div>

    <!-- 菜单 -->
    <!-- Naive UI scrollbar：padding 要挂到 content 上，
         挂根元素会被内部 .n-scrollbar-container 的 overflow 裁掉 -->
    <n-scrollbar class="sidebar-menu" :content-style="{ padding: '8px' }">
      <RouterLink
        v-for="item in menus"
        :key="item.path"
        :to="item.path"
        class="menu-item"
        :class="{ active: route.path === item.path }"
      >
        <span class="menu-icon">
          <svg class="menu-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path :d="iconPath(item.meta.icon)" />
          </svg>
        </span>
        <span v-if="!collapsed" class="menu-title">{{ item.meta.title }}</span>
      </RouterLink>
    </n-scrollbar>
  </aside>
</template>

<style scoped lang="scss">
.app-sidebar {
  display: flex;
  flex-direction: column;
  height: 100vh;
  flex-shrink: 0;
  background: var(--lz-bg-card);
  border-right: 1px solid var(--lz-border);
  // 折叠动画是低频操作，此例允许 width 过渡（架构文档 4.1 的例外条款）
  transition: width var(--lz-duration-slow) var(--lz-ease-standard);
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid var(--lz-border);
  overflow: hidden;

  .logo-icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
  }

  .logo-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .logo-text {
    font-size: 15px;
    font-weight: 600;
    color: var(--lz-text-primary);
    white-space: nowrap;
  }
}

.sidebar-menu {
  flex: 1;
  // 关键：flex 子项默认 min-height: auto，会被内容撑开，
  // n-scrollbar 就永远算不出溢出高度、滚动条不出现
  min-height: 0;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 40px;
  padding: 0 12px;
  margin-bottom: 4px;
  border-radius: 6px;
  color: var(--lz-text-regular);
  text-decoration: none;
  font-size: 14px;
  transition: background-color var(--lz-duration-base), color var(--lz-duration-base);

  .menu-icon {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .menu-svg {
    width: 18px;
    height: 18px;
  }

  .menu-title {
    white-space: nowrap;
  }

  &:hover {
    background: var(--lz-primary-50);
    color: var(--lz-primary-600);
  }

  &.active {
    background: var(--lz-primary-100);
    color: var(--lz-primary-600);
    font-weight: 500;
  }
}
</style>
