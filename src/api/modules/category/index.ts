import type { Category } from '@/types/transaction'

/**
 * 分类模块 API
 * ====================================================================
 * 当前走本地 mock（./mock.ts）。后端就绪后把每个函数体换成 http 调用即可，
 * 调用方（分类管理页 / dict store / 记账弹层）一行不用动。
 */
import { MOCK_LATENCY, simulateLatency } from '@/api/mock-latency'
import {
  mockCreateCategory,
  mockDeleteCategory,
  mockFindFallbackCategory,
  mockListCategories,
  mockUpdateCategory,
} from './mock'

/** 分类字典（前端缓存） */
export function listCategories(): Promise<Category[]> {
  return simulateLatency(mockListCategories())
}

/** 新增分类 */
export function createCategory(input: Omit<Category, 'id'>): Promise<Category> {
  return simulateLatency(mockCreateCategory(input), MOCK_LATENCY.write)
}

/** 更新分类 */
export function updateCategory(id: number, patch: Partial<Omit<Category, 'id'>>): Promise<Category> {
  return simulateLatency(mockUpdateCategory(id, patch), MOCK_LATENCY.write)
}

/** 删除分类（仅提升子分类；交易的迁移由调用方另行处理） */
export function deleteCategory(id: number): Promise<number> {
  return simulateLatency(mockDeleteCategory(id), MOCK_LATENCY.write)
}

/** 查同类型兜底分类（删除时默认迁移目标） */
export function findFallbackCategory(type: Category['type']): Promise<Category | undefined> {
  return simulateLatency(mockFindFallbackCategory(type))
}
