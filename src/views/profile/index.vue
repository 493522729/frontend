<script setup lang="ts">
import type { UserInfo } from '@/api/modules/user'
import { NButton, NInput, NModal, useMessage } from 'naive-ui'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { userApi } from '@/api/modules/user'
import WechatBindModal from '@/components/WechatBindModal.vue'
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

// ── 头像上传（压缩为 128×128 JPEG 后转 base64）────────────────
const fileInputRef = ref<HTMLInputElement | null>(null)
const AVATAR_CANVAS_SIZE = 128

function triggerAvatarUpload() {
  fileInputRef.value?.click()
}

function compressImage(file: File, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('浏览器不支持 Canvas'))
        return
      }
      const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1)
      canvas.width = Math.round(img.width * ratio)
      canvas.height = Math.round(img.height * ratio)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }
    img.src = url
  })
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
  try {
    const base64 = await compressImage(file, AVATAR_CANVAS_SIZE, 0.8)
    await userApi.updateProfile({ avatar: base64 })
    await auth.refreshProfile()
    message.success('头像已更新')
  }
  catch {
    message.error('头像处理失败，请换一张图片')
  }
  finally {
    target.value = ''
  }
}

// ── 微信账号（MP-ADR-5 方案 A：出绑定码 → 小程序扫 → 绑定到当前账号）────
const wxBound = computed(() => Boolean(user.value?.wxBound))

const showBindModal = ref(false)
const showUnbindModal = ref(false)

/**
 * 点微信那一行：**先拉一次最新状态，再决定开哪个弹窗**。
 *
 * 为什么不能直接用 wxBound.value 判断：它可能已经是陈旧的 ——
 * 小程序端解绑、或另一台设备绑定都会悄悄改掉后端的 wx_openid，
 * 而页面上的值要等 visibilitychange 才会刷新。
 * 于是会出现「显示已绑定 → 点『解除绑定』→ 后端说本来就没绑 / 密码不对」这种自相矛盾的体验。
 * 先刷新一次（一次 GET，很轻），分派就永远基于真实状态。
 */
async function onWechatAction() {
  await auth.refreshProfile()
  if (wxBound.value)
    showUnbindModal.value = true
  else
    showBindModal.value = true
}

/** 绑定/解绑成功后刷新用户信息，让「已绑定/未绑定」立刻生效 */
async function onWechatSuccess() {
  await auth.refreshProfile()
}

/**
 * 跨端兜底：小程序端方案 B（输密码绑定）或另一台设备完成绑定/解绑时，
 * 网页端没有扫码会话通知，不会主动刷新。回到本标签页时拉一次最新 profile，
 * 保证「已绑定/未绑定」状态及时同步，避免出现「手机已绑定、网页没变化」。
 *
 * ⚠️ 两个事件都要听（2026-09-17 补）：
 *   · `visibilitychange` 只在页面**被隐藏**时触发（切 tab、最小化、切到别的应用）。
 *   · 窗口仅仅**失去焦点**（被别的窗口盖住但没最小化）时，`visibilityState` 仍是
 *     `'visible'`，那个事件根本不触发 —— 这时切回来就看不到最新状态。
 *   ⇒ 补一个 `window.focus`，两者一起才覆盖得住「去手机上操作一下再回来」这个场景。
 */
function refreshOnVisible() {
  if (document.visibilityState === 'visible')
    void auth.refreshProfile()
}

onMounted(() => {
  document.addEventListener('visibilitychange', refreshOnVisible)
  window.addEventListener('focus', refreshOnVisible)
})
onUnmounted(() => {
  document.removeEventListener('visibilitychange', refreshOnVisible)
  window.removeEventListener('focus', refreshOnVisible)
})

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
            <span class="row-avatar-preview">
              <img v-if="user?.avatar" :src="user.avatar" class="row-avatar-img" alt="头像">
              <span v-else class="row-avatar-text">
                {{ user?.nickname?.slice(0, 1) ?? user?.username?.slice(0, 1) ?? '?' }}
              </span>
            </span>
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
            <span class="row-desc">{{ wxBound ? '已绑定 · 小程序可免密记账' : '未绑定' }}</span>
          </div>
          <NButton size="small" :type="wxBound ? 'error' : 'primary'" ghost @click="onWechatAction">
            {{ wxBound ? '解除绑定' : '去绑定' }}
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

    <!-- 微信绑定 / 解绑（MP-ADR-5，与设置页共用同一个弹窗） -->
    <WechatBindModal v-model:show="showBindModal" mode="bind" @success="onWechatSuccess" />
    <WechatBindModal v-model:show="showUnbindModal" mode="unbind" @success="onWechatSuccess" />
  </div>
</template>

<style scoped lang="scss">
/* 与 settings 页统一：居中容器、统一字号 */
.profile-page {
  display: flex;
  flex-direction: column;
  gap: var(--lz-space-5);
  padding: var(--lz-content-padding);
  max-width: 760px;
  margin: 0 auto;
}

.profile-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--lz-text-primary);
}

.profile-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--lz-text-secondary);
}

.profile-card {
  display: flex;
  flex-direction: column;
  gap: var(--lz-space-4);
  padding: var(--lz-space-5);
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
}

.card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--lz-text-primary);
}

.card-body {
  display: flex;
  flex-direction: column;
}

.profile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  margin: 0 -16px;
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

.row-avatar-preview {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--lz-primary-100);
  color: var(--lz-primary-600);
  font-size: 18px;
  font-weight: 500;
}

.row-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.row-avatar-text {
  line-height: 1;
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
