/**
 * 字典 store —— 分类 / 账户的全局缓存
 * ====================================================================
 * 架构文档 2.2 节：分类/账户字典是跨页面共享状态，必须进 store。
 *
 * 设计：
 *   - 第一次访问时按需懒加载
 *   - 缓存命中直接返回，避免每个页面都重复请求
 *   - 业务侧只调 useDict()，不感知加载时机
 */
import type { Account, Category } from '@/types/transaction'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { listAccounts, listCategories } from '@/api/modules/transaction'

export const useDictStore = defineStore('dict', () => {
  // ── 原始数据 ──
  const categories = ref<Category[]>([])
  const accounts = ref<Account[]>([])

  // ── 加载状态：保证只请求一次 ──
  const loadingCategories = ref(false)
  const loadingAccounts = ref(false)
  const initialized = ref(false)

  /** 按需加载分类字典（幂等） */
  async function ensureCategories(): Promise<void> {
    if (loadingCategories.value)
      return
    if (categories.value.length > 0)
      return
    loadingCategories.value = true
    try {
      categories.value = await listCategories()
    }
    finally {
      loadingCategories.value = false
    }
  }

  /** 按需加载账户字典（幂等） */
  async function ensureAccounts(): Promise<void> {
    if (loadingAccounts.value)
      return
    if (accounts.value.length > 0)
      return
    loadingAccounts.value = true
    try {
      accounts.value = await listAccounts()
    }
    finally {
      loadingAccounts.value = false
    }
  }

  /** 首次进入时一次性加载全部字典 */
  async function ensureLoaded(): Promise<void> {
    if (initialized.value)
      return
    await Promise.all([ensureCategories(), ensureAccounts()])
    initialized.value = true
  }

  /** 强制刷新（设置项改了分类/账户后调用） */
  async function refresh(): Promise<void> {
    categories.value = []
    accounts.value = []
    initialized.value = false
    await ensureLoaded()
  }

  // ── 派生：id → 实体映射（O(1) 查表） ──
  const categoryMap = computed(() => new Map(categories.value.map(c => [c.id, c])))
  const accountMap = computed(() => new Map(accounts.value.map(a => [a.id, a])))

  return {
    categories,
    accounts,
    categoryMap,
    accountMap,
    initialized,
    ensureCategories,
    ensureAccounts,
    ensureLoaded,
    refresh,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useDictStore, import.meta.hot))
