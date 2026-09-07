import type { BookWithStats } from '@/types/book'
/**
 * 账本模块 API
 * ====================================================================
 * 当前走本地 mock（./mock.ts）。后端就绪后换成 http.get('/books') 即可，
 * 调用方（book store / 顶栏切换器）一行不用动。
 */
import { MOCK_LATENCY, simulateLatency } from '@/api/mock-latency'
import { mockListBooks } from './mock'

/** 账本列表（含每本的交易笔数、账户数摘要） */
export function listBooks(): Promise<BookWithStats[]> {
  return simulateLatency(mockListBooks(), MOCK_LATENCY.fast)
}
