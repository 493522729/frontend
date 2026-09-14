<script setup lang="ts">
import type { Category } from '@/types/transaction'
import { useMessage } from 'naive-ui'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  createCategory,
  deleteCategory,
  findFallbackCategory,
  reorderCategories,
  updateCategory,
} from '@/api/modules/category'
import { countCategoryUsage, reassignCategory } from '@/api/modules/transaction'
import EmptyState from '@/components/business/empty-state/index.vue'
import TwemojiIcon from '@/components/business/twemoji-icon/index.vue'
import { useDictStore } from '@/stores/modules/dict'
import { useSettingsStore } from '@/stores/modules/settings'
import { emojiOption, renderEmojiLabel } from '@/utils/select-option'

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
const settings = useSettingsStore()
const message = useMessage()

// 分组色点跟随「系统设置 → 金额配色偏好」：用户切成 A 股红收时，
// 这里的支出/收入色点会跟着翻转，不再和金额颜色打架
const expenseDotColor = computed(() => settings.typeColor('expense'))
const incomeDotColor = computed(() => settings.typeColor('income'))

const categories = computed<Category[]>(() => dict.categories)

const expenseRoots = computed(() => categories.value.filter(c => c.type === 'expense' && c.parentId === null))
const incomeRoots = computed(() => categories.value.filter(c => c.type === 'income' && c.parentId === null))
function childrenOf(parentId: number): Category[] {
  return categories.value.filter(c => c.parentId === parentId)
}

// ── 图标 / 颜色 快捷候选（降低输入成本，也保证视觉统一） ──────────
/**
 * 图标候选分 3 组，每组 20 个（弹层里正好铺满两行，10 列 × 2 行）。
 * 默认展示第 1 组，底部「换一批」在组间循环 —— 候选项太多会显得杂，
 * 分组后既保持弹层高度稳定，又能覆盖更多场景（餐饮/交通/数码/收入/理财…）。
 */
const ICON_GROUPS: string[][] = [
  // 组 1：日常高频（新建时的默认图标 📦 / 💰 也在这组，保证打开就能看到选中态）
  ['📦', '💰', '🍜', '🚇', '🛍️', '🏠', '🎮', '💊', '📚', '📱', '💼', '🎁', '☕', '🍺', '🏥', '🎓', '💡', '🎵', '✈️', '🐱'],
  // 组 2：生活开销（吃喝、出行、穿搭、水电、娱乐）
  ['🍚', '🍔', '🍰', '🚌', '🚗', '⛽', '👕', '👟', '💄', '🧴', '🛒', '🏨', '🚿', '⚡', '📶', '🧹', '🐶', '🎬', '🎤', '🎨'],
  // 组 3：收入与资产（工资、奖金、理财、账户、工具）
  ['💵', '💳', '🏦', '🏧', '🧧', '🏆', '🎯', '⏰', '📝', '🔧', '🧰', '🌐', '🚀', '💖', '🌟', '🔒', '🧾', '🥇', '📈', '💻'],
]
/** 当前展示的图标组下标 */
const iconGroupIndex = ref(0)
/** 当前组的图标（索引访问可能是 undefined，这里收窄成确定的数组，模板少一层判断） */
const iconGroup = computed(() => ICON_GROUPS[iconGroupIndex.value] ?? ICON_GROUPS[0]!)
/** 组下标列表（给底部分组圆点用，避免模板里出现未使用的 v-for 变量） */
const iconGroupIndexes = ICON_GROUPS.map((_, i) => i)

/** 换一批：循环切到下一组（最后一组之后回到第 1 组） */
function nextIconGroup() {
  iconGroupIndex.value = (iconGroupIndex.value + 1) % ICON_GROUPS.length
}

/** 打开弹层时定位到「当前图标所在的那组」，否则用户会看不到自己选中的图标 */
function focusIconGroup(icon: string) {
  const idx = ICON_GROUPS.findIndex(group => group.includes(icon))
  iconGroupIndex.value = idx < 0 ? 0 : idx
}

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

const parentOptions = computed(() => parentCandidates().map(c => emojiOption(c.icon, c.name, c.id)))

/** 当前编辑项是否已有子分类：有子项时不能把它改成二级，否则子项会变为三级，UI 目前只支持两级 */
const editingHasChildren = computed(() => editingId.value != null && childrenOf(editingId.value).length > 0)

function openCreate(type: Category['type']) {
  editingId.value = null
  form.type = type
  form.name = ''
  form.icon = type === 'expense' ? '📦' : '💰'
  form.color = type === 'expense' ? '#5BA9FF' : '#22C55E'
  form.parentId = null
  focusIconGroup(form.icon)
  formVisible.value = true
}

function openEdit(cat: Category) {
  editingId.value = cat.id
  form.type = cat.type
  form.name = cat.name
  form.icon = cat.icon
  form.color = cat.color
  form.parentId = cat.parentId
  focusIconGroup(cat.icon)
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
    .map(c => emojiOption(c.icon, c.name, c.id))
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

// ── 拖拽排序（HTML5 原生 DnD，零依赖） ───────────────
// 只在同一分组（type + parentId 相同）内排序，跨分组不允许。
const dragItem = ref<{ id: number, type: Category['type'], parentId: number | null } | null>(null)
const dragOverId = ref<number | null>(null)

function onDragStart(e: DragEvent, cat: Category) {
  dragItem.value = { id: cat.id, type: cat.type, parentId: cat.parentId }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(cat.id))
  }
}

function onDragOver(e: DragEvent, cat: Category) {
  const src = dragItem.value
  if (!src)
    return
  if (src.type !== cat.type || src.parentId !== cat.parentId || src.id === cat.id)
    return
  e.preventDefault() // 允许放
  dragOverId.value = cat.id
}

function onDrop(e: DragEvent, cat: Category) {
  e.preventDefault()
  const src = dragItem.value
  dragItem.value = null
  dragOverId.value = null
  if (!src)
    return
  // 仅同分组内可排序
  if (src.type !== cat.type || src.parentId !== cat.parentId || src.id === cat.id)
    return
  const ids = dict.categories
    .filter(c => c.type === src.type && c.parentId === src.parentId)
    .map(c => c.id)
  const from = ids.indexOf(src.id)
  const to = ids.indexOf(cat.id)
  if (from < 0 || to < 0)
    return
  ids.splice(from, 1)
  ids.splice(to, 0, src.id)
  applyReorder(src.type, src.parentId, ids)
}

function onDragEnd() {
  dragItem.value = null
  dragOverId.value = null
}

/** 乐观更新：先本地重排避免闪烁，再调用后端持久化；失败则回滚刷新 */
async function applyReorder(type: Category['type'], parentId: number | null, ids: number[]) {
  const group = ids
    .map(id => dict.categories.find(c => c.id === id))
    .filter((c): c is Category => Boolean(c))
  group.forEach((c, i) => {
    c.sortOrder = i
  })
  const others = dict.categories.filter(c => !(c.type === type && c.parentId === parentId))
  dict.categories = [...others, ...group]
  try {
    await reorderCategories(type, parentId, ids)
  }
  catch {
    message.error('排序保存失败，已恢复')
    await dict.refresh()
  }
}

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
      <section class="cat-group" title="拖动分类行可调整顺序，排序会自动保存">
        <div class="group-head">
          <span class="group-title"><span class="dot" :style="{ background: expenseDotColor }" /> 支出分类</span>
          <NButton size="small" tertiary type="primary" @click="openCreate('expense')">
            + 新增
          </NButton>
        </div>
        <ul class="cat-list">
          <template v-for="root in expenseRoots" :key="root.id">
            <li
              class="cat-row"
              :class="{ 'dragging': dragItem?.id === root.id, 'drop-target': dragOverId === root.id }"
              draggable="true"
              @dragstart="onDragStart($event, root)"
              @dragover="onDragOver($event, root)"
              @drop="onDrop($event, root)"
              @dragend="onDragEnd"
            >
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
              :class="{ 'dragging': dragItem?.id === child.id, 'drop-target': dragOverId === child.id }"
              draggable="true"
              @dragstart="onDragStart($event, child)"
              @dragover="onDragOver($event, child)"
              @drop="onDrop($event, child)"
              @dragend="onDragEnd"
            >
              <span class="child-connector" />
              <span class="cat-icon cat-icon--sm" :style="{ background: `${child.color}22` }">
                <TwemojiIcon :emoji="child.icon" :size="18" />
              </span>
              <span class="cat-name">{{ child.name }}</span>
              <span class="cat-actions">
                <NButton size="tiny" quaternary @click="openEdit(child)">编辑</NButton>
                <NButton size="tiny" quaternary type="error" @click="openDelete(child)">删除</NButton>
              </span>
            </li>
          </template>
          <li v-if="expenseRoots.length === 0" class="cat-empty">
            <EmptyState
              variant="ledger"
              size="sm"
              title="暂无支出分类"
              desc="点击右上角「+ 新增」创建你的第一个分类"
            >
              <NButton size="small" tertiary type="primary" @click="openCreate('expense')">
                + 新增
              </NButton>
            </EmptyState>
          </li>
        </ul>
      </section>

      <!-- 收入 -->
      <section class="cat-group" title="拖动分类行可调整顺序，排序会自动保存">
        <div class="group-head">
          <span class="group-title"><span class="dot" :style="{ background: incomeDotColor }" /> 收入分类</span>
          <NButton size="small" tertiary type="primary" @click="openCreate('income')">
            + 新增
          </NButton>
        </div>
        <ul class="cat-list">
          <template v-for="root in incomeRoots" :key="root.id">
            <li
              class="cat-row"
              :class="{ 'dragging': dragItem?.id === root.id, 'drop-target': dragOverId === root.id }"
              draggable="true"
              @dragstart="onDragStart($event, root)"
              @dragover="onDragOver($event, root)"
              @drop="onDrop($event, root)"
              @dragend="onDragEnd"
            >
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
              :class="{ 'dragging': dragItem?.id === child.id, 'drop-target': dragOverId === child.id }"
              draggable="true"
              @dragstart="onDragStart($event, child)"
              @dragover="onDragOver($event, child)"
              @drop="onDrop($event, child)"
              @dragend="onDragEnd"
            >
              <span class="child-connector" />
              <span class="cat-icon cat-icon--sm" :style="{ background: `${child.color}22` }">
                <TwemojiIcon :emoji="child.icon" :size="18" />
              </span>
              <span class="cat-name">{{ child.name }}</span>
              <span class="cat-actions">
                <NButton size="tiny" quaternary @click="openEdit(child)">编辑</NButton>
                <NButton size="tiny" quaternary type="error" @click="openDelete(child)">删除</NButton>
              </span>
            </li>
          </template>
          <li v-if="incomeRoots.length === 0" class="cat-empty">
            <EmptyState
              variant="ledger"
              size="sm"
              title="暂无收入分类"
              desc="点击右上角「+ 新增」创建你的第一个分类"
            >
              <NButton size="small" tertiary type="primary" @click="openCreate('income')">
                + 新增
              </NButton>
            </EmptyState>
          </li>
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

        <label class="form-label">
          上级分类（可选）
          <span v-if="editingHasChildren" class="form-hint">· 该分类已有子项，需先处理子项才能修改上级</span>
        </label>
        <NSelect
          v-model:value="form.parentId"
          :options="parentOptions"
          :render-label="renderEmojiLabel"
          placeholder="不选择则为一级分类"
          :disabled="editingHasChildren"
          clearable
        />

        <div class="icon-head">
          <span class="form-label">图标</span>
          <span class="icon-current" title="当前选中的图标">
            已选 <TwemojiIcon :emoji="form.icon" :size="15" />
          </span>
        </div>
        <!-- key 绑组号：切组时整块重建，触发一次淡入位移动画（时长走 token，开了减弱动效自动关掉） -->
        <div :key="iconGroupIndex" class="icon-grid">
          <button
            v-for="ic in iconGroup"
            :key="ic"
            type="button"
            class="icon-cell"
            :class="{ active: form.icon === ic }"
            :aria-label="`图标 ${ic}`"
            :aria-pressed="form.icon === ic"
            @click="form.icon = ic"
          >
            <TwemojiIcon :emoji="ic" :size="18" />
          </button>
        </div>
        <div class="icon-foot">
          <span class="icon-dots">
            <button
              v-for="i in iconGroupIndexes"
              :key="i"
              type="button"
              class="icon-dot"
              :class="{ active: i === iconGroupIndex }"
              :aria-label="`第 ${i + 1} 组图标`"
              :aria-current="i === iconGroupIndex ? 'true' : undefined"
              @click="iconGroupIndex = i"
            />
          </span>
          <NButton size="tiny" tertiary type="primary" @click="nextIconGroup">
            换一批
          </NButton>
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
              :render-label="renderEmojiLabel"
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
  height: calc(100% - 50px); // 填满内容区，让分类盒子内部滚动而非整页滚动
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
  flex: 1; // 占满剩余高度
  min-height: 0; // 允许在 flex 容器内收缩，否则内部滚动失效
}

.cat-group {
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  padding: var(--lz-space-4);
  display: flex; // 让内部 cat-list 能独立滚动
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
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

// 色值走 settings.typeColor（内联 style 绑定），这里只管形状
.dot {
  width: 10px;
  height: 10px;
  border-radius: var(--lz-radius-full);
}

.cat-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1; // 撑满 cat-group 剩余高度
  min-height: 0;
  overflow-y: auto; // 分类多时盒子内部滚动，不撑高页面
}

// 空态：占满分类列表高度并垂直居中（仅当无分类时渲染）
.cat-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.cat-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--lz-radius-lg);
  cursor: grab;
  transition: background-color var(--lz-duration-base) var(--lz-ease-standard), box-shadow var(--lz-duration-base) var(--lz-ease-standard);

  &:hover {
    background: var(--lz-bg-hover);
  }

  &:active {
    cursor: grabbing;
  }

  // 拖拽中：半透明，提示正在移动
  &.dragging {
    opacity: .4;
  }

  // 可放置目标：顶部高亮条
  &.drop-target {
    background: var(--lz-primary-50);
    box-shadow: inset 0 3px 0 0 var(--lz-primary-500);
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

.form-hint {
  font-weight: 400;
  color: var(--lz-text-secondary);
  margin-left: 6px;
}

// ── 图标选择器 ─────────────────────────────────────────
.icon-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.icon-current {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--lz-text-secondary);
}

// 10 列 × 2 行：每组 20 个固定铺满两行，切组时高度不跳
.icon-grid {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 6px;
  animation: icon-grid-in var(--lz-duration-base) var(--lz-ease-standard);
}

@keyframes icon-grid-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

.icon-cell {
  display: grid;
  place-items: center;
  aspect-ratio: 1 / 1;
  padding: 0;
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-md);
  background: var(--lz-bg-card);
  cursor: pointer;
  @include transition-paint();

  &:hover {
    border-color: var(--lz-primary-300);
    background: var(--lz-bg-hover);
  }

  &.active {
    border-color: var(--lz-primary-600);
    background: var(--lz-primary-50);
    box-shadow: 0 0 0 2px var(--lz-primary-100);
  }
}

.icon-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: -4px;
}

.icon-dots {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.icon-dot {
  width: 6px;
  height: 6px;
  padding: 0;
  border: 0;
  border-radius: var(--lz-radius-full);
  background: var(--lz-border);
  cursor: pointer;
  @include transition-paint();

  &.active {
    width: 16px;
    background: var(--lz-primary-500);
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
