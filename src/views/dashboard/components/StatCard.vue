<script setup lang="ts">
/**
 * 仪表盘数据卡（PRD 8.1）
 * ====================================================================
 * 规格：数字 26px 等宽（`--lz-font-num`）、千分位、收入绿 / 支出红、
 * 环比胶囊 + 箭头。
 *
 * 三个刻意的选择：
 *  1. 主数字用**等宽字体**而不是无衬线 + tabular-nums —— 财务感的来源。
 *     JetBrains Mono 的字符宽度一致，金额位数变化时整块数字不会「呼吸」，
 *     四张卡并排时小数点也能对齐。
 *  2. 卡片顶部一条**语义色渐隐条**：把「这张卡的身份」编码进表面，
 *     扫一眼就知道哪张是收入哪张是支出，不必读标签。
 *     渐隐到右侧透明是为了避免一条实线把顶栏切得太硬。
 *  3. 环比做成**胶囊**而不是裸文字：环比是「辅助结论」，
 *     用底色和主数字拉开层级，四张卡的视觉重心才会落在金额上。
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

/** 语义色调（success / danger / neutral）—— 随「金额配色偏好」翻转 */
const semanticTone = computed(() => settings.toneFor(logicalTone.value))

/** 顶部渐隐条 / 主数字的颜色（token 变量名，明暗主题自动跟随） */
const toneColor = computed(() => settings.toneColor(semanticTone.value))
const toneColorBg = computed(() => settings.toneColorBg(semanticTone.value))

/** 传给 CSS 的自定义属性：避免在样式里再判断一次 tone */
const cardStyle = computed(() => ({
  '--card-tone': toneColor.value,
  '--card-tone-bg': toneColorBg.value,
}))

const valueClass = computed(() => `tone-${semanticTone.value}`)

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
const momTone = computed(() => {
  const m = props.mom
  if (m == null || m === 0)
    return 'neutral'
  const isUp = m > 0
  const isGood = props.momGoodWhen === 'up' ? isUp : !isUp
  return isGood ? 'success' : 'danger'
})

const momStyle = computed(() => (momTone.value === 'neutral'
  ? {}
  : {
      color: settings.toneColor(momTone.value),
      background: settings.toneColorBg(momTone.value),
    }))
</script>

<template>
  <div class="stat-card" :style="cardStyle">
    <span class="stat-label">{{ label }}</span>

    <NSkeleton v-if="loading" text width="60%" :height="32" />
    <span v-else class="stat-value" :class="valueClass">{{ displayValue }}</span>

    <div
      v-if="hasMom && !loading"
      class="stat-mom"
      :class="`mom-${momTone}`"
      :style="momStyle"
    >
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
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 18px 14px;
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  box-shadow: var(--lz-shadow-sm);
  overflow: hidden; // 顶条贴圆角，不溢出
  @include transition-paint();

  // 语义色顶条：卡片身份的编码（收 / 支 / 结余），渐隐避免切得太硬
  &::before {
    content: '';
    position: absolute;
    inset: 0 0 auto;
    height: 2px;
    background: linear-gradient(90deg, var(--card-tone) 0%, transparent 72%);
  }

  &:hover {
    box-shadow: var(--lz-shadow-md);
  }
}

.stat-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--lz-text-secondary);
  letter-spacing: 0.02em;
}

// 等宽数字：金额位数变化时不错位（架构文档 3.2）
// 26px 是架构 3.2「等宽档光学补偿」那一档：JetBrains Mono 同字号比 Inter 宽约
// 8%，按 text-2xl 的 24px 画出来视觉上会比 24px 无衬线小一档，所以补偿到 26px，
// 全站所有「主金额」都用这一档，不各自微调。
.stat-value {
  @include tabular;

  font-size: 26px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.02em;
  color: var(--lz-text-primary);
  // 极窄容器下宁可缩小也不折行 —— 金额被折成两行是最难看的
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

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

// 环比胶囊：比主数字弱一层，但又必须能被扫到
.stat-mom {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 4px;
  margin-top: 2px;
  padding: 2px 8px;
  border-radius: var(--lz-radius-full);
  font-size: 12px;
  line-height: 18px;
  @include tabular;

  &.mom-success {
    color: var(--lz-success);
    background: var(--lz-success-bg);
  }

  &.mom-danger {
    color: var(--lz-danger);
    background: var(--lz-danger-bg);
  }

  &.mom-neutral {
    color: var(--lz-text-secondary);
    background: var(--lz-bg-page);
  }
}

.stat-mom--loading {
  background: transparent;
  padding: 0;
  min-height: 22px;
}

.mom-arrow {
  font-size: 12px;
}

// 「较上月」是胶囊里最不重要的一截，压暗半档，让百分比先被读到
.mom-hint {
  opacity: 0.75;
}

// 四卡并排需要 ~185px/卡的可用宽度，1200px 以下改 2×2 更稳（PRD 8.1 响应式规格）
@media (max-width: 1199px) {
  .stat-value {
    font-size: 24px;
  }
}
</style>
