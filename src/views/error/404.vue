<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="not-found">
    <div class="code">
      404
    </div>
    <p class="desc">
      页面不存在，可能已被移动或删除。
    </p>
    <n-button type="primary" @click="router.push('/dashboard')">
      回仪表盘
    </n-button>
  </div>
</template>

<style scoped lang="scss">
.not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-height: 60vh;

  .code {
    font-size: 80px;
    font-weight: 700;
    color: var(--lz-primary-200);
    line-height: 1;
  }

  .desc {
    font-size: 14px;
    color: var(--lz-text-secondary);
    margin: 0;
  }
}
</style>
