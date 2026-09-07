<script setup lang="ts">
import { useRoute } from 'vue-router'
import { SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_WIDTH } from '@/constants/app'
import { useAppStore } from '@/stores/modules/app'

/**
 * 侧边栏：菜单完全由路由 meta 生成（ADR-5），此处不维护第二份菜单数据
 */
const appStore = useAppStore()
const route = useRoute()
const router = useRouter()

// 菜单图标映射：key 来自 route.meta.icon，值为内联 SVG 路径
// 不依赖 @iconify-json/mdi，避免当前 pnpm 信任策略阻塞
const iconMap: Record<string, string> = {
  dashboard: 'M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z',
  list: 'M3 5h4v4H3zM10 5h11v4H10zM3 11h4v4H3zM10 11h11v4H10zM3 17h4v4H3zM10 17h11v4H10z',
}

// 找不到映射时回退到「圆点」默认图标，绝不能把原始 key 当 path 回吐（否则 <path d="list"> 非法）
const FALLBACK_ICON = 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z'

function iconPath(icon?: string): string {
  if (!icon)
    return FALLBACK_ICON
  return iconMap[icon] ?? FALLBACK_ICON
}

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
    :style="{ width: appStore.sidebarCollapsed ? `${SIDEBAR_COLLAPSED_WIDTH}px` : `${SIDEBAR_WIDTH}px` }"
  >
    <!-- Logo 区 -->
    <div class="sidebar-logo" :title="$route.meta.title">
      <span class="logo-icon">
        <svg class="logo-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 20h18" />
          <path d="M5 20V9l4-2 3 2 3-2 4 2v11" />
          <path d="M9 20v-6h2v6" />
          <path d="M15 20v-9h2v9" />
        </svg>
      </span>
      <Transition name="fade">
        <span v-if="!appStore.sidebarCollapsed" class="logo-text">老赵财务中台</span>
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
        <span v-if="!appStore.sidebarCollapsed" class="menu-title">{{ item.meta.title }}</span>
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
  transition: width 250ms cubic-bezier(0.4, 0, 0.2, 1);
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
    border-radius: 8px;
    background: linear-gradient(135deg, var(--lz-primary-400), var(--lz-primary-600));
    color: #fff;
    flex-shrink: 0;
  }

  .logo-svg {
    width: 20px;
    height: 20px;
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
  transition: background-color 200ms, color 200ms;

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
