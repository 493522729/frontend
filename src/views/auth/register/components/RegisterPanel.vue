<script setup lang="ts">
/**
 * 注册表单 · 账号密码
 * ====================================================================
 * 复用登录页 BrandPanel（保持品牌一致性），表单独立。
 * 注册成功后由父组件统一处理跳转（emit 'success'）。
 */
import type { FormInst, FormRules } from 'naive-ui'
import type { RegisterParams } from '@/api/modules/auth'
import { NButton, NForm, NFormItem, NInput, useMessage } from 'naive-ui'
import { reactive, ref } from 'vue'
import { useAuthStore } from '@/stores/modules/auth'

const emit = defineEmits<{
  success: []
  switchToLogin: []
}>()

const auth = useAuthStore()
const message = useMessage()
const formRef = ref<FormInst | null>(null)
const submitting = ref(false)

/** 表单数据 */
const form = reactive<RegisterParams>({
  username: '',
  password: '',
  confirmPassword: '',
  nickname: '',
})

/** 校验规则 —— 至少 3 位 / 至少 6 位 / 两次密码一致 */
const rules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度 3-20 位', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 32, message: '密码长度 6-32 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      // 自定义校验：两次密码一致
      validator(_rule, value) {
        if (value !== form.password)
          return new Error('两次输入的密码不一致')
        return true
      },
      trigger: 'blur',
    },
  ],
}

async function onSubmit() {
  if (submitting.value)
    return
  try {
    await formRef.value?.validate()
  }
  catch {
    return
  }
  submitting.value = true
  try {
    await auth.register({ ...form })
    message.success('注册成功，欢迎加入')
    emit('success')
  }
  catch (err: unknown) {
    // mock 后端失败时把错误信息翻译成可读文本（前端兜底，避免后端文案直达用户）
    const msg = err instanceof Error ? err.message : '注册失败'
    if (msg.startsWith('BUSINESS:')) {
      const detail = msg.split(':').slice(2).join(':')
      message.error(detail || '注册失败')
    }
    else {
      message.error(msg)
    }
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <NForm
    ref="formRef"
    :model="form"
    :rules="rules"
    size="large"
    label-placement="top"
    class="register-form"
    @keyup.enter="onSubmit"
  >
    <NFormItem label="用户名" path="username">
      <NInput
        v-model:value="form.username"
        placeholder="3-20 位字母/数字/下划线"
        clearable
        autofocus
      />
    </NFormItem>
    <NFormItem label="昵称（可选）" path="nickname">
      <NInput
        v-model:value="form.nickname"
        placeholder="留空则使用用户名"
        clearable
      />
    </NFormItem>
    <NFormItem label="密码" path="password">
      <NInput
        v-model:value="form.password"
        type="password"
        show-password-on="click"
        placeholder="6-32 位"
        clearable
      />
    </NFormItem>
    <NFormItem label="确认密码" path="confirmPassword">
      <NInput
        v-model:value="form.confirmPassword"
        type="password"
        show-password-on="click"
        placeholder="再输入一次"
        clearable
      />
    </NFormItem>
    <NButton
      type="primary"
      block
      :loading="submitting"
      @click="onSubmit"
    >
      注册并登录
    </NButton>
    <p class="form-foot-tip">
      已有账号？<a class="foot-link" @click.prevent="emit('switchToLogin')">去登录</a>
    </p>
  </NForm>
</template>

<style scoped lang="scss">
.register-form {
  :deep(.n-form-item-label) {
    font-size: 13px;
    font-weight: 500;
    color: var(--lz-text-regular);
  }
}

.form-foot-tip {
  margin: 12px 0 0;
  text-align: center;
  font-size: 13px;
  color: var(--lz-text-secondary);
}

.foot-link {
  color: var(--lz-primary-600);
  cursor: pointer;
  text-decoration: none;

  &:hover {
    color: var(--lz-primary-700);
    text-decoration: underline;
  }
}
</style>
