/**
 * 标签模块 API —— 已切换到真实后端（Spring Boot）。
 * 调用方（标签管理页 / 流水页标签列 / 记一笔 / 规则引擎）零改动对接。
 *
 * 标签是用户级资源（不区分账本），所有接口都只针对当前登录用户。
 */
import type { Tag } from '@/types/tag'
import { http } from '@/api/request'

/** 标签字典（当前用户全部） */
export function listTags(): Promise<Tag[]> {
  return http.get<Tag[]>('/tags')
}

/** 新增标签（重名后端返回 400） */
export function createTag(input: { name: string, color?: string }): Promise<Tag> {
  return http.post<Tag>('/tags', input)
}

/** 更新标签（name / color 至少传其一） */
export function updateTag(id: number, patch: { name?: string, color?: string }): Promise<Tag> {
  return http.put<Tag>(`/tags/${id}`, patch)
}

/** 删除标签（后端自动清理流水引用） */
export function deleteTag(id: number): Promise<void> {
  return http.delete<void>(`/tags/${id}`)
}
