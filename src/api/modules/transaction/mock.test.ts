import { describe, expect, it } from 'vitest'
import {
  mockBatchUpdateStatus,
  mockGetAllTransactions,
} from './mock'

/**
 * C1 批量确认 — US-002 体验补强
 *
 * 注意：transaction mock 没有 reset helper，_transactions 启动即被
 * generateTransactions 灌满（幂等）。所以测试只挑真实种子里几条改，
 * 不重置数据 —— 测的是「改对了 / 计数对 / 不动不相关的」，不是初始状态。
 */
describe('mockBatchUpdateStatus', () => {
  it('改指定 id 的 status，并返回成功笔数', () => {
    const before = mockGetAllTransactions()
    // 拿前 3 条做样本；不论原 status 是 pending 还是 confirmed，一律覆盖为 confirmed
    const targets = before.slice(0, 3)
    const ids = targets.map(t => t.id)
    const updatedAtsBefore = targets.map(t => t.updatedAt)

    const n = mockBatchUpdateStatus(ids, 'confirmed')

    expect(n).toBe(3)

    const after = mockGetAllTransactions()
    const changed = after.filter(t => ids.includes(t.id))
    expect(changed).toHaveLength(3)
    for (const t of changed)
      expect(t.status).toBe('confirmed')
    // updatedAt 必须推进（mockBatchUpdateStatus 写了 Date.now()）
    for (let i = 0; i < changed.length; i++) {
      expect(changed[i]!.updatedAt).toBeGreaterThanOrEqual(updatedAtsBefore[i]!)
    }
  })

  it('传不存在的 id 返回 0，不影响任何行', () => {
    const before = mockGetAllTransactions()
    const n = mockBatchUpdateStatus([99999999, 99999998], 'pending')
    expect(n).toBe(0)
    const after = mockGetAllTransactions()
    expect(after).toHaveLength(before.length)
    // 抽样 5 条校验 status / updatedAt 都没动
    for (const sample of before.slice(0, 5)) {
      const a = after.find(t => t.id === sample.id)!
      expect(a.status).toBe(sample.status)
      expect(a.updatedAt).toBe(sample.updatedAt)
    }
  })

  it('混合命中 / 未命中：只改命中的，计数与命中数一致', () => {
    const before = mockGetAllTransactions()
    const realIds = before.slice(0, 2).map(t => t.id)
    const mixedIds = [...realIds, 99999999]

    const n = mockBatchUpdateStatus(mixedIds, 'pending')

    expect(n).toBe(2)
    const after = mockGetAllTransactions()
    for (const t of after.filter(x => realIds.includes(x.id))) {
      expect(t.status).toBe('pending')
    }
  })
})
