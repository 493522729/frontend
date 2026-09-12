<script setup lang="ts">
import { useSiteConfigStore } from '@/stores/modules/siteConfig'
import { onMounted } from 'vue'

/**
 * 全局备案字号页脚
 * ====================================================================
 * 读取后端 site-config 配置展示：
 *   - 备案中：只展示 footerText（默认「本网站正在备案中」）
 *   - 已备案：footerText + 可点击的备案号链接
 * 只在 default layout 的登录后内页使用，因此无需处理未登录态。
 */
const site = useSiteConfigStore()

onMounted(() => {
  site.load()
})
</script>

<template>
  <footer v-if="site.config.showFooter" class="icp-footer">
    <p class="icp-line">
      <span v-if="site.config.footerText" class="icp-text">{{ site.config.footerText }}</span>
      <template v-if="site.config.icpNo">
        <span class="icp-divider" />
        <a
          v-if="site.config.icpLink"
          class="icp-link"
          :href="site.config.icpLink"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ site.config.icpNo }}
        </a>
        <span v-else class="icp-no">{{ site.config.icpNo }}</span>
      </template>
    </p>
  </footer>
</template>

<style scoped lang="scss">
.icp-footer {
  box-sizing: border-box;
  width: 100%;
  padding: 16px 24px 24px;
  display: flex;
  justify-content: center;
}

.icp-line {
  margin: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  max-width: 100%;
  font-size: 12px;
  line-height: 1.5;
  color: var(--lz-text-tertiary);
}

.icp-divider {
  width: 1px;
  height: 10px;
  background: var(--lz-border);
}

.icp-link,
.icp-no {
  color: var(--lz-text-tertiary);
  text-decoration: none;
}

.icp-link {
  &:hover {
    color: var(--lz-text-secondary);
    text-decoration: underline;
  }
}
</style>
