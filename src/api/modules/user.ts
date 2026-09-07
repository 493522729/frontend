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
  /** 角色，用于权限控制（P0 后续做菜单权限时会用到） */
  roles: string[]
}

/** 用户模块接口集合 */
export const userApi = {
  /**
   * 登录
   * 注意返回类型：Promise<LoginResult>，不是 Result<LoginResult>。
   * 因为 request 层已经把 Result 的 data 解包了。
   */
  login(params: LoginParams) {
    return http.post<LoginResult>('/auth/login', params)
  },

  /** 获取当前登录用户信息 */
  getProfile() {
    return http.get<UserInfo>('/user/profile')
  },
}
