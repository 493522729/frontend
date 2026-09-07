export * from './modules/auth'
export * from './modules/user'
/**
 * 请求层统一出口
 * ====================================================================
 * 业务页面统一从这里导入，不要直接从子文件 import，
 * 这样内部文件怎么重组都不影响调用方。
 *
 *   import { http, accountLogin, ApiError } from '@/api'
 */
export { http, setUnauthorizedHandler } from './request'
export * from './types'
