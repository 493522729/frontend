<script setup lang="ts">
import { onMounted } from 'vue'
import beianPoliceImg from '@/assets/beian-police.png'
import { useSiteConfigStore } from '@/stores/modules/siteConfig'

/**
 * 全局备案字号页脚
 * ====================================================================
 * 读取后端 site-config 配置展示：
 *   - 备案中：只展示 footerText（默认「本网站正在备案中」）
 *   - 已备案：footerText + 可点击的备案号链接
 * 只在 default layout 的登录后内页使用，因此无需处理未登录态。
 *
 * 公安联网备案（京公网安备11010502063140号）为审批固定值，直接写死；
 * 链接必须指向公安备案查询页且带 code（管局核查要求），不可改为 beian.mps.gov.cn 首页。
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
    </p>
    <p class="icp-line">
      <!-- 第二行：备案信息 -->
      <!-- 公安联网备案：官方金色徽标 + 备案号，链接为带 code 的官方查询页（合规硬要求）；
           排在 ICP 备案号之前（管局核查页脚时公安备案常在前） -->
      <a
        class="icp-police"
        href="https://beian.mps.gov.cn/#/query/webSearch?code=11010502063140"
        target="_blank"
        rel="noreferrer"
        aria-label="京公网安备11010502063140号"
        title="京公网安备11010502063140号"
      >
        <img
          :src="beianPoliceImg"
          alt="公安联网备案徽标"
        >
        <span class="icp-police__no">京公网安备11010502063140号</span>
      </a>
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
  flex-direction: column;
  align-items: center;
  gap: 4px;
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

/* 公安备案：官方金色徽标 + 备案号，整条是一个链接；徽标固定配色不随主题变 */
.icp-police {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--lz-text-tertiary);
  text-decoration: none;

  img {
    display: block;
    width: 14px;
    height: auto;
  }

  &:hover {
    color: var(--lz-text-secondary);
    text-decoration: underline;
  }
}
</style>
