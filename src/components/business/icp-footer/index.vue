<script setup lang="ts">
import { onMounted } from 'vue'
import { useSiteConfigStore } from '@/stores/modules/siteConfig'

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
      <!-- 公安联网备案警徽：官方金色标识，不随主题变色（对齐腾讯云页脚样式）。
           公安备案号下来后，在这枚图标后面追加「X公网安备 XXXX 号」+ 查询链接 -->
      <a
        class="icp-police"
        href="https://beian.mps.gov.cn/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="公安联网备案"
        title="公安联网备案"
      >
        <img
          src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjE0IiBoZWlnaHQ9IjE0Ij48cGF0aCBkPSJNMTIgMS41bDguNSAzLjJ2Ni4xYzAgNS4yLTMuNiA4LjktOC41IDExLjctNC45LTIuOC04LjUtNi41LTguNS0xMS43VjQuN3oiIGZpbGw9IiNjODkxMmYiLz48cGF0aCBkPSJNMTIgMy42bDYuNiAyLjV2NC43YzAgNC4yLTIuOCA3LjMtNi42IDkuNy0zLjgtMi40LTYuNi01LjUtNi42LTkuN1Y2LjF6IiBmaWxsPSIjZjBiOTNmIi8+PHBhdGggZD0iTTEyIDYuNGwxLjM1IDIuNzUgMy4wNS40NS0yLjIgMi4xNS41IDMuMDVMMTIgMTMuMzVsLTIuNyAxLjQ1LjUtMy4wNS0yLjItMi4xNSAzLjA1LS40NXoiIGZpbGw9IiM4YTVhMWIiLz48L3N2Zz4K"
          alt=""
        >
      </a>
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

/* 公安备案警徽：金色官方标识，固定配色不随主题变 */
.icp-police {
  display: inline-flex;
  align-items: center;

  img {
    display: block;
    width: 14px;
    height: 14px;
  }
}
</style>
