<script setup lang="ts">
import type { BadgeDef, BadgeStat, UserBadge } from '@/types/badge'
import { useMessage } from 'naive-ui'
/**
 * 勋章管理（超管专属，路由 roles + 守卫双重拦截）
 * ====================================================================
 * 三块：
 *   1. 勋章定义：卡片墙 + 新建/编辑弹窗（含图标上传，走后端 /api/badges/icon）
 *   2. 获得统计：每枚勋章的持有人数
 *   3. 用户勋章：按用户 ID 查其勋章 + 手动授予/撤销（把 36 枚猫图用起来）
 * 图标全部走后端静态资源 URL（/uploads/**），前端不打包、不占小程序包。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  adminListBadges,
  badgeStats,
  createBadge,
  deleteBadge,
  grantBadge,
  listUserBadges,
  resolveBadgeUser,
  revokeBadge,
  updateBadge,
  uploadBadgeIcon,
} from '@/api/modules/badge'

const message = useMessage()

const tab = ref<'defs' | 'stats' | 'users'>('defs')

// ── 渐变解析 / 组合（兜底展示用） ─────────────────────────────
function parseGradient(g?: string) {
  const defAngle = 135
  const defStart = '#FFD56B'
  const defEnd = '#FF9A3D'
  if (!g)
    return { angle: defAngle, start: defStart, end: defEnd }
  const parts = g.split(',')
  let angle = defAngle
  let start = defStart
  let end = defEnd
  if (parts[0]?.includes('deg'))
    angle = Number.parseInt(parts[0], 10) || defAngle
  if (parts[1])
    start = parts[1].trim()
  if (parts[2])
    end = parts[2].trim()
  return { angle, start, end }
}

function gradientCss(g?: string) {
  const { angle, start, end } = parseGradient(g)
  return `linear-gradient(${angle}deg, ${start}, ${end})`
}

// ── 1. 勋章定义 ─────────────────────────────────────────────
const loading = ref(false)
const badges = ref<BadgeDef[]>([])

async function loadBadges() {
  loading.value = true
  try {
    badges.value = await adminListBadges()
  }
  catch {
    message.error('加载勋章失败')
  }
  finally {
    loading.value = false
  }
}

const formVisible = ref(false)
const formSubmitting = ref(false)
const editingId = ref<number | null>(null)
const uploading = ref(false)
const previewIcon = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const form = reactive({
  name: '',
  category: '',
  description: '',
  conditionType: 'MANUAL',
  threshold: null as number | null,
  sortOrder: 0,
  enabled: true,
  code: '',
  gradientAngle: 135,
  gradientStart: '#FFD56B',
  gradientEnd: '#FF9A3D',
})

const formGradient = computed(() => `${form.gradientAngle}deg,${form.gradientStart},${form.gradientEnd}`)

function resetForm() {
  form.name = ''
  form.category = ''
  form.description = ''
  form.conditionType = 'MANUAL'
  form.threshold = null
  form.sortOrder = 0
  form.enabled = true
  form.code = ''
  form.gradientAngle = 135
  form.gradientStart = '#FFD56B'
  form.gradientEnd = '#FF9A3D'
  previewIcon.value = null
  editingId.value = null
}

function openCreate() {
  resetForm()
  formVisible.value = true
}

function openEdit(b: BadgeDef) {
  editingId.value = b.id
  form.name = b.name
  form.category = b.category ?? ''
  form.description = b.description ?? ''
  form.conditionType = b.conditionType ?? 'MANUAL'
  form.threshold = b.threshold ?? null
  form.sortOrder = b.sortOrder ?? 0
  form.enabled = b.enabled ?? true
  form.code = b.code ?? ''
  const g = parseGradient(b.gradient)
  form.gradientAngle = g.angle
  form.gradientStart = g.start
  form.gradientEnd = g.end
  previewIcon.value = b.iconUrl ?? null
  formVisible.value = true
}

function pickIcon() {
  fileInputRef.value?.click()
}

async function onIconPicked(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 允许重复选同一文件
  if (!file)
    return
  uploading.value = true
  try {
    const res = await uploadBadgeIcon(file)
    previewIcon.value = res.url
    message.success('图标已上传')
  }
  catch {
    message.error('图标上传失败（仅支持 PNG/JPG/WebP，≤2MB）')
  }
  finally {
    uploading.value = false
  }
}

function removeIcon() {
  previewIcon.value = null
}

async function submitForm() {
  const name = form.name.trim()
  if (!name)
    return message.warning('请输入勋章名称')
  formSubmitting.value = true
  const payload = {
    name,
    category: form.category.trim() || undefined,
    description: form.description.trim() || undefined,
    gradient: formGradient.value,
    conditionType: form.conditionType,
    threshold: form.conditionType === 'MANUAL' ? undefined : form.threshold ?? undefined,
    sortOrder: form.sortOrder,
    enabled: form.enabled,
    code: form.code.trim() || undefined,
    iconUrl: previewIcon.value ?? undefined,
  }
  try {
    if (editingId.value == null) {
      const created = await createBadge(payload)
      badges.value.push(created)
      message.success('勋章已创建')
    }
    else {
      const updated = await updateBadge(editingId.value, payload)
      const idx = badges.value.findIndex(b => b.id === updated.id)
      if (idx >= 0)
        badges.value[idx] = updated
      message.success('勋章已更新')
    }
    formVisible.value = false
  }
  catch {
    message.error('保存失败')
  }
  finally {
    formSubmitting.value = false
  }
}

const targetDeleting = ref<BadgeDef | null>(null)
const deleting = ref(false)

async function confirmDelete() {
  if (!targetDeleting.value)
    return
  deleting.value = true
  const { id, name } = targetDeleting.value
  try {
    await deleteBadge(id)
    badges.value = badges.value.filter(b => b.id !== id)
    message.success(`已删除「${name}」`)
  }
  catch {
    message.error('删除失败')
  }
  finally {
    deleting.value = false
    targetDeleting.value = null
  }
}

async function toggleEnabled(b: BadgeDef, val: boolean) {
  try {
    const updated = await updateBadge(b.id, { enabled: val })
    const idx = badges.value.findIndex(x => x.id === b.id)
    if (idx >= 0)
      badges.value[idx] = updated
  }
  catch {
    message.error('更新状态失败')
  }
}

// ── 2. 获得统计 ─────────────────────────────────────────────
const stats = ref<BadgeStat[]>([])
const statsLoading = ref(false)

async function loadStats() {
  statsLoading.value = true
  try {
    stats.value = await badgeStats()
  }
  catch {
    message.error('加载统计失败')
  }
  finally {
    statsLoading.value = false
  }
}

const maxEarned = computed(() => stats.value.reduce((m, s) => Math.max(m, s.earnedCount), 0))

// ── 3. 用户勋章 ─────────────────────────────────────────────
const userQuery = ref('')
const resolvedUserId = ref<number | null>(null)
const userBadges = ref<UserBadge[]>([])
const userBadgesLoading = ref(false)
const grantBadgeId = ref<number | null>(null)
const granting = ref(false)

async function lookupUser() {
  if (!userQuery.value.trim())
    return message.warning('请输入用户账号或 ID')
  userBadgesLoading.value = true
  try {
    // 后端解析：纯数字当用户 ID，否则按账号（用户名）查
    resolvedUserId.value = await resolveBadgeUser(userQuery.value.trim())
    userBadges.value = await listUserBadges(resolvedUserId.value)
  }
  catch {
    resolvedUserId.value = null
    userBadges.value = []
    message.error('查询失败（用户不存在或无权限）')
  }
  finally {
    userBadgesLoading.value = false
  }
}

async function doGrant() {
  if (!resolvedUserId.value || grantBadgeId.value == null)
    return
  granting.value = true
  try {
    await grantBadge(resolvedUserId.value, grantBadgeId.value)
    message.success('已授予')
    grantBadgeId.value = null
    await lookupUser()
  }
  catch {
    message.error('授予失败')
  }
  finally {
    granting.value = false
  }
}

async function doRevoke(b: UserBadge) {
  if (!resolvedUserId.value)
    return
  try {
    await revokeBadge(resolvedUserId.value, b.badgeId)
    message.success('已撤销')
    await lookupUser()
  }
  catch {
    message.error('撤销失败')
  }
}

// 条件类型与小程序 badge-catalog.ts 的 cond.kind 对齐（跨端唯一权威），
// 后端只存字符串不校验；阈值含义随 kind 解释（笔数/天数/百分比/元）。
// 手动类保持大写 MANUAL（表单/模板里以此判断是否展示阈值输入）。
const conditionOptions = [
  { label: '手动授予', value: 'MANUAL' },
  { label: '累计笔数', value: 'count' },
  { label: '连记天数', value: 'streak' },
  { label: '分类覆盖数', value: 'cats' },
  { label: '单月满勤', value: 'monthFull' },
  { label: '连续满勤月数', value: 'fullMonths' },
  { label: '守预算月数', value: 'budgetKeep' },
  { label: '建预算复合达标', value: 'budgetMaster' },
  { label: '既有收又有支', value: 'both' },
  { label: '收支均衡', value: 'balance' },
  { label: '月收入≥支出', value: 'selfSufficient' },
  { label: '月储蓄率%', value: 'savingRate' },
  { label: '净资产（元）', value: 'netAsset' },
  { label: '共享账本笔数', value: 'sharedTxn' },
  { label: '连记共享天数', value: 'sharedStreak' },
  { label: '创建过共享账本', value: 'sharedHost' },
  { label: '共享账本人数', value: 'sharedMembers' },
  { label: '节日纪念', value: 'festival' },
  { label: '时段打卡', value: 'timeWindow' },
  { label: '极简记账', value: 'minimal' },
]

function conditionLabel(t?: string) {
  return conditionOptions.find(o => o.value === t)?.label ?? t ?? '手动'
}

const grantOptions = computed(() =>
  badges.value.map(b => ({ label: b.name, value: b.id })))

watch(tab, (t) => {
  if (t === 'stats' && stats.value.length === 0)
    loadStats()
})

onMounted(loadBadges)
</script>

<template>
  <div class="badge-page">
    <header class="page-head">
      <div>
        <h1 class="page-title">
          勋章管理
        </h1>
        <p class="page-sub">
          维护勋章定义与图标（图标由后端托管，下发 URL，不进小程序包）；可手动授予用户。
        </p>
      </div>
      <NButton v-if="tab === 'defs'" type="primary" @click="openCreate">
        新建勋章
      </NButton>
    </header>

    <NTabs v-model:value="tab" type="line" class="badge-tabs">
      <NTabPane name="defs" tab="勋章定义">
        <!-- 卡片墙 -->
        <div v-if="loading" class="state-tip">
          加载中…
        </div>
        <NEmpty v-else-if="badges.length === 0" description="还没有勋章，点「新建勋章」开始添加" class="state-tip">
          <template #extra>
            <NButton type="primary" @click="openCreate">
              新建勋章
            </NButton>
          </template>
        </NEmpty>

        <div v-else class="badge-grid">
          <div v-for="b in badges" :key="b.id" class="badge-card">
            <div
              class="badge-medal"
              :style="b.iconUrl ? undefined : { background: gradientCss(b.gradient) }"
            >
              <img v-if="b.iconUrl" :src="b.iconUrl" alt="">
            </div>
            <div class="badge-info">
              <div class="badge-name-row">
                <span class="badge-name">{{ b.name }}</span>
                <NTag v-if="b.category" size="small" :bordered="false" type="info">
                  {{ b.category }}
                </NTag>
              </div>
              <div class="badge-meta">
                {{ conditionLabel(b.conditionType) }}
                <template v-if="b.threshold != null && b.conditionType !== 'MANUAL'">
                  · 阈值 {{ b.threshold }}
                </template>
              </div>
              <div v-if="b.description" class="badge-desc">
                {{ b.description }}
              </div>
            </div>
            <div class="badge-actions">
              <NSwitch
                :value="b.enabled"
                size="small"
                @update:value="(v: boolean) => toggleEnabled(b, v)"
              />
              <NButton size="tiny" quaternary @click="openEdit(b)">
                编辑
              </NButton>
              <NPopconfirm
                positive-text="删除"
                negative-text="取消"
                @positive-click="confirmDelete"
              >
                <template #trigger>
                  <NButton size="tiny" quaternary type="error" @click="targetDeleting = b">
                    删除
                  </NButton>
                </template>
                删除后将一并清除所有用户持有记录，确定删除「{{ b.name }}」吗？
              </NPopconfirm>
            </div>
          </div>
        </div>
      </NTabPane>

      <NTabPane name="stats" tab="获得统计">
        <div v-if="statsLoading" class="state-tip">
          加载中…
        </div>
        <NEmpty v-else-if="stats.length === 0" description="暂无勋章" class="state-tip" />
        <ul v-else class="stat-list">
          <li v-for="s in stats" :key="s.badgeId" class="stat-row">
            <div
              class="stat-medal"
              :style="s.iconUrl ? undefined : { background: gradientCss(undefined) }"
            >
              <img v-if="s.iconUrl" :src="s.iconUrl" alt="">
            </div>
            <div class="stat-main">
              <div class="stat-name">
                {{ s.name }}
                <NTag v-if="s.category" size="small" :bordered="false" type="info">
                  {{ s.category }}
                </NTag>
              </div>
              <div class="stat-bar">
                <div
                  class="stat-bar-fill"
                  :style="{ width: maxEarned > 0 ? `${(s.earnedCount / maxEarned) * 100}%` : '0%' }"
                />
              </div>
            </div>
            <div class="stat-count">
              {{ s.earnedCount }} 人
            </div>
          </li>
        </ul>
      </NTabPane>

      <NTabPane name="users" tab="用户勋章">
        <div class="lookup-bar">
          <NInput
            v-model:value="userQuery"
            clearable
            placeholder="输入用户账号或 ID"
            class="lookup-input"
            @keyup.enter="lookupUser"
          />
          <NButton type="primary" :loading="userBadgesLoading" @click="lookupUser">
            查询
          </NButton>
        </div>

        <div v-if="userBadgesLoading" class="state-tip">
          加载中…
        </div>
        <template v-else>
          <div class="grant-bar">
            <NSelect
              v-model:value="grantBadgeId"
              :options="grantOptions"
              placeholder="选择要授予的勋章"
              class="grant-select"
              filterable
            />
            <NButton type="primary" :disabled="grantBadgeId == null" :loading="granting" @click="doGrant">
              授予
            </NButton>
          </div>

          <NEmpty v-if="userBadges.length === 0" description="该用户暂未获得任何勋章" class="state-tip" />
          <div v-else class="badge-grid">
            <div v-for="ub in userBadges" :key="ub.id" class="badge-card">
              <div
                class="badge-medal"
                :style="ub.iconUrl ? undefined : { background: gradientCss(ub.gradient) }"
              >
                <img v-if="ub.iconUrl" :src="ub.iconUrl" alt="">
              </div>
              <div class="badge-info">
                <div class="badge-name-row">
                  <span class="badge-name">{{ ub.name }}</span>
                  <NTag v-if="ub.source" size="small" :bordered="false">
                    {{ ub.source === 'MANUAL' ? '手动' : '自动' }}
                  </NTag>
                </div>
                <div v-if="ub.description" class="badge-desc">
                  {{ ub.description }}
                </div>
              </div>
              <div class="badge-actions">
                <NButton size="tiny" quaternary type="error" @click="doRevoke(ub)">
                  撤销
                </NButton>
              </div>
            </div>
          </div>
        </template>
      </NTabPane>
    </NTabs>

    <!-- 新建 / 编辑 -->
    <NModal
      v-model:show="formVisible"
      preset="card"
      :title="editingId == null ? '新建勋章' : '编辑勋章'"
      style="width: min(480px, 92vw)"
    >
      <div class="form-body">
        <label class="form-label">名称</label>
        <NInput v-model:value="form.name" placeholder="如：百笔达成" maxlength="32" />

        <label class="form-label">图标</label>
        <div class="icon-row">
          <div
            class="icon-preview"
            :style="previewIcon ? undefined : { background: gradientCss(formGradient) }"
          >
            <img v-if="previewIcon" :src="previewIcon" alt="">
          </div>
          <div class="icon-controls">
            <NButton size="small" :loading="uploading" @click="pickIcon">
              {{ previewIcon ? '更换图标' : '上传图标' }}
            </NButton>
            <NButton v-if="previewIcon" size="small" quaternary type="error" @click="removeIcon">
              移除
            </NButton>
            <p class="icon-hint">
              PNG / JPG / WebP，≤2MB；不传则用渐变兜底
            </p>
          </div>
          <input
            ref="fileInputRef"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            class="hidden-file"
            @change="onIconPicked"
          >
        </div>

        <label class="form-label">分类</label>
        <NInput v-model:value="form.category" placeholder="如：记账 / 资产 / 活跃" maxlength="32" />

        <label class="form-label">描述</label>
        <NInput
          v-model:value="form.description"
          type="textarea"
          placeholder="一句话说明达成条件"
          maxlength="255"
          :autosize="{ minRows: 2, maxRows: 4 }"
        />

        <label class="form-label">达成条件类型</label>
        <NSelect v-model:value="form.conditionType" :options="conditionOptions" />

        <label v-if="form.conditionType !== 'MANUAL'" class="form-label">阈值</label>
        <NInputNumber
          v-if="form.conditionType !== 'MANUAL'"
          v-model:value="form.threshold"
          :min="0"
          placeholder="如 100（笔 / 天）"
          class="full"
        />

        <label class="form-label">兜底渐变</label>
        <div class="gradient-row">
          <input v-model="form.gradientStart" type="color" class="color-input" aria-label="渐变起始色">
          <input v-model="form.gradientEnd" type="color" class="color-input" aria-label="渐变结束色">
          <NInputNumber v-model:value="form.gradientAngle" :min="0" :max="360" class="angle-input" />
          <span class="angle-hint">°</span>
        </div>

        <label class="form-label">排序 / 编码</label>
        <div class="dual-row">
          <NInputNumber v-model:value="form.sortOrder" :min="0" placeholder="排序" class="full" />
          <NInput v-model:value="form.code" placeholder="稳定编码(可选)" maxlength="64" class="full" />
        </div>

        <label class="form-label">启用</label>
        <NSwitch v-model:value="form.enabled" />
      </div>

      <template #footer>
        <div class="modal-footer">
          <NButton quaternary :disabled="formSubmitting" @click="formVisible = false">
            取消
          </NButton>
          <NButton type="primary" :loading="formSubmitting" @click="submitForm">
            保存
          </NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped lang="scss">
.badge-page {
  display: flex;
  flex-direction: column;
  gap: var(--lz-space-5);
  padding: var(--lz-content-padding);
  max-width: 1080px;
  margin: 0 auto;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--lz-text-primary);
}

.page-sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--lz-text-secondary);
}

.badge-tabs {
  margin-top: 4px;
}

.state-tip {
  padding: var(--lz-space-8) 0;
}

.badge-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--lz-space-4);
}

.badge-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: var(--lz-space-4);
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  transition: border-color var(--lz-duration-base), box-shadow var(--lz-duration-base);

  &:hover {
    border-color: var(--lz-primary-300);
    box-shadow: var(--lz-shadow-sm);
  }
}

.badge-medal {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;
  display: grid;
  place-items: center;
  box-shadow: var(--lz-shadow-sm);

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.badge-info {
  flex: 1;
  min-width: 0;
}

.badge-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.badge-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--lz-text-primary);
}

.badge-meta {
  margin-top: 2px;
  font-size: 12px;
  color: var(--lz-text-secondary);
}

.badge-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--lz-text-secondary);
  line-height: 1.5;
  @include ellipsis-lines(2);
}

.badge-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

/* 统计 */
.stat-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stat-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: var(--lz-space-3) var(--lz-space-4);
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-lg);
}

.stat-medal {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  display: grid;
  place-items: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.stat-main {
  flex: 1;
  min-width: 0;
}

.stat-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--lz-text-primary);
}

.stat-bar {
  margin-top: 6px;
  height: 6px;
  border-radius: 99px;
  background: var(--lz-bg-hover);
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  border-radius: 99px;
  background: var(--lz-primary-500);
  transition: width var(--lz-duration-slow) var(--lz-ease-standard);
}

.stat-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--lz-text-regular);
  flex-shrink: 0;
}

/* 用户勋章 */
.lookup-bar {
  display: flex;
  gap: 8px;
  margin-bottom: var(--lz-space-4);
}

.lookup-input {
  width: 200px;
}

.grant-bar {
  display: flex;
  gap: 8px;
  margin-bottom: var(--lz-space-4);
}

.grant-select {
  flex: 1;
  max-width: 360px;
}

/* 表单 */
.form-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--lz-text-regular);
  margin-top: 6px;
}

.full {
  width: 100%;
}

.icon-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.icon-preview {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border: 1px solid var(--lz-border);

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.icon-controls {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.icon-hint {
  margin: 0;
  font-size: 11px;
  color: var(--lz-text-secondary);
}

.hidden-file {
  display: none;
}

.gradient-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-input {
  width: 36px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-md);
  background: none;
  cursor: pointer;
}

.angle-input {
  width: 96px;
}

.angle-hint {
  font-size: 13px;
  color: var(--lz-text-secondary);
}

.dual-row {
  display: flex;
  gap: 8px;

  > * {
    flex: 1;
  }
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
