import type { Book, BookWithStats } from '@/types/book'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { DEFAULT_BOOK_ID } from '@/api/mock-books'
import {
  createBook,
  deleteBook,
  listBooks,
  setDefaultBook,
  updateBook,
} from '@/api/modules/book'
import { STORAGE_KEYS } from '@/constants/storage-keys'

/**
 * 账本 store —— 当前账本 + 账本列表
 * ====================================================================
 * Book 是**数据隔离的最小单位**（US-005）：交易、账户都挂在账本下，
 * 切账本 = 换一整套数据。所以「当前账本」是个全局状态，和「当前主题」
 * 一个级别 —— 顶栏切换器改它，各业务页面 watch 它重新取数。
 *
 * 为什么只持久化 currentBookId、不持久化 books：
 *   账本列表是服务端数据（会被新增/删除/改名），缓存下来会展示过期信息；
 *   而「我上次在看哪一本」是纯用户偏好，刷新后停在原处才不打断思路。
 *
 * 刷新通知机制：切换后各页面（仪表盘 / 流水 / 字典）**各自 watch
 * currentBookId 重新取数**，不在这里发全局广播 —— 数据依赖比事件更直白，
 * 也少一个需要维护的信号量。
 */
export const useBookStore = defineStore('book', () => {
  /** 账本列表（含笔数摘要） */
  const books = ref<BookWithStats[]>([])
  /** 当前账本 ID */
  const currentBookId = ref<number>(DEFAULT_BOOK_ID)
  const loading = ref(false)
  const loaded = ref(false)

  const currentBook = computed(() => books.value.find(b => b.id === currentBookId.value) ?? null)

  /** 幂等加载账本列表 */
  async function ensureLoaded(): Promise<void> {
    if (loaded.value || loading.value)
      return
    loading.value = true
    try {
      books.value = await listBooks()
      // 兜底：持久化的账本可能已经不存在了（后端删掉 / 换了环境），回落到默认账本
      if (!books.value.some(b => b.id === currentBookId.value)) {
        currentBookId.value = books.value.find(b => b.isDefault)?.id
          ?? books.value[0]?.id
          ?? DEFAULT_BOOK_ID
      }
      loaded.value = true
    }
    finally {
      loading.value = false
    }
  }

  /**
   * 切换账本
   *
   * 只改 ID —— 各页面 watch 到变化后自行重新取数，
   * 这里不直接调它们的 reload，避免 store 反向依赖 view 层。
   */
  function switchBook(id: number): void {
    if (id === currentBookId.value)
      return
    currentBookId.value = id
  }

  /** 刷新账本摘要（记账/删账后笔数变了，切换器里的数字要跟着变） */
  async function refresh(): Promise<void> {
    books.value = await listBooks()
  }

  // ── 账本管理（CRUD，Now 清单 #2）───────────────────────
  // 写操作后统一 refresh() 让顶栏切换器、各业务页面同步到最新账本列表。

  async function createBookEntry(input: Omit<Book, 'id'>): Promise<void> {
    await createBook(input)
    await refresh()
  }

  async function updateBookEntry(id: number, patch: Partial<Omit<Book, 'id'>>): Promise<void> {
    await updateBook(id, patch)
    await refresh()
  }

  /**
   * 删除账本：若删的是当前账本，先回落到一个存活账本（默认账本优先），
   * 否则各业务页面 watch 到的还是已不存在的 currentBookId、拉不到数据。
   */
  async function deleteBookEntry(id: number): Promise<void> {
    await deleteBook(id)
    if (currentBookId.value === id) {
      const fallback = books.value.find(b => b.isDefault)?.id
        ?? books.value[0]?.id
        ?? DEFAULT_BOOK_ID
      currentBookId.value = fallback
    }
    await refresh()
  }

  async function setDefaultBookEntry(id: number): Promise<void> {
    await setDefaultBook(id)
    await refresh()
  }

  return {
    books,
    currentBookId,
    currentBook,
    loading,
    loaded,
    ensureLoaded,
    switchBook,
    refresh,
    createBookEntry,
    updateBookEntry,
    deleteBookEntry,
    setDefaultBookEntry,
  }
}, {
  persist: {
    key: STORAGE_KEYS.book,
    pick: ['currentBookId'],
  },
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useBookStore, import.meta.hot))
