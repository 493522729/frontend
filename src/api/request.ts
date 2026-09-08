import type { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import type { Result } from './types'
/**
 * 请求层核心 —— axios 封装
 * ====================================================================
 * 这一整层解决四件事，让你写业务接口时「只关心业务、不碰脏活」：
 *
 *   1. 统一 baseURL / 超时 / 请求头
 *   2. 请求拦截器：自动给每个请求带上登录令牌（Authorization）
 *   3. 响应拦截器：把后端的 { code, message, data }「解包」成 data 直接返回；
 *      失败则统一翻译成 ApiError（network / http / business 三类）
 *   4. 401 令牌过期：自动用 refreshToken 换新 token，且「并发请求只刷新一次」
 */
import axios from 'axios'
import { getActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/modules/auth'
import { ApiError, BUSINESS_CODE } from './types'

/**
 * 所有请求的前缀：和 .env 的 VITE_BASE_API 对齐（dev 下 '/api' 走 vite proxy 转发后端）。
 * 取不到时兜底 '/api'，保证不出现 undefined 拼出 'undefined/xxx' 这种鬼地址。
 */
const BASE_URL = import.meta.env.VITE_BASE_API || '/api'

/** 请求超时（毫秒）。财务系统弱网也要给足时间，10s 较稳妥 */
const TIMEOUT = 10_000

/**
 * 裸 axios 实例（不带任何拦截器）
 * --------------------------------------------------------------------
 * 专用给「刷新 token」这种底层调用。
 * 如果也用主实例，刷新请求失败又会触发响应拦截器 → 又去刷新 → 死循环。
 * 所以刷新必须用「没有拦截器的干净实例」。
 */
const rawAxios = axios.create({ baseURL: BASE_URL, timeout: TIMEOUT })

/**
 * 主实例（带下面写的拦截器）。业务代码最终都通过它发请求。
 */
const instance: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
})

/* ──────────────────────────────────────────────────────────────
 * 模块级共享状态（整个应用只有一份，挂在模块闭包里，不进 Vue 响应式）
 * ──────────────────────────────────────────────────────────── */

/** 是否正在刷新 token —— 用来防止「多个请求同时 401」时重复刷新 */
let isRefreshing = false

/**
 * 等待刷新完成的「请求重试」队列。
 * 刷新期间又来了 401 请求，先把「怎么重发自己」存进这个数组，
 * 等刷新成功一次性全部重发。数组里存的是函数，不是数据。
 */
let pendingQueue: Array<(newToken: string) => void> = []

/**
 * 未授权时的回调（跳登录页）。由应用层通过 setUnauthorizedHandler 注入，
 * 这样请求层「不依赖 router」，分层更干净。
 */
let unauthorizedHandler: (() => void) | null = null

/** 应用层注册「跳登录」逻辑（在 main.ts 里调用一次） */
export function setUnauthorizedHandler(fn: () => void): void {
  unauthorizedHandler = fn
}

/* ──────────────────────────────────────────────────────────────
 * 辅助函数
 * ──────────────────────────────────────────────────────────── */

/**
 * 读取当前登录令牌。
 * 用 getActivePinia() 判断 Pinia 是否已激活——没激活（如单测、首屏极早期）
 * 就返回空字符串，避免「还没装好 Pinia 就调 store」报错。
 */
function getAccessToken(): string {
  if (!getActivePinia())
    return ''
  return useAuthStore().accessToken
}

/** 刷新成功后，挨个调用队列里的重试函数，把新 token 塞回去 */
function flushQueue(newToken: string): void {
  pendingQueue.forEach(cb => cb(newToken))
  pendingQueue = []
}

/** 刷新失败，清空队列（这些请求已经没救了，各自会被拒绝） */
function clearQueue(): void {
  pendingQueue = []
}

/** 退出登录：清 token + 触发跳登录（如果应用层注册了 handler） */
function doLogout(): void {
  if (getActivePinia())
    useAuthStore().clearAuth()
  unauthorizedHandler?.()
}

/**
 * 真正去后端换新 token（不会被拦截器递归调用，因为用的是 rawAxios）
 */
async function refreshAccessToken(): Promise<string> {
  const refreshToken = getActivePinia() ? useAuthStore().refreshToken : ''
  if (!refreshToken)
    throw new ApiError('http', '登录已过期，请重新登录', 401)

  const { data } = await rawAxios.post<Result<{ accessToken: string, refreshToken: string }>>(
    '/auth/refresh',
    { refreshToken },
  )
  if (data.code !== BUSINESS_CODE.SUCCESS)
    throw new ApiError('business', data.message, data.code, data.data)

  // 把新旧两个 token 都写回 store（后端可能同时换发 refreshToken）
  useAuthStore().setTokens(data.data.accessToken, data.data.refreshToken)
  return data.data.accessToken
}

/* ──────────────────────────────────────────────────────────────
 * 请求拦截器：发出去之前，给请求头塞上 token
 * ──────────────────────────────────────────────────────────── */
instance.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token)
    // 标准 JWT 写法：Authorization: Bearer <token>
    config.headers.Authorization = `Bearer ${token}`
  return config
})

/* ──────────────────────────────────────────────────────────────
 * 响应拦截器：到手之后做「解包」和「错误翻译」
 * ──────────────────────────────────────────────────────────── */
instance.interceptors.response.use(
  // 成功分支：HTTP 状态码是 2xx 才会进这里
  (response: AxiosResponse<Result>): AxiosResponse => {
    const body = response.data

    // 后端约定：哪怕 HTTP 200，只要业务 code 非成功就是「业务失败」
    if (body.code !== BUSINESS_CODE.SUCCESS)
      throw new ApiError('business', body.message, body.code, body.data)

    /**
     * 解包：把 Result.data 直接交出去。
     * 调用方 `http.get<UserInfo>(...)` 拿到的就是 UserInfo，不用再 .data.data。
     * 这里先「伪装」成 AxiosResponse 以通过 axios 的类型检查，
     * 真正的 T 类型在下面的 request<T>() 里还原。
     */
    return body.data as unknown as AxiosResponse
  },

  // 错误分支：网络异常 / HTTP 非 2xx 都会进这里
  async (error: AxiosError<Result>) => {
    // 拿到当时发出去的请求配置，刷新 token 后要靠它「原样重发」
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined

    // 情况一：网络层错误（断网 / 超时 / DNS 失败）—— error.response 根本不存在
    if (!error.response) {
      throw new ApiError('network', '网络异常，请检查网络连接', undefined, error.message)
    }

    const status = error.response.status

    // 情况二：token 过期 —— 触发「刷新 + 重发」流程
    // 兼容两种后端写法：HTTP 401，或 HTTP 200 但业务码是 TOKEN_EXPIRED
    const isTokenExpired
      = status === 401 || error.response.data?.code === BUSINESS_CODE.TOKEN_EXPIRED

    if (isTokenExpired) {
      // 2a. 这个请求「本身就是刷新请求」且已经失败（被标记过 _retry）
      //     → 说明连刷新都救不回来，直接登出
      if (originalRequest?._retry) {
        doLogout()
        throw new ApiError('http', '登录已过期，请重新登录', status)
      }

      // 2b. 已经有别的请求在刷新了 → 把自己挂到队列里等，不重复刷新
      if (isRefreshing) {
        return new Promise((resolve) => {
          pendingQueue.push((newToken: string) => {
            if (originalRequest)
              originalRequest.headers.Authorization = `Bearer ${newToken}`
            // 用新 token 重发原请求，结果会再次经过响应拦截器（此时已是新 token，能成功）
            resolve(instance(originalRequest!))
          })
        })
      }

      // 2c. 第一个 401：由我来发起刷新（并标记「正在刷新」）
      isRefreshing = true
      if (originalRequest)
        originalRequest._retry = true

      try {
        const newToken = await refreshAccessToken()
        flushQueue(newToken) // 重发队列里所有挂起的请求
        // 重发当前这个 401 请求本身
        if (originalRequest)
          originalRequest.headers.Authorization = `Bearer ${newToken}`
        return instance(originalRequest!)
      }
      catch (refreshErr) {
        // 刷新也失败了：清空队列 + 登出 + 把错误透传出去
        clearQueue()
        doLogout()
        throw refreshErr instanceof ApiError
          ? refreshErr
          : new ApiError('http', '登录已过期，请重新登录', status)
      }
      finally {
        // 无论成功失败，刷新动作结束，释放锁
        isRefreshing = false
      }
    }

    // 情况三：其它 HTTP 错误（404 / 500 / 502 ...）
    const msg = error.response.data?.message || `请求失败（${status}）`
    throw new ApiError('http', msg, status, error.response.data)
  },
)

/**
 * 底层请求方法。把 config 交给主实例，并把「解包后的 data」还原成 T 类型。
 * 因为拦截器里我们已经把 AxiosResponse「伪装」成 data 返回，
 * 这里用 as 把类型纠正回调用方期望的 T。
 */
function request<T>(config: AxiosRequestConfig): Promise<T> {
  return instance.request(config) as unknown as Promise<T>
}

/**
 * 给业务代码用的便捷方法集。
 * 重点：http.get<UserInfo>(url) 里的 <UserInfo> 会一路传到 request<T>，
 * 最终返回 Promise<UserInfo> —— 你拿到的就是「类型明确的数据」，编辑器全程有补全。
 */
export const http = {
  get<T>(url: string, params?: object, config?: AxiosRequestConfig): Promise<T> {
    return request<T>({ ...config, url, method: 'GET', params })
  },
  post<T>(url: string, data?: object, config?: AxiosRequestConfig): Promise<T> {
    return request<T>({ ...config, url, method: 'POST', data })
  },
  put<T>(url: string, data?: object, config?: AxiosRequestConfig): Promise<T> {
    return request<T>({ ...config, url, method: 'PUT', data })
  },
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return request<T>({ ...config, url, method: 'DELETE' })
  },
}

export default http

// ── 仅供单元测试挂载 mock adapter 用，业务代码请勿直接使用 ──
export { instance, rawAxios }
