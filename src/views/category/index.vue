<script setup lang="ts">
import type { Category } from '@/types/transaction'
import { NButton, NColorPicker, NInput, NModal, NRadioButton, NRadioGroup, NSelect, useMessage } from 'naive-ui'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  createCategory,
  deleteCategory,
  findFallbackCategory,
  updateCategory,
} from '@/api/modules/category'
import { countCategoryUsage, reassignCategory } from '@/api/modules/transaction'
import { useDictStore } from '@/stores/modules/dict'

/**
 * 分类管理页（Now 清单 #1，PRD §15.2.1）
 * ====================================================================
 * 分类是记账灵魂：用户必须能自由增删改、建二级分类、调图标色块。
 * 这里是「字典管理」型页面 —— 只编排，所有读写走 api/modules/category，
 * 不在此处写任何过滤/聚合逻辑。
 *
 * 关键交互：
 *  - 树形：顶层分类 + 缩进的子分类（parentId 串联）
 *  - 删除迁移：有子分类 → 提升为一级；被交易引用 → 先选迁移目标再删
 *    （交易迁移走 transaction 模块的 reassignCategory，保持 category 不反向依赖 transaction）
 */

const dict = useDictStore()
const message = useMessage()

const categories = computed<Category[]>(() => dict.categories)

const expenseRoots = computed(() => categories.value.filter(c => c.type === 'expense' && c.parentId === null))
const incomeRoots = computed(() => categories.value.filter(c => c.type === 'income' && c.parentId === null))
function childrenOf(parentId: number): Category[] {
  return categories.value.filter(c => c.parentId === parentId)
}

// ── 图标 / 颜色 快捷候选（降低输入成本，也保证视觉统一） ──────────
const ICON_CANDIDATES = ['🍜', '🚇', '🛍️', '🏠', '🎮', '💊', '📚', '📱', '💼', '🎁', '📈', '💻', '✈️', '🐱', '☕', '🍺', '🏥', '🎓', '💡', '🎵']
const COLOR_CANDIDATES = ['#FF7A6B', '#5BA9FF', '#FF9F45', '#A78BFA', '#3CC6BC', '#F87171', '#60A5FA', '#818CF8', '#22C55E', '#0EA5E9', '#84CC16', '#94A3B8']

// ── 表单弹层 ─────────────────────────────────────────────
const formVisible = ref(false)
const formSubmitting = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({
  type: 'expense' as Category['type'],
  name: '',
  icon: '📦',
  color: '#5BA9FF',
  parentId: null as number | null,
})

/** 排除自己及其全部后代后的「可选父级」（避免把节点挂到自己子孙下形成环） */
function parentCandidates(): Category[] {
  const excludeId = editingId.value
  return categories.value.filter((c) => {
    if (c.type !== form.type)
      return false
    if (c.parentId !== null)
      return false
    if (excludeId != null && (c.id === excludeId || isDescendant(c.id, excludeId)))
      return false
    return true
  })
}

/** 判断 nodeId 是否为 ancestorId 的后代（沿 parentId 向上回溯） */
function isDescendant(nodeId: number, ancestorId: number): boolean {
  let cur: Category | undefined = categories.value.find(c => c.id === nodeId)
  while (cur && cur.parentId !== null) {
    if (cur.parentId === ancestorId)
      return true
    cur = categories.value.find(c => c.id === cur!.parentId)
  }
  return false
}

const parentOptions = computed(() => parentCandidates().map(c => ({ label: `${c.icon} ${c.name}`, value: c.id })))

function openCreate(type: Category['type']) {
  editingId.value = null
  form.type = type
  form.name = ''
  form.icon = type === 'expense' ? '📦' : '💰'
  form.color = type === 'expense' ? '#5BA9FF' : '#22C55E'
  form.parentId = null
  formVisible.value = true
}

function openEdit(cat: Category) {
  editingId.value = cat.id
  form.type = cat.type
  form.name = cat.name
  form.icon = cat.icon
  form.color = cat.color
  form.parentId = cat.parentId
  formVisible.value = true
}

async function submitForm() {
  const name = form.name.trim()
  if (!name)
    return message.warning('请输入分类名称')
  formSubmitting.value = true
  try {
    if (editingId.value == null) {
      await createCategory({ type: form.type, name, icon: form.icon, color: form.color, parentId: form.parentId })
      message.success('分类已添加')
    }
    else {
      await updateCategory(editingId.value, { type: form.type, name, icon: form.icon, color: form.color, parentId: form.parentId })
      message.success('分类已更新')
    }
    formVisible.value = false
    // 写操作改了字典，刷新 dict 缓存让记账弹层/流水页立即生效
    await dict.refresh()
  }
  finally {
    formSubmitting.value = false
  }
}

// ── 删除确认弹层 ───────────────────────────────────────
const deleteVisible = ref(false)
const deleting = ref(false)
const targetDeleting = ref<Category | null>(null)
const usageCount = ref(0)
const childCount = ref(0)
const migrationTarget = ref<number | null>(null)

/** 可迁移目标：同类型分类，排除被删项本身 */
const migrationOptions = computed(() => {
  if (!targetDeleting.value)
    return []
  return categories.value
    .filter(c => c.type === targetDeleting.value!.type && c.id !== targetDeleting.value!.id)
    .map(c => ({ label: `${c.icon} ${c.name}`, value: c.id }))
})

async function openDelete(cat: Category) {
  targetDeleting.value = cat
  usageCount.value = await countCategoryUsage(cat.id)
  childCount.value = childrenOf(cat.id).length
  // 默认迁移到同类型「其他」兜底分类
  const fallback = await findFallbackCategory(cat.type)
  migrationTarget.value = (fallback && fallback.id !== cat.id) ? fallback.id : null
  deleteVisible.value = true
}

async function confirmDelete() {
  if (!targetDeleting.value)
    return
  if (usageCount.value > 0 && migrationTarget.value == null)
    return message.warning('请选择交易迁移目标分类')
  deleting.value = true
  try {
    // 1) 交易先迁移到目标分类（保持总数与统计不丢）
    if (usageCount.value > 0 && migrationTarget.value != null)
      await reassignCategory(targetDeleting.value.id, migrationTarget.value)
    // 2) 再删分类（子分类会自动提升为一级，见 mockDeleteCategory）
    await deleteCategory(targetDeleting.value.id)
    message.success(`已删除「${targetDeleting.value.name}」${childCount.value > 0 ? '，子分类已提升为一级' : ''}`)
    deleteVisible.value = false
    await dict.refresh()
  }
  finally {
    deleting.value = false
  }
}

onMounted(() => dict.ensureCategories())

// 类型切换时，若当前父级与类型不匹配则清空（父级必须同类型）
watch(() => form.type, () => {
  if (form.parentId != null) {
    const p = categories.value.find(c => c.id === form.parentId)
    if (!p || p.type !== form.type)
      form.parentId = null
  }
})
</script>

<template>
  <div class="category-page">
    <header class="page-head">
      <div>
        <h1 class="page-title">
          分类管理
        </h1>
        <p class="page-sub">
          管理支出与收入分类，支持二级分类、图标与色块自定义。
        </p>
      </div>
    </header>

    <div class="cat-groups">
      <!-- 支出 -->
      <section class="cat-group">
        <div class="group-head">
          <span class="group-title"><span class="dot dot-expense" /> 支出分类</span>
          <NButton size="small" tertiary type="primary" @click="openCreate('expense')">
            + 新增
          </NButton>
        </div>
        <ul class="cat-list">
          <template v-for="root in expenseRoots" :key="root.id">
            <li class="cat-row">
              <span class="cat-icon" :style="{ background: `${root.color}22`, color: root.color }">{{ root.icon }}</span>
              <span class="cat-name">{{ root.name }}</span>
              <span v-if="childrenOf(root.id).length" class="cat-badge">{{ childrenOf(root.id).length }} 个子项</span>
              <span class="cat-actions">
                <NButton size="tiny" quaternary @click="openEdit(root)">编辑</NButton>
                <NButton size="tiny" quaternary type="error" @click="openDelete(root)">删除</NButton>
              </span>
            </li>
            <li
              v-for="child in childrenOf(root.id)"
              :key="child.id"
              class="cat-row cat-row--child"
            >
              <span class="child-connector" />
              <span class="cat-icon cat-icon--sm" :style="{ background: `${child.color}22`, color: child.color }">{{ child.icon }}</span>
              <span class="cat-name">{{ child.name }}</span>
              <span class="cat-actions">
                <NButton size="tiny" quaternary @click="openEdit(child)">编辑</NButton>
                <NButton size="tiny" quaternary type="error" @click="openDelete(child)">删除</NButton>
              </span>
            </li>
          </template>
        </ul>
      </section>

      <!-- 收入 -->
      <section class="cat-group">
        <div class="group-head">
          <span class="group-title"><span class="dot dot-income" /> 收入分类</span>
          <NButton size="small" tertiary type="primary" @click="openCreate('income')">
            + 新增
          </NButton>
        </div>
        <ul class="cat-list">
          <template v-for="root in incomeRoots" :key="root.id">
            <li class="cat-row">
              <span class="cat-icon" :style="{ background: `${root.color}22`, color: root.color }">{{ root.icon }}</span>
              <span class="cat-name">{{ root.name }}</span>
              <span v-if="childrenOf(root.id).length" class="cat-badge">{{ childrenOf(root.id).length }} 个子项</span>
              <span class="cat-actions">
                <NButton size="tiny" quaternary @click="openEdit(root)">编辑</NButton>
                <NButton size="tiny" quaternary type="error" @click="openDelete(root)">删除</NButton>
              </span>
            </li>
            <li
              v-for="child in childrenOf(root.id)"
              :key="child.id"
              class="cat-row cat-row--child"
            >
              <span class="child-connector" />
              <span class="cat-icon cat-icon--sm" :style="{ background: `${child.color}22`, color: child.color }">{{ child.icon }}</span>
              <span class="cat-name">{{ child.name }}</span>
              <span class="cat-actions">
                <NButton size="tiny" quaternary @click="openEdit(child)">编辑</NButton>
                <NButton size="tiny" quaternary type="error" @click="openDelete(child)">删除</NButton>
              </span>
            </li>
          </template>
        </ul>
      </section>
    </div>

    <!-- 新增 / 编辑 -->
    <NModal
      v-model:show="formVisible"
      preset="card"
      :title="editingId == null ? '新增分类' : '编辑分类'"
      style="width: min(460px, 92vw)"
    >
      <div class="form-body">
        <NRadioGroup v-model:value="form.type" class="type-group">
          <NRadioButton value="expense">
            支出
          </NRadioButton>
          <NRadioButton value="income">
            收入
          </NRadioButton>
        </NRadioGroup>

        <label class="form-label">名称</label>
        <NInput v-model:value="form.name" placeholder="如：餐饮、工资" maxlength="20" />

        <label class="form-label">上级分类（可选）</label>
        <NSelect
          v-model:value="form.parentId"
          :options="parentOptions"
          placeholder="不选择则为一级分类"
          clearable
        />

        <label class="form-label">图标</label>
        <div class="icon-grid">
          <button
            v-for="ic in ICON_CANDIDATES"
            :key="ic"
            type="button"
            class="icon-cell"
            :class="{ active: form.icon === ic }"
            @click="form.icon = ic"
          >
            {{ ic }}
          </button>
        </div>

        <label class="form-label">颜色</label>
        <div class="color-row">
          <NColorPicker v-model:value="form.color" :show-alpha="false" :swatches="COLOR_CANDIDATES" />
          <span class="color-preview" :style="{ background: form.color }" />
          <span class="color-hex">{{ form.color.toUpperCase() }}</span>
        </div>
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

    <!-- 删除确认 -->
    <NModal
      v-model:show="deleteVisible"
      preset="card"
      title="删除分类"
      style="width: min(440px, 92vw)"
    >
      <div class="delete-body">
        <p class="delete-warn">
          确定删除「<b>{{ targetDeleting?.name }}</b>」吗？
        </p>
        <ul class="delete-points">
          <li v-if="childCount > 0">
            该分类下有 <b>{{ childCount }}</b> 个子分类，删除后将自动提升为一级分类。
          </li>
          <li v-if="usageCount > 0">
            当前有 <b>{{ usageCount }}</b> 笔交易使用此分类，删除前请选择迁移目标：
            <NSelect
              v-model:value="migrationTarget"
              :options="migrationOptions"
              placeholder="选择交易迁移到哪个分类"
              class="migration-select"
            />
          </li>
          <li v-if="usageCount === 0 && childCount === 0">
            无子分类、无交易引用，可安全删除。
          </li>
        </ul>
      </div>
      <template #footer>
        <div class="modal-footer">
          <NButton quaternary @click="deleteVisible = false">
            取消
          </NButton>
          <NButton type="error" :loading="deleting" @click="confirmDelete">
            删除
          </NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped lang="scss">
.category-page {
  display: flex;
  flex-direction: column;
  gap: var(--lz-space-6);
  padding: var(--lz-content-padding);
  max-width: 960px;
  margin: 0 auto;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--lz-text-primary);
  margin: 0;
}

.page-sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--lz-text-secondary);
}

.cat-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--lz-space-5);
}

.cat-group {
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  padding: var(--lz-space-4);
}

.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--lz-space-3);
}

.group-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--lz-text-primary);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: var(--lz-radius-full);
}

.dot-expense {
  background: var(--lz-danger);
}

.dot-income {
  background: var(--lz-success);
}

.cat-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cat-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--lz-radius-lg);
  transition: background-color var(--lz-duration-base) var(--lz-ease-standard);

  &:hover {
    background: var(--lz-bg-hover);
  }
}

.cat-row--child {
  padding-left: 22px;
}

.child-connector {
  width: 14px;
  height: 1px;
  background: var(--lz-border);
  flex-shrink: 0;
}

.cat-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--lz-radius-md);
  font-size: 16px;
  flex-shrink: 0;
}

.cat-icon--sm {
  width: 26px;
  height: 26px;
  font-size: 14px;
}

.cat-name {
  font-size: 14px;
  color: var(--lz-text-regular);
  flex: 1;
}

.cat-badge {
  font-size: 12px;
  color: var(--lz-text-secondary);
  background: var(--lz-bg-page);
  padding: 2px 8px;
  border-radius: var(--lz-radius-full);
}

.cat-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--lz-duration-base) var(--lz-ease-standard);
}

.cat-row:hover .cat-actions {
  opacity: 1;
}

// ── 表单 ────────────────────────────────────────────────
.form-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.type-group {
  align-self: flex-start;
}

.form-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--lz-text-regular);
  margin-top: 4px;
}

.icon-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.icon-cell {
  width: 34px;
  height: 34px;
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-md);
  background: var(--lz-bg-card);
  font-size: 16px;
  cursor: pointer;
  transition: all var(--lz-duration-base) var(--lz-ease-standard);

  &:hover {
    border-color: var(--lz-primary-300);
  }

  &.active {
    border-color: var(--lz-primary-600);
    background: var(--lz-primary-50);
    box-shadow: 0 0 0 2px var(--lz-primary-100);
  }
}

.color-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.color-preview {
  width: 28px;
  height: 28px;
  border-radius: var(--lz-radius-md);
  border: 1px solid var(--lz-border);
}

.color-hex {
  font-size: 13px;
  color: var(--lz-text-secondary);
  font-family: var(--lz-font-num);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

// ── 删除确认 ───────────────────────────────────────────
.delete-body {
  font-size: 14px;
  color: var(--lz-text-regular);
}

.delete-warn {
  margin: 0 0 10px;
}

.delete-points {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--lz-text-secondary);

  b {
    color: var(--lz-text-primary);
  }
}

.migration-select {
  margin-top: 6px;
}
</style>
