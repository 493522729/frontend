<script setup lang="ts">
/**
 * 金额滚动动画（纯展示，无业务语义）
 * ====================================================================
 * 解决「余额变了但数字瞬间跳变，用户感知不到是哪张卡变了」的问题：
 * 旧值 → 新值做一次 ~600ms 的 easeOut 滚动，视线会被数字本身吸引过去。
 *
 * 为什么是自绘而不是引动画库：
 *   本质只是「数值插值 + formatCents」，一个 rAF 循环就够；
 *   动画库（GSAP / motion）为了这一个效果进包不值得。
 *
 * 细节：
 *   - 组件只在 cents **变化时**滚动，首挂载直接显示目标值 ——
 *     首屏所有数字同时从 0 滚上来的效果很热闹但没有信息量，还拖慢可读时间。
 *   - `prefers-reduced-motion` 下直接跳到目标值（无障碍红线）。
 *   - 只动数值不动 DOM 结构，金额格式化仍走 utils/money 的唯一出入口。
 */
import { onBeforeUnmount, ref, watch } from 'vue'
import { formatCents } from '@/utils/money'

const props = withDefaults(defineProps<{
  /** 金额（分） */
  cents: number
  /** 是否带 ¥ 符号 */
  withSymbol?: boolean
  /** 是否带 +/− 号（0 不带号，口径与 formatCents 一致） */
  withSign?: boolean
  /** 滚动时长（ms） */
  duration?: number
}>(), {
  withSymbol: true,
  withSign: false,
  duration: 600,
})

/** 当前展示的数值（分）—— 动画期间它是中间值，静止时等于 cents */
const display = ref(props.cents)

let rafId = 0

watch(() => props.cents, (next) => {
  const prev = display.value
  if (prev === next)
    return

  // 尊重系统「减少动态效果」：直接跳到目标值
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    display.value = next
    return
  }

  cancelAnimationFrame(rafId)
  const start = performance.now()

  const step = (now: number) => {
    const t = Math.min(1, (now - start) / props.duration)
    // easeOutCubic：起步快、收尾缓，金额「落到」目标值的手感比线性舒服
    const eased = 1 - (1 - t) ** 3
    display.value = Math.round(prev + (next - prev) * eased)
    if (t < 1)
      rafId = requestAnimationFrame(step)
  }
  rafId = requestAnimationFrame(step)
})

onBeforeUnmount(() => cancelAnimationFrame(rafId))
</script>

<template>
  <span class="animated-money">{{ formatCents(display, { withSymbol, withSign }) }}</span>
</template>

<style scoped>
/* 组件本身不带任何排版样式：字号 / 颜色 / 字体由使用处的容器决定 */
.animated-money {
  font-variant-numeric: tabular-nums;
}
</style>
