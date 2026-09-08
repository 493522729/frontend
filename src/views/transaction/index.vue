<script setup lang="ts">
/**
 * 交易流水页 · 主页面
 * ====================================================================
 * - 左侧 240px 固定筛选区
 * - 右侧 vxe-table 虚拟滚动大表（10w 行不卡）
 * - 行内编辑：双击单元格改金额/分类/备注，乐观更新
 * - 批量操作：勾选多行 → 改分类 / 删除
 * - 列自定义：显隐 + 拖拽排序（vxe-toolbar 内置）
 *
 * vxe-table 加载策略（架构 1.3 节）：
 *   - 不进 main.ts；只在 setup 时调 ensureVxeTable 局部注册到本页面所在 app
 *   - 体积 ~700KB 落在交易大表 chunk，其他页面不受影响
 */
import type { App } from 'vue'
import type { VxeGridProps } from 'vxe-table'
import type { Transaction } from '@/types/transaction'
import { NButton, NInput, NInputNumber, NPagination, NSelect, NSpace, NTag, useMessage, useNotification } from 'naive-ui'
import { computed, getCurrentInstance, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { STORAGE_KEYS } from '@/constants/storage-keys'
import { TRANSACTION_SOURCE_META, TRANSACTION_TYPE_META } from '@/enums/transaction'
import { useDictStore } from '@/stores/modules/dict'
import { useQuickEntryStore } from '@/stores/modules/quickEntry'
import { useSettingsStore } from '@/stores/modules/settings'
import { formatCents } from '@/utils/money'
import { ensureVxeTable } from './_vxe-bootstrap'
import FilterPanel from './components/FilterPanel.vue'
import { useTransactionList } from './composables/useTransactionList'

// vxe-table 4.x 的 TS 类型对自定义插槽支持不全 —— 官方类型只覆盖内置 slot，
// 自定义 slot 名（如 type_cell / category_cell 等）会报 "Property X does not exist on type VxeTableSlots<any>"
// 这是 vxe-table 已知问题。这里用 `& Record<string, unknown>` 局部放宽网格配置类型，
// 模板里的 `(row as Transaction)` 仍由 TS 静态校验安全。
// 注意：vxe-table 4.x 中 vxe-table 组件通过 <vxe-column> 子节点配列，
//       用 JS columns 配置必须改用 <vxe-grid> 组件
type VxeGridOptions = VxeGridProps<Transaction> & Record<string, unknown>

// 局部注册 vxe-table 到本页面所在 app
const app = getCurrentInstance()!.appContext.app as App
ensureVxeTable(app)

const message = useMessage()
const notification = useNotification()
const settings = useSettingsStore()
const dict = useDictStore()

// vxe-table 4.x 的 edit-closed 在「editRender={name:'input'} + 自定义 slot」组合下，
// 偶发会把编辑前的 row 引用传回来，row[field] 拿不到用户在 NSelect 里刚选的值，
// 导致保存的 patch 是个「看似没改」的旧值。这里让 slot 在 @update:value 里
// 主动缓存最近一次选择，onEditClosed 优先用缓存（id+field 校验避免串），
// 缓存没命中再回退到 row[field]。
const editBuffer = ref<{ id: number, field: string, value: unknown } | null>(null)

// 写 buffer 走函数：在 template 上下文里 VLS 会把 ref 自动 unwrap 成可空值，
// 直接 `editBuffer.value = ...` 会触发 TS18047（"editBuffer is possibly null"）。
// 把写入逻辑收到 script 里就绕开了这个误报。
function pushEditBuffer(id: number, field: string, value: unknown) {
  editBuffer.value = { id, field, value }
}

// 单独抽出这个 handler：
// 1) template 里 NSelect 的 @update:value 多行回调会被 vue/html-indent 误判缩进；
// 2) 业务逻辑收在 script 里，单测也好挂
function onCategoryEditChange(row: Transaction, v: number) {
  row.categoryId = v
  pushEditBuffer(row.id, 'categoryId', v)
}

const {
  list,
  total,
  loading,
  filter,
  selectedIds,
  page,
  pageSize,
  reload,
  reloadFromFirst,
  // FilterPanel 只 emit 意图，真正的筛选状态改动走 composable 这两个方法
  applyFilter,
  resetFilter,
  onPageChange,
  saveRow,
  removeOne,
  removeBatch,
  restoreLastRemoved,
  batchSetCategory,
} = useTransactionList()

// 快速记账弹层的写操作（新增 / 撤销）完成后刷新列表：回第 1 页，保证所见即所得
const quickEntry = useQuickEntryStore()
watch(() => quickEntry.dataChangedAt, () => reloadFromFirst())

// ── vxe-grid 高度：由外层 .grid-host(flex:1) 实时算出像素值 ──
// 直接给 height:'100%' 会让 vxe-grid 占满整个 .table-wrap，把分页栏挤出可视区被 overflow:hidden 裁掉；
// 改为 ResizeObserver 监听容器高度，用真实像素驱动虚拟滚动高度，分页栏始终可见。
const gridHostRef = ref<HTMLElement | null>(null)
const gridHeight = ref(420)
let gridResizeObserver: ResizeObserver | null = null

function syncGridHeight() {
  if (gridHostRef.value) {
    gridHeight.value = gridHostRef.value.clientHeight
  }
}

onMounted(() => {
  syncGridHeight()
  if (gridHostRef.value && typeof ResizeObserver !== 'undefined') {
    gridResizeObserver = new ResizeObserver(syncGridHeight)
    gridResizeObserver.observe(gridHostRef.value)
  }
})

onBeforeUnmount(() => {
  gridResizeObserver?.disconnect()
  gridResizeObserver = null
})

const categoryOptions = computed(() => dict.categories.map(c => ({ label: c.name, value: c.id })))
const batchCategoryId = ref<number | null>(null)

/** 当前是否有生效的筛选条件 —— 空状态文案判断用 */
const filterApplied = computed(() => {
  const f = filter
  return !!(
    f.keyword
    || f.type
    || (f.categoryIds && f.categoryIds.length > 0)
    || (f.accountIds && f.accountIds.length > 0)
    || f.startDate
    || f.endDate
  )
})

// ── 行高（紧凑 / 标准 / 宽松，PRD §15.2.2） ──────────────────────
// vxe-table 的 size prop 直接控制整体密度（含行高），比手写 CSS 改 tr 高度稳得多
type RowSize = 'small' | 'medium' | 'large'
const ROW_SIZE_KEY = `${STORAGE_KEYS.columnsPrefix}row-size:/transaction`

function loadRowSize(): RowSize {
  const v = localStorage.getItem(ROW_SIZE_KEY)
  return v === 'small' || v === 'large' ? v : 'medium'
}
const rowSize = ref<RowSize>(loadRowSize())
const rowSizeOptions = [
  { label: '紧凑', value: 'small' as RowSize },
  { label: '标准', value: 'medium' as RowSize },
  { label: '宽松', value: 'large' as RowSize },
]
function onRowSizeChange(s: RowSize) {
  rowSize.value = s
  localStorage.setItem(ROW_SIZE_KEY, s)
}

// ── 列配置持久化（PRD §15.2.2：显隐 / 列宽 / 顺序刷新后保留） ──
// key 含页面路径，避免和其他表格串。vxe 的列自定义（拖拽/显隐/调宽）改动后，
// 通过 @custom / @resizable-change 事件把当前列状态落盘。
const COLUMN_KEY = `${STORAGE_KEYS.columnsPrefix}/transaction`
const gridRef = ref<unknown>(null)

interface ColState { visible: boolean, width: number }

function loadColumnState(): Map<string, ColState> | null {
  try {
    const raw = localStorage.getItem(COLUMN_KEY)
    if (!raw)
      return null
    const arr = JSON.parse(raw) as Array<{ field: string, visible: boolean, width: number }>
    return new Map(arr.map(s => [s.field, { visible: s.visible, width: s.width }]))
  }
  catch {
    return null
  }
}

function persistColumns() {
  // 直接从 grid 实例读当前列状态，不依赖事件 payload 形状，最稳
  const grid = gridRef.value as { getColumns?: () => Array<{ field?: string, visible?: boolean, renderWidth?: number, width?: number }> } | null
  const cols = grid?.getColumns?.() ?? []
  const state = cols
    .filter(c => c.field)
    .map(c => ({ field: c.field as string, visible: c.visible !== false, width: c.renderWidth || c.width || 0 }))
    .filter(s => s.width > 0)
  localStorage.setItem(COLUMN_KEY, JSON.stringify(state))
}

/** 列定义基准（不含可见性/宽度，持久化的状态叠加在它之上） */
type ColDef = NonNullable<VxeGridProps<Transaction>['columns']>[number]
const BASE_COLUMNS: ColDef[] = [
  { type: 'checkbox', width: 44, fixed: 'left' },
  { field: 'transDate', title: '日期', width: 120, sortable: true, fixed: 'left' },
  { field: 'type', title: '类型', width: 90, slots: { default: 'type_cell' } },
  {
    field: 'categoryId',
    title: '分类',
    width: 140,
    editRender: { name: 'input' },
    slots: { default: 'category_cell', edit: 'category_edit' },
  },
  { field: 'accountId', title: '账户', width: 140, slots: { default: 'account_cell' } },
  {
    field: 'amount',
    title: '金额',
    width: 140,
    align: 'right',
    sortable: true,
    editRender: { name: 'input' },
    slots: { default: 'amount_cell', edit: 'amount_edit' },
  },
  { field: 'note', title: '备注', minWidth: 180, editRender: { name: 'input' }, slots: { default: 'note_cell', edit: 'note_edit' } },
  { field: 'source', title: '来源', width: 100, slots: { default: 'source_cell' } },
  { field: 'action', title: '操作', width: 90, fixed: 'right', slots: { default: 'action_cell' } },
]

/** 合并持久化状态：顺序按已存字段顺序，可见性/宽度叠加；新增列自动追加在末尾 */
function buildColumns(): ColDef[] {
  const saved = loadColumnState()
  if (!saved)
    return BASE_COLUMNS
  const ordered = [...saved.keys()]
    .map(f => BASE_COLUMNS.find(c => (c as { field?: string }).field === f))
    .filter(Boolean) as ColDef[]
  const extra = BASE_COLUMNS.filter(c => !saved.has((c as { field?: string }).field ?? ''))
  return [...ordered, ...extra].map((c) => {
    const f = (c as { field?: string }).field
    const s = f ? saved.get(f) : undefined
    return s ? { ...c, visible: s.visible, width: s.width } : c
  })
}

// ── vxe-table 列配置 ──
// vxe-table 自带虚拟滚动、列拖拽、列设置工具栏；这里只配数据 + 列定义
// 列配置只在初始化时读一次持久化状态（避免数据 reload 时反复重建列、打断用户拖拽）
const initialColumns = buildColumns()

const gridOptions = computed<VxeGridOptions>(() => ({
  border: true,
  showOverflow: true,
  stripe: true,
  // 行高密度：紧凑 / 标准 / 宽松，随用户选择 + 持久化（PRD §15.2.2）
  size: rowSize.value,
  // 高度由 .grid-host(flex:1) 经 ResizeObserver 实时算出的像素值驱动，避免 100% 把分页栏挤出可视区
  height: gridHeight.value,
  columnConfig: { resizable: true },
  rowConfig: { isHover: true, keyField: 'id' },
  checkboxConfig: { reserve: true, highlight: true },
  // 只保留列自定义，避免 zoom/refresh 依赖未注册的 vxe-button 组件
  toolbarConfig: { custom: true },
  // showOverflow=true 时 vxe-table 默认 tooltip-config.mode='tooltip' 不合法，改为 'title' 用原生 title 提示，避免缺 vxe-tooltip 组件报错
  tooltipConfig: { mode: 'title' },
  // 行内编辑开启 editConfig.showStatus 时必须保留原始数据源，否则无法计算编辑状态
  keepSource: true,
  loading: loading.value,
  data: list.value,
  // 列定义走 buildColumns()：基准列叠加 localStorage 里持久化的「显隐/列宽/顺序」
  columns: initialColumns,
  scrollY: { enabled: true },
  editConfig: { trigger: 'dblclick' as const, mode: 'cell' as const, showStatus: true },
}))

// 同步 loading / data 到 gridOptions（vxe-table 是命令式，watch 同步）
watch(loading, (v) => {
  gridOptions.value.loading = v
})
watch(list, (v) => {
  gridOptions.value.data = v
})

// ── 行内编辑：vxe-table 关闭编辑时触发，回写并保存 ──
async function onEditClosed(event: { row: Transaction, column: { field: string } }) {
  const { row, column } = event
  // 优先用 slot 缓存的「最近一次选择」——见 editBuffer 注释。
  // 缓存没命中（不是本次编辑的格子 / 用户没改值）才回退到 row[field]
  const buffered = editBuffer.value
  const value = (buffered && buffered.id === row.id && buffered.field === column.field)
    ? buffered.value
    : (row as unknown as Record<string, unknown>)[column.field]
  editBuffer.value = null
  const patch: Partial<Transaction> = { [column.field]: value as Transaction[keyof Transaction] }
  try {
    await saveRow(row.id, patch)
    message.success('已保存', { duration: 1500 })
  }
  catch {
    message.error('保存失败')
  }
}

// ── 单删 / 批量 ──
async function onDeleteOne(id: number) {
  try {
    await removeOne(id)
    message.success('已删除')
  }
  catch {
    message.error('删除失败')
  }
}

async function onBatchDelete() {
  if (selectedIds.value.length === 0) {
    message.warning('请先勾选要删除的交易')
    return
  }
  const n = selectedIds.value.length
  try {
    await removeBatch()
    // 破坏性操作给 5s 撤销窗口（PRD 4.3）：message 无 action 能力，改用 notification 挂撤销按钮
    const notice = notification.success({
      title: '已删除',
      content: `已删除 ${n} 笔交易`,
      duration: 5000,
      action: () => h(NButton, {
        size: 'tiny',
        quaternary: true,
        onClick: async () => {
          await restoreLastRemoved()
          notice.destroy()
          notification.info({ title: '已撤销删除', duration: 2000 })
        },
      }, { default: () => '撤销' }),
    })
  }
  catch {
    message.error('删除失败')
  }
}

// ── 列配置持久化：列自定义（拖拽/显隐）或调宽后落盘（PRD §15.2.2） ──
function onColumnCustom() {
  persistColumns()
}
function onResizableChange() {
  persistColumns()
}

function onPageSizeChange(s: number) {
  pageSize.value = s
  onPageChange(1)
}

async function onBatchSetCategory() {
  if (batchCategoryId.value === null) {
    message.warning('请先选择分类')
    return
  }
  if (selectedIds.value.length === 0) {
    message.warning('请先勾选要修改分类的交易')
    return
  }
  const n = selectedIds.value.length
  try {
    await batchSetCategory(batchCategoryId.value)
    batchCategoryId.value = null
    message.success(`已将 ${n} 笔改为新分类`)
  }
  catch {
    message.error('批量修改失败')
  }
}

// ── 插槽参数类型化：vxe-table 内置插槽类型只覆盖官方 slot，自定义 slot 需要显式断言 row ──
// 注：defineSlots 在 vxe-table 上工作不好（vxe-table 的内置 slots 类型不全）
// 这里保留 `(row as Transaction)` —— TS 已知 data 是 Transaction[]，运行时安全
</script>

<template>
  <div class="txn-page">
    <header class="txn-head">
      <div>
        <h2 class="page-title">
          交易流水
        </h2>
        <p class="page-subtitle">
          共 {{ total.toLocaleString() }} 笔 · 已选 {{ selectedIds.length }} 笔
        </p>
      </div>
      <NSpace>
        <!-- 行高切换：紧凑 / 标准 / 宽松（PRD §15.2.2） -->
        <NSelect
          v-model:value="rowSize"
          :options="rowSizeOptions"
          size="small"
          style="width: 96px"
          @update:value="onRowSizeChange"
        />
        <NButton :loading="loading" @click="reload">
          刷新
        </NButton>
      </NSpace>
    </header>

    <div class="txn-body">
      <FilterPanel
        :filter="filter"
        :categories="dict.categories"
        :accounts="dict.accounts"
        @change="applyFilter"
        @reset="resetFilter"
      />

      <main class="txn-main">
        <div class="batch-bar" :class="{ active: selectedIds.length > 0 }">
          <NSpace v-if="selectedIds.length > 0" align="center">
            <span class="batch-tip">已选 {{ selectedIds.length }} 笔</span>
            <NSelect
              v-model:value="batchCategoryId"
              :options="categoryOptions"
              placeholder="批量改分类…"
              size="small"
              style="width: 180px"
              filterable
            />
            <NButton size="small" type="primary" @click="onBatchSetCategory">
              应用
            </NButton>
            <NButton size="small" type="error" @click="onBatchDelete">
              删除
            </NButton>
            <NButton size="small" quaternary @click="selectedIds = []">
              取消
            </NButton>
          </NSpace>
          <span v-else class="batch-hint">
            勾选行后可批量改分类 / 删除 · 双击单元格可编辑
          </span>
        </div>

        <div class="table-wrap">
          <div ref="gridHostRef" class="grid-host">
            <!--
              空状态：数据加载完且无数据时显示。
              vxe-table 自带空态文案过于朴素，给一个带引导的友好版：
              - 首次使用 → 「点右下角 + 记一笔」
              - 筛了没结果 → 「清空筛选看看」
            -->
            <div v-if="!loading && list.length === 0" class="empty-state">
              <div class="empty-emoji">
                {{ filterApplied ? '🔍' : '📒' }}
              </div>
              <h3 class="empty-title">
                {{ filterApplied ? '没有匹配的流水' : '还没有任何交易' }}
              </h3>
              <p class="empty-desc">
                {{ filterApplied ? '试试调整或清空筛选条件' : '点击右下角快速记一笔，开始你的记账之旅' }}
              </p>
              <NButton v-if="filterApplied" size="small" quaternary @click="resetFilter">
                清空筛选
              </NButton>
            </div>

            <vxe-grid
              v-else
              ref="gridRef"
              v-bind="gridOptions"
              @checkbox-change="(e: any) => selectedIds = e.records.map((r: Transaction) => r.id)"
              @checkbox-all="(e: any) => selectedIds = e.records.map((r: Transaction) => r.id)"
              @edit-closed="onEditClosed"
              @custom="onColumnCustom"
              @resizable-change="onResizableChange"
            >
              <!-- 类型 -->
              <template #type_cell="{ row }">
                <NTag :type="TRANSACTION_TYPE_META[(row as Transaction).type].naiveTagType" size="small" :bordered="false">
                  {{ TRANSACTION_TYPE_META[(row as Transaction).type].label }}
                </NTag>
              </template>

              <!-- 分类：显示态 -->
              <template #category_cell="{ row }">
                <!-- 转账没有分类（mock 里 categoryId=0），不再走到「· -」那种两个占位符的难看兜底 -->
                <span v-if="row.type === 'transfer'" class="cell-muted">—</span>
                <span v-else class="cell-inline">
                  <span class="cell-icon">{{ dict.categoryMap.get(row.categoryId)?.icon ?? '·' }}</span>
                  <span>{{ dict.categoryMap.get(row.categoryId)?.name ?? '-' }}</span>
                </span>
              </template>

              <!-- 分类：编辑态 -->
              <template #category_edit="{ row }">
                <!-- 转账没有可挂的分类，禁止进入编辑态（否则保存一个 income/expense 分类到 transfer 上是脏数据） -->
                <span v-if="row.type === 'transfer'" class="cell-muted">—</span>
                <NSelect
                  v-else
                  :value="row.categoryId"
                  :options="categoryOptions"
                  size="small"
                  filterable
                  @update:value="onCategoryEditChange(row, $event)"
                />
              </template>

              <!-- 账户 -->
              <template #account_cell="{ row }">
                <span class="cell-inline">
                  <span class="cell-icon">{{ dict.accountMap.get(row.accountId)?.icon ?? '·' }}</span>
                  <span>{{ dict.accountMap.get(row.accountId)?.name ?? '-' }}</span>
                </span>
              </template>

              <!-- 金额：显示态（颜色随「金额配色偏好」翻转，但符号恒定，颜色不是唯一编码） -->
              <template #amount_cell="{ row }">
                <span class="amt" :class="`tone-${settings.toneFor(row.type)}`">
                  {{ row.type === 'expense' ? '-' : row.type === 'income' ? '+' : '' }}{{ formatCents(row.amount) }}
                </span>
              </template>

              <!-- 金额：编辑态 -->
              <template #amount_edit="{ row }">
                <NInputNumber
                  :value="row.amount / 100"
                  :precision="2"
                  size="small"
                  :show-button="false"
                  @update:value="(v: number | null) => { if (v != null) row.amount = Math.round(v * 100) }"
                />
              </template>

              <!-- 备注：编辑态 -->
              <template #note_edit="{ row }">
                <NInput
                  :value="row.note"
                  size="small"
                  @update:value="(v: string) => { row.note = v }"
                />
              </template>

              <!-- 备注：显示态 -->
              <template #note_cell="{ row }">
                <span class="cell-note" :title="(row as Transaction).note || undefined">
                  {{ (row as Transaction).note || '-' }}
                </span>
              </template>

              <!-- 来源 -->
              <template #source_cell="{ row }">
                <NTag size="small" :bordered="false" type="default">
                  {{ TRANSACTION_SOURCE_META[(row as Transaction).source].label }}
                </NTag>
              </template>

              <!-- 操作 -->
              <template #action_cell="{ row }">
                <NButton text type="error" size="tiny" @click="onDeleteOne(row.id)">
                  删除
                </NButton>
              </template>
            </vxe-grid>
          </div>

          <div class="pagination-bar">
            <span class="pagination-total">
              共 {{ total.toLocaleString() }} 笔 · 每页 {{ pageSize }} 条 · 第 {{ page }} / {{ Math.ceil(total / pageSize) || 1 }} 页
            </span>
            <NPagination
              :page="page"
              :page-size="pageSize"
              :item-count="total"
              :page-sizes="[20, 50, 100]"
              show-size-picker
              show-quick-jumper
              @update:page="onPageChange"
              @update:page-size="onPageSizeChange"
            />
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped lang="scss">
.txn-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;
}

.txn-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.page-title {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 600;
  color: var(--lz-text-primary);
}

.page-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--lz-text-secondary);
}

.txn-body {
  display: flex;
  gap: 16px;
  // stretch 让两侧同高，右侧 txn-main 才能占满垂直空间
  align-items: stretch;
  min-height: 0;
}

.txn-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.batch-bar {
  padding: 8px 16px;
  border-radius: 10px;
  background: var(--lz-bg-card);
  border: 1px dashed var(--lz-border-light);
  transition: all 0.2s;

  &.active {
    border-color: var(--lz-primary-500);
    background: var(--lz-primary-50);
  }
}

.batch-tip {
  font-size: 13px;
  color: var(--lz-primary-700);
  font-weight: 600;
}

.batch-hint {
  font-size: 12px;
  color: var(--lz-text-secondary);
}

.table-wrap {
  flex: 1;
  min-height: 0;
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border-light);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

// vxe-grid 的弹性宿主：占满除分页栏外的全部高度，并约束 vxe 不溢出
.grid-host {
  flex: 1;
  min-height: 0;

  // 宽度拉满；高度由 height prop(ResizeObserver 算出的像素)驱动，不要再覆盖，
  // 否则会破坏 vxe 内部虚拟滚动高度计算
  :deep(.vxe-grid),
  :deep(.vxe-table) {
    width: 100%;
  }
}

.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid var(--lz-border-light);
  background: var(--lz-bg-card);
}

.pagination-total {
  font-size: 13px;
  color: var(--lz-text-secondary);
}

.cell-note {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

.cell-inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.cell-icon {
  font-size: 14px;
}

// 不可编辑 / 无内容的占位：与 .cell-inline 同高度对齐，灰色弱化
.cell-muted {
  display: inline-block;
  min-width: 1em;
  font-size: 13px;
  color: var(--lz-text-tertiary, var(--lz-text-secondary));
  user-select: none;
}

.amt {
  font-variant-numeric: tabular-nums;
  font-weight: 500;

  &.tone-success {
    color: var(--lz-success);
  }

  &.tone-danger {
    color: var(--lz-danger);
  }

  &.tone-neutral {
    color: var(--lz-text-secondary);
  }
}

// 空状态（PRD §15.2.2：友好引导而非空白）
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 240px;
  padding: 32px 16px;
  text-align: center;
  gap: 8px;
}

.empty-emoji {
  font-size: 48px;
  line-height: 1;
  margin-bottom: 4px;
}

.empty-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--lz-text-primary);
}

.empty-desc {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--lz-text-secondary);
}
</style>
