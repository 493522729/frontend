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
import { useMessage, useNotification } from 'naive-ui'
import { computed, getCurrentInstance, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useHotkey } from '@/composables/useHotkey'
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

// ── 行内编辑保存策略 ──
//  - 金额 / 备注：编辑框失焦时由 @edit-closed 统一回写保存
//  - 分类：NSelect「选完即保存」，在 @update:value 里直接 saveRow 并 clearEdit 退出编辑态；
//          因此 @edit-closed 对 categoryId 列跳过，避免重复保存 / 多弹一次提示
// 焦点竞态的根因与修复见下方 onDocMouseDownCapture 注释。

// 单独抽出这个 handler：
// 1) template 里 NSelect 的 @update:value 多行回调会被 vue/html-indent 误判缩进；
// 2) 业务逻辑收在 script 里，单测也好挂
const {
  list,
  total,
  loading,
  filter,
  selectedIds,
  page,
  pageSize,
  // 键盘导航高亮行 + 加载错误（错误条/重试用）
  activeIndex,
  loadError,
  reload,
  reloadFromFirst,
  // FilterPanel 只 emit 意图，真正的筛选状态改动走 composable 这两个方法
  applyFilter,
  resetFilter,
  onPageChange,
  saveRow,
  confirmRow,
  removeOne,
  removeBatch,
  restoreLastRemoved,
  batchSetCategory,
  confirmBatch,
  exportCurrentView,
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

// ── 筛选快捷键（PRD §15.2.2 体验补强 / 架构 §4.2）──────────────
//   - `/`：聚焦关键词搜索框（架构 §4.2：「/」= 列表页聚焦搜索）
//   - 1 / 2 / 3：切「全部 / 待确认 / 已记」状态筛选
//   - Esc：清空筛选条件
//
// ⚠️ 聚焦搜索原本占用 ⌘K，与全局「⌘K 记一笔」撞车：两处监听分别挂在
// document 与 window 上，preventDefault() 不阻止冒泡，在交易页按一次 ⌘K
// 会**同时**聚焦搜索框并弹出记账弹层。改回架构规定的 `/` 后冲突消失。
//
// 统一走 useHotkey 的另一个收益：单键在输入态自动豁免，
// 不必在每个页面各写一遍 typing 判断（架构 §4.2 铁律）。
useHotkey('/', focusKeyword)
useHotkey('1', () => setStatusFilter('all'))
useHotkey('2', () => setStatusFilter('pending'))
useHotkey('3', () => setStatusFilter('confirmed'))
useHotkey('Escape', () => {
  if (hasActiveFilter(filter))
    resetFilter()
})

/** 聚焦关键词搜索框并选中已有内容（方便直接改写） */
function focusKeyword() {
  const kwInput = document.querySelector<HTMLInputElement>('.filter-area input')
  kwInput?.focus()
  kwInput?.select()
}

/** 切状态筛选：与点击「全部 / 待确认 / 已记」等价 */
function setStatusFilter(status: typeof filter.status) {
  filter.status = status
  applyFilter({})
}

/** 是否有任何生效的筛选条件（用于 Esc 清空判断） */
function hasActiveFilter(f: typeof filter): boolean {
  return !!(
    f.keyword
    || f.type
    || f.status !== 'all'
    || (f.categoryIds && f.categoryIds.length > 0)
    || (f.accountIds && f.accountIds.length > 0)
    || f.startDate
    || f.endDate
  )
}

const categoryOptions = computed(() => dict.categories.map(c => ({ label: `${c.icon} ${c.name}`, value: c.id })))
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
    || (f.status && f.status !== 'all')
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
// 加版本号 v2：旧的列持久化数据（v1 存的 action fixed right / checkbox 44px 等）会导致新版布局异常，
// 直接换 key 弃用旧数据，让新基准列生效。
const COLUMN_KEY = `${STORAGE_KEYS.columnsPrefix}/transaction/v2`
const gridRef = ref<unknown>(null)

// onCategoryChange 定义在此：它依赖 saveRow（在上方声明），放在后面以通过 ts/no-use-before-define；
// <script setup> 里函数声明会提升，template 中通过 @update:value="onCategoryChange(row, $event)" 引用不受顺序影响。
async function onCategoryChange(row: Transaction, v: number) {
  if (row.categoryId === v)
    return
  // 分类列常驻 NSelect，「选完即保存」：乐观更新本地行，再落库；不进 vxe 编辑态，无需 clearEdit
  row.categoryId = v
  try {
    await saveRow(row.id, { categoryId: v })
    message.success('已保存', { duration: 1500 })
  }
  catch {
    message.error('保存失败')
  }
}

interface ColState { visible: boolean, width: number }

function loadColumnState(): Map<string, ColState> | null {
  try {
    const raw = localStorage.getItem(COLUMN_KEY)
    if (!raw)
      return null
    const obj = JSON.parse(raw) as Record<string, ColState>
    return new Map(Object.entries(obj))
  }
  catch {
    return null
  }
}

function persistColumns() {
  // 直接从 grid 实例读当前列状态，不依赖事件 payload 形状，最稳。
  // 只存「列 key → {可见性, 宽度}」，不存顺序 —— 顺序永远按 BASE_COLUMNS 固定，
  // 这样即使 getColumns() 返回的顺序与基准不同（拖宽后物理顺序变化），重建时也不会乱序。
  const grid = gridRef.value as {
    getColumns?: () => Array<{ field?: string, type?: string, visible?: boolean, renderWidth?: number, width?: number }>
  } | null
  const cols = grid?.getColumns?.() ?? []
  const state: Record<string, ColState> = {}
  for (const c of cols) {
    // checkbox 列没有 field，用 type 兜底做 key；其余列用 field
    const key = c.field || (c.type === 'checkbox' ? '__checkbox__' : '')
    if (!key)
      continue
    const width = c.renderWidth || c.width || 0
    if (width > 0)
      state[key] = { visible: c.visible !== false, width }
  }
  localStorage.setItem(COLUMN_KEY, JSON.stringify(state))
}

/** 列定义基准（不含可见性/宽度，持久化的状态叠加在它之上） */
type ColDef = NonNullable<VxeGridProps<Transaction>['columns']>[number]
const BASE_COLUMNS: ColDef[] = [
  // checkbox 列宽度要覆盖勾选框 + 左右 padding：44px 在 size=small 下会被压成细条，给 52px
  { type: 'checkbox', width: 52, fixed: 'left', align: 'center' },
  { field: 'transDate', title: '日期', width: 110, sortable: true, fixed: 'left' },
  { field: 'type', title: '类型', width: 80, slots: { default: 'type_cell' }, align: 'center' },
  {
    field: 'categoryId',
    title: '分类',
    width: 130,
    // 分类列不进 vxe 编辑态：直接常驻 NSelect（见模板 #category_cell 注释），选完即保存
    slots: { default: 'category_cell' },
  },
  // 转账行要显示「A → B」两端，宽度按两条账户名预留，否则会被截断成省略号
  { field: 'accountId', title: '账户', width: 170, slots: { default: 'account_cell' } },
  {
    field: 'amount',
    title: '金额',
    width: 120,
    align: 'right',
    sortable: true,
    editRender: { name: 'input' },
    slots: { default: 'amount_cell', edit: 'amount_edit' },
  },
  // 备注列不固定宽度，用 minWidth 让其在宽屏下自动拉伸，避免右侧大片留白
  { field: 'note', title: '备注', minWidth: 160, editRender: { name: 'input' }, slots: { default: 'note_cell', edit: 'note_edit' } },
  { field: 'source', title: '来源', width: 90, slots: { default: 'source_cell' } },
  // 操作列不固定右侧：当前页面数据量（50 行/页）不需要固定，固定反而在表格未横向滚动时制造右侧阴影留白
  { field: 'action', title: '操作', width: 80, slots: { default: 'action_cell' } },
]

/** 合并持久化状态：顺序始终按 BASE_COLUMNS 固定，只叠加「可见性 / 宽度」 */
function buildColumns(): ColDef[] {
  const saved = loadColumnState()
  if (!saved)
    return BASE_COLUMNS
  return BASE_COLUMNS.map((c) => {
    const key = (c as { field?: string }).field || (c.type === 'checkbox' ? '__checkbox__' : '')
    const s = key ? saved.get(key) : undefined
    if (!s)
      return c
    // 只有基准列本身声明了固定 width 的列，才允许持久化覆盖 width；
    // 弹性列（如备注 minWidth）保持 width 未定义，确保在宽屏下自动拉伸填充剩余空间，
    // 避免右侧出现大片空白。
    const baseHasFixedWidth = 'width' in c && c.width != null
    return {
      ...c,
      visible: s.visible,
      ...(baseHasFixedWidth ? { width: Math.max(40, Math.min(500, s.width)) } : {}),
    }
  })
}

// ── vxe-table 列配置 ──
// vxe-table 自带虚拟滚动、列拖拽、列设置工具栏；这里只配数据 + 列定义
// 列配置只在初始化时读一次持久化状态（避免数据 reload 时反复重建列、打断用户拖拽）
const initialColumns = buildColumns()

/**
 * 虚拟滚动阈值：单页超过这么多行才启用（架构 §438）
 *
 * 200 行以内 DOM 直出比虚拟滚动更轻——虚拟滚动要额外维护偏移量和渲染窗口，
 * 行数少时是纯开销。默认值 50/100 都在这个阈值下，所以日常翻页走原生渲染。
 */
const VIRTUAL_SCROLL_GT = 200

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
  // ⚠️ data / loading 不放进这个 computed：
  // 之前把它们塞进 computed、再用 watch 手动 mutate 这个 computed 的缓存对象来同步，
  // 是脆弱写法——list 重新赋值后 computed 会重算出新对象，而 watch 改的是旧对象，
  // v-bind 用的是新对象，二者错位，导致 vxe 拿不到最新数据、单元格「改了和没改一样」。
  // 改为模板里 `:data="list" :loading="loading"` 直接绑定，list 一重新赋值就立刻下发给 vxe。
  // 列定义走 buildColumns()：基准列叠加 localStorage 里持久化的「显隐/列宽/顺序」
  columns: initialColumns,
  // 纵向虚拟滚动（PRD §249：10w 行 60fps；架构 §438：单页 > 200 行走虚拟滚动）
  //
  // ⚠️ 必须显式给 gt，且不能再用已废弃的 scrollY：
  //   vxe 4.21.5 的启用判定是 `gt > -1 && (gt === 0 || gt < 行数)`，
  //   而 vxe 全局配置里**没有 gt 的默认值** —— 只写 `{ enabled: true }` 时 gt 是
  //   undefined，`undefined > -1` 为 false，虚拟滚动永远不启用，
  //   页面会把整页行全渲进 DOM（实测 pageSize=2000 → 4000 个 tr）。
  //   这个坑很隐蔽：小数据量下页面照样正常，只有行数上去了才会卡。
  virtualYConfig: { enabled: true, gt: VIRTUAL_SCROLL_GT },
  editConfig: {
    trigger: 'dblclick' as const,
    mode: 'cell' as const,
    showStatus: true,
    // Esc 原生取消编辑；但自定义键盘导航仍监听同一事件，需 stopPropagation 避免双重处理
    escToCancel: true,
  },
  // 键盘导航高亮：当前 activeIndex 对应的行加 .is-active-row（见 onGridKeydown）
  rowClassName: ({ rowIndex }: { rowIndex: number }) => (rowIndex === activeIndex.value ? 'is-active-row' : ''),
}))

// ── 行内编辑：vxe-table 关闭编辑时触发，回写并保存（金额 / 备注走这里） ──
// 分类列已改为常驻 NSelect、不走 vxe 编辑态（见模板 #category_cell 注释）。
async function onEditClosed(event: { row: Transaction, column: { field: string } }) {
  const { row, column } = event
  const patch = { [column.field]: (row as unknown as Record<string, unknown>)[column.field] } as Partial<Transaction>
  try {
    await saveRow(row.id, patch)
    message.success('已保存', { duration: 1500 })
  }
  catch {
    message.error('保存失败')
  }
}

// ── 键盘导航（PRD §15.2.2：↑↓ 移焦点 / Enter 编辑 / Esc 退出） ──
// 依赖 vxe-grid 实例方法：scrollToRow 滚到某行、setEditCell 进入单元格编辑、clearEdit/isEdit 退出/判断编辑态。
// gridRef 在模板里是 unknown，这里按需收紧成「只取用到的几个方法」，避免到处 any。
function gridApi() {
  return gridRef.value as {
    scrollToRow?: (row: Transaction) => void
    setEditCell?: (row: Transaction, field: string) => void
    clearEdit?: () => void
    // vxe-table 4.x 没有 isEdit()，用 getEditRecord() 判断是否处于编辑态
    getEditRecord?: () => { row: Transaction } | null
  } | null
}

/**
 * 表格区键盘事件。
 * 两个「让权」原则，避免和正常输入打架：
 *   1) 正在编辑单元格（vxe getEditRecord 返回对象）→ Enter 提交、Esc 取消编辑并阻止冒泡；
 *      方向键也别插手，留给输入框光标/选区移动。
 *   2) 焦点在 input/select/textarea → 那是用户在打字，方向键留给光标移动。
 *
 * 踩坑：vxe-table 4.x 没有 isEdit()，之前误判为「非编辑态」，导致 Esc 只清 activeIndex
 *       而不退出单元格编辑。修复：用 getEditRecord() 判断；同时 editConfig 开启 escToCancel。
 */
function onGridKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  const tag = target?.tagName
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable === true
  const grid = gridApi()
  const isEditing = !!grid?.getEditRecord?.()

  if (isEditing) {
    if (e.key === 'Escape') {
      // 阻止事件继续传给 vxe 内部其他 handler（escToCancel 已开，这里只是兜底+同步状态）
      e.preventDefault()
      e.stopPropagation()
      grid?.clearEdit?.()
    }
    return
  }
  if (typing || list.value.length === 0)
    return

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const dir = e.key === 'ArrowDown' ? 1 : -1
    // 当前无高亮时，↓从首行开始、↑从末行开始，体验更顺
    const base = activeIndex.value < 0 ? (dir > 0 ? -1 : list.value.length) : activeIndex.value
    const next = Math.min(list.value.length - 1, Math.max(0, base + dir))
    activeIndex.value = next
    const row = list.value[next]
    if (row)
      grid?.scrollToRow?.(row)
  }
  else if (e.key === 'Enter') {
    if (activeIndex.value < 0)
      return
    e.preventDefault()
    const row = list.value[activeIndex.value]
    if (row)
      grid?.setEditCell?.(row, 'amount')
  }
  else if (e.key === 'Escape') {
    if (activeIndex.value !== -1) {
      e.preventDefault()
      activeIndex.value = -1
    }
  }
}

/** 鼠标点单元格也同步高亮行，让鼠标 / 键盘两套交互状态一致 */
function onCellClick(params: { rowIndex: number }) {
  activeIndex.value = params.rowIndex
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

/**
 * 一键批量确认（US-002 体验补强）
 * - 仅在「待确认」筛选下显示入口
 * - 内部按 status 二次过滤：哪怕用户勾了已记行也不会被改
 */
async function onConfirmBatch() {
  if (selectedIds.value.length === 0) {
    message.warning('请先勾选要确认的流水')
    return
  }
  const ids = list.value.filter(t => selectedIds.value.includes(t.id) && t.status === 'pending')
  if (ids.length === 0) {
    message.warning('所选行均已确认，无可操作流水')
    return
  }
  try {
    await confirmBatch()
    message.success(`已确认 ${ids.length} 笔流水`)
  }
  catch {
    message.error('批量确认失败')
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
        <h1 class="page-title">
          交易流水
        </h1>
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
        <!-- 导出当前筛选视图（PRD §15.2.2）；不依赖勾选，导出的是筛选结果全集 -->
        <NButton size="small" quaternary :disabled="total === 0" @click="exportCurrentView">
          导出 CSV
        </NButton>
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
            <NButton size="small" type="warning" @click="onConfirmBatch">
              批量确认
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
          <!-- 加载失败统一错误条（PRD 9.2）：自动重试 3 次仍失败才出现，附手动重试按钮 -->
          <div v-if="loadError" class="load-error" role="alert">
            <span class="load-error-icon">⚠️</span>
            <div class="load-error-text">
              <strong>{{ loadError.title }}</strong>
              <span v-if="loadError.detail"> · {{ loadError.detail }}</span>
            </div>
            <NButton size="small" type="primary" secondary @click="reload">
              重试
            </NButton>
          </div>

          <div ref="gridHostRef" class="grid-host" tabindex="0" @keydown="onGridKeydown">
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
              <h2 class="empty-title">
                {{ filterApplied ? '没有匹配的流水' : '还没有任何交易' }}
              </h2>
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
              :data="list"
              :loading="loading"
              @checkbox-change="(e: any) => selectedIds = e.records.map((r: Transaction) => r.id)"
              @checkbox-all="(e: any) => selectedIds = e.records.map((r: Transaction) => r.id)"
              @edit-closed="onEditClosed"
              @cell-click="onCellClick"
              @custom="onColumnCustom"
              @resizable-change="onResizableChange"
            >
              <!--
                vxe-table 4.x 默认未注册 VxeLoading 组件，直接用 loading prop
                会报「缺少 vxe-loading 组件」警告。提供 #loading 插槽后，table
                会走插槽渲染，不再依赖全局注册的 loading 组件。
              -->
              <template #loading="slotProps">
                <div v-if="(slotProps as unknown as { loading: boolean }).loading" class="grid-loading-mask">
                  <div class="grid-loading-spinner">
                    <span class="grid-loading-dot" />
                    <span class="grid-loading-text">加载中…</span>
                  </div>
                </div>
              </template>

              <!-- 类型 -->
              <template #type_cell="{ row }">
                <NTag :type="TRANSACTION_TYPE_META[(row as Transaction).type].naiveTagType" size="small" :bordered="false">
                  {{ TRANSACTION_TYPE_META[(row as Transaction).type].label }}
                </NTag>
              </template>

              <!--
                分类列：始终以 NSelect 呈现（不进 vxe 编辑态）。
                之所以不走「双击进入编辑态再选」：NSelect 下拉默认 teleport 到 document.body，
                点选项的 mousedown 落在 body 上，vxe 会误判为「点击单元格外部」而抢先关闭编辑态并用旧值回写，
                紧接着 NSelect 被卸载、@update:value 再也无法触发，新值传不过去（经典竞态）。
                Naive 的 v-binder 定位又强依赖 teleport 到 body，任何 getPopupContainer / teleported:false
                都会把下拉定位打乱（选项压到触发器上、点不中）。所以直接把 NSelect 常驻单元格，
                选完即保存，彻底绕开「失焦→关编辑→旧值回写」这一连串问题。转账行无分类，显示「—」。
              -->
              <template #category_cell="{ row }">
                <span v-if="row.type === 'transfer'" class="cell-muted">—</span>
                <NSelect
                  v-else
                  :value="row.categoryId"
                  :options="categoryOptions"
                  :input-props="{ 'aria-label': `修改第 ${(row as Transaction).id} 行的分类` }"
                  size="small"
                  filterable
                  @update:value="onCategoryChange(row, $event)"
                />
              </template>

              <!--
                账户
                转账要显示「从哪 → 到哪」：只写转出账户会让人以为钱凭空少了，
                而转账的本质就是资金在自己账户间搬运，两端都得看得见。
              -->
              <template #account_cell="{ row }">
                <span v-if="row.type === 'transfer'" class="cell-inline">
                  <span class="cell-icon">{{ dict.accountMap.get(row.accountId)?.icon ?? '·' }}</span>
                  <span>{{ dict.accountMap.get(row.accountId)?.name ?? '-' }}</span>
                  <span class="transfer-arrow" aria-hidden="true">→</span>
                  <span class="cell-icon">{{ dict.accountMap.get(row.toAccountId ?? -1)?.icon ?? '·' }}</span>
                  <span>{{ dict.accountMap.get(row.toAccountId ?? -1)?.name ?? '-' }}</span>
                </span>
                <span v-else class="cell-inline">
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

              <!-- 来源 + 入账状态 -->
              <template #source_cell="{ row }">
                <NTag size="small" :bordered="false" type="default">
                  {{ TRANSACTION_SOURCE_META[(row as Transaction).source].label }}
                </NTag>
                <NTag
                  v-if="(row as Transaction).status === 'pending'"
                  size="small"
                  type="warning"
                  :bordered="false"
                  class="status-pending"
                >
                  待确认
                </NTag>
              </template>

              <!-- 操作 -->
              <template #action_cell="{ row }">
                <NButton
                  v-if="(row as Transaction).status === 'pending'"
                  text
                  type="primary"
                  size="tiny"
                  @click="confirmRow(row.id)"
                >
                  确认
                </NButton>
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
              :page-sizes="[20, 50, 100, 200, 500]"
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
  @include transition-paint();

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

  // 自定义 loading 遮罩（替代未注册的 vxe-loading 组件）
  .grid-loading-mask {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(var(--lz-bg-card-rgb, 255 255 255), 0.72);
    backdrop-filter: blur(2px);
    z-index: 10;
  }

  .grid-loading-spinner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .grid-loading-dot {
    width: 28px;
    height: 28px;
    border: 3px solid var(--lz-border-light);
    border-top-color: var(--lz-primary-500);
    border-radius: 50%;
    animation: grid-spin 0.8s linear infinite;
  }

  .grid-loading-text {
    font-size: 13px;
    color: var(--lz-text-secondary);
  }
}

@keyframes grid-spin {
  to {
    transform: rotate(360deg);
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

// 转账的「→」：灰、等宽、不参与选中，避免复制单元格时把箭头一起带走
.transfer-arrow {
  margin: 0 2px;
  font-size: 12px;
  color: var(--lz-text-secondary);
  user-select: none;
}

// 不可编辑 / 无内容的占位：与 .cell-inline 同高度对齐，灰色弱化
.cell-muted {
  display: inline-block;
  min-width: 1em;
  font-size: 13px;
  color: var(--lz-text-secondary);
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

// 键盘导航高亮行（vxe 生成的 <tr> 不带本组件 scoped 属性，必须 :deep 才能命中）
:deep(.is-active-row) {
  background: var(--lz-primary-50) !important;
}

:deep(.is-active-row:hover) {
  background: var(--lz-primary-100, var(--lz-primary-50)) !important;
}

// 待确认标签与来源标签之间的间距
.status-pending {
  margin-left: 6px;
}

// 加载失败统一错误条（PRD 9.2）
.load-error {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  margin-bottom: 12px;
  border-radius: 10px;
  background: var(--lz-danger-bg);
  border: 1px solid var(--lz-danger);

  .load-error-icon {
    font-size: 18px;
  }

  .load-error-text {
    flex: 1;
    font-size: 13px;
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
