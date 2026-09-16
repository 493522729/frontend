/**
 * 用户相关接口示例 —— 看明白这一个，其它接口照抄即可
 * ====================================================================
 * 这里演示「业务接口怎么写」的标准姿势：
 *   1. 先把「入参」「出参」定义成 interface（类型契约）
 *   2. 调用 http.get<T> / http.post<T>，把 T 填成你的出参类型
 *   3. 返回的就是 Promise<T>，页面 await 后直接拿到类型明确的数据
 *
 * 你不需要写任何拦截器 / try-catch / 解包 —— 那些脏活全在 request.ts 里。
 */
import { http } from '../request'

/** 登录入参 */
export interface LoginParams {
  username: string
  password: string
}

/** 注册入参（PRD §15.1：注册成功自动登录，跳到首页） */
export interface RegisterParams {
  username: string
  password: string
  /** 重复密码，前端校验、后端兜底 */
  confirmPassword: string
  nickname?: string
}

/** 登录成功返回（后端会把两个 token 一起给前端） */
export interface LoginResult {
  accessToken: string
  refreshToken: string
}

/** 当前登录用户的信息 */
export interface UserInfo {
  id: number
  username: string
  nickname: string
  avatar?: string
  /** 手机号，可选 */
  phone?: string
  /** 角色，用于权限控制（P0 后续做菜单权限时会用到） */
  roles: string[]
  /**
   * 是否已绑定微信（后端按 User.wxOpenid 是否为空算）。
   * 设置页据此显示「已绑定 + 解绑入口」还是「未绑定 + 出码入口」（MP-ADR-5）。
   * 老版本后端没有这个字段 → 视为未绑定。
   */
  wxBound?: boolean
}

/** 更新个人资料入参 */
export interface UpdateProfileParams {
  nickname?: string
  avatar?: string
  phone?: string
}

/** 修改密码入参 */
export interface ChangePasswordParams {
  oldPassword: string
  newPassword: string
}

/**
 * 用户模块接口集合
 * 注意：登录/注册/改密/登出已统一收敛到 @/api/modules/auth，
 * 这里只保留资料更新（profile 页在用），避免与 auth 模块重复。
 */
export const userApi = {
  /** 更新当前登录用户资料（昵称/头像/手机号） */
  updateProfile(params: UpdateProfileParams) {
    return http.put<UserInfo>('/user/profile', params)
  },
}
