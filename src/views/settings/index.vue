<script setup lang="ts">
import type { FormInst, FormRules } from 'naive-ui'
import type { ThemeMode } from '@/stores/modules/app'
import type { MoneyColorMode } from '@/stores/modules/settings'
import { NButton, NForm, NFormItem, NInput, NModal, NRadioButton, NRadioGroup, NSpace, useMessage } from 'naive-ui'
import { computed, reactive, ref } from 'vue'
import { useAppStore } from '@/stores/modules/app'
import { useAuthStore } from '@/stores/modules/auth'
import { useSettingsStore } from '@/stores/modules/settings'

/**
 * 设置页（Now 清单 #3，PRD §15.2.1）
 * ====================================================================
 * 当前只有「顶栏临时切主题」，缺集中设置入口。这里把全局偏好收口：
 *   1. 主题模式（跟随系统 / 浅色 / 深色）—— 走 app store（已持久化）
 *   2. 金额配色偏好（收入绿/支出红 ↔ A 股收入红/支出绿）—— 走 settings store
 *   3. 账号安全（修改密码）—— 弹窗走 auth.changePassword
 * 所有改动即时生效、即时持久化，无需保存按钮。
 */
const app = useAppStore()
const settings = useSettingsStore()
const auth = useAuthStore()
const message = useMessage()
const themeOptions = [
  { label: '跟随系统', value: 'auto' as ThemeMode },
  { label: '浅色', value: 'light' as ThemeMode },
  { label: '深色', value: 'dark' as ThemeMode },
]

const moneyColorOptions = [
  { label: '收入绿 · 支出红（默认）', value: 'income-green' as MoneyColorMode, desc: '花钱=警示红，符合记账直觉' },
  { label: '收入红 · 支出绿（A 股习惯）', value: 'income-red' as MoneyColorMode, desc: '与股票涨红跌绿保持一致' },
]

const currentMoneyColorDesc = computed(
  () => moneyColorOptions.find(o => o.value === settings.moneyColorMode)?.desc ?? '',
)

function onThemeChange(mode: ThemeMode) {
  app.setThemeMode(mode)
  message.success('主题已更新')
}

function onMoneyColorChange(mode: MoneyColorMode) {
  settings.moneyColorMode = mode
  message.success('金额配色已更新')
}

// ── 改密弹窗 ─────────────────────────────────────────────────────
const showChangePwd = ref(false)
const changePwdFormRef = ref<FormInst | null>(null)
const changePwdSubmitting = ref(false)

/** 改密表单数据 */
const pwdForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const pwdRules: FormRules = {
  oldPassword: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 32, message: '密码长度 6-32 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator(_rule, value) {
        if (value !== pwdForm.newPassword)
          return new Error('两次输入的新密码不一致')
        return true
      },
      trigger: 'blur',
    },
  ],
}

function openChangePwd() {
  pwdForm.oldPassword = ''
  pwdForm.newPassword = ''
  pwdForm.confirmPassword = ''
  showChangePwd.value = true
}

async function onChangePwdSubmit() {
  if (changePwdSubmitting.value)
    return
  try {
    await changePwdFormRef.value?.validate()
  }
  catch {
    return
  }
  changePwdSubmitting.value = true
  try {
    await auth.changePassword({
      oldPassword: pwdForm.oldPassword,
      newPassword: pwdForm.newPassword,
    })
    message.success('密码已修改')
    showChangePwd.value = false
  }
  catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '修改失败'
    if (msg.startsWith('BUSINESS:')) {
      const detail = msg.split(':').slice(2).join(':')
      message.error(detail || '修改失败')
    }
    else {
      message.error(msg)
    }
  }
  finally {
    changePwdSubmitting.value = false
  }
}
</script>

<template>
  <div class="settings-page">
    <header class="page-head">
      <h1 class="page-title">
        设置
      </h1>
      <p class="page-sub">
        偏好即时生效并自动保存，刷新后保留。
      </p>
    </header>

    <section class="setting-card">
      <div class="setting-head">
        <h2 class="setting-title">
          外观 · 主题
        </h2>
        <span class="setting-hint">深色模式已做语义色降饱和处理，保护眼睛</span>
      </div>
      <NRadioGroup :value="app.themeMode" @update:value="onThemeChange">
        <NRadioButton v-for="opt in themeOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </NRadioButton>
      </NRadioGroup>
    </section>

    <section class="setting-card">
      <div class="setting-head">
        <h2 class="setting-title">
          金额配色
        </h2>
        <span class="setting-hint">{{ currentMoneyColorDesc }}</span>
      </div>
      <NRadioGroup :value="settings.moneyColorMode" @update:value="onMoneyColorChange">
        <NRadioButton v-for="opt in moneyColorOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </NRadioButton>
      </NRadioGroup>
      <p class="setting-note">
        无论哪种配色，金额都同时带 <b>+ / −</b> 符号，颜色不是唯一编码（色盲可读，无障碍友好）。
      </p>
    </section>

    <section class="setting-card">
      <div class="setting-head">
        <h2 class="setting-title">
          账号安全
        </h2>
        <span class="setting-hint">
          当前账号：{{ auth.userInfo?.nickname || auth.userInfo?.username || '未登录' }}
        </span>
      </div>
      <NSpace>
        <NButton @click="openChangePwd">
          修改密码
        </NButton>
      </NSpace>
    </section>

    <section class="setting-card">
      <div class="setting-head">
        <h2 class="setting-title">
          快捷键
        </h2>
      </div>
      <ul class="shortcut-list">
        <li><span>快速记账</span><b><kbd>Cmd</kbd><kbd>K</kbd> / <kbd>N</kbd></b></li>
        <li><span>命令面板</span><b><kbd>Cmd</kbd><kbd>Shift</kbd><kbd>P</kbd></b></li>
        <li><span>切换侧边栏</span><b><kbd>Cmd</kbd><kbd>B</kbd></b></li>
        <li><span>关闭弹窗 / 面板</span><b><kbd>Esc</kbd></b></li>
        <li><span>交易页聚焦搜索</span><b><kbd>/</kbd></b></li>
        <li><span>交易页切换状态筛选</span><b><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></b></li>
      </ul>
      <p class="setting-note">
        Cmd 在 Windows 上对应 Ctrl；单字母快捷键（如 <kbd>N</kbd>、<kbd>/</kbd>、<kbd>1~3</kbd>）在输入框内自动失效，不会打断打字。
      </p>
    </section>

    <section class="setting-card">
      <div class="setting-head">
        <h2 class="setting-title">
          关于
        </h2>
      </div>
      <ul class="about-list">
        <li><span>产品</span><b>简账</b></li>
        <li><span>定位</span><b>个人 / 家庭财务中台（记账 + 多账本 + 报表）</b></li>
        <li><span>技术栈</span><b>Vue 3 · TypeScript · Naive UI · ECharts 6 · Vite</b></li>
        <li><span>数据状态</span><b>已对接真实后端，数据落库持久化</b></li>
      </ul>
    </section>

    <!-- 改密弹窗 -->
    <NModal
      v-model:show="showChangePwd"
      preset="card"
      title="修改密码"
      style="max-width: 420px"
      :mask-closable="!changePwdSubmitting"
    >
      <NForm
        ref="changePwdFormRef"
        :model="pwdForm"
        :rules="pwdRules"
        label-placement="top"
        @keyup.enter="onChangePwdSubmit"
      >
        <NFormItem label="当前密码" path="oldPassword">
          <NInput
            v-model:value="pwdForm.oldPassword"
            type="password"
            show-password-on="click"
            placeholder="请输入当前密码"
            clearable
          />
        </NFormItem>
        <NFormItem label="新密码" path="newPassword">
          <NInput
            v-model:value="pwdForm.newPassword"
            type="password"
            show-password-on="click"
            placeholder="6-32 位"
            clearable
          />
        </NFormItem>
        <NFormItem label="确认新密码" path="confirmPassword">
          <NInput
            v-model:value="pwdForm.confirmPassword"
            type="password"
            show-password-on="click"
            placeholder="再输入一次"
            clearable
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton :disabled="changePwdSubmitting" @click="showChangePwd = false">
            取消
          </NButton>
          <NButton type="primary" :loading="changePwdSubmitting" @click="onChangePwdSubmit">
            确认修改
          </NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped lang="scss">
.settings-page {
  display: flex;
  flex-direction: column;
  gap: var(--lz-space-5);
  padding: var(--lz-content-padding);
  max-width: 760px;
  margin: 0 auto;
}

.page-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--lz-text-primary);
  margin: 0;
}

.page-sub {
  font-size: 13px;
  color: var(--lz-text-secondary);
  margin: 0;
}

.setting-card {
  display: flex;
  flex-direction: column;
  gap: var(--lz-space-4);
  padding: var(--lz-space-5);
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
}

.setting-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.setting-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--lz-text-primary);
  margin: 0;
}

.setting-hint {
  font-size: 12px;
  color: var(--lz-text-secondary);
}

.setting-note {
  margin: 0;
  font-size: 12px;
  color: var(--lz-text-secondary);
  line-height: 1.6;

  b {
    color: var(--lz-text-regular);
  }
}

.about-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;

  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    font-size: 13px;
  }

  span {
    color: var(--lz-text-secondary);
    flex-shrink: 0;
  }

  b {
    color: var(--lz-text-primary);
    font-weight: 500;
    text-align: right;
  }
}

.shortcut-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;

  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    font-size: 13px;
  }

  span {
    color: var(--lz-text-secondary);
    flex-shrink: 0;
  }

  b {
    color: var(--lz-text-primary);
    font-weight: 500;
    text-align: right;
  }

  kbd {
    display: inline-grid;
    place-items: center;
    min-width: 24px;
    height: 22px;
    padding: 0 6px;
    margin-left: 4px;
    font-family: var(--lz-font-num);
    font-size: 11px;
    font-weight: 500;
    color: var(--lz-text-regular);
    background: var(--lz-bg-page);
    border: 1px solid var(--lz-border);
    border-radius: var(--lz-radius-sm);
    box-shadow: 0 1px 0 var(--lz-border);

    &:first-of-type {
      margin-left: 0;
    }
  }
}
</style>
