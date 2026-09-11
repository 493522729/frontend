<script setup lang="ts">
/**
 * 统一空状态（PRD §15.2.3「空态插画」）
 * ====================================================================
 * 之前各页面空态是 emoji 硬编码（📊 🏦 🔍 📒），风格不统一、暗色下观感参差、也没有品牌感。
 * 这里收口成一套内联 SVG 插画 —— 不引第三方图片资源（零请求、零维护成本），
 * 颜色全部走 token，暗色模式自动跟随。
 *
 * 插画设计原则（三条，别破）：
 *  1. **几何化**：只用矩形/圆/直线，不画具象物体 —— 财务产品要克制，插画太可爱会削弱专业感
 *  2. **线性为主**：2~2.5px 描边 + 极少量浅填充，跟 Naive UI 的图标语言一致
 *  3. **留白**：viewBox 120×120 里图形只占中间 ~72，四周留白 —— 空态本身就要"空"
 *
 * 颜色只用三个 token：
 *  - 主线条 var(--lz-primary-400)（亮色 #5fa5de / 暗色档自动替换）
 *  - 浅填充 rgb(var(--lz-primary-rgb) / 14%)（通道分量暗色已各一份，不会锁死成亮蓝）
 *  - 中性轮廓 var(--lz-border)（分隔线、基线）
 */

export type EmptyVariant = 'ledger' | 'search' | 'wallet' | 'rule' | 'recurring' | 'chart'

withDefaults(defineProps<{
  /** 插画类型 */
  variant?: EmptyVariant
  /** 主文案 */
  title: string
  /** 辅助说明，可省略 */
  desc?: string
  /** sm = 图表/卡片内嵌（80px），md = 整页区块（112px） */
  size?: 'sm' | 'md'
}>(), {
  variant: 'ledger',
  size: 'md',
})
</script>

<template>
  <div class="empty-state" :class="`empty-state--${size}`">
    <svg
      class="empty-art"
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
    >
      <!-- ─── 账本：翻开的账本 + 记录线 + 右上角结余标记 ─── -->
      <g v-if="variant === 'ledger'">
        <rect x="22" y="30" width="36" height="58" rx="5" class="art-fill" />
        <rect x="62" y="30" width="36" height="58" rx="5" class="art-fill" />
        <path d="M22 35a5 5 0 0 1 5-5h31v58H27a5 5 0 0 1-5-5z" class="art-stroke" />
        <path d="M98 35a5 5 0 0 0-5-5H62v58h31a5 5 0 0 0 5-5z" class="art-stroke" />
        <path d="M60 30v58" class="art-stroke" />
        <path d="M32 46h18M32 56h18M32 66h11" class="art-line" />
        <rect x="70" y="42" width="20" height="7" rx="3.5" class="art-solid" />
        <path d="M70 60h16M70 70h12" class="art-line" />
        <circle cx="92" cy="26" r="9" class="art-fill" />
        <path d="M92 22v8M88 26h8" class="art-stroke" />
      </g>

      <!-- ─── 搜索：放大镜里是空列表 ─── -->
      <g v-else-if="variant === 'search'">
        <circle cx="52" cy="50" r="24" class="art-fill" />
        <circle cx="52" cy="50" r="24" class="art-stroke" />
        <path d="M69 67l16 16" class="art-stroke art-stroke--thick" />
        <path d="M42 43h20M42 51h20M42 59h13" class="art-line" />
        <circle cx="92" cy="30" r="8" class="art-fill" />
        <path d="M92 27.5v2.5M92 32h.01" class="art-stroke" />
      </g>

      <!-- ─── 账户：银行卡 + 硬币 ─── -->
      <g v-else-if="variant === 'wallet'">
        <rect x="18" y="42" width="56" height="38" rx="7" class="art-fill" />
        <rect x="18" y="42" width="56" height="38" rx="7" class="art-stroke" />
        <rect x="27" y="52" width="14" height="10" rx="2.5" class="art-solid" />
        <path d="M27 72h20" class="art-line" />
        <circle cx="83" cy="52" r="14" class="art-fill" />
        <circle cx="83" cy="52" r="14" class="art-stroke" />
        <path d="M83 46v12M79.5 49.5h7M79.5 54.5h7" class="art-line" />
        <path d="M20 92h80" class="art-dash" />
      </g>

      <!-- ─── 规则：漏斗，上面散落、下面收拢 ─── -->
      <g v-else-if="variant === 'rule'">
        <path d="M30 34h60l-22 26v20l-16 10V60z" class="art-fill" />
        <path d="M30 34h60l-22 26v20l-16 10V60z" class="art-stroke" />
        <path d="M40 26h40" class="art-dash" />
        <circle cx="34" cy="24" r="4" class="art-solid" />
        <circle cx="50" cy="20" r="4" class="art-solid" />
        <circle cx="68" cy="24" r="4" class="art-solid" />
        <path d="M52 100h16" class="art-stroke" />
      </g>

      <!-- ─── 周期账单：循环箭头 + 日历 ─── -->
      <g v-else-if="variant === 'recurring'">
        <path d="M84 36a30 30 0 1 0 6 22" class="art-stroke" />
        <path d="M84 30v12h12" class="art-stroke" />
        <rect x="44" y="44" width="32" height="30" rx="5" class="art-fill" />
        <rect x="44" y="44" width="32" height="30" rx="5" class="art-stroke" />
        <path d="M44 54h32" class="art-stroke" />
        <path d="M53 40v6M67 40v6" class="art-stroke" />
        <path d="M52 63h6M52 69h10" class="art-line" />
      </g>

      <!-- ─── 图表：虚线柱 + 基线（数据不足） ─── -->
      <g v-else>
        <path d="M28 66v16M46 54v28M64 72v10M82 46v36" class="art-dash art-dash--bar" />
        <rect x="22" y="62" width="12" height="20" rx="3" class="art-fill" />
        <rect x="40" y="50" width="12" height="32" rx="3" class="art-fill" />
        <rect x="58" y="68" width="12" height="14" rx="3" class="art-fill" />
        <rect x="76" y="42" width="12" height="40" rx="3" class="art-fill" />
        <path d="M22 62v-4a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4" class="art-stroke" />
        <path d="M40 50v-4a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4" class="art-stroke" />
        <path d="M58 68v-4a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4" class="art-stroke" />
        <path d="M76 42v-4a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4" class="art-stroke" />
        <path d="M18 86h84" class="art-stroke" />
      </g>
    </svg>

    <p class="empty-title">
      {{ title }}
    </p>
    <p v-if="desc" class="empty-desc">
      {{ desc }}
    </p>

    <!-- 行动按钮（"记第一笔" / "清空筛选" / "去账户管理"…） -->
    <div v-if="$slots.default" class="empty-action">
      <slot />
    </div>
  </div>
</template>

<style scoped lang="scss">
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 32px 16px;
  text-align: center;

  &--sm {
    padding: 20px 12px;
    gap: 2px;
  }
}

.empty-art {
  width: 112px;
  height: 112px;
  margin-bottom: 8px;

  .empty-state--sm & {
    width: 80px;
    height: 80px;
    margin-bottom: 4px;
  }
}

/* ─── 插画色板：三色，全部走 token（暗色自动跟随）─────────────── */
.art-stroke {
  stroke: var(--lz-primary-400);
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;

  &--thick {
    stroke-width: 4;
  }
}

.art-line {
  stroke: var(--lz-primary-400);
  stroke-width: 2;
  stroke-linecap: round;
  opacity: 0.55;
}

.art-fill {
  fill: rgb(var(--lz-primary-rgb) / 12%);
}

.art-solid {
  fill: var(--lz-primary-400);
  opacity: 0.75;
}

.art-dash {
  stroke: var(--lz-border);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-dasharray: 4 5;

  &--bar {
    stroke: var(--lz-primary-400);
    opacity: 0.4;
  }
}

.empty-title {
  margin: 0;
  color: var(--lz-text-primary);
  font-size: 15px;
  font-weight: 600;

  .empty-state--sm & {
    font-size: 14px;
  }
}

.empty-desc {
  margin: 0;
  max-width: 320px;
  color: var(--lz-text-secondary);
  font-size: 13px;
  line-height: 1.6;

  .empty-state--sm & {
    font-size: 12px;
  }
}

.empty-action {
  margin-top: 10px;
}
</style>
