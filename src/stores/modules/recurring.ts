import type {
  ConfirmRecurringOptions,
  PendingRecurring,
  RecurringTemplate,
} from '@/types/recurring'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref } from 'vue'
import {
  confirmRecurring,
  createTemplate,
  deleteTemplate,
  dismissRecurring,
  getPendingRecurring,
  listTemplates,
  toggleAutoConfirm,
  updateTemplate,
} from '@/api/modules/recurring'
import { useBookStore } from './book'
import { useQuickEntryStore } from './quickEntry'

/**
 * 周期账单 store —— 模板 + 本月待确认队列
 * ====================================================================
 * 账本隔离（US-005）：切账本换一整批模板与待确认项，所以用 loadedBookId
 * 记住当前数据属于哪本账本，避免切账本后列表串数据。
 *
 * 自动确认：加载待确认队列时，将 willAutoConfirm 的项直接 confirm 入账，
 * 再重取 —— 这样「开启自动确认」后该模板不再出现在待确认队列（已进账本）。
 * （mock 阶段的近似：更严谨地应在「月切换」时触发，这里在加载时触发以保证可演示。）
 *
 * 写操作后广播：quickEntry.notifyDataChanged() —— 确认入账会新增流水，
 * 流水页 / 仪表盘得重新取数，否则还显示着未入账前的数字。
 */
export const useRecurringStore = defineStore('recurring', () => {
  const book = useBookStore()
  const quickEntry = useQuickEntryStore()

  const templates = ref<RecurringTemplate[]>([])
  const pending = ref<PendingRecurring[]>([])
  const loading = ref(false)
  /** 当前已加载的是哪本账本（null = 还没加载过） */
  const loadedBookId = ref<number | null>(null)

  async function ensureLoaded(force = false): Promise<void> {
    const bookId = book.currentBookId
    if (loading.value)
      return
    if (!force && loadedBookId.value === bookId)
      return
    loading.value = true
    try {
      templates.value = await listTemplates(bookId)
      let list = await getPendingRecurring(bookId)
      // 自动确认：加载时把 autoConfirm 的待确认项直接入账，再重取队列
      const autoOnes = list.filter(p => p.willAutoConfirm)
      for (const p of autoOnes)
        await confirmRecurring({ bookId, templateId: p.templateId })
      list = await getPendingRecurring(bookId)
      pending.value = list
      loadedBookId.value = bookId
    }
    finally {
      loading.value = false
    }
  }

  /** 强制刷新（写操作后 / 切账本后） */
  async function refresh(): Promise<void> {
    await ensureLoaded(true)
  }

  /** 写操作后统一同步：自己刷新 + 广播流水变更 */
  async function afterWrite(): Promise<void> {
    await refresh()
    quickEntry.notifyDataChanged()
  }

  async function createTemplateEntry(input: Omit<RecurringTemplate, 'id'>): Promise<void> {
    await createTemplate(input)
    await afterWrite()
  }

  async function updateTemplateEntry(id: number, patch: Partial<Omit<RecurringTemplate, 'id'>>): Promise<void> {
    await updateTemplate(id, patch)
    await afterWrite()
  }

  async function deleteTemplateEntry(id: number): Promise<void> {
    await deleteTemplate(id)
    await afterWrite()
  }

  async function toggleAutoConfirmEntry(id: number): Promise<void> {
    await toggleAutoConfirm(id)
    await afterWrite()
  }

  /** 手动确认一笔（可带覆盖字段） */
  async function confirmPendingEntry(options: ConfirmRecurringOptions): Promise<void> {
    await confirmRecurring(options)
    await afterWrite()
  }

  /** 驳回一笔（不写流水） */
  async function dismissEntry(templateId: number): Promise<void> {
    await dismissRecurring(templateId, book.currentBookId)
    await afterWrite()
  }

  return {
    templates,
    pending,
    loading,
    loadedBookId,
    ensureLoaded,
    refresh,
    createTemplateEntry,
    updateTemplateEntry,
    deleteTemplateEntry,
    toggleAutoConfirmEntry,
    confirmPendingEntry,
    dismissEntry,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useRecurringStore, import.meta.hot))
