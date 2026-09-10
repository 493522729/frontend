<script setup lang="ts">
/**
 * 交易流水页 · 左侧筛选区
 * ====================================================================
 * 240px 固定宽度，支持日期区间、类型、账户、分类、关键词。
 * 任一变化自动触发 reload（composable 内置 250ms 防抖）。
 *
 * 数据来源：dict store（跨页面共享），本组件只接收 filter 引用，避免重复加载。
 */
import type { FilterState } from '../composables/useTransactionList'
import type { Account, Category } from '@/types/transaction'
import { NButton, NDatePicker, NInput, NSelect } from 'naive-ui'
import { computed } from 'vue'
import { TRANSACTION_TYPE_META, TRANSACTION_TYPES } from '@/enums/transaction'

interface Props {
  filter: FilterState
  categories: Category[]
  accounts: Account[]
}

const props = defineProps<Props>()

/**
 * 单向数据流：filter 在本组件里只读，所有改动 emit 给父级，
 * 由 composable 的 applyFilter / resetFilter 统一落盘（并顺带把分页重置回第 1 页）。
 * 直接写 props.filter.* 会命中 vue/no-mutating-props，且父级重渲染时改动可能被覆盖回去。
 */
const emit = defineEmits<{
  /** 局部更新筛选项 */
  change: [patch: Partial<FilterState>]
  /** 重置全部筛选条件 */
  reset: []
}>()

/** 造可写 computed：模板继续用 v-model 语法，写入自动转成 change 事件 */
function field<K extends keyof FilterState>(key: K) {
  return computed({
    get: () => props.filter[key],
    set: value => emit('change', { [key]: value } as Partial<FilterState>),
  })
}

const startDate = field('startDate')
const endDate = field('endDate')
const type = field('type')
const accountIds = field('accountIds')
const categoryIds = field('categoryIds')
const keyword = field('keyword')
const status = field('status')

const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '待确认', value: 'pending' },
  { label: '已记', value: 'confirmed' },
]

const typeOptions = TRANSACTION_TYPES.map(value => ({
  label: TRANSACTION_TYPE_META[value].label,
  value,
}))

const accountOptions = computed(() => props.accounts.map(a => ({ label: a.name, value: a.id })))
const categoryOptions = computed(() => props.categories.map(c => ({ label: c.name, value: c.id })))

function reset() {
  emit('reset')
}
</script>

<template>
  <aside class="filter-panel filter-area" aria-label="筛选条件">
    <header class="filter-head">
      <h3 class="filter-title">
        筛选
      </h3>
      <NButton quaternary size="tiny" @click="reset">
        重置
      </NButton>
    </header>

    <div class="filter-body">
      <div class="field">
        <label class="field-label">日期区间</label>
        <NDatePicker
          v-model:formatted-value="startDate"
          value-format="yyyy-MM-dd"
          type="date"
          placeholder="开始日期"
          clearable
        />
        <NDatePicker
          v-model:formatted-value="endDate"
          value-format="yyyy-MM-dd"
          type="date"
          placeholder="结束日期"
          clearable
        />
      </div>

      <div class="field">
        <label class="field-label">类型</label>
        <NSelect
          v-model:value="type"
          :options="typeOptions"
          placeholder="全部"
          clearable
        />
      </div>

      <div class="field">
        <label class="field-label">账户</label>
        <NSelect
          v-model:value="accountIds"
          :options="accountOptions"
          multiple
          placeholder="全部账户"
          clearable
        />
      </div>

      <div class="field">
        <label class="field-label">分类</label>
        <NSelect
          v-model:value="categoryIds"
          :options="categoryOptions"
          multiple
          placeholder="全部分类"
          filterable
          clearable
        />
      </div>

      <div class="field">
        <label class="field-label">关键词</label>
        <NInput
          v-model:value="keyword"
          placeholder="备注 / 分类名"
          clearable
        />
      </div>

      <div class="field">
        <label class="field-label">状态</label>
        <NSelect
          v-model:value="status"
          :options="statusOptions"
          placeholder="全部"
          clearable
        />
      </div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.filter-panel {
  width: 240px;
  flex-shrink: 0;
  padding: 16px;
  border-radius: 12px;
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border-light);
  align-self: flex-start;
  position: sticky;
  top: 16px;
}

.filter-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.filter-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--lz-text-primary);
}

.filter-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  font-size: 12px;
  color: var(--lz-text-secondary);
  font-weight: 500;
}
</style>
