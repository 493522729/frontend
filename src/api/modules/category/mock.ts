import type { Category } from '@/types/transaction'

/**
 * 分类 mock 数据源（全局共享字典）
 * ====================================================================
 * 分类**不属于任何账本**（US-005 语义：跨账本统计要求「餐饮」是同一个分类），
 * 因此独立成模块，与 book/account/transaction 解耦。
 *
 * 依赖方向是单向的：transaction/mock → category/mock（取种子），
 * category 绝不反向依赖 transaction，否则会形成循环依赖。
 * 删除分类时对「交易迁移」的归属处理，由调用方（页面）决定目标后走 transaction 模块，
 * 这里只负责分类自身的增删改与「子分类提升」。
 *
 * 数据落地在内存（刷新重置）—— 这是 mock 的预期行为，真接口联调时整体替换本文件。
 */

/** 种子：顶层分类可挂 children，初始化时 children 的 parentId 自动接到父级 */
interface CategorySeed extends Omit<Category, 'id'> {
  children?: Omit<Category, 'id'>[]
}

const CATEGORY_SEED: CategorySeed[] = [
  {
    type: 'expense',
    name: '餐饮',
    icon: '🍜',
    color: '#FF7A6B',
    parentId: null,
    children: [
      { type: 'expense', name: '外卖', icon: '🥡', color: '#FF9A8B', parentId: null },
      { type: 'expense', name: '聚餐', icon: '🍲', color: '#FF6B5B', parentId: null },
    ],
  },
  {
    type: 'expense',
    name: '交通',
    icon: '🚇',
    color: '#5BA9FF',
    parentId: null,
    children: [
      { type: 'expense', name: '打车', icon: '🚕', color: '#6FB0FF', parentId: null },
      { type: 'expense', name: '公交地铁', icon: '🚌', color: '#5BA9FF', parentId: null },
    ],
  },
  { type: 'expense', name: '购物', icon: '🛍️', color: '#FF9F45', parentId: null },
  { type: 'expense', name: '居家', icon: '🏠', color: '#A78BFA', parentId: null },
  { type: 'expense', name: '娱乐', icon: '🎮', color: '#3CC6BC', parentId: null },
  { type: 'expense', name: '医疗', icon: '💊', color: '#F87171', parentId: null },
  { type: 'expense', name: '学习', icon: '📚', color: '#60A5FA', parentId: null },
  { type: 'expense', name: '通讯', icon: '📱', color: '#818CF8', parentId: null },
  { type: 'expense', name: '其他', icon: '📦', color: '#94A3B8', parentId: null },
  { type: 'income', name: '工资', icon: '💼', color: '#22C55E', parentId: null },
  { type: 'income', name: '奖金', icon: '🎁', color: '#10A6B0', parentId: null },
  { type: 'income', name: '理财', icon: '📈', color: '#0EA5E9', parentId: null },
  { type: 'income', name: '兼职', icon: '💻', color: '#84CC16', parentId: null },
  { type: 'income', name: '其他', icon: '💰', color: '#94A3B8', parentId: null },
]

/** 内存中的分类表（共享给全应用） */
const _categories: Category[] = []
/** 全局自增 ID：分类与账户共用一个递增序列，保证 ID 不冲突（沿用原 transaction/mock 约定） */
let _nextId = 1

/** 幂等初始化：把种子铺成带 ID 的扁平表，children 的 parentId 接到父级 */
export function initCategories(): void {
  if (_categories.length > 0)
    return
  for (const seed of CATEGORY_SEED) {
    const parentId = _nextId++
    _categories.push({ id: parentId, type: seed.type, name: seed.name, icon: seed.icon, color: seed.color, parentId: null })
    if (seed.children) {
      for (const child of seed.children)
        _categories.push({ id: _nextId++, type: child.type, name: child.name, icon: child.icon, color: child.color, parentId })
    }
  }
}

/** 供其他 mock 模块（transaction）承接 ID 序列，避免账户 ID 与分类冲突 */
export function peekNextCategoryId(): number {
  initCategories()
  return _nextId
}

export function mockListCategories(): Category[] {
  initCategories()
  return _categories
}

export function mockCreateCategory(input: Omit<Category, 'id'>): Category {
  initCategories()
  const created: Category = { ...input, id: _nextId++ }
  _categories.push(created)
  return created
}

export function mockUpdateCategory(id: number, patch: Partial<Omit<Category, 'id'>>): Category {
  initCategories()
  const idx = _categories.findIndex(c => c.id === id)
  if (idx < 0)
    throw new Error(`Category ${id} not found`)
  const updated: Category = { ..._categories[idx]!, ...patch, id }
  _categories[idx] = updated
  return updated
}

/**
 * 删除分类（含「迁移」语义，PRD §15.2.1）
 * ─────────────────────────────────────────────
 *  - 子分类提升：被删分类的 children 的 parentId 接到它的父级（无父级则置顶）
 *  - 不在此处改「交易」：交易迁移由调用方（页面）指定目标分类后走 transaction 模块，
 *    以此保持 category → 无 transaction 反向依赖（避免循环引用）
 * @returns 被提升的子分类数量（仅供 UI 提示）
 */
export function mockDeleteCategory(id: number): number {
  initCategories()
  const idx = _categories.findIndex(c => c.id === id)
  if (idx < 0)
    throw new Error(`Category ${id} not found`)
  const target = _categories[idx]!
  let promoted = 0
  for (const c of _categories) {
    if (c.parentId === id) {
      c.parentId = target.parentId
      promoted++
    }
  }
  _categories.splice(idx, 1)
  return promoted
}

/** 找同类型的「其他」兜底分类 —— 删除时交易的默认迁移目标 */
export function mockFindFallbackCategory(type: Category['type']): Category | undefined {
  initCategories()
  return _categories.find(c => c.type === type && c.name === '其他' && c.parentId === null)
}
