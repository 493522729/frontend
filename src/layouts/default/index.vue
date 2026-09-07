<script setup lang="ts">
import Header from './Header/index.vue'
import Sidebar from './Sidebar/index.vue'

/**
 * 默认布局：侧边栏 + 顶栏 + 内容区（架构文档 3.5 骨架尺寸）
 * 标签栏（Tabs）P1 期再上，目录已预留
 */
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
</style>
