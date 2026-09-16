<script setup lang="ts">
/**
 * 空白布局：登录页、全屏图表等无框架页面用
 */
</script>

<template>
  <div class="blank-layout">
    <RouterView />
  </div>
</template>

<style scoped lang="scss">
.blank-layout {
  min-height: 100vh;
  background: var(--lz-bg-page);
}
</style>
