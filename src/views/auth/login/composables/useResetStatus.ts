/**
 * 忘记密码 —— 重置二维码状态机 composable
 * ====================================================================
 * 封装「重置会话」的生命周期（仿 useScanStatus）：
 *   - createResetQr()：生成一次性重置二维码（qrId + 二维码内容）
 *   - 每秒本地倒计时（视觉主导）
 *   - 每 2s 轮询后端状态：waiting → confirmed
 *   - confirmed 时回调业务层（让弹窗切换到「设新密码」表单）
 *   - 剩余归零时回调 expired
 * 组件卸载时自动清理定时器。
 */
import type { Ref } from 'vue'
import type { ResetState } from '@/api/modules/auth'
import { onUnmounted, ref, watch } from 'vue'
import { createResetQr, pollResetQr } from '@/api/modules/auth'

export type ResetStatus = ResetState['status']

export interface UseResetStatusReturn {
  status: Ref<ResetStatus>
  /** 二维码图片（dataURL / mock 文本），仅用于渲染 */
  qrValue: Ref<string>
  /** 重置会话 id（ticket），提交新密码时传给后端，千万别传成 qrValue */
  qrId: Ref<string>
  remaining: Ref<number>
  total: Ref<number>
  refresh: () => Promise<void>
  destroy: () => void
}

export interface UseResetStatusOptions {
  onConfirmed?: () => void
  onExpired?: () => void
}

export function useResetStatus(opts: UseResetStatusOptions = {}): UseResetStatusReturn {
  const status = ref<ResetStatus>('waiting')
  const qrValue = ref('')
  const remaining = ref(0)
  const total = ref(0)

  let pollTimer: ReturnType<typeof setInterval> | null = null
  let countTimer: ReturnType<typeof setInterval> | null = null
  const currentQrId = ref<string>('')

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

  function destroy() {
    // 重置会话无 cancel 接口：服务端靠 TTL（15 分钟）或一次性消费自动失效，无需客户端撤销
    stopTimers()
    currentQrId.value = ''
  }

  async function refresh() {
    destroy()
    status.value = 'waiting'
    const sess = await createResetQr()
    currentQrId.value = sess.qrId
    qrValue.value = sess.qrCodeDataUrl
    total.value = sess.expiresIn
    remaining.value = sess.expiresIn

    countTimer = setInterval(() => {
      if (remaining.value > 0) {
        remaining.value--
        if (remaining.value === 0) {
          status.value = 'expired'
          stopTimers()
          opts.onExpired?.()
        }
      }
    }, 1000)

    pollTimer = setInterval(async () => {
      if (!currentQrId.value)
        return
      try {
        const state = await pollResetQr(currentQrId.value)
        status.value = state.status
        if (state.status === 'confirmed') {
          stopTimers()
          opts.onConfirmed?.()
        }
        else if (state.status === 'expired') {
          stopTimers()
          opts.onExpired?.()
        }
      }
      catch {
        /* 网络抖动：保持当前状态静默 */
      }
    }, 2000)
  }

  watch(status, (now, prev) => {
    if (now === 'expired' && prev !== 'expired')
      opts.onExpired?.()
  })

  onUnmounted(destroy)

  return { status, qrValue, qrId: currentQrId, remaining, total, refresh, destroy }
}
