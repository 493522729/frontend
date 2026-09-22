<script setup lang="ts">
import type { FormInst, FormRules } from 'naive-ui'
import { useMessage } from 'naive-ui'
/**
 * 账号密码登录面板
 * ====================================================================
 * 全部用 Naive UI 组件拼装：n-form / n-form-item / n-input / n-checkbox / n-button。
 * - 表单校验失败时禁止提交
 * - loading 状态时按钮显示 spinner + 禁用表单（防止重复点击）
 * - 失败错误以 n-alert 形式展示在表单上方
 */
import { reactive, ref } from 'vue'
import { ApiError } from '@/api'
import { useAuthStore } from '@/stores/modules/auth'

const emit = defineEmits<{
  /** 登录成功（父级会处理跳转） */
  (e: 'success'): void
}>()

const auth = useAuthStore()
const message = useMessage()

/** 表单数据 */
const form = reactive({
  username: '',
  password: '',
  // 「记住我」：默认勾选，体验更顺
  remember: true,
})

/** 校验规则 */
const rules: FormRules = {
  username: {
    required: true,
    message: '请输入用户名',
    trigger: ['blur', 'input'],
  },
  password: {
    required: true,
    validator(_rule, value: string) {
      if (!value)
        return new Error('请输入密码')
      if (value.length < 4)
        return new Error('密码至少 4 位')
      return true
    },
    trigger: ['blur', 'input'],
  },
}

const formRef = ref<FormInst | null>(null)
const submitting = ref(false)
const errorMsg = ref('')

/**
 * 提交登录：
 *   - 先 validate
 *   - 成功后 toast + 抛事件给父级
 *   - 失败后按错误类型给文案
 */
async function submit() {
  if (submitting.value)
    return

  try {
    await formRef.value?.validate()
  }
  catch {
    return
  }

  submitting.value = true
  errorMsg.value = ''

  try {
    await auth.login({ username: form.username, password: form.password })
    message.success(`欢迎回来，${form.username || '用户'}！`, { duration: 1800 })
    emit('success')
  }
  catch (e: unknown) {
    let msg = '登录失败，请稍后再试'
    if (e instanceof ApiError) {
      if (e.type === 'business')
        msg = e.message || '用户名或密码错误'
      else if (e.type === 'network')
        msg = '网络异常，请检查连接'
      else if (e.type === 'http')
        msg = '服务器开小差了，稍后再试'
    }
    else if (e instanceof Error) {
      msg = e.message
    }
    errorMsg.value = msg
  }
  finally {
    submitting.value = false
  }
}

/** 回车提交 */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey)
    submit()
}
</script>

<template>
  <n-form
    ref="formRef"
    class="account-panel"
    :model="form"
    :rules="rules"
    size="large"
    @keydown="onKeydown"
    @submit.prevent="submit"
  >
    <!-- 错误提示：Naive UI n-alert，比自绘 error-bar 更统一 -->
    <n-form-item v-if="errorMsg" :show-feedback="false" :show-label="false">
      <n-alert type="error" :bordered="false" closable @close="errorMsg = ''">
        {{ errorMsg }}
      </n-alert>
    </n-form-item>

    <n-form-item path="username" :show-label="false">
      <n-input
        v-model:value="form.username"
        placeholder="请输入用户名 / 邮箱"
        :input-props="{ autocomplete: 'username' }"
        clearable
      >
        <template #prefix>
          <svg class="field-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.6" fill="none" />
            <path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" />
          </svg>
        </template>
      </n-input>
    </n-form-item>

    <n-form-item path="password" :show-label="false">
      <n-input
        v-model:value="form.password"
        type="password"
        show-password-on="click"
        placeholder="请输入密码"
        :input-props="{ autocomplete: 'current-password' }"
        @keydown.enter="submit"
      >
        <template #prefix>
          <svg class="field-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="1.6" fill="none" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" />
          </svg>
        </template>
      </n-input>
    </n-form-item>

    <n-form-item :show-label="false" :show-feedback="false">
      <div class="row-between">
        <n-checkbox v-model:checked="form.remember">
          记住我（30 天免登录）
        </n-checkbox>
        <a class="link" href="#forget" @click.prevent>忘记密码？</a>
      </div>
    </n-form-item>

    <n-form-item :show-label="false" :show-feedback="false">
      <n-button
        type="primary"
        attr-type="submit"
        :loading="submitting"
        :disabled="submitting"
        block
        class="submit-btn"
      >
        登 录
      </n-button>
    </n-form-item>
  </n-form>
</template>

<style scoped lang="scss">
.account-panel {
  padding-top: 4px;
}

.field-icon {
  width: 16px;
  height: 16px;
  color: var(--lz-text-placeholder);
}

.row-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  font-size: 13px;
}

.link {
  color: var(--lz-primary-600);
  text-decoration: none;
  font-weight: 500;
  transition: color var(--lz-duration-base);

  &:hover {
    color: var(--lz-primary-700);
  }
}

.submit-btn {
  height: 44px;
  font-weight: 600;
  letter-spacing: 0.05em;
}

/* 降低输入框背景透明度，同时保证输入文字/placeholder 颜色不被影响。
   Naive UI 通过 --n-color 控制 input 背景，--n-text-color / --n-placeholder-color 独立控制文字。 */
.account-panel :deep(.n-input) {
  --n-color: rgba(255, 255, 255, 0.95) !important;
  --n-color-focus: rgba(255, 255, 255, 1) !important;
}

html.dark .account-panel :deep(.n-input) {
  --n-color: rgba(22, 28, 40, 0.95) !important;
  --n-color-focus: rgba(22, 28, 40, 1) !important;
}
</style>
