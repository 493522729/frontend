/**
 * withRetry 重试逻辑单测
 * ====================================================================
 * 只测「纯函数」重试行为（成功即返回 / 失败重试 / 全失败抛错 / 次数正确），
 * 不发真实网络请求。Vue 组合式的 loading/error 状态靠页面手动验证。
 */
import { describe, expect, it, vi } from 'vitest'
import { withRetry } from './useRetryable'

describe('withRetry', () => {
  it('首次成功直接返回结果', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const res = await withRetry(fn)
    expect(res).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('失败一次后重试并最终成功（返回最后一次结果）', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('网络抖动'))
      .mockResolvedValue('recovered')
    const res = await withRetry(fn, { retries: 2, delay: 1 })
    expect(res).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('全部重试耗尽后抛出最后一次错误', async () => {
    const err = new Error('彻底挂了')
    const fn = vi.fn().mockRejectedValue(err)
    await expect(withRetry(fn, { retries: 2, delay: 1 })).rejects.toBe(err)
    // 1 次原始 + 2 次重试 = 3 次
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('retries 默认值 = 2（共 3 次尝试）', async () => {
    const err = new Error('always fail')
    const fn = vi.fn().mockRejectedValue(err)
    await expect(withRetry(fn)).rejects.toBe(err)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('每次重试前回调 onRetry，参数为第几次重试', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('x'))
    const onRetry = vi.fn()
    await expect(withRetry(fn, { retries: 2, delay: 1, onRetry })).rejects.toThrow()
    // 第 1、2 次重试前各回调一次
    expect(onRetry).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error))
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error))
  })
})
