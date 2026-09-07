<script setup lang="ts">
/**
 * 空仪表盘：地基期的验收页面
 * 数据卡骨架已按 3.5 节自适应网格搭好，P0 期接上真实接口即可
 */
import { lastNMonths, monthLabel, today } from '@/utils/temporal'

const month = monthLabel(today().toPlainYearMonth())
// 近 6 月序列：图表 x 轴数据源已就位，等接口
const recentMonths = lastNMonths(6).map(monthLabel)
</script>

<template>
  <div class="dashboard">
    <h2 class="page-title">
      {{ month }} · 仪表盘
    </h2>
    <p class="page-subtitle">
      工程骨架已就绪，数据接口 P0 期接入。布局 / 主题切换 / 工具层已通过验收。
    </p>

    <!-- 数据卡：免媒体查询自适应网格（架构文档 3.5） -->
    <section class="stat-grid" aria-label="本月概览">
      <div v-for="m in recentMonths" :key="m" class="stat-card">
        <span class="stat-label">{{ m }}</span>
        <span class="stat-value">--</span>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.dashboard {
  max-width: 1600px;
  margin: 0 auto;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--lz-text-primary);
  margin: 0 0 4px;
}

.page-subtitle {
  font-size: 13px;
  color: var(--lz-text-secondary);
  margin: 0 0 24px;
}

.stat-grid {
  display: grid;
  // 大屏 4 列、笔记本 2 列、手机 1 列，零媒体查询
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px 24px;
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: 8px;
  box-shadow: var(--shadow-sm);

  .stat-label {
    font-size: 13px;
    color: var(--lz-text-secondary);
  }

  .stat-value {
    font-size: 24px;
    font-weight: 600;
    color: var(--lz-text-primary);
    // 等宽数字：金额不错位（架构文档 3.2）
    font-variant-numeric: tabular-nums;
  }
}
</style>
