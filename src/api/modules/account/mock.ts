import type { Account } from '@/types/transaction'
import { BOOK_SEEDS } from '@/api/mock-books'
import { initCategories, peekNextCategoryId } from '@/api/modules/category/mock'

/**
 * 账户 mock 数据源（账本隔离字典）
 * ====================================================================
 * 账户**属于某个账本**（US-005）：「日常账本的招商卡」与「装修账本的招商卡」
 * 是两条独立记录，余额互不相干。因此种子按账本各实例化一份，ID 全局唯一。
 *
 * 依赖方向单向：transaction/mock → account/mock → category/mock。
 * account **绝不反向依赖 transaction**（否则与流水生成形成循环引用），
 * 于是「账户被多少笔流水引用」「删除账户时流水怎么迁移」这类
 * 需要读交易表的逻辑，一律留在 transaction/mock 里实现（与分类同款处理）。
 *
 * 数据落地在内存（刷新重置）—— 这是 mock 的预期行为，真接口联调时整体替换本文件。
 */

/** 账户种子：顺序与 api/mock-books.ts 的 ACCOUNT_TEMPLATE_ORDER 一致（下标即引用方式） */
const ACCOUNT_TEMPLATES: Omit<Account, 'id' | 'bookId' | 'mine'>[] = [
  { name: '招商储蓄卡', type: 'debit', icon: '🏦', initBalance: 5000000, creditLimit: 0 },
  { name: '支付宝', type: 'alipay', icon: '💙', initBalance: 200000, creditLimit: 0 },
  { name: '微信', type: 'wechat', icon: '💚', initBalance: 100000, creditLimit: 0 },
  { name: '现金', type: 'cash', icon: '💵', initBalance: 50000, creditLimit: 0 },
  { name: '招商信用卡', type: 'credit', icon: '💳', initBalance: 0, creditLimit: 5000000 },
]

/** 内存中的账户表（共享给全应用） */
const _accounts: Account[] = []
/**
 * 全局自增 ID：分类 → 账户 → 交易 共用一个递增序列方向，
 * 保证「看到 id=7 时它不会既是分类又是账户」（沿用原 transaction/mock 约定）。
 */
let _nextId = 1

/** 幂等初始化：按账本各实例化一份账户；ID 从分类序列之后接着排 */
export function initAccounts(): void {
  if (_accounts.length > 0)
    return
  initCategories()
  let id = peekNextCategoryId()
  for (const seed of BOOK_SEEDS) {
    for (const idx of seed.accountTemplateIndexes) {
      const tpl = ACCOUNT_TEMPLATES[idx]
      if (tpl)
        // mock 里的账户都视为「自己的」（演示数据没有共享账本成员概念）
        _accounts.push({ ...tpl, id: id++, bookId: seed.id, mine: true })
    }
  }
  _nextId = id
}

/** 供其他 mock 模块承接 ID 序列（目前交易 ID 独立，此处保留扩展位） */
export function peekNextAccountId(): number {
  initAccounts()
  return _nextId
}

/**
 * 账户列表
 *
 * 不传 bookId = 全部账本（统计类用途）；传了 = 只给该账本下的账户。
 * 切账本后筛选面板 / 记账弹层的账户下拉必须只剩本账本的，否则会选到别的账本的账户。
 */
export function mockListAccounts(bookId?: number): Account[] {
  initAccounts()
  return bookId == null ? _accounts : _accounts.filter(a => a.bookId === bookId)
}

export function mockCreateAccount(input: Omit<Account, 'id' | 'mine'>): Account {
  initAccounts()
  const created: Account = { ...input, id: _nextId++, mine: true }
  _accounts.push(created)
  return created
}

export function mockUpdateAccount(id: number, patch: Partial<Omit<Account, 'id' | 'mine'>>): Account {
  initAccounts()
  const idx = _accounts.findIndex(a => a.id === id)
  if (idx < 0)
    throw new Error(`Account ${id} not found`)
  const updated: Account = { ..._accounts[idx]!, ...patch, id }
  _accounts[idx] = updated
  return updated
}

/**
 * 删除账户（只删账户本体）
 *
 * 交易的归属处理由调用方（账户管理页）决定后走 transaction 模块的 reassignAccount，
 * 这里不碰交易表 —— 保持 account → 无 transaction 反向依赖，避免循环引用。
 */
export function mockDeleteAccount(id: number): void {
  initAccounts()
  const idx = _accounts.findIndex(a => a.id === id)
  if (idx < 0)
    throw new Error(`Account ${id} not found`)
  _accounts.splice(idx, 1)
}

/**
 * 找同账本内的兜底账户（删除时的默认迁移目标）
 *
 * 优先非信用卡：信用卡余额是「欠了多少」，把储蓄卡的流水迁到信用卡上语义很怪。
 */
export function mockFindFallbackAccount(bookId: number, exceptId: number): Account | undefined {
  initAccounts()
  const candidates = _accounts.filter(a => a.bookId === bookId && a.id !== exceptId)
  return candidates.find(a => a.type !== 'credit') ?? candidates[0]
}
