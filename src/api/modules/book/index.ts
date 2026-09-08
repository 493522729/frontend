import type { Book, BookWithStats } from '@/types/book'
/**
 * 账本模块 API
 * ====================================================================
 * 当前走本地 mock（./mock.ts）。后端就绪后换成 http.get/post 即可，
 * 调用方（book store / 顶栏切换器 / 账本管理页）一行不用动。
 */
import { MOCK_LATENCY, simulateLatency } from '@/api/mock-latency'
import {
  mockCreateBook,
  mockDeleteBook,
  mockListBooks,
  mockSetDefaultBook,
  mockUpdateBook,
} from './mock'

/** 账本列表（含每本的交易笔数、账户数摘要） */
export function listBooks(): Promise<BookWithStats[]> {
  return simulateLatency(mockListBooks(), MOCK_LATENCY.fast)
}

/** 新建账本 */
export function createBook(input: Omit<Book, 'id'>): Promise<Book> {
  return simulateLatency(mockCreateBook(input), MOCK_LATENCY.write)
}

/** 更新账本（名称 / 类型 / 图标 / 设默认） */
export function updateBook(id: number, patch: Partial<Omit<Book, 'id'>>): Promise<Book> {
  return simulateLatency(mockUpdateBook(id, patch), MOCK_LATENCY.write)
}

/** 删除账本 */
export function deleteBook(id: number): Promise<void> {
  return simulateLatency(mockDeleteBook(id), MOCK_LATENCY.write)
}

/** 设为默认账本 */
export function setDefaultBook(id: number): Promise<void> {
  return simulateLatency(mockSetDefaultBook(id), MOCK_LATENCY.write)
}
