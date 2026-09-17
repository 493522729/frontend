/**
 * 标签 store —— 标签字典的全局缓存
 * ====================================================================
 * 仿 dict.ts：分类 / 账户是账本隔离的，标签是「用户级」资源（不区分账本），
 * 因此这里只做一次性懒加载，不感知账本切换。
 *
 * 设计：
 *   - 登录后首次使用时 ensureLoaded() 触发加载（幂等）
 *   - 缓存命中直接返回，避免每个页面都重复请求
 *   - 写操作（新增/更新/删除）由页面层负责刷新 tags，这里只暴露 reset 兜底
 *   - 防并发：loading 期间重复调用直接返回，避免同一用户重复发请求
 */
import type { Tag } from '@/types/tag'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { listTags } from '@/api/modules/tag'

export const useTagStore = defineStore('tag', () => {
  // ── 原始数据 ──
  const tags = ref<Tag[]>([])
  const loaded = ref(false)
  const loading = ref(false)

  /** 按需加载标签字典（幂等 + 防并发） */
  async function loadTags(): Promise<void> {
    if (loading.value)
      return
    if (tags.value.length > 0 && loaded.value)
      return
    loading.value = true
    try {
      tags.value = await listTags()
      loaded.value = true
    }
    finally {
      loading.value = false
    }
  }

  /** 首次进入 / 切账本时调用（幂等）；标签是用户级，无需传 bookId */
  async function ensureLoaded(): Promise<void> {
    if (loaded.value)
      return
    await loadTags()
  }

  /** 强制刷新（标签写操作后调用） */
  async function refresh(): Promise<void> {
    tags.value = []
    loaded.value = false
    await loadTags()
  }

  /** id → 标签映射（O(1) 查表，渲染流水标签色/名时用） */
  const tagMap = computed(() => new Map(tags.value.map(t => [t.id, t])))

  return {
    tags,
    loaded,
    tagMap,
    loadTags,
    ensureLoaded,
    refresh,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useTagStore, import.meta.hot))
