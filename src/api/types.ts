/**
 * 请求层「词汇表」—— 所有接口都讲同一种语言
 * ====================================================================
 * 这是整个请求层的类型地基。把「后端返回长什么样」「出错有哪几种」
 * 集中在这里定义一次，业务代码（modules/*.ts）和拦截器都引用它，
 * 避免到处硬编码字符串/数字，改协议只动这一处。
 */

/**
 * 后端统一响应体（Spring Boot 后台常见 Result<T> 结构）
 * --------------------------------------------------------------------
 * 约定：无论成功失败，HTTP 状态都是 200，真正的成败看 `code`：
 *   { "code": 200, "message": "ok",        "data": { ... } }  // 成功
 *   { "code": 5001, "message": "余额不足", "data": null }      // 业务失败
 *
 * 如果你的后端用 `code: 0` 表示成功，把下面 BUSINESS_CODE.SUCCESS 改成 0 即可。
 */
export interface Result<T = unknown> {
  /** 业务状态码，200 表示成功（见 BUSINESS_CODE） */
  code: number
  /** 提示信息，成功时通常是 "ok"，失败时是可展示的中文文案 */
  message: string
  /** 真正的数据负载；请求层会把这一层「解包」后直接返回给调用方 */
  data: T
}

/**
 * 业务状态码（和后端商量好的字典）
 * --------------------------------------------------------------------
 * `as const` 让 TS 把这些值当成「字面量类型」而不是普通 number，
 * 这样 `code === BUSINESS_CODE.SUCCESS` 能被精确推断，编辑器还有补全。
 */
export const BUSINESS_CODE = {
  /** 成功 */
  SUCCESS: 200,
  /** token 过期 / 无效（前端据此触发刷新或跳登录） */
  TOKEN_EXPIRED: 40101,
  /** 未登录（没有 token） */
  UNAUTHORIZED: 40100,
  /** 无权限访问该资源 */
  FORBIDDEN: 40300,
  /** 入参校验失败 */
  PARAM_INVALID: 40000,
} as const

/**
 * 错误的三大类 —— 这是整个请求层最重要的设计决策
 * --------------------------------------------------------------------
 * 一次请求失败可能源于完全不同的原因，处理方式也完全不同。
 * 把它们区分开，业务页面才能「对症下药」：
 *
 *   network  —— 断网 / DNS 失败 / 请求超时（axios 根本没收到响应）
 *   http     —— 收到了响应，但 HTTP 状态码不是 2xx（如 404、500、502）
 *   business —— HTTP 200 但业务 code 非成功（后端明确说「这单子不合法」）
 */
export type ApiErrorType = 'network' | 'http' | 'business'

/**
 * 统一的错误类
 * --------------------------------------------------------------------
 * 拦截器把上面三类原始错误，全部「翻译」成 ApiError 再往外抛。
 * 业务页面 `catch` 到的永远是这个类型，用 `err.type` 就能判断怎么处理。
 */
export class ApiError extends Error {
  /** 错误归类，见 ApiErrorType */
  readonly type: ApiErrorType
  /** 状态码：network 时为 undefined；http 时是 HTTP 状态码；business 时是业务 code */
  readonly code?: number
  /** 原始响应里的 data（有的业务错误会附带详情） */
  readonly data?: unknown

  constructor(
    type: ApiErrorType,
    message: string,
    code?: number,
    data?: unknown,
  ) {
    // 调用父类 Error 的构造函数，把 message 存进去
    super(message)
    // 设置自定义字段
    this.type = type
    this.code = code
    this.data = data
    // 让 ApiError 的 instanceof 判断在编译后的 JS 里依然准确（TS 编译成 ES 类时偶尔会丢原型链）
    this.name = 'ApiError'
    Object.setPrototypeOf(this, ApiError.prototype)
  }
}
