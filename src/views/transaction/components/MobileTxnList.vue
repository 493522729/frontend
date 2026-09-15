<script setup lang="ts">
/**
 * 交易流水页 · 移动端列表
 * ====================================================================
 * 与 PC 版（vxe-grid 大表）共用同一份数据层（useTransactionList），
 * 这里只换展示层。原因：vxe 的双击编辑 / 拖宽列 / 批量勾选全是鼠标交互，
 * 触屏上不成立 —— 手机上「无法显示」的根因就是渲染了一堆为鼠标设计的控件。
 *
 * 降级策略（移动端第一版刻意做减法）：
 *   - 每笔流水一张卡：分类 + 金额 / 账户 + 日期 + 状态 / 备注
 *   - 待确认行给「确认入账」；删除走父级确认弹窗（onDeleteOne 自带）
 *   - 筛选由父级的 NDrawer 承载（复用 FilterPanel），本组件只发 open-filter
 *   - 行内编辑、批量操作、列自定义：移动端不做（触屏没有高效形态，硬塞是负担）
 */
import type { Transaction } from '@/types/transaction'
import { NButton, NPagination, NTag } from 'naive-ui'
import EmptyState from '@/components/business/empty-state/index.vue'
import { useDictStore } from '@/stores/modules/dict'
import { useSettingsStore } from '@/stores/modules/settings'
import { formatCents } from '@/utils/money'

interface Props {
  list: Transaction[]
  loading: boolean
  total: number
  page: number
  pageSize: number
  /** 是否有生效中的筛选（筛选按钮上的小圆点提示，与 PC 版 filterApplied 同源） */
  filterApplied: boolean
}

const props = defineProps<Props>()

// 事件名统一带引号（'update:page' 含冒号必须带，其余跟随保持一致）；
// openFilter 用 camelCase：模板里写 @open-filter，Vue 会 camelize 回来
const emit = defineEmits<{
  'update:page': [page: number]
  'confirm': [txn: Transaction]
  'remove': [txn: Transaction]
  'openFilter': []
}>()

const dict = useDictStore()
const settings = useSettingsStore()

function categoryName(t: Transaction): string {
  if (t.type === 'transfer')
    return '转账'
  return dict.categoryMap.get(t.categoryId)?.name ?? '未分类'
}

function categoryIcon(t: Transaction): string {
  if (t.type === 'transfer')
    return '🔁'
  return dict.categoryMap.get(t.categoryId)?.icon ?? '·'
}

/** 转账行显示「A → B」两端（同 PC 版 account_cell：只写转出会让人以为钱凭空少了） */
function accountText(t: Transaction): string {
  const from = dict.accountMap.get(t.accountId)?.name ?? '-'
  if (t.type === 'transfer') {
    const to = dict.accountMap.get(t.toAccountId ?? -1)?.name ?? '-'
    return `${from} → ${to}`
  }
  return from
}
</script>

<template>
  <div class="mtxn">
    <!-- 工具条：筛选入口 + 计数。筛选是否生效用小圆点标记（不只靠颜色，位置+形态双编码） -->
    <div class="mtxn-toolbar">
      <button class="mtxn-filter-btn" type="button" @click="emit('openFilter')">
        <svg class="mtxn-filter-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
        筛选
        <span v-if="filterApplied" class="mtxn-filter-dot" aria-hidden="true" />
      </button>
      <span class="mtxn-count">共 {{ props.total.toLocaleString() }} 笔</span>
    </div>

    <!-- 列表：卡片式，每张卡三行（分类/金额 → 账户/日期/状态 → 备注 → 操作） -->
    <div class="mtxn-list">
      <EmptyState
        v-if="!props.loading && props.list.length === 0"
        :variant="props.filterApplied ? 'search' : 'ledger'"
        :title="props.filterApplied ? '没有匹配的流水' : '还没有任何交易'"
        :desc="props.filterApplied ? '试试调整或清空筛选条件' : '点击右下角快速记一笔，开始你的记账之旅'"
      />

      <article v-for="t in props.list" :key="t.id" class="mtxn-card">
        <div class="mtxn-row">
          <span class="mtxn-cat">
            <span class="mtxn-cat-icon" aria-hidden="true">{{ categoryIcon(t) }}</span>
            <span class="mtxn-cat-name">{{ categoryName(t) }}</span>
          </span>
          <!-- 金额：符号恒定 + 颜色跟随偏好（颜色不是唯一编码，与 PC 版同口径） -->
          <span class="mtxn-amt" :class="`tone-${settings.toneFor(t.type)}`">
            {{ t.type === 'expense' ? '-' : t.type === 'income' ? '+' : '' }}{{ formatCents(t.amount) }}
          </span>
        </div>

        <div class="mtxn-row mtxn-meta">
          <span class="mtxn-acct">{{ accountText(t) }}</span>
          <span class="mtxn-date">{{ t.transDate }}</span>
          <NTag v-if="t.status === 'pending'" size="small" type="warning" :bordered="false" class="mtxn-pending">
            待确认
          </NTag>
        </div>

        <p v-if="t.note" class="mtxn-note">
          {{ t.note }}
        </p>

        <div class="mtxn-actions">
          <NButton
            v-if="t.status === 'pending'"
            size="tiny"
            type="primary"
            secondary
            @click="emit('confirm', t)"
          >
            确认入账
          </NButton>
          <NButton size="tiny" type="error" secondary @click="emit('remove', t)">
            删除
          </NButton>
        </div>
      </article>

      <div v-if="props.loading" class="mtxn-loading" role="status">
        <span class="mtxn-loading-dot" aria-hidden="true" />
        加载中…
      </div>
    </div>

    <!-- 分页：simple 模式（上一页/下一页 + 页码），移动端不放 page-sizes -->
    <div v-if="props.total > 0" class="mtxn-pager">
      <NPagination
        simple
        :page="props.page"
        :page-size="props.pageSize"
        :item-count="props.total"
        @update:page="(p: number) => emit('update:page', p)"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.mtxn {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

// ── 工具条 ──
.mtxn-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mtxn-filter-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--lz-border-light);
  border-radius: var(--lz-radius-lg);
  background: var(--lz-bg-card);
  color: var(--lz-text-regular);
  font-size: 13px;
  cursor: pointer;

  &:active {
    background: var(--lz-primary-50);
    color: var(--lz-primary-600);
  }
}

.mtxn-filter-icon {
  width: 16px;
  height: 16px;
}

// 筛选生效中的小圆点：挂在按钮右上角
.mtxn-filter-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--lz-primary-500);
}

.mtxn-count {
  font-size: 13px;
  color: var(--lz-text-secondary);
}

// ── 卡片列表 ──
.mtxn-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mtxn-card {
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border-light);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mtxn-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mtxn-cat {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.mtxn-cat-icon {
  font-size: 20px;
  line-height: 1;
}

.mtxn-cat-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--lz-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// 金额：等宽数字，防抖动（与 PC 版 .amt 同规范）
.mtxn-amt {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  font-size: 16px;
  font-weight: 600;

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

.mtxn-meta {
  justify-content: flex-start;
  gap: 8px;
  font-size: 12px;
  color: var(--lz-text-secondary);
}

.mtxn-acct {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mtxn-date {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.mtxn-pending {
  flex-shrink: 0;
}

.mtxn-note {
  margin: 0;
  font-size: 13px;
  color: var(--lz-text-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mtxn-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.mtxn-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 0;
  font-size: 13px;
  color: var(--lz-text-secondary);
}

.mtxn-loading-dot {
  width: 16px;
  height: 16px;
  border: 2px solid var(--lz-border-light);
  border-top-color: var(--lz-primary-500);
  border-radius: 50%;
  animation: mtxn-spin 0.8s linear infinite;
}

@keyframes mtxn-spin {
  to {
    transform: rotate(360deg);
  }
}

// ── 分页 ──
.mtxn-pager {
  display: flex;
  justify-content: center;
  padding: 4px 0 8px;
}
</style>
