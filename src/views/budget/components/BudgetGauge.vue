<script setup lang="ts">
/**
 * 预算进度条（总预算卡 / 分类预算卡共用）
 * ====================================================================
 * 为什么不用 NProgress：
 *   1. 预算页的关键信息是「还剩多少空间到预警线」，需要在轨道上画一条
 *      80% 的刻度 —— NProgress 的轨道里塞不进额外元素；
 *   2. 它的颜色写进 SVG 的 stroke 属性，CSS 变量在属性里不解析，
 *      只能像现在这样把色值读出来再传进去，多绕一层；
 *   3. 自绘 DOM 才能拿到「进入页面时长出来」的过渡（NProgress 的
 *      percentage 变化动画在首次渲染时不触发）。
 *
 * 超支（percent > 100）时轨道只画满到 100%：画 130% 需要压缩整条轨道的
 * 比例尺，反而看不出「到底超了多少」—— 超出量交给卡片上的文字表达。
 */
import { computed, onMounted, ref } from 'vue'
import { BUDGET_WARN_PERCENT } from '@/types/budget'

const props = withDefaults(defineProps<{
  /** 使用百分比，允许 > 100 */
  percent: number
  /** 轨道填充色（由 budgetTone 决定，调用方传具体色值） */
  color: string
  /** 无障碍标签：屏幕阅读器读的是「餐饮预算 已用 65%」而不是一个光秃秃的数字 */
  label: string
  /** 轨道高度（px）：总卡粗一点、分类卡细一点 */
  height?: number
  /** 是否画 80% 预警刻度（分类卡空间小，可关掉） */
  marker?: boolean
}>(), {
  height: 10,
  marker: true,
})

/** 轨道只画到 100%，负值（脏数据）也夹到 0 */
const filled = computed(() => Math.max(0, Math.min(props.percent, 100)))

/**
 * 「长出来」动效
 *
 * 首帧先渲染 0 宽，等浏览器完成一次布局后再切到目标宽度 ——
 * 直接给目标宽度的话浏览器会把两帧合并，过渡根本不会触发。
 * 与 FlowRail 的 grown 是同一套写法。
 */
const grown = ref(false)

onMounted(() => {
  requestAnimationFrame(() => {
    grown.value = true
  })
})

const fillStyle = computed(() => ({
  width: `${grown.value ? filled.value : 0}%`,
  background: props.color,
}))
</script>

<template>
  <div
    class="gauge"
    role="progressbar"
    :aria-label="label"
    :aria-valuenow="Math.round(percent)"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <div class="gauge__track" :style="{ height: `${height}px` }">
      <div class="gauge__fill" :style="fillStyle" />
      <!-- 预警刻度：80% 的判定口径来自 budgetTone，这里不再写第二份 80 -->
      <span
        v-if="marker"
        class="gauge__marker"
        :style="{ left: `${BUDGET_WARN_PERCENT}%` }"
        aria-hidden="true"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.gauge {
  width: 100%;
}

.gauge__track {
  position: relative;
  width: 100%;
  // 用页面底色而不是边框色：进度条要表达的是「容器」，比卡片再深一层
  // 才有凹槽感，明暗两档都能和卡片区分开
  background: var(--lz-bg-page);
  border-radius: var(--lz-radius-full);
  overflow: hidden;
}

.gauge__fill {
  height: 100%;
  border-radius: inherit;
  // 只动 width：改布局会触发重排，这里用 width 是因为进度条本来就是
  // 「长度」在变，没有 transform 的等价写法（scaleX 会把圆角拉变形）
  transition: width 0.6s var(--lz-ease-standard), background-color var(--lz-duration-base);
}

/**
 * 80% 预警刻度
 *
 * 用卡片底色在填充上「划一道」：亮色档是白线压在绿/橙/红上，
 * 暗色档是深线压在亮色填充上 —— 两种主题下都与填充有足够反差，
 * 不需要为它再引入第三个颜色。
 */
.gauge__marker {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--lz-bg-card);
  opacity: 0.9;
}
</style>
