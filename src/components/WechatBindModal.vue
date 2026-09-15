<script setup lang="ts">
/**
 * 微信绑定弹窗（MP-ADR-5 方案 A，账号设置页 / 设置页共用）
 * ====================================================================
 * mode = 'bind'   ：生成「绑定码」小程序码 → 轮询 → 小程序点确认后绑定成功
 * mode = 'unbind' ：输入密码验证后解绑（只清 wxOpenid，账本与流水不动）
 *
 * 绑定成功 / 解绑成功只 emit('success')，由父页面决定怎么刷新用户状态
 * （profile 页 auth.refreshProfile()，settings 页同样）。
 */
import { NButton, NInput, useMessage } from 'naive-ui'
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  cancelScanBindSession,
  createScanBindSession,
  pollScanBindSession,
  unbindWechat,
} from '@/api/modules/auth'

const props = defineProps<{
  show: boolean
  mode: 'bind' | 'unbind'
}>()

const emit = defineEmits<{
  (e: 'update:show', v: boolean): void
  (e: 'success'): void
}>()

const message = useMessage()

// ── 绑定流程 ─────────────────────────────────────────────────
const qrUrl = ref('')
const ticket = ref('')
const loading = ref(false)
const statusText = ref('')
const done = ref(false)
let timer: ReturnType<typeof setInterval> | null = null
// 绑定成功后用于自动收起弹窗的延时器（让父页刷新结果直接呈现，不必再点「完成」）
let closeTimer: ReturnType<typeof setTimeout> | null = null

/** 后端返回的不是 data: 图片时（理论只在极端回落时出现）按 mock 文本展示 */
const isMock = computed(() => Boolean(ticket.value) && !qrUrl.value.startsWith('data:'))

function stopPoll() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function clearCloseTimer() {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
}

async function startBind() {
  if (loading.value)
    return
  loading.value = true
  done.value = false
  statusText.value = ''
  try {
    const res = await createScanBindSession()
    ticket.value = res.qrId
    qrUrl.value = res.qrCodeDataUrl
    statusText.value = isMock.value
      ? '本地未配置微信，无法生成小程序码。请改用小程序内「绑定简账账号」输密码绑定。'
      : '请用微信扫描二维码，在手机上点「确认绑定」'
    if (!isMock.value)
      startPoll(res.qrId)
  }
  catch (err: unknown) {
    message.error(err instanceof Error ? err.message : '生成二维码失败')
  }
  finally {
    loading.value = false
  }
}

function startPoll(qrId: string) {
  stopPoll()
  timer = setInterval(async () => {
    try {
      const state = await pollScanBindSession(qrId)
      if (state.status === 'scanned')
        statusText.value = '已扫码，请在手机上点「确认绑定」'
      if (state.status === 'confirmed') {
        stopPoll()
        done.value = true
        statusText.value = '绑定成功，小程序已可以记账'
        message.success('微信绑定成功')
        emit('success')
        // 1.2s 后自动收起弹窗，让父页刷新后的「已绑定」状态直接呈现，不必再点「完成」
        clearCloseTimer()
        closeTimer = setTimeout(() => {
          if (done.value)
            emit('update:show', false)
        }, 1200)
      }
      if (state.status === 'expired') {
        stopPoll()
        statusText.value = '二维码已过期，请重新生成'
      }
    }
    catch {
      /* 轮询失败不打断，下一轮继续 */
    }
  }, 2000)
}

async function cancelBind() {
  if (ticket.value)
    await cancelScanBindSession(ticket.value).catch(() => {})
  stopPoll()
  qrUrl.value = ''
  ticket.value = ''
  statusText.value = ''
  emit('update:show', false)
}

// ── 解绑流程 ─────────────────────────────────────────────────
const pwd = ref('')
const submitting = ref(false)

async function submitUnbind() {
  if (submitting.value || !pwd.value)
    return
  submitting.value = true
  try {
    await unbindWechat(pwd.value)
    message.success('已解绑微信（账本与流水不受影响）')
    pwd.value = ''
    emit('success')
    emit('update:show', false)
  }
  catch (err: unknown) {
    message.error(err instanceof Error ? err.message : '解绑失败')
  }
  finally {
    submitting.value = false
  }
}

// 弹窗打开时按模式初始化；关闭时清状态
watch(() => props.show, (v) => {
  if (v && props.mode === 'bind')
    startBind()
  if (!v) {
    stopPoll()
    clearCloseTimer()
    qrUrl.value = ''
    ticket.value = ''
    statusText.value = ''
    done.value = false
    pwd.value = ''
  }
})

onUnmounted(() => {
  stopPoll()
  clearCloseTimer()
})

const title = computed(() => (props.mode === 'bind' ? '绑定微信' : '解除微信绑定'))
</script>

<template>
  <NModal
    :show="show"
    preset="dialog"
    :title="title"
    :positive-text="mode === 'bind' ? (done ? '完成' : '取消') : '确认解绑'"
    :negative-text="mode === 'unbind' ? '取消' : undefined"
    :loading="mode === 'bind' ? loading : submitting"
    :positive-button-props="{ type: mode === 'bind' ? 'default' : 'error', disabled: mode === 'unbind' && !pwd }"
    :mask-closable="mode === 'bind' ? !loading : !submitting"
    @update:show="emit('update:show', $event)"
    @positive-click="mode === 'bind' ? cancelBind() : submitUnbind()"
    @negative-click="emit('update:show', false)"
  >
    <!-- 绑定：二维码 + 轮询状态 -->
    <template v-if="mode === 'bind'">
      <div class="wb-qr">
        <div class="wb-qr__box">
          <!-- 生成中：占位骨架，避免空白闪烁 -->
          <span v-if="loading && !qrUrl" class="wb-qr__loading">
            <span class="wb-qr__spinner" />
            正在生成二维码…
          </span>
          <img v-else-if="!isMock" :src="qrUrl" alt="微信绑定二维码" class="wb-qr__img">
          <span v-else class="wb-qr__ticket">{{ ticket }}</span>
        </div>
        <p class="wb-status" :class="{ 'wb-status--done': done }">
          {{ statusText }}
        </p>
        <NButton v-if="!done && !isMock && !loading" size="tiny" tertiary @click="startBind">
          刷新二维码
        </NButton>
      </div>
    </template>

    <!-- 解绑：验密码 -->
    <template v-else>
      <p class="wb-unbind-tip">
        解绑后小程序将回到「未绑定」状态，再次使用需要重新绑定。账本与流水不受影响。
      </p>
      <NInput
        v-model:value="pwd"
        type="password"
        show-password-on="click"
        placeholder="请输入账号密码验证身份"
        @keydown.enter="submitUnbind"
      />
    </template>
  </NModal>
</template>

<style scoped>
.wb-qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.wb-qr__box {
  display: grid;
  place-items: center;
  width: 200px;
  height: 200px;
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-lg, 12px);
  overflow: hidden;
  background: var(--lz-bg-card);
}

.wb-qr__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.wb-qr__ticket {
  padding: 0 12px;
  font-size: 12px;
  color: var(--lz-text-secondary);
  word-break: break-all;
}

/* 生成中的占位：转圈 + 文案，避免打开瞬间空白 */
.wb-qr__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--lz-text-secondary);
}

.wb-qr__spinner {
  width: 22px;
  height: 22px;
  border: 2px solid var(--lz-border);
  border-top-color: var(--lz-primary-600, #2a6bb4);
  border-radius: 50%;
  animation: wb-spin 0.8s linear infinite;
}

@keyframes wb-spin {
  to {
    transform: rotate(360deg);
  }
}

.wb-status {
  margin: 0;
  font-size: 13px;
  color: var(--lz-text-secondary);
  text-align: center;
}

.wb-status--done {
  color: var(--lz-success, #2f855a);
  font-weight: 500;
}

.wb-unbind-tip {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--lz-text-secondary);
}
</style>
