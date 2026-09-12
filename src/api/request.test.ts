import type { AxiosResponse } from 'axios'
import type { UserInfo } from './modules/user'
import { AxiosError } from 'axios'
/**
 * 请求层单元测试
 * ====================================================================
 * 不依赖真后端、也不依赖第三方 mock 库 —— 直接用「自定义 axios adapter」
 * 当假后端。这样你能直观看懂「mock 的本质就是：拦截请求、返回我们编的假数据」。
 *
 * 跑法：pnpm test
 */
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '@/stores/modules/auth'
import { http, instance, rawAxios } from './request'
import { ApiError } from './types'

/**
 * 安装一个「假后端」：把 instance / rawAxios 的底层适配器替换成我们的规则函数。
 * rule 返回 { status, data } 表示一次 HTTP 响应；返回 'network' 表示网络层直接失败。
 *
 * mock 实现思路：
 *   - axios 真正发请求前会调用「adapter(config)」，所以把 instance 的 adapter 替换成
 *     我们自己写的假适配器，就能在不联网的情况下模拟后端响应。
 *   - 2xx 直接 resolve 一个 AxiosResponse；非 2xx 抛一个带 response 的 AxiosError，
 *     这样 axios 会把它当作「HTTP 错误」走到 error 分支 —— 正是真实网络的行为。
 */
function installMock(
  rule: (config: { url?: string, baseURL?: string, method?: string }) =>
    | { status: number, data: unknown }
    | 'network',
): void {
  const adapter: import('axios').AxiosAdapter = async (config) => {
    const res = rule(config)
    if (res === 'network') {
      // 故意不传 response（第 5 个参数），模拟「连响应都没收到」
      throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config)
    }
    // 把 baseURL 前缀去掉，得到干净的 '/xxx' 路径，给 rule 用
    const path = config.baseURL && config.url?.startsWith(config.baseURL)
      ? config.url.slice(config.baseURL.length)
      : (config.url ?? '')

    const response: AxiosResponse = {
      data: res.data,
      status: res.status,
      statusText: res.status === 200 ? 'OK' : 'Error',
      headers: {},
      config,
      request: {},
    }
    // 让 lint 闭嘴：本适配器不读 path，但保留它便于 rule 函数判断 URL
    void path

    // axios 约定：2xx 算成功（resolve），其它算失败（reject 并带上 response）
    if (res.status >= 200 && res.status < 300)
      return response
    throw new AxiosError(
      `Request failed with status code ${res.status}`,
      AxiosError.ERR_BAD_RESPONSE,
      config,
      {},
      response,
    )
  }
  instance.defaults.adapter = adapter
  rawAxios.defaults.adapter = adapter
}

describe('请求层 request', () => {
  beforeEach(() => {
    // 激活干净的 pinia，否则 getActivePinia() 为空、取不到 token
    setActivePinia(createPinia())
  })

  afterEach(() => {
    // 还原真实适配器，避免影响其它测试 / 模块
    delete instance.defaults.adapter
    delete rawAxios.defaults.adapter
  })

  it('成功响应：自动解包 Result.data', async () => {
    const profile: UserInfo = {
      id: 1,
      username: 'laozhao',
      nickname: '老赵',
      roles: ['admin'],
    }
    installMock(() => ({
      status: 200,
      data: { code: 200, message: 'ok', data: profile },
    }))

    const res = await http.get<UserInfo>('/user/profile')
    // 重点是：拿到的是 data 本体，没有外层 code/message
    expect(res).toEqual(profile)
  })

  it('业务失败：http 200 但 code 非成功 → 抛 business 错误', async () => {
    installMock(() => ({
      status: 200,
      data: { code: 5001, message: '余额不足', data: null },
    }))

    let err: unknown
    try {
      await http.get('/biz')
    }
    catch (e) {
      err = e
    }

    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).type).toBe('business')
    expect((err as ApiError).code).toBe(5001)
    expect((err as ApiError).message).toBe('余额不足')
  })

  it('登录失败：http 200 + code 40100 → 抛 business 错误并保留后端提示', async () => {
    installMock(() => ({
      status: 200,
      data: { code: 40100, message: '用户名或密码错误', data: null },
    }))

    let err: unknown
    try {
      await http.post('/auth/login', { username: 'wrong', password: 'wrong' })
    }
    catch (e) {
      err = e
    }

    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).type).toBe('business')
    expect((err as ApiError).code).toBe(40100)
    expect((err as ApiError).message).toBe('用户名或密码错误')
  })

  it('http 错误：状态码非 2xx → 抛 http 错误', async () => {
    installMock(() => ({
      status: 500,
      data: { code: 500, message: '服务器开小差' },
    }))

    let err: unknown
    try {
      await http.get('/boom')
    }
    catch (e) {
      err = e
    }

    expect((err as ApiError).type).toBe('http')
    expect((err as ApiError).code).toBe(500)
  })

  it('网络错误：断网 / 超时 → 抛 network 错误', async () => {
    installMock(() => 'network')

    let err: unknown
    try {
      await http.get('/net')
    }
    catch (e) {
      err = e
    }

    expect((err as ApiError).type).toBe('network')
  })

  it('令牌过期：并发 401 只刷新一次，且全部重发成功', async () => {
    // 先给一个有效的 refreshToken，刷新请求才发得动
    useAuthStore().setTokens('old-at', 'old-rt')

    let secureCall = 0
    let refreshCall = 0

    installMock((config) => {
      const path = config.baseURL && config.url?.startsWith(config.baseURL)
        ? config.url.slice(config.baseURL.length)
        : (config.url ?? '')

      if (path === '/secure') {
        secureCall++
        // 前两次返回 401（过期），之后返回成功（模拟重发后通过）
        if (secureCall <= 2)
          return { status: 401, data: {} }
        return { status: 200, data: { code: 200, message: 'ok', data: 'secret' } }
      }
      if (path === '/auth/refresh') {
        refreshCall++
        return {
          status: 200,
          data: {
            code: 200,
            message: 'ok',
            data: { accessToken: 'new-at', refreshToken: 'new-rt' },
          },
        }
      }
      return { status: 200, data: { code: 200, message: 'ok', data: null } }
    })

    // 同时发出两个请求，制造「并发 401」
    const [r1, r2] = await Promise.all([
      http.get<string>('/secure'),
      http.get<string>('/secure'),
    ])

    // 两个请求最终都拿到了重发后的正确数据
    expect(r1).toBe('secret')
    expect(r2).toBe('secret')
    // 关键断言：刷新接口只被调了一次（并发请求共享同一次刷新）
    expect(refreshCall).toBe(1)
    // 刷新后 store 里的 token 已被更新
    expect(useAuthStore().accessToken).toBe('new-at')
  })
})
