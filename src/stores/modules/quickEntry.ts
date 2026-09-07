import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref } from 'vue'
import { STORAGE_KEYS } from '@/constants/storage-keys'

/**
 * 快速记账弹层 store —— 全局「30 秒记一笔」入口的开关 + 默认值记忆
 * ====================================================================
 * 为什么弹层开合状态要进 store 而不是留在组件里：
 *   弹层的触发点分散在顶栏「+」按钮、Cmd+K 快捷键（任意业务页面），
 *   它们是彼此独立的组件树节点，只能通过 store 共享同一个开关。
 *
 * 默认值记忆（上次分类/账户）：
 *   按 PRD 8.3「上次的分类、账户作为默认值」，这是跨会话的用户偏好，
 *   交给 pinia-plugin-persistedstate 落 localStorage，刷新不丢。
 *   金额不做跨会话记忆 —— 它只在「弹层打开期间」保留，方便连续记几笔，
 *   关闭弹层即重置，避免下次打开残留一个尴尬的旧数字。
 */
export const useQuickEntryStore = defineStore('quickEntry', () => {
  /** 弹层是否可见 */
  const visible = ref(false)

  /** 上次记账的分类 ID（作为下次默认值，null 表示还没记过） */
  const lastCategoryId = ref<number | null>(null)

  /** 上次记账的账户 ID */
  const lastAccountId = ref<number | null>(null)

  /**
   * 最近一次记账数据变更（新增 / 撤销删除）的时间戳（0 = 本次会话还没变更过）
   *
   * 跨组件树的「数据已变更」信号：弹层挂在 layout 层，与业务页面
   * 没有父子关系，写操作发生后各页面的列表刷新靠 watch 它触发。
   * 会话内信号，不进持久化白名单（persist.pick）。
   */
  const dataChangedAt = ref(0)

  function open() {
    visible.value = true
  }

  function close() {
    visible.value = false
  }

  /** 保存成功后调用：把本次选择记下来，下次打开自动回填 */
  function remember(categoryId: number | null, accountId: number | null) {
    lastCategoryId.value = categoryId
    lastAccountId.value = accountId
  }

  /** 记账数据发生写操作（新增 / 撤销删除）后调用：广播变更信号，订阅方据此刷新 */
  function notifyDataChanged() {
    dataChangedAt.value = Date.now()
  }

  return {
    visible,
    lastCategoryId,
    lastAccountId,
    dataChangedAt,
    open,
    close,
    remember,
    notifyDataChanged,
  }
}, {
  persist: {
    key: STORAGE_KEYS.quickEntry,
    pick: ['lastCategoryId', 'lastAccountId'],
  },
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useQuickEntryStore, import.meta.hot))
