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
import type { Tag } from '@/types/tag'
import type { Account, Category } from '@/types/transaction'
import { NButton, NDatePicker, NInput, NSelect } from 'naive-ui'
import { computed } from 'vue'
import { TRANSACTION_TYPE_META, TRANSACTION_TYPES } from '@/enums/transaction'
import { useSettingsStore } from '@/stores/modules/settings'
import { dotOption, emojiOption, renderDotLabel, renderEmojiLabel } from '@/utils/select-option'

interface Props {
  filter: FilterState
  categories: Category[]
  accounts: Account[]
  tags: Tag[]
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

/** 类型色点取色来源（跟随系统设置里的金额配色偏好） */
const settings = useSettingsStore()

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
const tagIds = field('tagIds')
const keyword = field('keyword')
const status = field('status')

const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '待确认', value: 'pending' },
  { label: '已记', value: 'confirmed' },
]

/**
 * 类型筛选项：前面带语义色点。
 * 支出 / 收入取「系统设置 → 金额配色偏好」（绿收 or A 股红收都会跟着翻转），
 * 转账固定中性蓝 —— 取色统一走 settings.typeColor，页面里不再写死红绿。
 */
const typeOptions = computed(() => TRANSACTION_TYPES.map(value => dotOption(
  settings.typeColor(value),
  TRANSACTION_TYPE_META[value].label,
  value,
)))

// 账户 / 分类都带图标：和右侧大表单元格里的图标风格对齐（Twemoji，见 renderEmojiLabel）
const accountOptions = computed(() => props.accounts.map(a => emojiOption(a.icon, a.name, a.id)))
const categoryOptions = computed(() => props.categories.map(c => emojiOption(c.icon, c.name, c.id)))
// 标签：色点 + 名称（renderDotLabel）
const tagOptions = computed(() => props.tags.map(t => dotOption(t.color, t.name, t.id)))

function reset() {
  emit('reset')
}
</script>

<template>
  <aside class="filter-panel filter-area" aria-label="筛选条件">
    <header class="filter-head">
      <h2 class="filter-title">
        筛选
      </h2>
      <NButton quaternary size="tiny" @click="reset">
        重置
      </NButton>
    </header>

    <div class="filter-body">
      <!-- 无障碍：NDatePicker 不支持 input-props，用 label 包裹做隐式关联；
           NSelect / NInput 走 :input-props 直接给内部 input 加 aria-label（axe：控件必须有可访问名称） -->
      <div class="field">
        <span class="field-label">日期区间</span>
        <label class="date-box" aria-label="开始日期">
          <NDatePicker
            v-model:formatted-value="startDate"
            value-format="yyyy-MM-dd"
            type="date"
            placeholder="开始日期"
            clearable
          />
        </label>
        <label class="date-box" aria-label="结束日期">
          <NDatePicker
            v-model:formatted-value="endDate"
            value-format="yyyy-MM-dd"
            type="date"
            placeholder="结束日期"
            clearable
          />
        </label>
      </div>

      <div class="field">
        <span class="field-label">类型</span>
        <NSelect
          v-model:value="type"
          :options="typeOptions"
          :render-label="renderDotLabel"
          :input-props="{ 'aria-label': '类型筛选' }"
          placeholder="全部"
          clearable
        />
      </div>

      <div class="field">
        <span class="field-label">账户</span>
        <NSelect
          v-model:value="accountIds"
          :options="accountOptions"
          :render-label="renderEmojiLabel"
          :input-props="{ 'aria-label': '账户筛选' }"
          multiple
          placeholder="全部账户"
          clearable
        />
      </div>

      <div class="field">
        <span class="field-label">分类</span>
        <NSelect
          v-model:value="categoryIds"
          :options="categoryOptions"
          :render-label="renderEmojiLabel"
          :input-props="{ 'aria-label': '分类筛选' }"
          multiple
          placeholder="全部分类"
          filterable
          clearable
        />
      </div>

      <div class="field">
        <span class="field-label">标签</span>
        <NSelect
          v-model:value="tagIds"
          :options="tagOptions"
          :render-label="renderDotLabel"
          :input-props="{ 'aria-label': '标签筛选' }"
          multiple
          placeholder="全部标签"
          filterable
          clearable
        />
      </div>

      <div class="field">
        <span class="field-label">关键词</span>
        <NInput
          v-model:value="keyword"
          :input-props="{ 'aria-label': '关键词搜索' }"
          placeholder="备注 / 分类名"
          clearable
        />
      </div>

      <div class="field">
        <span class="field-label">状态</span>
        <NSelect
          v-model:value="status"
          :options="statusOptions"
          :input-props="{ 'aria-label': '状态筛选' }"
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

/* label 包裹日期选择器做无障碍隐式关联：label 默认 inline，撑成块让 picker 满宽 */
.date-box {
  display: flex;
}
</style>
