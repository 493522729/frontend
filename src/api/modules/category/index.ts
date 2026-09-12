import type { Category } from '@/types/transaction'

/**
 * 分类模块 API —— 已切换到真实后端。
 * 调用方（分类管理页 / dict store / 记账弹层）一行不用动。
 */
import { http } from '@/api/request'

/** 分类字典（全局共享） */
export function listCategories(): Promise<Category[]> {
  return http.get<Category[]>('/categories')
}

/** 新增分类 */
export function createCategory(input: Omit<Category, 'id'>): Promise<Category> {
  return http.post<Category>('/categories', input)
}

/** 更新分类 */
export function updateCategory(id: number, patch: Partial<Omit<Category, 'id'>>): Promise<Category> {
  return http.put<Category>(`/categories/${id}`, patch)
}

/** 删除分类（返回被提升的子分类数量） */
export function deleteCategory(id: number): Promise<number> {
  return http.delete<number>(`/categories/${id}`)
}

/** 查同类型兜底分类（删除时默认迁移目标） */
export function findFallbackCategory(type: Category['type']): Promise<Category | undefined> {
  return http.get<Category | null>(`/categories/fallback?type=${type}`).then(r => r ?? undefined)
}

/**
 * 拖拽排序：把某分组（同 type + parentId）的分类按新顺序持久化。
 * 只有同一分组内的顺序会变，跨分组不影响。
 */
export function reorderCategories(
  type: Category['type'],
  parentId: number | null,
  orderedIds: number[],
): Promise<void> {
  return http.put<void>('/categories/reorder', { type, parentId, orderedIds })
}
