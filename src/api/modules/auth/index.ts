/**
 * 鉴权相关接口汇总（账号登录 + 微信扫码登录）
 * ====================================================================
 * 本期还没真后端，所有接口都走「本地 mock」，模拟延迟 + 随机分支，
 * 这样前端 UI 流程能完整跑起来，等后端联调时把 baseURL 切到正式地址即可。
 *
 * 类型契约复用了 ./modules/user 里的 LoginParams/LoginResult/UserInfo，
 * 这里只重新导出一次避免重复定义。
 */

// 类型从 user.ts 复用 —— 这里只 export 类型，不重复定义
import type { ChangePasswordParams, LoginParams, LoginResult, RegisterParams, UserInfo } from '../user'

export type { ChangePasswordParams, LoginParams, LoginResult, RegisterParams, UserInfo }

/** 扫码会话状态 */
export type ScanStatus = 'waiting' | 'scanned' | 'confirmed' | 'expired'

/** 轮询接口的返回值 */
export interface ScanState {
  /** 当前状态 */
  status: ScanStatus
  /** 距离过期还有多少秒；前端用于倒计时环 */
  expiresIn: number
  /**
   * 当 status === 'confirmed' 时返回 token + 用户信息，
   * 前端拿到调 useAuthStore().setTokens 即可完成登录。
   */
  tokens?: LoginResult
  user?: UserInfo
}

// ── 共享 Mock 工具（内部使用） ──────────────────────────────────────────

/**
 * 「假后端」：sleep 一会儿再返回，让 loading 状态有显示时间。
 * 真接口实现时不需要这段。
 */
function fakeDelay(ms = 400): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 用于账号登录的 mock：根据用户名/密码特征触发不同分支。
 * 真接口实现时直接调 http.post('/auth/login', params) 即可。
 *   - username === 'admin' / password === 'admin'  → 成功
 *   - password === 'locked' → 抛出 business 错误（账号锁定）
 *   - 其它 → 抛出 business 错误（用户名或密码错误）
 */
function mockAccountLogin(params: LoginParams): Promise<LoginResult> {
  return fakeDelay(800).then(() => {
    if (params.username === 'admin' && params.password === 'admin')
      return { accessToken: 'mock-at-admin', refreshToken: 'mock-rt-admin' }

    if (params.password === 'locked')
      throw new Error('BUSINESS:1001:账号已被锁定，请稍后再试')

    throw new Error('BUSINESS:1002:用户名或密码错误')
  })
}

// ── 账号密码登录 ────────────────────────────────────────────────────────

/**
 * 账号密码登录。
 * 真接口实现时直接：return http.post<LoginResult>('/auth/login', params)
 * 这里走 mock 演示完整流程（loading / 成功 / 错误）。
 */
export function accountLogin(params: LoginParams): Promise<LoginResult> {
  return mockAccountLogin(params)
}

// ── 注册 ────────────────────────────────────────────────────────────

/**
 * 注册（mock：username 不可为 admin，password ≥ 6 位，确认密码一致）。
 * 真接口实现：return http.post<LoginResult>('/auth/register', params)
 */
export function register(params: RegisterParams): Promise<LoginResult> {
  return fakeDelay(800).then(() => {
    if (!params.username || params.username.length < 3)
      throw new Error('BUSINESS:2001:用户名至少 3 位')
    if (params.password.length < 6)
      throw new Error('BUSINESS:2002:密码至少 6 位')
    if (params.password !== params.confirmPassword)
      throw new Error('BUSINESS:2003:两次输入的密码不一致')
    if (params.username === 'admin')
      throw new Error('BUSINESS:2004:该用户名已注册')
    return {
      accessToken: `mock-at-${params.username}`,
      refreshToken: `mock-rt-${params.username}`,
    }
  })
}

// ── 修改密码 / 退出登录 ─────────────────────────────────────────────

export function changePassword(params: ChangePasswordParams): Promise<void> {
  return fakeDelay(500).then(() => {
    if (params.oldPassword.length < 1)
      throw new Error('BUSINESS:2101:请输入当前密码')
    if (params.newPassword.length < 6)
      throw new Error('BUSINESS:2102:新密码至少 6 位')
    if (params.oldPassword === params.newPassword)
      throw new Error('BUSINESS:2103:新密码不能与旧密码相同')
  })
}

export function logout(): Promise<void> {
  return fakeDelay(200)
}

/** 获取当前登录用户信息（mock 固定返回一个开发账号） */
export function fetchProfile(): Promise<UserInfo> {
  return fakeDelay(200).then(() => ({
    id: 1,
    username: 'laozhao',
    nickname: '老赵',
    avatar: undefined,
    roles: ['admin'],
  }))
}

// ── 微信扫码登录 ────────────────────────────────────────────────────────

/**
 * 扫码会话状态机（真接口实现时由后端 + SSE/WebSocket 维护，
 * 前端只需要订阅状态变化。这里用 setInterval 在前端 mock 一份演示）。
 */
const scanSessions = new Map<string, {
  status: ScanStatus
  createdAt: number
  expired: boolean
}>()

/**
 * 创建扫码会话 —— 后端返回一个 qrId，前端拿 qrId 渲染二维码 + 启动轮询。
 * 真接口实现：return http.post<{ qrId, qrCodeUrl }>('/auth/scan/create')
 *
 * 这里为了「让 UI 能看」，本地生成一个虚拟二维码数据：
 * 把 qrId 转成 25×25 网格的伪随机图案（每次刷新都不同），前端拿 SVG 渲染。
 */
export function createScanSession(): Promise<{ qrId: string, expiresIn: number, qrCodeDataUrl: string }> {
  return fakeDelay(300).then(() => {
    const qrId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    scanSessions.set(qrId, {
      status: 'waiting',
      createdAt: Date.now(),
      expired: false,
    })
    return {
      qrId,
      expiresIn: 120,
      // 30 秒后过期真接口时由后端控制；mock 给充足时间方便演示
      qrCodeDataUrl: qrId,
    }
  })
}

/**
 * 轮询扫码状态。前端用 setInterval 每 2 秒调一次。
 *
 * mock 状态机时间线（创建后）：
 *   0~8s     : waiting     → 显示二维码 + 「打开微信扫一扫」
 *   8~13s   : scanned    → 模拟「手机扫了没确认」
 *   13~15s   : confirmed   → 模拟「手机点了确认」，返回 token
 *   15~120s  : still confirmed（前端跳转走人）
 *   >120s    : expired    → 「二维码已失效，点击刷新」
 *
 * 真接口实现：return http.get<ScanState>(`/auth/scan/${qrId}`)
 * SSE 实现时直接订阅事件，不需要前端轮询。
 */
export function pollScanSession(qrId: string): Promise<ScanState> {
  return fakeDelay(150).then(() => {
    const session = scanSessions.get(qrId)
    if (!session || session.expired)
      return { status: 'expired', expiresIn: 0 }

    const elapsed = Math.floor((Date.now() - session.createdAt) / 1000)
    const remaining = Math.max(0, 120 - elapsed)

    if (elapsed > 120)
      return { status: 'expired', expiresIn: 0 }

    // 演示用：自动演一遍三态
    if (elapsed >= 8 && elapsed < 13)
      session.status = 'scanned'

    if (elapsed >= 13 && session.status !== 'confirmed') {
      session.status = 'confirmed'
    }

    // 推到 60s 时让被前端 cancel() 调用 → 这里做一下过期演示
    if (elapsed >= 15 && Math.random() < 0.01)
      session.expired = true

    if (session.status === 'confirmed') {
      return {
        status: 'confirmed',
        expiresIn: remaining,
        tokens: { accessToken: 'mock-at-scan', refreshToken: 'mock-rt-scan' },
        user: {
          id: 10086,
          username: 'laozhao',
          nickname: '老赵',
          roles: ['admin'],
        },
      }
    }

    return { status: session.status, expiresIn: remaining }
  })
}

/**
 * 主动取消扫码（用户点「刷新二维码」时调用）。
 * 真接口实现：return http.post(`/auth/scan/${qrId}/cancel`)
 */
export function cancelScanSession(qrId: string): Promise<void> {
  return fakeDelay(100).then(() => {
    const session = scanSessions.get(qrId)
    if (session)
      session.expired = true
  })
}
