<script setup lang="ts">
/**
 * 共享账本 · 成员管理（PC 端）
 * ====================================================================
 * 与小程序 book-members 页同一份交互铁律（见 共享账本技术设计.md §5 / 小程序实现）：
 *   ① 角色一眼读懂：所有者 / 管理员 / 可记账 / 仅查看，绝不露后端英文常量；
 *   ② 危险操作（移除 / 退出 / 转让）必有二次确认，且把后果说死；
 *   ③ 谁该有什么按钮按角色算清楚：owner 不能移除自己、不能没转让就退出。
 *
 * 数据：prefetch 成员列表（后端已按角色兜底权限），从 isMe 推出我的角色。
 */
import type { BookMember, MemberRole } from '@/types/book'
import { NButton, NDropdown, NInput, NModal, NTag, NText, useMessage } from 'naive-ui'
import { computed, onMounted, reactive, ref } from 'vue'
import {
  changeMemberRole,
  fetchBookMembers,
  inviteMember,
  leaveBook,
  removeMember,
  transferOwner,
} from '@/api/modules/bookMember'
import { MEMBER_ROLE_META } from '@/enums/book'

const props = defineProps<{
  bookId: number
  bookName: string
}>()

const emit = defineEmits<{ (e: 'changed'): void }>()

const message = useMessage()

const loading = ref(false)
const members = ref<BookMember[]>([])

// 我的角色 = 标记 isMe 的成员角色；空表示非成员（理论上进不来）
const myRole = computed<MemberRole | null>(
  () => members.value.find(m => m.isMe)?.role ?? null,
)
const isOwner = computed(() => myRole.value === 'OWNER')
const canManage = computed(() => myRole.value === 'OWNER' || myRole.value === 'ADMIN')
const ownerCount = computed(() => members.value.filter(m => m.role === 'OWNER').length)
const canLeave = computed(() => !!myRole.value && myRole.value !== 'OWNER')

const headSub = computed(() => {
  const label = myRole.value ? MEMBER_ROLE_META[myRole.value].label : ''
  return label
    ? `${members.value.length} 位成员 · 你是${label}`
    : `${members.value.length} 位成员`
})

const AVATAR_BGS = ['#e3eef9', '#e8f0e6', '#f3eaf6', '#f6eee3', '#e6f3f1', '#f6e6e9']
function avatarBg(userId: number): string {
  return AVATAR_BGS[Math.abs(userId) % AVATAR_BGS.length]!
}
function displayName(m: BookMember): string {
  return m.nickname || m.username || '成员'
}

async function load() {
  loading.value = true
  try {
    members.value = await fetchBookMembers(props.bookId)
  }
  catch {
    message.error('成员加载失败')
  }
  finally {
    loading.value = false
  }
}

// ── 邀请 ────────────────────────────────────────────────
const inviteVisible = ref(false)
const inviteLoading = ref(false)
const inviteUsername = ref('')
const inviteError = ref('')

function openInvite() {
  inviteError.value = ''
  inviteUsername.value = ''
  inviteVisible.value = true
}
async function confirmInvite() {
  // 连点防护：入口拦一道（按钮 :loading 只挡鼠标点击）
  if (inviteLoading.value)
    return
  const username = inviteUsername.value.trim()
  if (!username) {
    inviteError.value = '请输入对方的用户名'
    return
  }
  inviteLoading.value = true
  inviteError.value = ''
  try {
    await inviteMember(props.bookId, username)
    message.success(`已邀请 ${username}`)
    inviteVisible.value = false
    await load()
    emit('changed')
  }
  catch (e: unknown) {
    inviteError.value = (e as Error)?.message || '邀请失败，请重试'
  }
  finally {
    inviteLoading.value = false
  }
}

// ── 改角色（低风险，无需二次确认）─────────────────────────
async function doChangeRole(m: BookMember, role: MemberRole) {
  try {
    await changeMemberRole(props.bookId, m.userId, role)
    message.success(`已将「${displayName(m)}」设为${MEMBER_ROLE_META[role].label}`)
    await load()
    emit('changed')
  }
  catch (e: unknown) {
    message.error((e as Error)?.message || '设置失败')
  }
}

// ── 危险操作二次确认（移除 / 退出 / 转让）────────────────
interface PendingAction {
  kind: 'remove' | 'leave' | 'transfer'
  uid?: number
  name?: string
}
const danger = reactive({
  visible: false,
  title: '',
  message: '',
  loading: false,
  error: '',
})
let pending: PendingAction | null = null

function confirmRemove(m: BookMember) {
  pending = { kind: 'remove', uid: m.userId, name: displayName(m) }
  danger.title = '移除成员'
  danger.message = `确定将「${m.nickname || m.username}」移出该共享账本吗？对方记的流水会保留。`
  danger.error = ''
  danger.loading = false
  danger.visible = true
}
function confirmTransfer(m: BookMember) {
  pending = { kind: 'transfer', uid: m.userId, name: displayName(m) }
  danger.title = '转让账本'
  danger.message = `转让后「${m.nickname || m.username}」成为所有者，你变为管理员且无法再收回。确定转让吗？`
  danger.error = ''
  danger.loading = false
  danger.visible = true
}
function onLeave() {
  if (myRole.value === 'OWNER') {
    message.warning('请先把账本转让给他人，再退出')
    return
  }
  pending = { kind: 'leave' }
  danger.title = '退出账本'
  danger.message = '退出后你将看不到这本共享账本，里面的流水也不再对你可见。确定退出吗？'
  danger.error = ''
  danger.loading = false
  danger.visible = true
}
async function confirmDanger() {
  // 连点防护：移除成员 / 转让账本 / 退出账本都是不可逆操作，重复执行代价高
  if (danger.loading)
    return
  if (!pending)
    return
  danger.loading = true
  danger.error = ''
  try {
    if (pending.kind === 'remove' && pending.uid) {
      await removeMember(props.bookId, pending.uid)
      message.success('已移除成员')
    }
    else if (pending.kind === 'transfer' && pending.uid) {
      await transferOwner(props.bookId, pending.uid)
      message.success('已转让账本')
    }
    else if (pending.kind === 'leave') {
      await leaveBook(props.bookId)
      message.success('已退出账本')
    }
    danger.visible = false
    pending = null
    await load()
    emit('changed')
  }
  catch (e: unknown) {
    danger.error = (e as Error)?.message || '操作失败，请重试'
  }
  finally {
    danger.loading = false
  }
}

// ── 成员行的「···」下拉 ──────────────────────────────────
function rowOptions(m: BookMember) {
  const opts: { label: string, key: string, kind: 'transfer' | 'role' | 'remove', role?: MemberRole }[] = []
  if (m.isMe)
    return opts // 自己走单独「退出」按钮
  if (isOwner.value) {
    opts.push({ label: '转让账本给他', key: 'transfer', kind: 'transfer' })
  }
  if (canManage.value && m.role !== 'OWNER') {
    for (const r of ['ADMIN', 'EDITOR', 'VIEWER'] as MemberRole[]) {
      if (r === m.role)
        continue
      opts.push({ label: `设为${MEMBER_ROLE_META[r].label}`, key: `role-${r}`, kind: 'role', role: r })
    }
  }
  if (canManage.value && !(m.role === 'OWNER' && ownerCount.value <= 1)) {
    opts.push({ label: '移除成员', key: 'remove', kind: 'remove' })
  }
  return opts
}
function onRowSelect(m: BookMember, key: string) {
  const opt = rowOptions(m).find(o => o.key === key)
  if (!opt)
    return
  if (opt.kind === 'transfer')
    confirmTransfer(m)
  else if (opt.kind === 'remove')
    confirmRemove(m)
  else if (opt.kind === 'role' && opt.role)
    doChangeRole(m, opt.role)
}

function joinedText(m: BookMember): string {
  if (!m.joinedAt)
    return m.status === 'PENDING' ? '待接受' : ''
  const d = new Date(m.joinedAt)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 加入`
}

onMounted(load)
</script>

<template>
  <div class="member-panel">
    <header class="panel-head">
      <div>
        <h3 class="panel-title">
          {{ bookName }} · 成员
        </h3>
        <NText depth="3" class="panel-sub">
          {{ headSub }}
        </NText>
      </div>
      <NButton v-if="canManage" size="small" type="primary" @click="openInvite">
        邀请成员
      </NButton>
    </header>

    <ul class="member-list">
      <li v-for="m in members" :key="m.userId" class="member-row">
        <!-- 头像：有图用图，无图用「首字 + 色块」 -->
        <img v-if="m.avatar" :src="m.avatar" class="avatar" alt="">
        <span v-else class="avatar avatar--text" :style="{ background: avatarBg(m.userId) }">
          {{ (m.nickname || m.username || '?').slice(0, 1).toUpperCase() }}
        </span>

        <div class="member-meta">
          <div class="member-name">
            {{ displayName(m) }}
            <NTag v-if="m.isMe" size="tiny" :bordered="false" type="primary">
              我
            </NTag>
            <NTag
              size="tiny"
              :bordered="false"
              :color="{ color: 'var(--lz-bg-page)', textColor: MEMBER_ROLE_META[m.role].color }"
            >
              {{ MEMBER_ROLE_META[m.role].label }}
            </NTag>
          </div>
          <NText depth="3" class="member-sub">
            {{ joinedText(m) }}
          </NText>
        </div>

        <!-- 自己：退出按钮（owner 不渲染，提示需先转让） -->
        <NButton
          v-if="m.isMe && canLeave"
          size="tiny"
          tertiary
          type="error"
          @click="onLeave"
        >
          退出
        </NButton>
        <NText v-else-if="m.isMe && !canLeave" depth="3" class="self-hint">
          你是所有者，需先转让
        </NText>

        <!-- 他人：··· 下拉（按角色算权限） -->
        <NDropdown
          v-else-if="rowOptions(m).length > 0"
          trigger="click"
          :options="rowOptions(m)"
          @select="(k: string) => onRowSelect(m, k)"
        >
          <NButton size="tiny" tertiary>
            ···
          </NButton>
        </NDropdown>
      </li>
    </ul>

    <!-- 邀请弹层 -->
    <NModal
      v-model:show="inviteVisible"
      preset="card"
      title="邀请成员"
      style="width: min(420px, 92vw)"
    >
      <p class="invite-tip">
        输入对方的用户名，对方会被直接加入这本账本（默认角色「可记账」）。
      </p>
      <NInput
        v-model:value="inviteUsername"
        placeholder="对方用户名"
        :maxlength="30"
        @keyup.enter="confirmInvite"
      />
      <p v-if="inviteError" class="invite-error">
        {{ inviteError }}
      </p>
      <template #footer>
        <div class="modal-footer">
          <NButton quaternary @click="inviteVisible = false">
            取消
          </NButton>
          <NButton type="primary" :loading="inviteLoading" @click="confirmInvite">
            邀请
          </NButton>
        </div>
      </template>
    </NModal>

    <!-- 危险操作二次确认 -->
    <NModal
      v-model:show="danger.visible"
      preset="card"
      :title="danger.title"
      style="width: min(420px, 92vw)"
    >
      <p class="danger-msg">
        {{ danger.message }}
      </p>
      <p v-if="danger.error" class="invite-error">
        {{ danger.error }}
      </p>
      <template #footer>
        <div class="modal-footer">
          <NButton quaternary :disabled="danger.loading" @click="danger.visible = false">
            取消
          </NButton>
          <NButton type="error" :loading="danger.loading" @click="confirmDanger">
            确定
          </NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped lang="scss">
.member-panel {
  display: flex;
  flex-direction: column;
  gap: var(--lz-space-4);
  min-height: 320px;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--lz-text-primary);
}

.panel-sub {
  font-size: 12px;
}

.member-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.member-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
  border-radius: var(--lz-radius-lg);
  transition: background-color var(--lz-duration-base) var(--lz-ease-standard);

  &:hover {
    background: var(--lz-bg-hover);
  }
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--lz-radius-full);
  flex-shrink: 0;
  object-fit: cover;

  &--text {
    display: grid;
    place-items: center;
    font-size: 15px;
    font-weight: 600;
    color: var(--lz-text-primary);
  }
}

.member-meta {
  flex: 1;
  min-width: 0;
}

.member-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--lz-text-primary);
}

.member-sub {
  font-size: 12px;
}

.self-hint {
  font-size: 12px;
}

.invite-tip {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--lz-text-secondary);
  line-height: 1.6;
}

.invite-error {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--lz-danger);
}

.danger-msg {
  margin: 0;
  font-size: 14px;
  color: var(--lz-text-regular);
  line-height: 1.6;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
