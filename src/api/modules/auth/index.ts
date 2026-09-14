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

// ── 微信扫码登录（条件化：默认前端 mock 兜底，开关开启走真实后端） ─────────────
//
// 开关：VITE_WECHAT_SCAN_ENABLED === 'true' 时，前端调真实后端
//   POST /api/auth/scan              → 创建会话（后端返回真实小程序码 dataURL 或 mock 占位）
//   GET  /api/auth/scan/{qrId}       → 轮询状态
//   POST /api/auth/scan/{qrId}/cancel→ 取消
// 小程序侧（miniprogram/）负责调 /{qrId}/scanned 与 /{qrId}/confirm 推进状态。
//
// 说明：mock 实现保留不删除（用户明确要求），仅作为未配置微信时的兜底分支。

/** 是否走真实微信扫码链路（由 .env 的 VITE_WECHAT_SCAN_ENABLED 控制） */
export const WECHAT_SCAN_ENABLED = import.meta.env.VITE_WECHAT_SCAN_ENABLED === 'true'

/** 创建扫码会话的返回结构（与后端 ScanCreateResult 对齐） */
export interface ScanCreateResult {
  qrId: string
  expiresIn: number
  qrCodeDataUrl: string
}

// ── 前端 mock 实现（兜底，不删除） ──────────────────────────────────────

const mockSessions = new Map<string, {
  status: ScanStatus
  createdAt: number
  expired: boolean
}>()

export function createScanSessionMock(): Promise<ScanCreateResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const qrId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      mockSessions.set(qrId, {
        status: 'waiting',
        createdAt: Date.now(),
        expired: false,
      })
      resolve({ qrId, expiresIn: 120, qrCodeDataUrl: qrId })
    }, 300)
  })
}

export function pollScanSessionMock(qrId: string): Promise<ScanState> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const session = mockSessions.get(qrId)
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

export function cancelScanSessionMock(qrId: string): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const session = mockSessions.get(qrId)
      if (session)
        session.expired = true
      resolve()
    }, 100)
  })
}

// ── 真实后端实现（VITE_WECHAT_SCAN_ENABLED=true 时） ───────────────────────

export function createScanSessionReal(): Promise<ScanCreateResult> {
  return http.post<ScanCreateResult>('/auth/scan')
}

export function pollScanSessionReal(qrId: string): Promise<ScanState> {
  return http.get<ScanState>(`/auth/scan/${qrId}`)
}

export function cancelScanSessionReal(qrId: string): Promise<void> {
  return http.post<void>(`/auth/scan/${qrId}/cancel`)
}

// ── 统一导出：根据开关分流 ───────────────────────────────────────────────

export function createScanSession(): Promise<ScanCreateResult> {
  return WECHAT_SCAN_ENABLED ? createScanSessionReal() : createScanSessionMock()
}

export function pollScanSession(qrId: string): Promise<ScanState> {
  return WECHAT_SCAN_ENABLED ? pollScanSessionReal(qrId) : pollScanSessionMock(qrId)
}

export function cancelScanSession(qrId: string): Promise<void> {
  return WECHAT_SCAN_ENABLED ? cancelScanSessionReal(qrId) : cancelScanSessionMock(qrId)
}
