import type { Book, BookWithStats } from '@/types/book'
/**
 * 账本模块 API —— 已切换到真实后端（Spring Boot）。
 * 调用方（book store / 顶栏切换器 / 账本管理页）一行不用动：签名保持一致。
 *
 * 后端约定：HTTP 恒 200，成败看响应体里的 code（见 request.ts 解包）。
 */
import { http } from '@/api/request'

/** 账本列表（含每本的交易笔数、账户数摘要） */
export function listBooks(): Promise<BookWithStats[]> {
  return http.get<BookWithStats[]>('/books')
}

/** 新建账本 */
export function createBook(input: Omit<Book, 'id'>): Promise<Book> {
  return http.post<Book>('/books', input)
}

/** 更新账本（名称 / 类型 / 图标 / 设默认） */
export function updateBook(id: number, patch: Partial<Omit<Book, 'id'>>): Promise<Book> {
  return http.put<Book>(`/books/${id}`, patch)
}

/** 删除账本（级联删账户与交易） */
export function deleteBook(id: number): Promise<void> {
  return http.delete<void>(`/books/${id}`)
}

/** 设为默认账本 */
export function setDefaultBook(id: number): Promise<void> {
  return http.post<void>(`/books/${id}/default`)
}
