<script setup lang="ts">
/**
 * 预算页（PRD US-006 / 8.5）
 * ====================================================================
 * 「这个月餐饮只许花 2000，超了要提醒我」—— 页面结构就两块：
 *   1. 总预算卡：当月全部支出的进度
 *   2. 分类预算卡网格：每个已设预算的分类一条进度条
 *
 * 三条颜色阈值（绿 < 80 / 橙 80-100 / 红 > 100）来自 types/budget.ts 的
 * budgetTone()，预警 toast 用的是同一口径 —— 别在页面里再写一份 80。
 *
 * 花费由流水现算，所以进度条不需要「改账后手动刷新」：
 * 页面订阅 quickEntry.dataChangedAt，任何一笔流水变化都会重取。
 */
import type { BudgetProgress } from '@/types/budget'
import { NButton, NInputNumber, NModal, NPopconfirm, NProgress, NSelect, useMessage } from 'naive-ui'
import { computed, onMounted, ref, watch } from 'vue'
import { deleteBudget, upsertBudget } from '@/api/modules/budget'
import { useBookStore } from '@/stores/modules/book'
import { useDictStore } from '@/stores/modules/dict'
import { budgetTone } from '@/types/budget'
import { readToken } from '@/utils/echarts'
import { formatCents } from '@/utils/money'
import { useBudgets } from './composables/useBudgets'

const { overview, month, loading, error, load } = useBudgets()
const book = useBookStore()
const dict = useDictStore()
const message = useMessage()

onMounted(() => {
  void load()
  // 新建预算要选分类，分类字典按需懒加载
  void dict.ensureCategories()
})

// ── 阈值配色 ─────────────────────────────────────────────
// NProgress 把颜色写进 SVG stroke 属性，CSS 变量在属性里不生效，
// 所以这里读 token 的**当前值**（暗色切换后 watch 会重新取）
const toneColors = computed(() => ({
  safe: readToken('--lz-success', '#15803d'),
  warning: readToken('--lz-warning', '#b45309'),
  over: readToken('--lz-danger', '#dc2626'),
}))

function toneColor(percent: number): string {
  return toneColors.value[budgetTone(percent)]
}

// ── 进页预警（US-006：超 80% toast）─────────────────────
// 同一「账本+月份」只提示一次：预算页不是消息中心，反复弹会烦
const alertedKey = ref('')

watch(overview, (o) => {
  if (!o)
    return
  const key = `${book.currentBookId}:${o.month}`
  if (alertedKey.value === key)
    return
  alertedKey.value = key

  const over = o.items.filter(i => i.percent > 100)
  const near = o.items.filter(i => i.percent >= 80 && i.percent <= 100)
  if (over.length > 0) {
    const names = over.map(i => `「${i.categoryName}」${formatCents(-i.remaining, { withSymbol: true })}`).join('、')
    message.error(`本月 ${over.length} 个预算已超支：${names}`, { duration: 5000 })
  }
  else if (near.length > 0) {
    const first = near[0]!
    message.warning(`「${first.categoryName}」预算已用 ${first.percent.toFixed(0)}%，注意控制`, { duration: 5000 })
  }
})

// ── 编辑弹窗（总预算 / 分类新建 / 分类修改共用一个 modal）──
type EditorMode = 'total' | 'create' | 'edit'
/** 当前弹窗模式；null = 关闭 */
const editorMode = ref<EditorMode | null>(null)
// NModal 的 show 是 boolean，模式字符串不能直接塞给它，用计算属性桥接
const showEditor = computed({
  get: () => editorMode.value != null,
  set: (v: boolean) => {
    if (!v)
      editorMode.value = null
  },
})
/** 编辑中的分类预算（edit 模式用） */
const editingItem = ref<BudgetProgress | null>(null)
/** 新建时选的分类 */
const createCategoryId = ref<number | null>(null)
/** 弹窗里的金额（单位：元 —— 用户直觉是元，落库前转分） */
const amountYuan = ref<number | null>(null)

/** 已设预算的分类（新建下拉里要排除，避免出现两条同分类预算） */
const budgetedCategoryIds = computed(() =>
  new Set((overview.value?.items ?? []).map(i => i.budget.categoryId)),
)

/** 可选分类：全部支出分类（二级也行 —— 预算可以细到「外卖」） */
const createOptions = computed(() =>
  dict.categories
    .filter(c => c.type === 'expense' && !budgetedCategoryIds.value.has(c.id))
    .map(c => ({
      label: `${c.parentId != null ? '　' : ''}${c.icon} ${c.name}`,
      value: c.id,
    })),
)

const editorTitle = computed(() => {
  if (editorMode.value === 'total')
    return '设置总预算'
  if (editorMode.value === 'create')
    return '新建分类预算'
  return `修改「${editingItem.value?.categoryName ?? ''}」预算`
})

function openTotal(): void {
  editingItem.value = null
  createCategoryId.value = null
  // 总预算金额回填当前值，改 2000 → 2500 这种微调不用重输
  const total = overview.value?.total.budget.amount ?? 0
  amountYuan.value = total > 0 ? total / 100 : null
  editorMode.value = 'total'
}

function openCreate(): void {
  editingItem.value = null
  createCategoryId.value = null
  amountYuan.value = null
  editorMode.value = 'create'
}

function openEdit(item: BudgetProgress): void {
  editingItem.value = item
  createCategoryId.value = null
  amountYuan.value = item.budget.amount / 100
  editorMode.value = 'edit'
}

const saving = ref(false)

async function saveEditor(): Promise<void> {
  if (saving.value || amountYuan.value == null || amountYuan.value <= 0) {
    message.warning('请输入大于 0 的金额')
    return
  }
  const categoryId = editorMode.value === 'total'
    ? 0
    : editorMode.value === 'create'
      ? createCategoryId.value
      : editingItem.value?.budget.categoryId

  if (categoryId == null) {
    message.warning(editorMode.value === 'create' ? '请选择分类' : '分类信息缺失')
    return
  }

  saving.value = true
  try {
    await upsertBudget({
      bookId: book.currentBookId,
      month: month.value,
      categoryId,
      amount: Math.round(amountYuan.value * 100),
    })
    message.success('预算已保存')
    editorMode.value = null
    // 即改即生效（PRD 8.5）：重取总览，进度条立刻回跑
    await load()
  }
  catch (e) {
    message.error(e instanceof Error ? e.message : '保存失败')
  }
  finally {
    saving.value = false
  }
}

async function removeBudget(item: BudgetProgress): Promise<void> {
  try {
    await deleteBudget(item.budget.id)
    message.success('已删除该预算')
    await load()
  }
  catch (e) {
    message.error(e instanceof Error ? e.message : '删除失败')
  }
}

/** 进度条只画到 100%，超支的「超出量」用文字表达（画 130% 反而看不出超了多少） */
function barPercent(item: BudgetProgress): number {
  return Math.min(item.percent, 100)
}

/** 剩余文案：超支显示红色「超支 ¥x」，未超显示「还剩 ¥x」 */
function remainingText(item: BudgetProgress): string {
  return item.remaining >= 0
    ? `还剩 ${formatCents(item.remaining, { withSymbol: true })}`
    : `已超支 ${formatCents(-item.remaining, { withSymbol: true })}`
}
</script>

<template>
  <div class="budget-page">
    <header class="page-header">
      <div class="heading">
        <h1 class="page-title">
          预算
        </h1>
        <p class="page-subtitle">
          {{ book.currentBook?.name ?? '当前账本' }} · 给分类设上限，超支提前知道
        </p>
      </div>

      <!-- 月份切换：预算是月度的，看上月是复盘、看当月是控钱 -->
      <NDatePicker
        v-model:formatted-value="month"
        type="month"
        value-format="yyyy-MM"
        :clearable="false"
        size="small"
      />
    </header>

    <NAlert v-if="error" type="error" :title="error" class="page-error" closable />

    <!-- 总预算卡：当月全部支出的进度 -->
    <section class="total-card">
      <div class="total-head">
        <div class="total-title">
          <span class="total-icon">📊</span>
          <div>
            <h2 class="total-name">
              本月总预算
            </h2>
            <p class="total-hint">
              全部分类支出的总额度
            </p>
          </div>
        </div>
        <NButton size="small" quaternary @click="openTotal">
          {{ (overview?.total.budget.amount ?? 0) > 0 ? '修改' : '设置总预算' }}
        </NButton>
      </div>

      <NSkeleton v-if="loading" class="chart-skeleton" height="46px" />
      <template v-else-if="overview">
        <NProgress
          type="line"
          :percentage="barPercent(overview.total)"
          :color="toneColor(overview.total.percent)"
          :show-indicator="false"
          :height="12"
          :border-radius="6"
        />
        <div class="total-nums">
          <span class="total-spent">
            已花 <b>{{ formatCents(overview.total.spent, { withSymbol: true }) }}</b>
            <template v-if="overview.total.budget.amount > 0">
              / {{ formatCents(overview.total.budget.amount, { withSymbol: true }) }}
              <span class="total-percent">{{ overview.total.percent.toFixed(0) }}%</span>
            </template>
            <span
              v-else
              class="total-unset"
            >（未设置总额度，仅统计）</span>
          </span>
          <span
            v-if="overview.total.budget.amount > 0"
            class="total-remaining"
            :style="{ color: toneColor(overview.total.percent) }"
          >
            {{ remainingText(overview.total) }}
          </span>
        </div>
      </template>
    </section>

    <!-- 分类预算卡网格 -->
    <section class="card-grid" aria-label="分类预算">
      <div v-for="item in overview?.items ?? []" :key="item.budget.id" class="budget-card">
        <div class="card-head">
          <span class="card-icon">{{ item.categoryIcon }}</span>
          <span class="card-name">{{ item.categoryName }}</span>
          <span class="card-percent" :style="{ color: toneColor(item.percent) }">
            {{ item.percent.toFixed(0) }}%
          </span>
        </div>

        <NProgress
          type="line"
          :percentage="barPercent(item)"
          :color="toneColor(item.percent)"
          :show-indicator="false"
          :height="10"
          :border-radius="5"
        />

        <div class="card-nums">
          <span class="card-spent">
            {{ formatCents(item.spent, { withSymbol: true }) }} / {{ formatCents(item.budget.amount, { withSymbol: true }) }}
          </span>
          <span class="card-remaining" :style="{ color: toneColor(item.percent) }">
            {{ remainingText(item) }}
          </span>
        </div>

        <div class="card-actions">
          <NButton size="tiny" quaternary @click="openEdit(item)">
            编辑
          </NButton>
          <NPopconfirm @positive-click="removeBudget(item)">
            <template #trigger>
              <NButton size="tiny" quaternary type="error">
                删除
              </NButton>
            </template>
            删除「{{ item.categoryName }}」的本月预算？已花的钱不受影响。
          </NPopconfirm>
        </div>
      </div>

      <!-- 新建卡：空态时它就是唯一的卡片，兼做「建第一个预算」的引导 -->
      <button class="add-card" type="button" @click="openCreate">
        <span class="add-icon" aria-hidden="true">＋</span>
        <span>{{ (overview?.items.length ?? 0) === 0 ? '给第一个分类设预算' : '新建分类预算' }}</span>
      </button>
    </section>

    <!-- 骨架屏：首屏还没数据时给网格占位，避免布局跳动 -->
    <div v-if="loading && !overview" class="card-grid">
      <div v-for="i in 5" :key="i" class="budget-card">
        <NSkeleton text width="40%" :height="22" />
        <NSkeleton text width="100%" :height="10" />
        <NSkeleton text width="70%" :height="16" />
      </div>
    </div>

    <!-- 新建 / 修改弹窗 -->
    <NModal
      v-model:show="showEditor"
      preset="card"
      :title="editorTitle"
      class="budget-editor"
      :style="{ width: '380px' }"
      :mask-closable="!saving"
    >
      <div class="editor-body">
        <div v-if="editorMode === 'create'" class="editor-field">
          <label class="editor-label">分类</label>
          <NSelect
            v-model:value="createCategoryId"
            :options="createOptions"
            placeholder="选择支出分类"
            filterable
          />
        </div>
        <div class="editor-field">
          <label class="editor-label">每月额度（元）</label>
          <NInputNumber
            v-model:value="amountYuan"
            :min="0"
            :precision="2"
            placeholder="如 2000"
            autofocus
            @keyup.enter="saveEditor"
          />
        </div>
      </div>
      <template #footer>
        <div class="editor-footer">
          <NButton :disabled="saving" @click="editorMode = null">
            取消
          </NButton>
          <NButton type="primary" :loading="saving" @click="saveEditor">
            保存
          </NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped lang="scss">
.budget-page {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--lz-text-primary);
  margin: 0 0 4px;
}

.page-subtitle {
  font-size: 13px;
  color: var(--lz-text-secondary);
  margin: 0;
}

.page-error {
  margin-bottom: 16px;
}

// ── 总预算卡 ─────────────────────────────────────────────
.total-card {
  padding: 20px 24px;
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  box-shadow: var(--lz-shadow-sm);
  margin-bottom: 20px;
}

.total-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.total-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.total-icon {
  font-size: 26px;
}

.total-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--lz-text-primary);
  margin: 0;
}

.total-hint {
  font-size: 12px;
  color: var(--lz-text-secondary);
  margin: 2px 0 0;
}

.total-nums {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  font-size: 13px;
  color: var(--lz-text-secondary);
  font-variant-numeric: tabular-nums;

  b {
    color: var(--lz-text-primary);
    font-size: 15px;
  }
}

.total-percent {
  margin-left: 4px;
  font-weight: 600;
}

.total-unset {
  font-size: 12px;
  opacity: 0.8;
}

// ── 分类预算卡 ───────────────────────────────────────────
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.budget-card {
  padding: 16px 18px;
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  box-shadow: var(--lz-shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: box-shadow var(--lz-duration-base) var(--lz-ease-standard);

  &:hover {
    box-shadow: var(--lz-shadow-md);

    .card-actions {
      opacity: 1;
    }
  }
}

.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-icon {
  font-size: 18px;
}

.card-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--lz-text-primary);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-percent {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.card-nums {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--lz-text-secondary);
  font-variant-numeric: tabular-nums;
}

.card-remaining {
  flex-shrink: 0;
  font-weight: 500;
}

// 操作按钮默认半透明，hover 才完全显形 —— 低频操作不抢进度条的视觉
.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--lz-duration-base);
}

.add-card {
  min-height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed var(--lz-border);
  border-radius: var(--lz-radius-xl);
  background: transparent;
  color: var(--lz-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: border-color var(--lz-duration-base), color var(--lz-duration-base);

  &:hover {
    border-color: var(--lz-primary-400);
    color: var(--lz-primary-600);
  }
}

.add-icon {
  font-size: 22px;
  line-height: 1;
}

// ── 弹窗 ─────────────────────────────────────────────────
.editor-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.editor-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.editor-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--lz-text-regular);
}

.editor-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.chart-skeleton {
  border-radius: var(--lz-radius-lg);
}

@media (max-width: 575px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
