<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '@/stores/modules/app'
import { resolveNaiveOverrides, resolveNaiveTheme } from '@/theme/naive'

// 把「实际暗色开关」接到 Naive 的全局主题：亮/暗主题对象 + 晨雾蓝覆盖
const app = useAppStore()
const naiveTheme = computed(() => resolveNaiveTheme(app.isDark))
const naiveOverrides = computed(() => resolveNaiveOverrides(app.isDark))
</script>

<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="naiveOverrides">
    <!--
      Naive UI 函数式 API 依赖这些 provider 注入上下文
      顺序按官方约定：loading-bar → dialog → notification → message
      全部走 build/plugins/components.ts 的 NaiveUiResolver 自动按需引入
    -->
    <n-loading-bar-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <n-message-provider>
            <RouterView />
          </n-message-provider>
        </n-notification-provider>
      </n-dialog-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>
