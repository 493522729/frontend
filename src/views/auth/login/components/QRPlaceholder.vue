<script setup lang="ts">
/**
 * 二维码占位组件
 * ====================================================================
 * 真正的二维码应该由后端生成图片（dataURL 或 imageURL）返回，
 * 这里因为没有后端，前端用 qrId 哈希出一个伪随机点阵作为视觉占位，
 * 让扫码面板「看起来像一张二维码」。等真接口联调时把 props 换成图片 url 即可。
 *
 * 设计细节：
 *   - 25×25 的「模块矩阵」（v3 行业标准）
 *   - 三角定位标记（4 个角的 7×7 方框）永远保留，让视觉像二维码
 *   - 中央 logo 占位（后续可叠加上品牌 logo）
 */
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  /** 二维码内容；不同内容渲染出不同点阵 */
  value?: string
  /** 二维码正方形尺寸（px） */
  size?: number
}>(), {
  value: 'placeholder',
  size: 220,
})

/** 矩阵边长（奇数方便三角定位 7×7 居中） */
const SIZE = 25

/**
 * 三角定位方框的位置（左上、右上、左下）
 * 「QR 三只角永远有几个大块，比对角定位」
 */
const FINDER_REGIONS: Array<[number, number]> = [
  [0, 0],
  [SIZE - 7, 0],
  [0, SIZE - 7],
]

/**
 * 是否 (x, y) 处于「三角定位方框」范围内
 *   形态：
 *   ███████
 *   █     █
 *   █ ███ █
 *   █ ███ █
 *   █ ███ █
 *   █     █
 *   ███████
 */
function isFinderArea(x: number, y: number): boolean {
  for (const [fx, fy] of FINDER_REGIONS) {
    if (x >= fx && x < fx + 7 && y >= fy && y < fy + 7) {
      const dx = x - fx
      const dy = y - fy
      if (dx === 0 || dx === 6 || dy === 0 || dy === 6)
        return true
      if (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)
        return true
    }
  }
  return false
}

/**
 * 把字符串「洗」成 25×25 的 boolean 二维数组
 * - 用一组权重交叉相加提高伪随机度
 * - 三角定位区强制 false
 */
const matrix = computed<boolean[][]>(() => {
  const grid: boolean[][] = []
  for (let y = 0; y < SIZE; y++) {
    const row: boolean[] = []
    for (let x = 0; x < SIZE; x++) {
      if (isFinderArea(x, y)) {
        row.push(false)
        continue
      }
      let hash = 0
      for (let i = 0; i < props.value.length; i++) {
        hash
          = (hash * 31 + props.value.charCodeAt(i) * 17 + x * 37 + y * 53)
            >>> 0
      }
      row.push((hash % 100) > 50)
    }
    grid.push(row)
  }
  return grid
})
</script>

<template>
  <div class="qrcode" :style="{ width: `${size}px`, height: `${size}px` }">
    <!-- 背景底 -->
    <div class="qrcode-bg" />

    <!-- 模块矩阵 SVG -->
    <svg
      class="qrcode-pattern"
      :viewBox="`0 0 ${SIZE} ${SIZE}`"
      :width="size"
      :height="size"
      aria-hidden="true"
    >
      <g v-for="(row, y) in matrix" :key="`g-${y}`">
        <rect
          v-for="(on, x) in row"
          v-show="on"
          :key="`c-${x}-${y}`"
          :x="x"
          :y="y"
          width="1"
          height="1"
          fill="currentColor"
        />
      </g>
      <!-- 三角定位框（叠加在矩阵上方，更显眼） -->
      <template v-for="([fx, fy], i) in [[0, 0], [SIZE - 7, 0], [0, SIZE - 7]]" :key="i">
        <rect
          :x="fx"
          :y="fy"
          width="7"
          height="7"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
        />
        <rect
          :x="fx + 2"
          :y="fy + 2"
          width="3"
          height="3"
          fill="currentColor"
        />
      </template>
    </svg>

    <!-- 中央 logo 占位（后续可换真 logo） -->
    <div class="qrcode-center">
      <span class="center-glyph">LZ</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.qrcode {
  position: relative;
  display: inline-block;
  user-select: none;
  font-family: 'JetBrains Mono', 'Menlo', monospace;
}

.qrcode-bg {
  position: absolute;
  inset: 0;
  background: var(--lz-bg-card);
  border-radius: 12px;
  box-shadow:
    0 0 0 1px var(--lz-border),
    0 12px 40px -8px rgba(64, 158, 255, 0.12);
}

.qrcode-pattern {
  position: absolute;
  inset: 16px;
  width: calc(100% - 32px);
  height: calc(100% - 32px);
  /* 暗色不写覆盖：--lz-text-primary 在 html.dark 下已是浅色（架构 3.4） */
  color: var(--lz-text-primary);
}

.qrcode-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 44px;
  height: 44px;
  background: var(--lz-bg-card);
  border-radius: 8px;
  display: grid;
  place-items: center;
  border: 1px solid var(--lz-border);
  box-shadow: 0 2px 12px -4px rgba(64, 158, 255, 0.3);

  .center-glyph {
    font-family: 'Outfit', system-ui, sans-serif;
    font-size: 14px;
    font-weight: 700;
    color: var(--lz-primary-600);
    letter-spacing: 0.5px;
  }
}
</style>
