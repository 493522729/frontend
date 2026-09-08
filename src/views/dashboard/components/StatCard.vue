<script setup lang="ts">
/**
 * 仪表盘数据卡（PRD 8.1）
 * ====================================================================
 * 规格：数字 28px、千分位、收入绿 / 支出红、环比箭头 + 百分比。
 *
 * 环比的颜色是「语义驱动」而不是「方向驱动」—— 这点很容易做错：
 *   收入涨 = 好事（绿）；支出涨 = 坏事（红）
 * 所以组件要 momGoodWhen 来声明「涨是好事还是坏事」，
 * 否则支出同比涨 20% 会显示成一片绿，语义完全反了。
 */
import { NSkeleton } from 'naive-ui'
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/modules/settings'
import { formatCents } from '@/utils/money'

const props = withDefaults(defineProps<{
  label: string
  /** 金额（分）—— 金额卡传它 */
  value?: number | null
  /** 直接展示的文本（百分比卡传它），与 value 二选一 */
  text?: string
  /** 收入 / 支出 / 中性 / 按正负自动（结余卡用 auto） */
  tone?: 'income' | 'expense' | 'neutral' | 'auto'
  /** 环比百分比；null 不展示环比行 */
  mom?: number | null
  /** 上涨算好事（收入）还是坏事（支出） */
  momGoodWhen?: 'up' | 'down'
  loading?: boolean
}>(), {
  value: null,
  text: '',
  tone: 'auto',
  mom: null,
  momGoodWhen: 'up',
  loading: false,
})

const settings = useSettingsStore()

const displayValue = computed(() =>
  props.text || formatCents(props.value ?? 0, { withSymbol: true }),
)

/**
 * 主数值的「逻辑色调」：income / expense / neutral
 * ────────────────────────────────────────────────
 * tone 直接指定时取它；auto 模式按结余正负推（正=收入语义、负=支出语义）。
 * 真正上色由 settings.toneFor 决定，从而尊重用户的「收入红/绿」偏好。
 */
const logicalTone = computed<('income' | 'expense' | 'neutral')>(() => {
  if (props.tone === 'income')
    return 'income'
  if (props.tone === 'expense')
    return 'expense'
  if (props.tone === 'neutral')
    return 'neutral'
  const v = props.value ?? 0
  if (v > 0)
    return 'income'
  if (v < 0)
    return 'expense'
  return 'neutral'
})

/** 主数值颜色：随「金额配色偏好」翻转 */
const toneClass = computed(() => `tone-${settings.toneFor(logicalTone.value)}`)

const hasMom = computed(() => props.mom != null)

const momArrow = computed(() => {
  const m = props.mom
  if (m == null || m === 0)
    return '－'
  return m > 0 ? '↑' : '↓'
})

const momText = computed(() => {
  const m = props.mom
  if (m == null)
    return ''
  // 百分比不是金额，不走 formatCents
  const abs = Math.abs(m)
  return `${abs.toFixed(1)}%`
})

/**
 * 环比颜色：按「涨跌对我是好是坏」判断，不随收入红/绿偏好翻转
 * （「好」永远用 success 色，与收支配色是两回事）
 */
const momClass = computed(() => {
  const m = props.mom
  if (m == null || m === 0)
    return 'tone-neutral'
  const isUp = m > 0
  const isGood = props.momGoodWhen === 'up' ? isUp : !isUp
  return isGood ? 'tone-success' : 'tone-danger'
})
</script>

<template>
  <div class="stat-card">
    <span class="stat-label">{{ label }}</span>

    <NSkeleton v-if="loading" text width="60%" :height="34" />
    <span v-else class="stat-value" :class="toneClass">{{ displayValue }}</span>

    <div v-if="hasMom && !loading" class="stat-mom" :class="momClass">
      <span class="mom-arrow" aria-hidden="true">{{ momArrow }}</span>
      <span class="mom-value">{{ momText }}</span>
      <span class="mom-hint">较上月</span>
    </div>
    <div v-else-if="hasMom" class="stat-mom stat-mom--loading">
      <NSkeleton text width="72px" :height="16" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.stat-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 20px 24px;
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  box-shadow: var(--lz-shadow-sm);
  transition: box-shadow 200ms var(--lz-ease-standard);

  &:hover {
    box-shadow: var(--lz-shadow-md);
  }
}

.stat-label {
  font-size: 13px;
  color: var(--lz-text-secondary);
}

// 等宽数字：金额位数变化时不错位（架构文档 3.2）
.stat-value {
  font-size: 28px;
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  color: var(--lz-text-primary);

  &.tone-success {
    color: var(--lz-success);
  }

  &.tone-danger {
    color: var(--lz-danger);
  }

  &.tone-neutral {
    color: var(--lz-text-primary);
  }
}

.stat-mom {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;

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

.stat-mom--loading {
  min-height: 20px;
}

.mom-arrow {
  font-size: 12px;
}

.mom-hint {
  color: var(--lz-text-secondary);
}
</style>
