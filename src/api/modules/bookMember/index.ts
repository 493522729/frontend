/**
 * 共享账本成员管理 API —— 对齐后端 BookMemberController（见 共享账本技术设计.md §4.4 / §6）
 *
 * 权限基调（后端已兜底，前端只负责把能力呈现给用户）：
 *   - 成员列表：任意成员可看
 *   - 邀请 / 改角色 / 移除：owner / admin
 *   - 退出：任意成员（owner 需先转让）
 *   - 转让 owner：仅 owner
 *
 * ⚠️ SYNC：字段名与后端 Dtos.BookMemberDTO 对齐（尤其 `isMe`，不是 `me`）。改后端 DTO 必须回来改这里。
 */
import type { BookMember, MemberRole } from '@/types/book'
import { http } from '@/api/request'

/** 成员列表 */
export function fetchBookMembers(bookId: number): Promise<BookMember[]> {
  return http.get<BookMember[]>(`/books/${bookId}/members`)
}

/** 邀请成员（输入用户名一步添加，后端默认给 EDITOR 角色） */
export function inviteMember(bookId: number, username: string): Promise<BookMember> {
  return http.post<BookMember>(`/books/${bookId}/members`, { username })
}

/** 改角色（owner/admin） */
export function changeMemberRole(bookId: number, userId: number, role: MemberRole): Promise<void> {
  return http.put<void>(`/books/${bookId}/members/${userId}`, { role })
}

/** 移除成员（owner/admin） */
export function removeMember(bookId: number, userId: number): Promise<void> {
  return http.delete<void>(`/books/${bookId}/members/${userId}`)
}

/** 自己退出（owner 需先转让） */
export function leaveBook(bookId: number): Promise<void> {
  return http.post<void>(`/books/${bookId}/leave`, {})
}

/** 转让 owner（仅 owner 可调用） */
export function transferOwner(bookId: number, targetUid: number): Promise<void> {
  return http.post<void>(`/books/${bookId}/transfer`, { targetUid })
}
