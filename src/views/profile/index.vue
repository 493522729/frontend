<script setup lang="ts">
import type { UserInfo } from '@/api/modules/user'
import { NAvatar, NButton, NInput, NModal, useMessage } from 'naive-ui'
import { computed, ref } from 'vue'
import { userApi } from '@/api/modules/user'
import { useAuthStore } from '@/stores/modules/auth'

/**
 * 账号设置页（个人资料）
 * ====================================================================
 * 参照截图布局：顶部标题 + 个人信息卡片 + 账号操作卡片。
 * 当前实现：头像（本地 base64 预览 + 落库）、昵称编辑、手机号换绑、
 * 微信账号占位、退出登录。
 */
const auth = useAuthStore()
const message = useMessage()
const router = useRouter()

/** 当前用户信息（响应式引用自 auth store） */
const user = computed<UserInfo | null>(() => auth.userInfo)

/** 头像上传限制：2MB */
const AVATAR_MAX_SIZE = 2 * 1024 * 1024

/** 手机号脱敏：138****1234 */
function maskPhone(phone?: string): string {
  if (!phone)
    return '未绑定'
  if (phone.length !== 11)
    return phone
  return `${phone.slice(0, 3)}****${phone.slice(7)}`
}

// ── 昵称编辑 ─────────────────────────────────────────────
const nicknameVisible = ref(false)
const nicknameDraft = ref('')
const nicknameSubmitting = ref(false)

function openNicknameEdit() {
  nicknameDraft.value = user.value?.nickname ?? ''
  nicknameVisible.value = true
}

async function submitNickname() {
  const val = nicknameDraft.value.trim()
  if (!val) {
    message.warning('昵称不能为空')
    return false
  }
  nicknameSubmitting.value = true
  try {
    await userApi.updateProfile({ nickname: val })
    await auth.refreshProfile()
    message.success('昵称已更新')
    nicknameVisible.value = false
  }
  finally {
    nicknameSubmitting.value = false
  }
}

// ── 手机号换绑 ───────────────────────────────────────────
const phoneVisible = ref(false)
const phoneDraft = ref('')
const phoneSubmitting = ref(false)
const phoneTitle = computed(() => user.value?.phone ? '换绑手机号' : '绑定手机号')

function openPhoneEdit() {
  phoneDraft.value = user.value?.phone ?? ''
  phoneVisible.value = true
}

async function submitPhone() {
  const val = phoneDraft.value.trim()
  if (!/^1[3-9]\d{9}$/.test(val)) {
    message.warning('请输入有效的 11 位手机号')
    return false
  }
  phoneSubmitting.value = true
  try {
    await userApi.updateProfile({ phone: val })
    await auth.refreshProfile()
    message.success(user.value?.phone ? '手机号已换绑' : '手机号已绑定')
    phoneVisible.value = false
  }
  finally {
    phoneSubmitting.value = false
  }
}

// ── 头像上传（本地 base64，限制 2MB）───────────────────────
const fileInputRef = ref<HTMLInputElement | null>(null)

function triggerAvatarUpload() {
  fileInputRef.value?.click()
}

async function onAvatarChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file)
    return
  if (file.size > AVATAR_MAX_SIZE) {
    message.warning('头像大小不能超过 2MB')
    target.value = ''
    return
  }
  if (!file.type.startsWith('image/')) {
    message.warning('请上传图片文件')
    target.value = ''
    return
  }
  const reader = new FileReader()
  reader.onload = async () => {
    const base64 = reader.result as string
    try {
      await userApi.updateProfile({ avatar: base64 })
      await auth.refreshProfile()
      message.success('头像已更新')
    }
    catch {
      message.error('头像更新失败')
    }
    target.value = ''
  }
  reader.readAsDataURL(file)
}

// ── 微信账号（P5 微信扫码登录对接后启用）────────────────────
function bindWechat() {
  message.info('微信登录功能开发中，敬请期待')
}

// ── 退出登录 ─────────────────────────────────────────────
async function handleLogout() {
  await auth.logout()
  await router.push('/login')
}
</script>

<template>
  <div class="profile-page">
    <header class="profile-header">
      <h1 class="profile-title">
        账号设置
      </h1>
      <p class="profile-subtitle">
        查看您的账号信息
      </p>
    </header>

    <!-- 个人信息 -->
    <section class="profile-card">
      <h2 class="card-title">
        个人信息
      </h2>
      <div class="card-body">
        <div class="profile-row" @click="triggerAvatarUpload">
          <div class="row-meta">
            <span class="row-label">头像</span>
            <span class="row-desc">JPG、PNG 或 GIF（最大 2 MB）</span>
          </div>
          <div class="row-action">
            <NAvatar
              round
              :size="48"
              :src="user?.avatar"
              :fallback-src="undefined"
              class="row-avatar"
            >
              {{ user?.nickname?.slice(0, 1) ?? user?.username?.slice(0, 1) ?? '?' }}
            </NAvatar>
            <input
              ref="fileInputRef"
              type="file"
              accept="image/*"
              class="avatar-input"
              @change="onAvatarChange"
            >
          </div>
        </div>

        <div class="profile-row" @click="openNicknameEdit">
          <div class="row-meta">
            <span class="row-label">昵称</span>
            <span class="row-desc">您的个人资料名称</span>
          </div>
          <div class="row-action">
            <span class="row-value">{{ user?.nickname || user?.username || '-' }}</span>
            <svg class="edit-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
            </svg>
          </div>
        </div>
      </div>
    </section>

    <!-- 账号操作 -->
    <section class="profile-card">
      <h2 class="card-title">
        账号操作
      </h2>
      <div class="card-body">
        <div class="profile-row">
          <div class="row-meta">
            <span class="row-label">手机号</span>
            <span class="row-desc">{{ maskPhone(user?.phone) }}</span>
          </div>
          <NButton size="small" @click="openPhoneEdit">
            {{ user?.phone ? '换绑' : '去绑定' }}
          </NButton>
        </div>

        <div class="profile-row">
          <div class="row-meta">
            <span class="row-label">微信账号</span>
            <span class="row-desc">未绑定</span>
          </div>
          <NButton size="small" @click="bindWechat">
            去绑定
          </NButton>
        </div>

        <div class="profile-row">
          <div class="row-meta">
            <span class="row-label">退出当前账号</span>
            <span class="row-desc">退出后需要重新登录</span>
          </div>
          <NButton size="small" type="error" ghost @click="handleLogout">
            退出登录
          </NButton>
        </div>
      </div>
    </section>

    <!-- 昵称弹窗 -->
    <NModal
      v-model:show="nicknameVisible"
      preset="dialog"
      title="修改昵称"
      positive-text="保存"
      negative-text="取消"
      :loading="nicknameSubmitting"
      @positive-click="submitNickname"
    >
      <NInput v-model:value="nicknameDraft" placeholder="请输入昵称" maxlength="32" />
    </NModal>

    <!-- 手机号弹窗 -->
    <NModal
      v-model:show="phoneVisible"
      preset="dialog"
      :title="phoneTitle"
      positive-text="保存"
      negative-text="取消"
      :loading="phoneSubmitting"
      @positive-click="submitPhone"
    >
      <NInput v-model:value="phoneDraft" placeholder="请输入手机号" maxlength="11" />
    </NModal>
  </div>
</template>

<style scoped lang="scss">
.profile-page {
  max-width: 720px;
}

.profile-header {
  margin-bottom: 24px;
}

.profile-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 600;
  color: var(--lz-text-primary);
}

.profile-subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--lz-text-secondary);
}

.profile-card {
  margin-bottom: 24px;
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  box-shadow: var(--lz-shadow-sm);
  overflow: hidden;
}

.card-title {
  margin: 0;
  padding: 16px 20px 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--lz-text-primary);
  border-bottom: 1px solid var(--lz-border);
}

.card-body {
  padding: 4px 0;
}

.profile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--lz-border);
  cursor: pointer;
  transition: background-color var(--lz-duration-base);

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: var(--lz-bg-hover);
  }
}

.row-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.row-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--lz-text-primary);
}

.row-desc {
  font-size: 12px;
  color: var(--lz-text-secondary);
}

.row-action {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.row-value {
  font-size: 14px;
  color: var(--lz-text-regular);
}

.row-avatar {
  font-size: 18px;
  background: var(--lz-primary-100);
  color: var(--lz-primary-600);
}

.edit-icon {
  width: 16px;
  height: 16px;
  color: var(--lz-text-secondary);
}

.avatar-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
</style>
