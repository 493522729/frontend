<script setup lang="ts">
/**
 * 左侧品牌面板
 * ====================================================================
 * 视觉布局：
 *   ┌─ 顶部 ─┐
 *   │ Logo + 名字 │
 *   ├─ 中间 ─┤
 *   │ 大字标题（3 列断行 + 渐变色）│
 *   │ 副标题       │
 *   │           │
 *   │ 4 特性（2×2 grid）       │
 *   ├─ 底部 ─┤
 *   │ 版权 + 小字 │
 *   └─────┘
 *
 * 视觉细节：
 *   - **深色底**（primary-900 → 700 晨雾蓝深阶）+ 装饰几何（左下/右上浮动 SVG）
 *   - 装饰「光斑」用 float 动画（架构文档 4.2）
 *
 * 配色定案（2026-09-11 老赵拍板，方案 C）：
 *   登录页左侧品牌区原来用 #5288ff→#7d5fff 蓝紫渐变，与全站晨雾蓝两套色并存。
 *   现改为「同色系深底」—— 仍是晨雾蓝（primary-900/800/700），但深底一压，
 *   登录页既有独立气质，又不引入第二个色系。
 *   附带收益：**不再需要 is-dark 分支**，深浅模式共用一套深底（本来就该如此：
 *   品牌区是"海报"，不是"内容区"，不该跟着主题明暗来回变）。
 */
interface Feature {
  icon: string // SVG innerHTML path
  title: string
  desc: string
}

const features: Feature[] = [
  {
    icon: 'M3 12h4l3-9 4 18 3-9h4',
    title: '实时同步',
    desc: '多端数据秒级一致',
  },
  {
    icon: 'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4',
    title: '智能分类',
    desc: '自动识别收支流向',
  },
  {
    icon: 'M9 17V4l11 13H9',
    title: '多端协同',
    desc: '桌面 + 移动无缝',
  },
  {
    icon: 'M12 1l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
    title: '安全保障',
    desc: '端到端加密 + 审计',
  },
]
</script>

<template>
  <aside class="brand-panel">
    <!-- 装饰：径向光斑 + 流动 SVG -->
    <div class="bg-glow bg-glow--1" aria-hidden="true" />
    <div class="bg-glow bg-glow--2" aria-hidden="true" />

    <!-- 网格底纹 -->
    <svg class="bg-grid" viewBox="0 0 400 800" aria-hidden="true">
      <defs>
        <pattern id="grid-pattern" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.08" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid-pattern)" />
    </svg>

    <!-- 浮动几何：左下大圆 + 右上矩形 -->
    <svg class="float-shape shape-circle" viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="80" stroke="currentColor" stroke-width="1" fill="none" opacity="0.12" />
      <circle cx="100" cy="100" r="50" stroke="currentColor" stroke-width="1" fill="none" opacity="0.2" />
    </svg>
    <svg class="float-shape shape-square" viewBox="0 0 200 200" aria-hidden="true">
      <rect x="40" y="40" width="120" height="120" rx="12" stroke="currentColor" stroke-width="1" fill="none" opacity="0.12" transform="rotate(15 100 100)" />
    </svg>

    <header class="brand-head">
      <div class="brand-mark" aria-hidden="true">
        <img src="/logo.png" alt="简账" class="brand-logo-img">
      </div>
      <span class="brand-name">简账</span>
    </header>

    <section class="brand-hero">
      <h1 class="hero-title">
        <span class="line line-1">让每一笔钱</span>
        <span class="line line-2">
          都有迹<em>可循</em>
        </span>
      </h1>
      <p class="hero-subtitle">
        个人 / 家庭 / 小微团队的智能财务管理后台<br>
        一键记账 · 多维报表 · 实时同步
      </p>
    </section>

    <!-- 4 特性 -->
    <section class="brand-features" aria-label="产品特性">
      <article v-for="f in features" :key="f.title" class="feat">
        <div class="feat-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path :d="f.icon" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <div class="feat-text">
          <h3 class="feat-title">
            {{ f.title }}
          </h3>
          <p class="feat-desc">
            {{ f.desc }}
          </p>
        </div>
      </article>
    </section>

    <footer class="brand-foot">
      <p class="version">
        v0.1.0 · 练手项目
      </p>
      <p class="copyright">
        © 2026 简账 · Built with WorkBuddy
      </p>
    </footer>
  </aside>
</template>

<style scoped lang="scss">
.brand-panel {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100vh;
  padding: 64px 56px;
  display: flex;
  flex-direction: column;
  /* 登录页左侧是「海报」品牌区，永远深底，不能随主题 token 的语义反转而变浅。
     因此这里用 SCSS 变量（固定字面色值），而非会随 html.dark 反转的 CSS 变量。
     模板里的 SVG 品牌渐变仍走 CSS 变量，所以把常用的两个浅色档位也锁死。 */
  --lz-primary-300: #{$primary-300};
  --lz-primary-500: #{$primary-500};
  background:
    radial-gradient(ellipse at top left, rgba($primary-500, 0.3), transparent 55%),
    radial-gradient(ellipse at bottom right, rgb(144 180 226 / 26%), transparent 55%),
    linear-gradient(135deg, $primary-900 0%, $primary-800 55%, $primary-700 100%);
  color: #e6eefb;
  overflow: hidden;
  isolation: isolate;
}

/* 光斑：float 制造缓慢漂浮 */
.bg-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  pointer-events: none;
  z-index: 0;

  &--1 {
    top: -120px;
    left: -100px;
    width: 360px;
    height: 360px;
    background: radial-gradient(circle, rgba($primary-500, 0.45), transparent 60%);
    animation: float 9s ease-in-out infinite;
  }

  &--2 {
    bottom: -160px;
    right: -80px;
    width: 420px;
    height: 420px;
    background: radial-gradient(circle, rgb(148 196 234 / 40%), transparent 60%);
    animation: float 11s ease-in-out infinite reverse;
  }
}

@keyframes float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(20px, -30px) scale(1.05); }
}

/* 网格底纹 */
.bg-grid {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  color: $primary-200;
  z-index: 0;
}

/* 浮动几何 */
.float-shape {
  position: absolute;
  z-index: 1;
  pointer-events: none;
  color: $primary-300;
}

.shape-circle {
  bottom: -80px;
  left: -60px;
  width: 240px;
  height: 240px;
  animation: spin 60s linear infinite;
}

.shape-square {
  top: -40px;
  right: -60px;
  width: 200px;
  height: 200px;
  animation: spin 80s linear infinite reverse;
}

@keyframes spin {
  to { transform: rotate(1turn); }
}

.brand-head {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 64px;
}

.brand-mark {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;

  .brand-logo-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
}

.brand-name {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.04em;
  opacity: 0.92;
}

.brand-hero {
  position: relative;
  z-index: 2;
  margin-bottom: 48px;
}

.hero-title {
  margin: 0 0 24px;
  font-size: 60px;
  line-height: 1.05;
  font-weight: 800;
  letter-spacing: -0.04em;

  .line {
    display: block;
    background: linear-gradient(120deg, #f2f7fc 0%, #ffffff 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  /* 优先级必须高过 .line，才能覆盖透明填充。
     深底上用 primary-300（浅蓝）做强调，保证与白字有足够对比又不刺眼 */
  .line-2 em {
    font-style: normal;
    color: $primary-300;
    -webkit-text-fill-color: $primary-300;
    background: none;
    -webkit-background-clip: initial;
    background-clip: initial;
  }
}

.hero-subtitle {
  margin: 0;
  font-size: 16px;
  line-height: 1.7;
  opacity: 0.78;
  letter-spacing: 0.02em;
  max-width: 480px;
}

.brand-features {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px 28px;
  margin-bottom: 64px;
  max-width: 520px;
}

.feat {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 0;
  transition: transform var(--lz-duration-slow);
}

.feat:hover {
  transform: translateX(4px);
}

.feat-icon {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: rgb(255 255 255 / 10%);
  border: 1px solid rgb(255 255 255 / 14%);
  color: $primary-200;
  flex-shrink: 0;
  @include transition-paint(var(--lz-duration-slow));

  svg {
    width: 18px;
    height: 18px;
  }
}

.feat:hover .feat-icon {
  background: linear-gradient(135deg, $primary-400, $primary-600);
  color: #fff;
  transform: scale(1.06);
  border-color: transparent;
}

.feat-title {
  margin: 0 0 2px;
  font-size: 14px;
  font-weight: 600;
}

.feat-desc {
  margin: 0;
  font-size: 12.5px;
  opacity: 0.65;
  letter-spacing: 0.01em;
}

.brand-foot {
  position: relative;
  z-index: 2;
  margin-top: auto;
  font-size: 12px;
  opacity: 0.6;
  line-height: 1.7;

  p {
    margin: 0;
  }
}

.version {
  font-weight: 500;
}

@media (max-width: 992px) {
  .brand-panel {
    padding: 32px 28px 16px;
    min-height: 280px;
    height: auto;
  }

  .hero-title {
    font-size: 36px;
  }

  .hero-subtitle {
    font-size: 14px;
  }

  .brand-features {
    grid-template-columns: 1fr 1fr;
    gap: 12px 16px;
    margin-bottom: 32px;
  }

  .brand-head {
    margin-bottom: 24px;
  }
}
</style>
