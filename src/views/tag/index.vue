<script setup lang="ts">
/**
 * 标签管理页（用户级，不区分账本）
 * ====================================================================
 * - 列表展示全部标签（色点 + 名称）
 * - 顶部「新建标签」按钮
 * - 新建 / 编辑用 NModal：名称 NInput + 预设色板（10 色，默认轮换色）+ 自定义取色块
 * - 删除用 NPopconfirm，提示「删除后将从所有流水中移除该标签」
 */
import type { Tag } from '@/types/tag'
import { useMessage } from 'naive-ui'
import { computed, onMounted, reactive, ref } from 'vue'
import { createTag, deleteTag, updateTag } from '@/api/modules/tag'
import EmptyState from '@/components/business/empty-state/index.vue'
import { useTagStore } from '@/stores/modules/tag'

/** 预设色板（与契约一致） */
const TAG_COLORS = ['#378ADD', '#0F6E56', '#993C1D', '#993556', '#854F0B', '#534AB7', '#1D9E75', '#D85A30', '#A32D2D', '#5F5E5A']

const tagStore = useTagStore()
const message = useMessage()

const tags = computed<Tag[]>(() => tagStore.tags)

// ── 表单弹层 ─────────────────────────────────────────────
const formVisible = ref(false)
const formSubmitting = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({
  name: '',
  color: TAG_COLORS[0]!,
})

function openCreate() {
  editingId.value = null
  form.name = ''
  // 默认给一个轮换色，避免每次新建都是同一种
  form.color = TAG_COLORS[tagStore.tags.length % TAG_COLORS.length]!
  formVisible.value = true
}

function openEdit(tag: Tag) {
  editingId.value = tag.id
  form.name = tag.name
  // 预设色直接沿用；自定义色也保留（否则会被轮换色覆盖丢失）
  form.color = tag.color || TAG_COLORS[tagStore.tags.length % TAG_COLORS.length]!
  formVisible.value = true
}

// ── 自定义颜色 ───────────────────────────────────────────
const customInputRef = ref<HTMLInputElement | null>(null)
/** 当前颜色是否为自定义（不在预设色板里） */
const isCustomColor = computed(() => !TAG_COLORS.includes(form.color))

function openCustomPicker() {
  customInputRef.value?.click()
}

function onCustomPicked(e: Event) {
  const v = (e.target as HTMLInputElement).value
  if (v)
    form.color = v
}

async function submitForm() {
  const name = form.name.trim()
  if (!name)
    return message.warning('请输入标签名称')
  formSubmitting.value = true
  try {
    if (editingId.value == null) {
      const created = await createTag({ name, color: form.color })
      tagStore.tags.push(created)
      message.success('标签已添加')
    }
    else {
      const updated = await updateTag(editingId.value, { name, color: form.color })
      const idx = tagStore.tags.findIndex(t => t.id === updated.id)
      if (idx >= 0)
        tagStore.tags[idx] = updated
      message.success('标签已更新')
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

// ── 删除 ────────────────────────────────────────────────
const deleting = ref(false)
const targetDeleting = ref<Tag | null>(null)

async function confirmDelete() {
  if (!targetDeleting.value)
    return
  deleting.value = true
  const name = targetDeleting.value.name
  const id = targetDeleting.value.id
  try {
    await deleteTag(id)
    tagStore.tags = tagStore.tags.filter(t => t.id !== id)
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

onMounted(() => tagStore.ensureLoaded())
</script>

<template>
  <div class="tag-page">
    <header class="page-head">
      <div>
        <h1 class="page-title">
          标签
        </h1>
        <p class="page-sub">
          给流水打标签，用于按标签筛选与批量归类（标签为账号级，跨账本共享）。
        </p>
      </div>
      <NButton type="primary" @click="openCreate">
        新建标签
      </NButton>
    </header>

    <NCard class="tag-card">
      <EmptyState
        v-if="tags.length === 0"
        variant="ledger"
        title="还没有标签"
        desc="新建一个标签，记账时就能快速归类了"
      >
        <NButton type="primary" @click="openCreate">
          新建标签
        </NButton>
      </EmptyState>

      <ul v-else class="tag-list">
        <li v-for="tag in tags" :key="tag.id" class="tag-row">
          <span class="tag-dot" :style="{ background: tag.color }" />
          <span class="tag-name">{{ tag.name }}</span>
          <span class="tag-actions">
            <NButton size="tiny" quaternary @click="openEdit(tag)">
              编辑
            </NButton>
            <NPopconfirm
              positive-text="删除"
              negative-text="取消"
              @positive-click="confirmDelete"
            >
              <template #trigger>
                <NButton size="tiny" quaternary type="error" @click="targetDeleting = tag">
                  删除
                </NButton>
              </template>
              删除后将从所有流水中移除该标签，确定删除「{{ tag.name }}」吗？
            </NPopconfirm>
          </span>
        </li>
      </ul>
    </NCard>

    <!-- 新建 / 编辑 -->
    <NModal
      v-model:show="formVisible"
      preset="card"
      :title="editingId == null ? '新建标签' : '编辑标签'"
      style="width: min(420px, 92vw)"
    >
      <div class="form-body">
        <label class="form-label">名称</label>
        <NInput v-model:value="form.name" placeholder="如：可报销、固定支出" maxlength="20" />

        <label class="form-label">颜色</label>
        <div class="color-grid">
          <button
            v-for="c in TAG_COLORS"
            :key="c"
            type="button"
            class="color-cell"
            :class="{ active: form.color === c }"
            :style="{ background: c }"
            :aria-label="`颜色 ${c}`"
            :aria-pressed="form.color === c"
            @click="form.color = c"
          />
          <!-- 自定义块：未选自定义色时显示取色器外观，选中后显示自定义色 -->
          <button
            type="button"
            class="color-cell custom-cell"
            :class="{ active: isCustomColor }"
            :style="isCustomColor ? { background: form.color } : undefined"
            aria-label="自定义颜色"
            :aria-pressed="isCustomColor"
            @click="openCustomPicker"
          >
            <span v-if="!isCustomColor" class="custom-icon" aria-hidden="true">＋</span>
          </button>
          <input
            ref="customInputRef"
            type="color"
            class="custom-input"
            :value="isCustomColor ? form.color : '#378ADD'"
            aria-label="自定义颜色选择器"
            @input="onCustomPicked"
          >
        </div>
        <span v-if="isCustomColor" class="custom-hex">{{ form.color }}</span>
      </div>

      <template #footer>
        <div class="modal-footer">
          <NButton quaternary @click="formVisible = false">
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
.tag-page {
  display: flex;
  flex-direction: column;
  gap: var(--lz-space-6);
  padding: var(--lz-content-padding);
  max-width: 720px;
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

.tag-card {
  min-height: 200px;
}

.tag-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tag-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--lz-radius-lg);
  transition: background-color var(--lz-duration-base) var(--lz-ease-standard);

  &:hover {
    background: var(--lz-bg-hover);
  }
}

.tag-dot {
  width: 14px;
  height: 14px;
  border-radius: var(--lz-radius-full);
  flex-shrink: 0;
}

.tag-name {
  font-size: 14px;
  color: var(--lz-text-regular);
  flex: 1;
}

.tag-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--lz-duration-base) var(--lz-ease-standard);
}

.tag-row:hover .tag-actions {
  opacity: 1;
}

.form-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--lz-text-regular);
  margin-top: 4px;
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(11, minmax(0, 1fr));
  gap: 8px;
}

.custom-cell {
  display: flex;
  align-items: center;
  justify-content: center;

  &:not([style*='background']) {
    background: conic-gradient(#f66, #fc6, #6c6, #6cf, #96f, #f66);
  }
}

.custom-icon {
  font-size: 14px;
  line-height: 1;
  color: #fff;
  text-shadow: 0 0 2px rgb(0 0 0 / 50%);
  pointer-events: none;
}

.custom-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.custom-hex {
  font-size: 12px;
  color: var(--lz-text-secondary);
}

.color-cell {
  aspect-ratio: 1 / 1;
  padding: 0;
  border: 2px solid transparent;
  border-radius: var(--lz-radius-md);
  cursor: pointer;
  @include transition-paint();

  &:hover {
    transform: scale(1.08);
  }

  &.active {
    box-shadow: 0 0 0 2px var(--lz-bg-card), 0 0 0 4px currentColor;
    // currentColor 取不到背景色，改用描边高亮
    outline: 2px solid var(--lz-primary-500);
    outline-offset: 1px;
  }
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
