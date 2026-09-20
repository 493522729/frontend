/**
 * 勋章模块 API —— 对接后端 BadgeController。
 * 图标走后端上传 + 静态资源 URL 下发（前端不打包图标，全部走 /uploads/**）。
 */
import type { BadgeDef, BadgeStat, UserBadge } from '@/types/badge'
import { http } from '@/api/request'

/** 公开列表（启用项，免登录） */
export function listBadges(): Promise<BadgeDef[]> {
  return http.get<BadgeDef[]>('/badges')
}

/** 后台全量（含禁用，超管） */
export function adminListBadges(): Promise<BadgeDef[]> {
  return http.get<BadgeDef[]>('/badges/admin')
}

export interface BadgeDefCreate {
  name: string
  category?: string
  description?: string
  gradient?: string
  conditionType?: string
  threshold?: number
  iconUrl?: string
  sortOrder?: number
  enabled?: boolean
  code?: string
}

export type BadgeDefUpdate = Partial<BadgeDefCreate>

export function createBadge(input: BadgeDefCreate): Promise<BadgeDef> {
  return http.post<BadgeDef>('/badges', input)
}

export function updateBadge(id: number, patch: BadgeDefUpdate): Promise<BadgeDef> {
  return http.put<BadgeDef>(`/badges/${id}`, patch)
}

export function deleteBadge(id: number): Promise<void> {
  return http.delete<void>(`/badges/${id}`)
}

/** 上传图标：返回 { url }，调用方填进 create/update 的 iconUrl */
export function uploadBadgeIcon(file: File): Promise<{ url: string }> {
  const formData = new FormData()
  formData.append('file', file)
  return http.post<{ url: string }>('/badges/icon', formData)
}

/** 手动授予（超管） */
export function grantBadge(userId: number, badgeId: number): Promise<UserBadge> {
  return http.post<UserBadge>('/badges/grant', { userId, badgeId })
}

/** 撤销（超管） */
export function revokeBadge(userId: number, badgeId: number): Promise<void> {
  return http.post<void>('/badges/revoke', { userId, badgeId })
}

/** 账号或 ID → userId（超管，后台手动授予/查询场景用） */
export function resolveBadgeUser(user: string): Promise<number> {
  return http.get<number>('/badges/resolve', { params: { user } })
}

/** 某用户的勋章（本人或超管） */
export function listUserBadges(userId: number): Promise<UserBadge[]> {
  return http.get<UserBadge[]>(`/badges/users/${userId}`)
}

/** 统计：每枚勋章持有人数（超管） */
export function badgeStats(): Promise<BadgeStat[]> {
  return http.get<BadgeStat[]>('/badges/stats')
}
