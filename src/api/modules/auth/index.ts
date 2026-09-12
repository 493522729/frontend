/**
 * 鉴权相关接口汇总（账号登录 + 微信扫码登录）
 * ====================================================================
 * 账号类接口（登录/注册/改密/退出/资料）已对接真后端（P2 完成）：
 * 直接走 http.post/get，请求层 request.ts 负责解包 {code,message,data}、
 * 自动带 token、40101 自动刷新。
 *
 * 微信扫码登录：后端已有内存态接口（/api/auth/scan*），但完整联调（SSE/轮询 +
 * 手机端确认）放到 P5，这里先用前端 mock 把 UI 流程跑通。
 *
 * 类型契约复用了 ./modules/user 里的 LoginParams/LoginResult/UserInfo，
 * 这里只重新导出一次避免重复定义。
 */

// 类型从 user.ts 复用 —— 这里只 export 类型，不重复定义
import type { ChangePasswordParams, LoginParams, LoginResult, RegisterParams, UserInfo } from '../user'

import { http } from '../../request'

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

// ── 账号密码登录 ────────────────────────────────────────────────────────

/**
 * 账号密码登录（已对接真后端）。
 * 入参 LoginParams{username,password} → 后端 /api/auth/login
 * 出参 LoginResult{accessToken,refreshToken}，请求层已自动解包。
 */
export function accountLogin(params: LoginParams): Promise<LoginResult> {
  return http.post<LoginResult>('/auth/login', params)
}

// ── 注册 ────────────────────────────────────────────────────────────

/**
 * 注册（已对接真后端）：/api/auth/register
 * 后端校验 username≥3 / password≥6 / 两次密码一致 / 用户名不重复，
 * 失败会以 ApiError(type='business', message) 形式抛出，登录页统一展示 e.message。
 */
export function register(params: RegisterParams): Promise<LoginResult> {
  return http.post<LoginResult>('/auth/register', params)
}

// ── 修改密码 / 退出登录 ─────────────────────────────────────────────

/** 修改密码（已对接真后端，需登录）：/api/auth/change-password */
export function changePassword(params: ChangePasswordParams): Promise<void> {
  return http.post<void>('/auth/change-password', params)
}

/** 退出登录（已对接真后端）：/api/auth/logout。双 token 方案下后端无状态，前端清 token 即可。 */
export function logout(): Promise<void> {
  return http.post<void>('/auth/logout')
}

/** 获取当前登录用户信息（已对接真后端，需登录）：/api/user/profile */
export function fetchProfile(): Promise<UserInfo> {
  return http.get<UserInfo>('/user/profile')
}

// ── 微信扫码登录（mock 演示，P5 接真后端 SSE/轮询） ───────────────────────────

/**
 * 扫码会话状态机（前端 mock 演示版）。
 * 真接口见后端 AuthController：POST /api/auth/scan 创建 →
 * GET /api/auth/scan/{qrId} 轮询 → POST /api/auth/scan/{qrId}/cancel 取消。
 * 这里用 setInterval 在前端 mock 一份，让 UI 能完整演示三态流转。
 */
const scanSessions = new Map<string, {
  status: ScanStatus
  createdAt: number
  expired: boolean
}>()

/**
 * 创建扫码会话（mock）。真实实现：http.post<ScanCreateResult>('/auth/scan')
 * 返回 { qrId, expiresIn, qrCodeDataUrl }，前端拿 qrId 渲染二维码 + 启动轮询。
 * 这里本地生成一个虚拟二维码数据，方便 UI 查看。
 */
export function createScanSession(): Promise<{ qrId: string, expiresIn: number, qrCodeDataUrl: string }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const qrId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      scanSessions.set(qrId, {
        status: 'waiting',
        createdAt: Date.now(),
        expired: false,
      })
      resolve({
        qrId,
        expiresIn: 120,
        qrCodeDataUrl: qrId,
      })
    }, 300)
  })
}

/**
 * 轮询扫码状态（mock 状态机）。
 * 真实实现：http.get<ScanState>(`/auth/scan/${qrId}`)
 */
export function pollScanSession(qrId: string): Promise<ScanState> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const session = scanSessions.get(qrId)
      if (!session || session.expired) {
        resolve({ status: 'expired', expiresIn: 0 })
        return
      }

      const elapsed = Math.floor((Date.now() - session.createdAt) / 1000)
      const remaining = Math.max(0, 120 - elapsed)

      if (elapsed > 120) {
        resolve({ status: 'expired', expiresIn: 0 })
        return
      }

      if (elapsed >= 8 && elapsed < 13)
        session.status = 'scanned'

      if (elapsed >= 13 && session.status !== 'confirmed')
        session.status = 'confirmed'

      if (session.status === 'confirmed') {
        resolve({
          status: 'confirmed',
          expiresIn: remaining,
          tokens: { accessToken: 'mock-at-scan', refreshToken: 'mock-rt-scan' },
          user: {
            id: 10086,
            username: 'laozhao',
            nickname: '老赵',
            roles: ['admin'],
          },
        })
        return
      }

      resolve({ status: session.status, expiresIn: remaining })
    }, 150)
  })
}

/**
 * 主动取消扫码（用户点「刷新二维码」时调用，mock 版）。
 * 真实实现：http.post(`/auth/scan/${qrId}/cancel`)
 */
export function cancelScanSession(qrId: string): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const session = scanSessions.get(qrId)
      if (session)
        session.expired = true
      resolve()
    }, 100)
  })
}
