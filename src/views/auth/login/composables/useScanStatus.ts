/**
 * 微信扫码登录 —— 状态机 composable
 * ====================================================================
 * 封装「扫码会话」的全部生命周期：
 *   - createScanSession()：创建新的会话拿到 qrId + 过期时间
 *   - 每秒本地倒计时（视觉主导，不依赖网络往返）
 *   - 每 2s 向后端轮询一次扫码状态（真接口 SSE/WebSocket 时直接订阅）
 *   - 收到 confirmed 时回调业务层；剩余归零时回调 expired
 *   - 组件卸载时自动清理所有定时器 + 通知后端取消会话
 */
import type { Ref } from 'vue'
import type { ScanState } from '@/api/modules/auth'
import { onUnmounted, ref, watch } from 'vue'
import {
  cancelScanSession,
  createScanSession,
  pollScanSession,
} from '@/api/modules/auth'

export type ScanStatus = ScanState['status']

export interface UseScanStatusReturn {
  /** 当前状态：waiting / scanned / confirmed / expired */
  status: Ref<ScanStatus>
  /** 二维码内容：mock 这里是 qrId，真接口是 dataURL / imageURL */
  qrValue: Ref<string>
  /** 倒计时剩余秒数 */
  remaining: Ref<number>
  /** 总秒数（默认 120s） */
  total: Ref<number>
  /** CONFIRMED 时附带的 token，会被登录页写入 store */
  tokens: Ref<ScanState['tokens']>
  /** 触发一次完整刷新（重建会话） */
  refresh: () => Promise<void>
  /** 主动销毁 + 取消会话 */
  destroy: () => void
}

export interface UseScanStatusOptions {
  /** 状态变为 confirmed 时回调 */
  onConfirmed?: (state: ScanState) => void
  /** 二维码过期时回调 */
  onExpired?: () => void
}

export function useScanStatus(
  opts: UseScanStatusOptions = {},
): UseScanStatusReturn {
  const status = ref<ScanStatus>('waiting')
  const qrValue = ref('')
  const remaining = ref(0)
  const total = ref(0)
  const tokens = ref<ScanState['tokens']>()

  let pollTimer: ReturnType<typeof setInterval> | null = null
  let countTimer: ReturnType<typeof setInterval> | null = null
  let currentQrId: string | null = null

  /** 关闭所有定时器（会话结束时调用） */
  function stopTimers() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    if (countTimer) {
      clearInterval(countTimer)
      countTimer = null
    }
  }

  /** 主动销毁 */
  function destroy() {
    if (currentQrId) {
      // 用 void + .catch 吃掉 reject，避免在 SPA 切走时 unhandled rejection
      cancelScanSession(currentQrId).catch(() => {})
    }
    stopTimers()
    currentQrId = null
  }

  /** 创建 / 刷新一次会话 */
  async function refresh() {
    // 先清理上一次会话
    destroy()

    // status 临时先回到 waiting 给 UI 反馈（不让上一帧的 expired 蒙层闪烁）
    status.value = 'waiting'
    tokens.value = undefined

    const sess = await createScanSession()
    currentQrId = sess.qrId
    qrValue.value = sess.qrCodeDataUrl
    total.value = sess.expiresIn
    remaining.value = sess.expiresIn

    // 本地倒计时：每秒减一，归零时把状态置为 expired
    countTimer = setInterval(() => {
      if (remaining.value > 0) {
        remaining.value--
        if (remaining.value === 0) {
          status.value = 'expired'
          opts.onExpired?.()
        }
      }
    }, 1000)

    // 后端状态轮询：每 2 秒拉一次；CONFIRMED 时立即回调 + 停轮询
    pollTimer = setInterval(async () => {
      if (!currentQrId)
        return
      try {
        const state = await pollScanSession(currentQrId)
        status.value = state.status
        if (state.tokens)
          tokens.value = state.tokens
        if (state.status === 'confirmed') {
          stopTimers()
          opts.onConfirmed?.(state)
        }
      }
      catch {
        // 网络抖动：保持当前状态静默，不打断用户
      }
    }, 2000)
  }

  // status 变化时的兜底回调（让外部也能响应式地看到状态变化）
  watch(status, (now, prev) => {
    if (now === 'expired' && prev !== 'expired')
      opts.onExpired?.()
  })

  onUnmounted(destroy)

  return {
    status,
    qrValue,
    remaining,
    total,
    tokens,
    refresh,
    destroy,
  }
}
