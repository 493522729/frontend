<script setup lang="ts">
/**
 * 注册页 · 拼装入口
 * ====================================================================
 * 复用登录页的 BrandPanel（保持品牌一致性），右侧表单换成注册表单。
 * 移动端折叠规则和登录页保持一致（< 992px 上下布局）。
 */
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/modules/app'
import BrandPanel from '@/views/auth/login/components/BrandPanel.vue'
import RegisterPanel from './components/RegisterPanel.vue'

const route = useRoute()
const router = useRouter()
const app = useAppStore()

/** 移动端检测 */
const isCompact = ref(false)
function checkCompact() {
  isCompact.value = window.innerWidth < 992
}
onMounted(() => {
  checkCompact()
  window.addEventListener('resize', checkCompact)
})

/** 注册成功：跳到登录前的目标页或首页 */
function onRegisterSuccess() {
  const r = route.query.redirect
  const target = typeof r === 'string' && r !== '/' ? r : '/'
  router.replace(target)
}

/** 切回登录页（保留原 redirect） */
function onSwitchToLogin() {
  router.replace({ path: '/login', query: route.query })
}
</script>

<template>
  <div class="login-page" :class="{ 'is-compact': isCompact }">
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

    <div class="split">
      <section class="split-left">
        <BrandPanel />
      </section>

      <section class="split-right">
        <div class="form-card">
          <header class="form-head">
            <h2 class="form-title">
              创建账号
            </h2>
            <p class="form-sub">
              注册成功后将自动登录，开始你的记账之旅
            </p>
          </header>

          <RegisterPanel
            @success="onRegisterSuccess"
            @switch-to-login="onSwitchToLogin"
          />

          <footer class="form-foot">
            注册即代表您同意 <a href="#terms" class="foot-link" @click.prevent>《服务条款》</a>
            和 <a href="#privacy" class="foot-link" @click.prevent>《隐私协议》</a>
          </footer>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 复用登录页的样式 —— 与 login/index.vue 保持视觉一致 */
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
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  border-radius: 10px;
  color: var(--lz-text-regular);
  cursor: pointer;
  @include transition-paint();
  box-shadow: 0 4px 12px -4px rgba(0, 0, 0, 0.04);

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

  :global(html.dark) & {
    background: rgba(255, 255, 255, 0.04);
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
  background:
    radial-gradient(circle at 50% 0%, rgb(var(--lz-primary-rgb) / 5%), transparent 50%),
    var(--lz-bg-card);

  :global(html.dark) & {
    background:
      radial-gradient(circle at 50% 0%, rgb(var(--lz-primary-rgb) / 7%), transparent 50%),
      var(--lz-bg-page);
  }
}

.form-card {
  width: 100%;
  max-width: 420px;
  padding: 32px;
  border-radius: 20px;
  background: var(--lz-bg-card);
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
    background: rgba(20, 28, 45, 0.6);
    backdrop-filter: blur(8px);
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

.form-foot {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px dashed var(--lz-border);
  text-align: center;
  font-size: 12px;
  color: var(--lz-text-placeholder);
}

.foot-link {
  color: var(--lz-primary-600);
  text-decoration: none;

  &:hover {
    color: var(--lz-primary-700);
  }
}

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
