<script setup lang="ts">
/**
 * 忘记密码弹窗（网页端）
 * ====================================================================
 * 流程：
 *   1) 展示「重置密码」二维码 → 每 2s 轮询状态
 *   2) 小程序（已登录态）扫码确认 / mock 自动确认 → 状态变 confirmed
 *   3) 切换到「设置新密码」表单 → 提交 resetConfirm（免登录）
 *   4) 成功 → 提示去登录 → 关闭弹窗
 * 依赖 useResetStatus 复用扫码状态机；纯前端 UI + 真后端接口。
 */
import { NButton, NInput, useMessage } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import { resetConfirm } from '@/api/modules/auth'
import { useResetStatus } from '@/views/auth/login/composables/useResetStatus'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ (e: 'update:show', v: boolean): void }>()
const message = useMessage()

// step: qr（扫码） → set（设新密码） → success / expired
const step = ref<'qr' | 'set' | 'success' | 'expired'>('qr')

const { status, qrValue, qrId, remaining, refresh, destroy } = useResetStatus({
  onConfirmed: () => {
    step.value = 'set'
  },
  onExpired: () => {
    step.value = 'expired'
  },
})

const loading = ref(false)
const pwd = ref('')
const pwd2 = ref('')

const isMock = computed(() => Boolean(qrValue.value) && !qrValue.value.startsWith('data:'))

async function submit() {
  if (!pwd.value || pwd.value.length < 6) {
    message.warning('新密码至少 6 位')
    return
  }
  if (pwd.value !== pwd2.value) {
    message.warning('两次输入的密码不一致')
    return
  }
  loading.value = true
  try {
    await resetConfirm(qrId.value, pwd.value)
    step.value = 'success'
    destroy()
    message.success('密码已重置，请用新密码登录')
  }
  catch (err: unknown) {
    message.error(err instanceof Error ? err.message : '重置失败，请重试')
  }
  finally {
    loading.value = false
  }
}

function reopen() {
  step.value = 'qr'
  pwd.value = ''
  pwd2.value = ''
  void refresh()
}

watch(() => props.show, (v) => {
  if (v) {
    step.value = 'qr'
    pwd.value = ''
    pwd2.value = ''
    void refresh()
  }
  else {
    destroy()
  }
})
</script>

<template>
  <NModal
    :show="show"
    preset="dialog"
    title="找回密码"
    :positive-text="step === 'success' ? '去登录' : undefined"
    :negative-text="step === 'set' ? '取消' : undefined"
    :loading="loading"
    :mask-closable="!loading"
    @update:show="emit('update:show', $event)"
    @positive-click="emit('update:show', false)"
    @negative-click="emit('update:show', false)"
  >
    <!-- 步骤 1：扫码确认 -->
    <template v-if="step === 'qr' || step === 'expired'">
      <p class="fp-tip">
        用已登录的微信小程序扫描下方二维码，在手机上点「确认重置」即可。
      </p>
      <div class="fp-qr">
        <div class="fp-qr__box">
          <span v-if="!qrValue" class="fp-qr__loading">
            <span class="fp-qr__spinner" />正在生成二维码…
          </span>
          <img v-else-if="!isMock" :src="qrValue" alt="重置密码二维码" class="fp-qr__img">
          <span v-else class="fp-qr__ticket">{{ qrValue }}</span>
        </div>
        <p class="fp-status" :class="{ 'fp-status--expired': step === 'expired' }">
          <template v-if="step === 'expired'">
            二维码已过期
          </template>
          <template v-else-if="status === 'confirmed'">
            已确认，请设置新密码
          </template>
          <template v-else-if="isMock">
            本地未配置微信：演示模式下约 10 秒自动确认
          </template>
          <template v-else>
            请用微信扫描二维码（剩余 {{ remaining }}s）
          </template>
        </p>
        <NButton v-if="status === 'expired' || step === 'expired'" size="tiny" tertiary @click="reopen">
          重新生成二维码
        </NButton>
      </div>
    </template>

    <!-- 步骤 2：设置新密码 -->
    <template v-else-if="step === 'set'">
      <p class="fp-tip">
        已确认身份，请设置新密码（至少 6 位）。
      </p>
      <NInput
        v-model:value="pwd"
        type="password"
        show-password-on="click"
        placeholder="请输入新密码（至少 6 位）"
        @keydown.enter="submit"
      />
      <div style="height: 12px" />
      <NInput
        v-model:value="pwd2"
        type="password"
        show-password-on="click"
        placeholder="请再次输入新密码"
        @keydown.enter="submit"
      />
      <div class="fp-actions">
        <NButton type="primary" :loading="loading" block @click="submit">
          确认重置
        </NButton>
      </div>
    </template>

    <!-- 步骤 3：成功 -->
    <template v-else>
      <p class="fp-tip fp-tip--ok">
        密码已重置成功，请用新密码重新登录。
      </p>
    </template>
  </NModal>
</template>

<style scoped>
.fp-tip {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--lz-text-secondary);
  line-height: 1.6;
}
.fp-tip--ok {
  color: var(--lz-success, #2f855a);
}
.fp-qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.fp-qr__box {
  display: grid;
  place-items: center;
  width: 200px;
  height: 200px;
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-lg, 12px);
  overflow: hidden;
  background: var(--lz-bg-card);
}
.fp-qr__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.fp-qr__ticket {
  padding: 0 12px;
  font-size: 12px;
  color: var(--lz-text-secondary);
  word-break: break-all;
}
.fp-qr__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--lz-text-secondary);
}
.fp-qr__spinner {
  width: 22px;
  height: 22px;
  border: 2px solid var(--lz-border);
  border-top-color: var(--lz-primary-600, #2a6bb4);
  border-radius: 50%;
  animation: fp-spin 0.8s linear infinite;
}
@keyframes fp-spin {
  to {
    transform: rotate(360deg);
  }
}
.fp-status {
  margin: 0;
  font-size: 13px;
  color: var(--lz-text-secondary);
  text-align: center;
}
.fp-status--expired {
  color: var(--lz-error, #c0392b);
}
.fp-actions {
  margin-top: 16px;
}
</style>
