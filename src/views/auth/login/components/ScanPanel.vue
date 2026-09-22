<script setup lang="ts">
import { useMessage } from 'naive-ui'
/**
 * 微信扫码登录面板 —— 4 态切换
 * ====================================================================
 * 状态机演示（真接口时由后端维护，前端订阅即可）：
 *
 *   waiting   ──用户扫了码──▶  scanned  ──用户在手机上点确认──▶  confirmed
 *      │                        │                                   │
 *      │ > expiresIn 秒          │ > expiresIn 秒                    │
 *      ▼                        ▼                                   ▼
 *   expired (点刷新回到 waiting)
 *
 * 视觉要点：
 *   - 二维码背后放「扫描线」（CSS 动画上下扫，给等待态加分）
 *   - 状态切换时整层淡入淡出 + 缩放，4 个层级视觉清晰
 *   - 倒计时环放在右上角（与 QRPlaceholder 同源，方便集成）
 */
import { computed, watch } from 'vue'
import { WECHAT_SCAN_ENABLED } from '@/api/modules/auth'
import { useAuthStore } from '@/stores/modules/auth'
import { useScanStatus } from '../composables/useScanStatus'
import ScanCountdown from './ScanCountdown.vue'

const props = defineProps<{
  /** 当前 Tab 是否激活；只有真正可见时才开始轮询，防止 hidden Tab 自动 mock 登录 */
  active: boolean
}>()

const emit = defineEmits<{
  /** 扫码登录成功（含 token 已写入 store）；父级统一处理跳转 */
  (e: 'success'): void
  /** 用户点了「使用账号登录」切到账号 Tab */
  (e: 'switchTab'): void
}>()

const auth = useAuthStore()
const message = useMessage()

const scan = useScanStatus({
  onConfirmed: async (state) => {
    if (!state.tokens) {
      console.error('[scan] 后端返回 confirmed 但缺少 tokens，跳过自动登录')
      message.error('登录状态异常，请刷新二维码重试')
      return
    }
    await auth.loginByScan(state.tokens.accessToken, state.tokens.refreshToken)
    message.success('扫码登录成功，欢迎回来！', { duration: 1500 })
    // 延迟 400ms 让用户看到「登录成功」反馈再切走
    setTimeout(emit, 400, 'success')
  },
  onExpired: () => {
    message.warning('二维码已过期，正在准备新的二维码', { duration: 1800 })
  },
})

/** 后端返回的是真实小程序码（data:image/png;base64…）时直接用 <img> 渲染；否则展示本地小程序码图片 */
const isRealQr = computed(() => scan.qrValue.value.startsWith('data:image'))

/**
 * 是否处于「等待后端返回二维码」的加载态：
 * 真实微信扫码链路（WECHAT_SCAN_ENABLED）下，后端可能尚未返回小程序码
 * （或压根没有配置小程序登录），此时展示加载占位而非误导性的静态演示码。
 * mock 模式（本地演示）保留静态演示码以完整演示 4 态状态机。
 */
const showQrLoading = computed(() => WECHAT_SCAN_ENABLED && !isRealQr.value)

/** Tab 激活时才创建会话；切走/卸载时销毁，避免账号 Tab 下 hidden 扫码面板自动登录 */
watch(
  () => props.active,
  (isActive, wasActive) => {
    if (isActive) {
      scan.refresh()
    }
    else if (wasActive) {
      scan.destroy()
    }
  },
  { immediate: true },
)

/** 手动刷新：点「点击刷新」按钮 */
async function manualRefresh() {
  await scan.refresh()
}
</script>

<template>
  <div class="scan-panel">
    <!-- 顶部状态描述 -->
    <p class="scan-hint" :class="{ 'is-active': scan.status.value === 'waiting' }">
      <span v-if="showQrLoading">
        正在获取登录二维码，请稍候…
      </span>
      <span v-else-if="scan.status.value === 'waiting'">
        二维码已就绪，打开 <b>微信</b> 扫一扫，扫码后请在手机端确认登录
      </span>
      <span v-else-if="scan.status.value === 'scanned'">
        已扫码，请在 <b>手机上点击确认</b>
      </span>
      <span v-else-if="scan.status.value === 'confirmed'">
        登录成功，正在跳转...
      </span>
      <span v-else>
        二维码已过期
      </span>
    </p>

    <!-- 二维码区 -->
    <div class="qr-wrap" :class="`is-${scan.status.value}`">
      <img v-if="isRealQr" :src="scan.qrValue.value" class="real-qr" alt="微信扫码登录">
      <!-- mock/演示模式：保留静态演示码以演示状态机 -->
      <img v-else-if="!showQrLoading" src="/scan-qr.jpg" class="real-qr" alt="微信扫码登录">
      <!-- 真实链路但后端尚未返回小程序码：加载占位（此时扫码不可能成功，不能放可扫的假码） -->
      <div v-else class="qr-loading" aria-live="polite">
        <n-spin :size="36" />
        <p>正在获取二维码…</p>
      </div>

      <!-- 倒计时环（等待态 / 已扫描态 / 确认中态 持续显示；过期态与加载态隐藏） -->
      <div v-if="!showQrLoading && scan.status.value !== 'expired'" class="countdown-badge">
        <ScanCountdown
          :total-seconds="scan.total.value"
          :remaining-seconds="scan.remaining.value"
          :size="36"
        />
      </div>

      <!-- 扫描线动画：仅 waiting 且有码时显示 -->
      <div v-if="scan.status.value === 'waiting' && !showQrLoading" class="scan-line" aria-hidden="true" />

      <!-- 三种状态蒙层：transition 切换 -->
      <Transition name="scan-overlay" mode="out-in">
        <!-- 已扫码：绿色蒙层 + 描边 + 大对勾 -->
        <div v-if="scan.status.value === 'scanned'" key="scanned" class="overlay overlay-scanned">
          <div class="overlay-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="11" stroke="currentColor" stroke-width="1.5" fill="rgba(255,255,255,.86)" />
              <path d="M7 12.5l3.5 3.5L17 9" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
          <p>已扫码，请在手机上点击确认</p>
        </div>

        <!-- 已确认：渐变蒙层 + 光环 -->
        <div v-else-if="scan.status.value === 'confirmed'" key="confirmed" class="overlay overlay-confirmed">
          <div class="confirmed-rays" aria-hidden="true" />
          <div class="overlay-icon big">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="11" stroke="currentColor" stroke-width="1.5" fill="rgba(255,255,255,.96)" />
              <path d="M7 12.5l3.5 3.5L17 9" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
          <p>登录成功</p>
        </div>

        <!-- 已过期：灰色蒙层 + 提示 -->
        <div v-else-if="scan.status.value === 'expired'" key="expired" class="overlay overlay-expired">
          <div class="overlay-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="11" stroke="currentColor" stroke-width="1.5" fill="rgba(245,245,245,.94)" />
              <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
            </svg>
          </div>
          <p class="expired-text">
            二维码已失效
          </p>
          <button class="refresh-btn" @click="manualRefresh">
            <svg viewBox="0 0 24 24" class="refresh-icon" aria-hidden="true">
              <path d="M4 12a8 8 0 0 1 14-5.3L20 4M20 12a8 8 0 0 1-14 5.3L4 20" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" />
              <path d="M20 4v4h-4M4 20v-4h4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span>点击刷新</span>
          </button>
        </div>
      </Transition>
    </div>

    <!-- 切换到账号登录的提示 -->
    <p class="footer-hint">
      没有账号？
      <a class="footer-link" href="#tab-account" @click.prevent="$emit('switchTab')">
        使用账号登录
      </a>
      或
      <a class="footer-link" href="#help" @click.prevent>联系管理员</a>
    </p>
  </div>
</template>

<style scoped lang="scss">
.scan-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding-top: 4px;
}

.scan-hint {
  margin: 0;
  font-size: 14px;
  color: var(--lz-text-secondary);
  text-align: center;
  line-height: 1.6;
  letter-spacing: 0.01em;
  transition: color var(--lz-duration-base);

  b {
    color: var(--lz-primary-600);
    font-weight: 600;
  }

  &.is-active {
    color: var(--lz-text-regular);
  }
}

.qr-wrap {
  position: relative;
  width: 220px;
  height: 220px;
  padding: 16px;
  border-radius: 16px;
  // 等宽数字用，确保不同尺寸二维码不偏移
  display: grid;
  place-items: center;
  isolation: isolate; // 让 z-index 在内部相对稳定
}

/** 真实小程序码：后端返回 data:image/png;base64，按 188×188 渲染（与 qr-wrap 内框同尺寸） */
.real-qr {
  width: 188px;
  height: 188px;
  border-radius: 12px;
  background: #fff;
  display: block;
  user-select: none;
}

/** 真实链路下等待后端返回小程序码的加载占位 */
.qr-loading {
  width: 188px;
  height: 188px;
  border-radius: 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;

  p {
    margin: 0;
    font-size: 13px;
    color: var(--lz-text-secondary);
  }
}

.countdown-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 4;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 999px;
  padding: 2px;
  box-shadow: 0 4px 12px -4px rgb(var(--lz-primary-rgb) / 20%);
  backdrop-filter: blur(8px);
}

/**
 * 扫描线：横向 1px 的红色（学微信）+ 渐变透明 + 上下扫动画
 * 只在 waiting 出现，营造「这是一张活的二维码」的微妙反馈
 */
.scan-line {
  position: absolute;
  left: 16px;
  right: 16px;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgb(var(--lz-primary-rgb) / 60%) 30%,
    var(--lz-danger) 50%,
    rgb(var(--lz-primary-rgb) / 60%) 70%,
    transparent 100%
  );
  box-shadow: 0 0 12px rgba(245, 63, 63, 0.4);
  z-index: 3;
  pointer-events: none;
  animation: scanline-move 2.8s cubic-bezier(0.5, 0, 0.5, 1) infinite;
}

@keyframes scanline-move {
  0% {
    top: 16px;
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  90% {
    opacity: 1;
  }
  100% {
    top: calc(100% - 16px);
    opacity: 0;
  }
}

/** 三种蒙层共享基础 */
.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  border-radius: 16px;
  padding: 16px;
  text-align: center;
  z-index: 5;
  font-size: 13px;
  font-weight: 500;
}

/* 蒙层压在黑白二维码图上，且 --lz-success-rgb 只在暗色主题定义（亮色下整条失效变透明，
   白字直接叠在码上不可读）——这里用固定微信绿实底，不随主题/收支色切换 */
.overlay-scanned {
  background: rgba(7, 193, 96, 0.94);
  color: #fff;
  backdrop-filter: blur(4px);
  box-shadow: 0 0 0 4px rgba(7, 193, 96, 0.2);

  svg {
    width: 48px;
    height: 48px;
    color: #fff;
  }

  p {
    margin: 0;
    color: #fff;
  }
}

.overlay-confirmed {
  background: linear-gradient(135deg, rgba(7, 193, 96, 0.97), rgba(37, 143, 220, 0.95));
  color: #fff;
  font-size: 14px;

  p {
    margin: 0;
    color: #fff;
    font-weight: 600;
    font-size: 14px;
  }

  svg {
    width: 56px;
    height: 56px;
    color: #fff;
  }
}

/** 已确认的光环：用 SVG 的 gradient stroke 营造「确认成功」的仪式感 */
.confirmed-rays {
  position: absolute;
  inset: -16px;
  border-radius: 32px;
  background: conic-gradient(
    from 0deg,
    rgba(255, 255, 255, 0.0),
    rgba(255, 255, 255, 0.5),
    rgba(255, 255, 255, 0.0)
  );
  filter: blur(8px);
  opacity: 0.4;
  z-index: -1;
  animation: rays-spin 2.4s linear infinite;
}

@keyframes rays-spin {
  to {
    transform: rotate(1turn);
  }
}

.overlay-icon {
  position: relative;

  svg {
    width: 48px;
    height: 48px;
  }
}

.overlay-icon.big svg {
  width: 56px;
  height: 56px;
}

.overlay-expired {
  background: rgba(245, 245, 245, 0.94);
  color: var(--lz-text-regular);
  backdrop-filter: blur(4px);

  svg {
    color: var(--lz-text-placeholder);
  }
}

.expired-text {
  margin: 4px 0 0;
  color: var(--lz-text-secondary);
}

.refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  padding: 6px 14px;
  border: 1px solid var(--lz-border);
  border-radius: 999px;
  background: var(--lz-bg-card);
  color: var(--lz-text-regular);
  font-size: 13px;
  cursor: pointer;
  @include transition-paint();

  .refresh-icon {
    width: 14px;
    height: 14px;
  }

  &:hover {
    color: var(--lz-primary-600);
    border-color: var(--lz-primary-600);
    transform: translateY(-1px);
  }
}

/* 状态切换 transition */
.scan-overlay-enter-active,
.scan-overlay-leave-active {
  transition: opacity var(--lz-duration-base), transform var(--lz-duration-base) cubic-bezier(0.34, 1.56, 0.64, 1);
}

.scan-overlay-enter-from {
  opacity: 0;
  transform: scale(0.94);
}

.scan-overlay-leave-to {
  opacity: 0;
  transform: scale(1.04);
}

.footer-hint {
  margin: 0;
  font-size: 13px;
  color: var(--lz-text-secondary);
  text-align: center;
  line-height: 1.6;
}

.footer-link {
  color: var(--lz-primary-600);
  text-decoration: none;
  font-weight: 500;
  margin: 0 2px;
  cursor: pointer;
  transition: color var(--lz-duration-base);

  &:hover {
    color: var(--lz-primary-700);
  }
}
</style>
