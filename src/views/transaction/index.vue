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
import { NButton, NInput, NInputNumber, NSelect, NSpace, NTag, useMessage } from 'naive-ui'
import { computed, getCurrentInstance, ref, watch } from 'vue'
import { TRANSACTION_SOURCE_META, TRANSACTION_TYPE_META } from '@/enums/transaction'
import { useDictStore } from '@/stores/modules/dict'
import { useQuickEntryStore } from '@/stores/modules/quickEntry'
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
const dict = useDictStore()

const {
  list,
  total,
  loading,
  filter,
  selectedIds,
  reload,
  reloadFromFirst,
  // FilterPanel 只 emit 意图，真正的筛选状态改动走 composable 这两个方法
  applyFilter,
  resetFilter,
  saveRow,
  removeOne,
  removeBatch,
  batchSetCategory,
} = useTransactionList()

// 快速记账弹层的写操作（新增 / 撤销）完成后刷新列表：回第 1 页，保证所见即所得
const quickEntry = useQuickEntryStore()
watch(() => quickEntry.dataChangedAt, () => reloadFromFirst())

const categoryOptions = computed(() => dict.categories.map(c => ({ label: c.name, value: c.id })))
const batchCategoryId = ref<number | null>(null)

// ── vxe-table 列配置 ──
// vxe-table 自带虚拟滚动、列拖拽、列设置工具栏；这里只配数据 + 列定义
const gridOptions = computed<VxeGridOptions>(() => ({
  border: true,
  showOverflow: true,
  stripe: true,
  // 高度由外层 .table-wrap 的 flex:1 撑满，这里填 100% 随容器拉伸
  height: '100%',
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
  columns: [
    { type: 'checkbox', width: 44, fixed: 'left' as const },
    { field: 'transDate', title: '日期', width: 120, sortable: true, fixed: 'left' as const },
    {
      field: 'type',
      title: '类型',
      width: 90,
      slots: { default: 'type_cell' },
    },
    {
      field: 'categoryId',
      title: '分类',
      width: 140,
      // editRender 是进入编辑态的开关；name 用 'input' 占位，实际渲染走下方的 #category_edit 插槽
      editRender: { name: 'input' },
      slots: { default: 'category_cell', edit: 'category_edit' },
    },
    {
      field: 'accountId',
      title: '账户',
      width: 140,
      slots: { default: 'account_cell' },
    },
    {
      field: 'amount',
      title: '金额',
      width: 140,
      align: 'right' as const,
      sortable: true,
      editRender: { name: 'input' },
      slots: { default: 'amount_cell', edit: 'amount_edit' },
    },
    {
      field: 'note',
      title: '备注',
      minWidth: 180,
      editRender: { name: 'input' },
      slots: { default: 'note_cell', edit: 'note_edit' },
    },
    {
      field: 'source',
      title: '来源',
      width: 100,
      slots: { default: 'source_cell' },
    },
    {
      field: 'action',
      title: '操作',
      width: 90,
      fixed: 'right' as const,
      slots: { default: 'action_cell' },
    },
  ],
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
  const patch: Partial<Transaction> = { [column.field]: (row as any)[column.field] }
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
    message.success(`已删除 ${n} 笔`)
  }
  catch {
    message.error('删除失败')
  }
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
          <vxe-grid
            v-bind="gridOptions"
            @checkbox-change="(e: any) => selectedIds = e.records.map((r: Transaction) => r.id)"
            @checkbox-all="(e: any) => selectedIds = e.records.map((r: Transaction) => r.id)"
            @edit-closed="onEditClosed"
          >
            <!-- 类型 -->
            <template #type_cell="{ row }">
              <NTag :type="TRANSACTION_TYPE_META[(row as Transaction).type].naiveTagType" size="small" :bordered="false">
                {{ TRANSACTION_TYPE_META[(row as Transaction).type].label }}
              </NTag>
            </template>

            <!-- 分类：显示态 -->
            <template #category_cell="{ row }">
              <span class="cell-inline">
                <span class="cell-icon">{{ dict.categoryMap.get(row.categoryId)?.icon ?? '·' }}</span>
                <span>{{ dict.categoryMap.get(row.categoryId)?.name ?? '-' }}</span>
              </span>
            </template>

            <!-- 分类：编辑态 -->
            <template #category_edit="{ row }">
              <NSelect
                :value="row.categoryId"
                :options="categoryOptions"
                size="small"
                filterable
                @update:value="(v: number) => { row.categoryId = v }"
              />
            </template>

            <!-- 账户 -->
            <template #account_cell="{ row }">
              <span class="cell-inline">
                <span class="cell-icon">{{ dict.accountMap.get(row.accountId)?.icon ?? '·' }}</span>
                <span>{{ dict.accountMap.get(row.accountId)?.name ?? '-' }}</span>
              </span>
            </template>

            <!-- 金额：显示态 -->
            <template #amount_cell="{ row }">
              <span class="amt" :class="[row.type]">
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

.amt {
  font-variant-numeric: tabular-nums;
  font-weight: 500;

  &.expense {
    color: var(--lz-danger);
  }

  &.income {
    color: var(--lz-success);
  }

  &.transfer {
    color: var(--lz-text-secondary);
  }
}
</style>
