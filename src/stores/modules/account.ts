import type { AccountType } from '@/enums/account'
import type { Account, AccountWithBalance } from '@/types/transaction'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  createAccount,
  deleteAccount,
  listAccounts,
  updateAccount,
} from '@/api/modules/account'
import { listAccountBalances } from '@/api/modules/stats'
import { reassignAccount } from '@/api/modules/transaction'
import { useBookStore } from './book'
import { useDictStore } from './dict'
import { useQuickEntryStore } from './quickEntry'

/**
 * 账户 store —— 当前账本下的账户 + 各自余额
 * ====================================================================
 * 账户是**账本隔离**的（US-005）：切账本要换一整批账户，所以加载函数
 * 必须带 bookId，并用 loadedBookId 记住「现在这份数据是哪本账本的」，
 * 否则切账本后列表还是上一本的（和分类不同：分类是全局共享的）。
 *
 * 余额不落存储：由 stats 模块的 listAccountBalances 现算（期初 + 流水），
 * 这里只做「账户字典 × 余额表」的拼装，保证页面拿到的是一份完整视图模型。
 *
 * 写操作后要广播两件事：
 *   1. dict.refresh() —— 记账弹层 / 筛选面板的账户下拉要跟着变
 *   2. quickEntry.notifyDataChanged() —— 删除账户会连带改流水（转账被清），
 *      流水页和仪表盘得重新取数，否则还显示着已经不存在的账户
 */
export const useAccountStore = defineStore('account', () => {
  const book = useBookStore()
  const dict = useDictStore()
  const quickEntry = useQuickEntryStore()

  /** 账户 + 余额（按类型分组展示前的原始列表） */
  const accounts = ref<AccountWithBalance[]>([])
  const loading = ref(false)
  /** 当前已加载的是哪本账本的账户（null = 还没加载过） */
  const loadedBookId = ref<number | null>(null)

  /**
   * 幂等加载：账本没变且已加载过就直接返回
   *
   * force = true 用于写操作后的强制刷新（余额变了但账本没变）。
   */
  async function ensureLoaded(force = false): Promise<void> {
    const bookId = book.currentBookId
    if (loading.value)
      return
    if (!force && loadedBookId.value === bookId)
      return
    loading.value = true
    try {
      const [list, balances] = await Promise.all([
        listAccounts(bookId),
        listAccountBalances(bookId),
      ])
      const balanceMap = new Map(balances.map(b => [b.accountId, b]))
      // 账户为准、余额兜零：账户刚建还没流水时也要显示余额（= 期初）
      accounts.value = list.map(a => ({
        ...a,
        balance: balanceMap.get(a.id)?.balance ?? a.initBalance,
        income: balanceMap.get(a.id)?.income ?? 0,
        expense: balanceMap.get(a.id)?.expense ?? 0,
        transferIn: balanceMap.get(a.id)?.transferIn ?? 0,
        transferOut: balanceMap.get(a.id)?.transferOut ?? 0,
        txnCount: balanceMap.get(a.id)?.txnCount ?? 0,
      }))
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

  // ── 派生视图 ────────────────────────────────────────────

  /** 净资产 = 所有账户余额之和（信用卡余额为负，自然被扣掉，无需额外判断类型） */
  const netAssets = computed(() => accounts.value.reduce((sum, a) => sum + a.balance, 0))

  /** 总资产（仅正余额账户，信用卡欠款不计入） */
  const totalAssets = computed(() =>
    accounts.value.filter(a => a.balance > 0).reduce((sum, a) => sum + a.balance, 0),
  )

  /** 总负债（信用卡欠了多少，返回正数便于展示） */
  const totalDebt = computed(() =>
    accounts.value.filter(a => a.balance < 0).reduce((sum, a) => sum - a.balance, 0),
  )

  /** 按账户类型分组（页面按「现金 / 银行卡 / 信用 / 第三方」分区展示） */
  const grouped = computed(() => {
    const map = new Map<AccountType, AccountWithBalance[]>()
    for (const a of accounts.value) {
      const bucket = map.get(a.type)
      if (bucket)
        bucket.push(a)
      else
        map.set(a.type, [a])
    }
    return map
  })

  const accountMap = computed(() => new Map(accounts.value.map(a => [a.id, a])))

  /**
   * 某账户的可用余额（转账时校验「转出方够不够钱」用）
   *
   * 信用卡的可用额度 = 额度 + 余额（余额为负表示已欠款），所以当
   * type === 'credit' 时返回剩余额度而不是余额本身。
   */
  function availableOf(id: number): number {
    const a = accountMap.value.get(id)
    if (!a)
      return 0
    return a.type === 'credit' ? a.creditLimit + a.balance : a.balance
  }

  // ── 写操作 ──────────────────────────────────────────────

  /** 写操作后统一同步：自己刷新 + 通知下拉字典 + 广播流水变更 */
  async function afterWrite(): Promise<void> {
    await refresh()
    await dict.refresh(book.currentBookId)
    quickEntry.notifyDataChanged()
  }

  async function createAccountEntry(input: Omit<Account, 'id'>): Promise<void> {
    await createAccount(input)
    await afterWrite()
  }

  async function updateAccountEntry(id: number, patch: Partial<Omit<Account, 'id'>>): Promise<void> {
    await updateAccount(id, patch)
    await afterWrite()
  }

  /**
   * 删除账户
   *
   * 必须先把流水迁走（migrateToId），再删账户本体 —— 顺序反了会留下
   * 指向不存在账户的孤儿流水。转账笔在迁移阶段被一并清掉（两端都是账户，
   * 缺一端就讲不通），所以这里要广播流水变更。
   */
  async function deleteAccountEntry(
    id: number,
    migrateToId: number,
  ): Promise<{ migrated: number, removed: number }> {
    if (id === migrateToId)
      throw new Error('不能迁移到自身')
    const result = await reassignAccount(id, migrateToId)
    await deleteAccount(id)
    await afterWrite()
    return result
  }

  return {
    accounts,
    loading,
    loadedBookId,
    netAssets,
    totalAssets,
    totalDebt,
    grouped,
    accountMap,
    availableOf,
    ensureLoaded,
    refresh,
    createAccountEntry,
    updateAccountEntry,
    deleteAccountEntry,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useAccountStore, import.meta.hot))
