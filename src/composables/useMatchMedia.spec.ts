import type { Ref } from 'vue'
// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { useIsMobile } from './useIsMobile'
import { useMatchMedia } from './useMatchMedia'

/**
 * 这组测试存在的原因（别删）
 * ====================================================================
 * 曾经用 @vueuse/core 的 useMediaQuery 判断移动端，结果**手机上首帧必定渲染成 PC 版**。
 * 根因：useMediaQuery 内部 `if (!useSupported(...)) return`，而
 * useSupported = `useMounted() && ...`，useMounted 在挂载前恒为 false ——
 * 于是首帧 matches 停留在初始值 false，挂载后才补一次更新。
 * 表现就是「首次进入是 PC 版，刷新/过一会儿才变移动版」。
 *
 * 所以这里专门断言 **setup 阶段（挂载前）的取值**，用 useMediaQuery 的话必然挂。
 */
function stubMatchMedia(matches: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList)
}

/** 挂载一个探针组件，返回 setup 阶段（首帧）拿到的值 */
function probeInSetup(use: () => Ref<boolean>): boolean {
  let firstFrame: boolean = false

  const Comp = defineComponent({
    setup() {
      const matched = use()
      // 关键：这里就是首帧 —— 此时组件还没挂载
      firstFrame = matched.value
      return () => null
    },
  })

  mount(Comp)
  return firstFrame
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useMatchMedia', () => {
  it('setup 阶段就能拿到匹配结果（不依赖挂载）', () => {
    stubMatchMedia(true)
    expect(probeInSetup(() => useMatchMedia('(max-width: 768px)'))).toBe(true)

    stubMatchMedia(false)
    expect(probeInSetup(() => useMatchMedia('(max-width: 768px)'))).toBe(false)
  })

  it('媒体查询变化时跟随更新', async () => {
    const handlers: Array<(e: MediaQueryListEvent) => void> = []
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => handlers.push(fn),
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList)

    let current: Ref<boolean> | undefined
    const Comp = defineComponent({
      setup() {
        current = useMatchMedia('(max-width: 768px)')
        return () => null
      },
    })
    mount(Comp)

    expect(current!.value).toBe(false)
    handlers[0]!({ matches: true } as MediaQueryListEvent)
    expect(current!.value).toBe(true)
  })
})

describe('useIsMobile', () => {
  it('首帧即为 true —— 手机上不会先渲染 PC 版再切走', () => {
    stubMatchMedia(true)
    expect(probeInSetup(() => useIsMobile())).toBe(true)
  })

  it('查询串同时覆盖窄窗口与触屏中窄设备', () => {
    const spy = vi.spyOn(window, 'matchMedia')
    stubMatchMedia(false)
    probeInSetup(() => useIsMobile())

    const query = spy.mock.calls[0]![0]
    expect(query).toContain('max-width: 768px')
    expect(query).toContain('pointer: coarse')
    expect(query).toContain('max-width: 1024px')
  })
})
