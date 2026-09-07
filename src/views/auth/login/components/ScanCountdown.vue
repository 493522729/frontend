<script setup lang="ts">
/**
 * 倒计时环（SVG stroke-dasharray 实现）
 * ====================================================================
 * 用「环形进度」展示「二维码还剩多少秒」：
 *   - 圆环从满（100%）开始，倒计时走完后降到 0%
 *   - 颜色从 lz-primary-600 渐变到 lz-warning-500（剩 30s 警告）
 *   - 到 0 时通过 @finish 回调抛给父组件
 */
import { computed, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  /** 总秒数 */
  totalSeconds: number
  /** 剩余秒数（外部控制；>0 即继续倒计时） */
  remainingSeconds: number
  /** 尺寸 px */
  size?: number
}>(), {
  size: 32,
})

const emit = defineEmits<{
  (e: 'finish'): void
}>()

/** 周长：2 × π × r，r = (size - 4) / 2 留 stroke 间距 */
const STROKE = 2
const RADIUS = computed(() => (props.size - STROKE * 2) / 2 - 2)
const CIRCUM = computed(() => 2 * Math.PI * RADIUS.value)

/**
 * 进度：1 = 满，0 = 空
 * 注意：remainingSeconds 可能为 0 时避免除零
 */
const progress = computed(() => {
  if (props.totalSeconds <= 0)
    return 0
  return Math.max(0, Math.min(1, props.remainingSeconds / props.totalSeconds))
})

/** stroke-dashoffset = 周长 × (1 - 进度) */
const dashOffset = computed(() => CIRCUM.value * (1 - progress.value))

/** 颜色：剩余 > 30s 显示 primary，<=30s 警告色 */
const isWarning = computed(() => props.remainingSeconds <= 30 && props.remainingSeconds > 0)

/** 监听归零触发 finish 事件（边沿检测：was > 0 → became 0） */
const prevRemaining = ref(props.remainingSeconds)
watch(() => props.remainingSeconds, (now) => {
  if (prevRemaining.value > 0 && now <= 0)
    emit('finish')
  prevRemaining.value = now
})

onUnmounted(() => {
  prevRemaining.value = 0
})
</script>

<template>
  <div
    class="countdown"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :title="`${remainingSeconds}s 后过期`"
  >
    <svg :width="size" :height="size" class="countdown-svg">
      <!-- 背景环 -->
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="RADIUS"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="ring-bg"
      />
      <!-- 进度环：旋转 -90 度让起点在正上方 -->
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="RADIUS"
        fill="none"
        class="ring-fg" :class="[{ warning: isWarning }]"
        :stroke-dasharray="CIRCUM"
        :stroke-dashoffset="dashOffset"
        stroke-width="2"
        stroke-linecap="round"
        :transform="`rotate(-90 ${size / 2} ${size / 2})`"
      />
    </svg>
    <span class="countdown-num">{{ remainingSeconds }}s</span>
  </div>
</template>

<style scoped lang="scss">
.countdown {
  position: relative;
  display: inline-grid;
  place-items: center;
  color: var(--lz-primary-600);
  font-variant-numeric: tabular-nums;

  :global(.dark) & {
    color: #80b4ff;
  }
}

.countdown-svg {
  position: absolute;
  inset: 0;
}

.ring-bg {
  opacity: 0.18;
}

.ring-fg {
  transition: stroke-dashoffset 950ms linear, stroke 300ms ease;
}

.ring-fg.warning {
  color: var(--lz-warning-500, #e6a23c);
}

.countdown-num {
  position: relative;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
</style>
