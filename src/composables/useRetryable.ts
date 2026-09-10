/**
 * 网络重试 + 可重试任务封装
 * ====================================================================
 * PRD 9.5 要求「网络异常自动重试 3 次」，9.2 要求「错误统一 toast」。
 * 这两个放在一起实现，调用方一行就能拿到「自动重试 + 失败时给用户重试按钮」的能力。
 *
 * 两层 API：
 *   1) withRetry(fn, opts)      —— 纯函数，自动重试 N 次（默认 2 次 → 共 3 次尝试），
 *                                  仍失败则把最后一次错误往外抛。可被单测直接验证。
 *   2) useRetryable(fn, opts)   —— Vue 组合式封装，额外管 loading / error / data 状态，
 *                                  适合直接在组件里用。
 *
 * 为什么重试默认 2 次：PRD 说「重试 3 次」指的是「总共尝试 3 次」，即 1 次原始 + 2 次重试。
 * 重试间隔用固定 delay（不指数退避，mock 阶段没必要；真后端可在这里加 backoff）。
 */
import { ref, shallowRef } from 'vue'
import { errorMessage } from '@/utils/errorHumanizer'

export interface RetryOptions {
  /** 重试次数（不含首次），默认 2 → 共 3 次尝试 */
  retries?: number
  /** 每次重试前的等待毫秒，默认 400 */
  delay?: number
  /** 每次重试前回调（可用于埋点 / 日志），参数 (第几次重试, 错误) */
  onRetry?: (attempt: number, err: unknown) => void
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * 自动重试包装：成功即返回；失败按 retries 次数重试；全失败抛出最后一次错误。
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 2, delay = 400, onRetry } = opts
  let lastErr: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    }
    catch (err) {
      lastErr = err
      // 还有重试机会才等 + 回调；最后一次直接落出
      if (attempt < retries) {
        onRetry?.(attempt + 1, err)
        await sleep(delay)
      }
    }
  }
  throw lastErr
}

export interface RetryableState<TArgs extends unknown[], TResult> {
  loading: ReturnType<typeof ref<boolean>>
  error: ReturnType<typeof shallowRef<unknown>>
  data: ReturnType<typeof shallowRef<TResult | null>>
  /** 执行任务（带重试）；返回结果或 null（失败） */
  run: (...args: TArgs) => Promise<TResult | null>
  /** 取错误原始信息 */
  errorMessage: (err: unknown) => string
}

/**
 * 组合式封装：在 withRetry 之上管 loading / error / data。
 * 用法：
 *   const { loading, error, run } = useRetryable(fetchX)
 *   await run()            // 内部自动重试；失败不抛，error 置位
 *   if (error.value) {...} // 自行决定怎么提示
 */
export function useRetryable<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  opts: RetryOptions = {},
): RetryableState<TArgs, TResult> {
  const loading = ref(false)
  const error = shallowRef<unknown>(null)
  const data = shallowRef<TResult | null>(null)

  async function run(...args: TArgs): Promise<TResult | null> {
    loading.value = true
    error.value = null
    try {
      const res = await withRetry(() => fn(...args), opts)
      data.value = res
      return res
    }
    catch (err) {
      error.value = err
      return null
    }
    finally {
      loading.value = false
    }
  }

  return { loading, error, data, run, errorMessage }
}
