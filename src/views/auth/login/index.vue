<script setup lang="ts">
/**
 * 登录主页 —— 拼装入口
 * ====================================================================
 * - 左侧 BrandPanel（品牌 + 特性）
 * - 右侧 FormCard：Naive UI 的 n-tabs 切换「账号密码 / 微信扫码」
 * - 顶部右上角：暗色模式开关
 * - 响应式：< 992px 折叠为上下布局
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import IcpFooter from '@/components/business/icp-footer/index.vue'
import { useAppStore } from '@/stores/modules/app'
import AccountPanel from './components/AccountPanel.vue'
import BrandPanel from './components/BrandPanel.vue'
import ScanPanel from './components/ScanPanel.vue'

type TabKey = 'account' | 'scan'

const route = useRoute()
const router = useRouter()
const app = useAppStore()

/** 当前激活的 Tab，默认账号密码 */
const activeTab = ref<TabKey>('account')

/** 移动端检测：< 992 折叠为上下布局 */
const isCompact = ref(false)
function checkCompact() {
  isCompact.value = window.innerWidth < 992
}
onMounted(() => {
  checkCompact()
  window.addEventListener('resize', checkCompact)
})

/** 登录成功统一处理：跳到原目标或首页 */
const redirectTarget = computed<string>(() => {
  const r = route.query.redirect
  return typeof r === 'string' && r !== '/' ? r : '/'
})

async function onLoginSuccess() {
  await new Promise(r => setTimeout(r, 600)) // 让动画走完
  router.replace(redirectTarget.value)
}

/** 跳到注册页（保留 redirect 参数，注册成功能跳回来） */
function onGoRegister() {
  router.replace({ path: '/register', query: route.query })
}
</script>

<template>
  <div class="login-page" :class="{ 'is-compact': isCompact }">
    <!-- 顶部右侧操作栏：暗色切换 -->
    <button
      class="theme-toggle"
      :title="app.isDark ? '切到亮色' : '切到暗色'"
      :aria-label="app.isDark ? '切换到亮色模式' : '切换到暗色模式'"
      @click="app.toggleDark()"
    >
      <svg v-if="app.isDark" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="5" fill="currentColor" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor" />
      </svg>
    </button>

    <!-- 分屏 -->
    <div class="split">
      <!-- 左侧品牌 -->
      <section class="split-left">
        <BrandPanel />
      </section>

      <!-- 右侧表单 -->
      <section class="split-right">
        <div class="ambient-bg" aria-hidden="true">
          <div class="ambient-blob blob-1" />
          <div class="ambient-blob blob-2" />
          <div class="ambient-blob blob-3" />
        </div>

        <div class="form-card">
          <header class="form-head">
            <h2 class="form-title">
              {{ activeTab === 'account' ? '欢迎回来' : '扫码登录' }}
            </h2>
            <p class="form-sub">
              {{ activeTab === 'account' ? '请使用您的账号继续' : '打开微信扫一扫即可登录' }}
            </p>
          </header>

          <!-- Naive UI Tabs：主题色统一走 primaryColor（晨雾蓝） -->
          <n-tabs
            v-model:value="activeTab"
            type="segment"
            animated
            class="login-tabs"
          >
            <n-tab-pane name="account" tab="账号密码">
              <AccountPanel @success="onLoginSuccess" />
            </n-tab-pane>
            <n-tab-pane name="scan" tab="微信扫码" display-directive="show">
              <ScanPanel :active="activeTab === 'scan'" @success="onLoginSuccess" @switch-tab="activeTab = 'account'" />
            </n-tab-pane>
          </n-tabs>

          <!-- 底部：服务条款 + 跳转注册 -->
          <footer class="form-foot">
            <p class="foot-register">
              还没有账号？<a class="foot-link" @click.prevent="onGoRegister">立即注册</a>
            </p>
            <p class="foot-terms">
              登录即代表您同意 <a href="#terms" class="foot-link" @click.prevent>《服务条款》</a>
              和 <a href="#privacy" class="foot-link" @click.prevent>《隐私协议》</a>
            </p>
          </footer>
        </div>
      </section>
    </div>

    <!-- ICP 备案号：未登录态也必须可见（管局核查要求） -->
    <IcpFooter class="auth-icp" />
  </div>
</template>

<style scoped lang="scss">
.login-page {
  position: relative;
  width: 100%;
  min-height: 100vh;
  background: var(--lz-bg-card);
  overflow: hidden;
}

:global(html.dark) .login-page {
  background: #0d1422;
}

/* 备案页脚：悬浮在分屏底部，不参与布局（避免把 100vh 撑出滚动条） */
.auth-icp {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 5;
  padding: 8px 24px 12px;
}

.theme-toggle {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 10;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid var(--lz-border);
  background: var(--lz-bg-card);
  border-radius: 10px;
  color: var(--lz-text-primary);
  cursor: pointer;
  @include transition-paint();
  box-shadow: var(--lz-shadow-md);

  svg {
    width: 18px;
    height: 18px;
  }

  &:hover {
    border-color: var(--lz-primary-600);
    color: var(--lz-primary-600);
    transform: translateY(-1px);
    box-shadow: 0 8px 24px -6px rgb(var(--lz-primary-rgb) / 30%);
  }
}

.split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 100vh;
}

.split-left {
  position: relative;
}

.split-right {
  position: relative;
  display: grid;
  place-items: center;
  padding: 32px 48px;
  overflow: hidden;
  isolation: isolate;
  background: var(--lz-login-split-bg);
}

.ambient-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.ambient-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(55px);
  transform-origin: center;
}

.blob-1 {
  top: -120px;
  right: -80px;
  width: 440px;
  height: 440px;
  background: var(--lz-login-blob-1);
  animation: float-1 18s ease-in-out infinite;
}

.blob-2 {
  bottom: -60px;
  left: -40px;
  width: 280px;
  height: 280px;
  background: var(--lz-login-blob-2);
  animation: float-2 22s ease-in-out infinite reverse;
}

@keyframes float-1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-30px, 40px) scale(1.05); }
}

@keyframes float-2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(30px, -30px) scale(1.08); }
}

/* 偏置光晕：在卡片背后大幅飘动，不固定正后方，毛玻璃透出流动质感 */
.blob-3 {
  top: 48%;
  left: 52%;
  width: 360px;
  height: 360px;
  margin: -180px 0 0 -180px;
  background: var(--lz-login-blob-3);
  animation: float-3 14s ease-in-out infinite;
}

@keyframes float-3 {
  0%   { transform: translate(-60px, 24px) scale(1); }
  50%  { transform: translate(56px, -36px) scale(1.12); }
  100% { transform: translate(-60px, 24px) scale(1); }
}

.form-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
  padding: 32px;
  border-radius: 20px;
  background: var(--lz-login-card-bg);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  backdrop-filter: blur(20px) saturate(160%);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.5) inset,
    0 24px 48px -16px rgba(82, 136, 255, 0.16),
    0 1px 0 var(--lz-border) inset;
  border: 1px solid var(--lz-border);

  :global(html.dark) & {
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.05) inset,
      0 24px 48px -16px rgba(0, 0, 0, 0.4),
      0 1px 0 rgba(255, 255, 255, 0.05) inset;
  }
}

.form-head {
  margin-bottom: 28px;
  text-align: center;
}

.form-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  color: var(--lz-text-primary);
  letter-spacing: -0.02em;
}

.form-sub {
  margin: 0;
  font-size: 13px;
  color: var(--lz-text-secondary);
  letter-spacing: 0.02em;
}

.login-tabs {
  margin-bottom: 24px;
}

.form-foot {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px dashed var(--lz-border);
  text-align: center;
  font-size: 12px;
  color: var(--lz-text-placeholder);
}

.foot-register {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--lz-text-secondary);
}

.foot-terms {
  margin: 0;
}

.foot-link {
  color: var(--lz-primary-600);
  text-decoration: none;

  &:hover {
    color: var(--lz-primary-700);
  }
}

/* 响应式：< 992px 折叠 */
@media (max-width: 992px) {
  .split {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .split-left {
    min-height: 200px;
  }

  .split-right {
    padding: 16px;
  }

  .form-card {
    padding: 24px;
    border-radius: 16px;
  }

  .form-title {
    font-size: 20px;
  }
}
</style>
