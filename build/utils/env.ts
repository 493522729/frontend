/**
 * 环境变量类型化封装
 *
 * Vite 的 loadEnv 返回的永远是 string，用起来到处 `=== 'true'` 很容易写错。
 * 这里统一转成真正的 boolean / number，配置文件里拿到的就是类型安全的对象。
 */

export interface ViteEnv {
  /** 站点标题，写进 index.html 的 <title> */
  VITE_APP_TITLE: string
  /** dev server 端口 */
  VITE_PORT: number
  /** 业务接口前缀，前端所有请求都以它开头 */
  VITE_BASE_API: string
  /** dev 代理目标（后端 Spring Boot 地址） */
  VITE_PROXY_TARGET: string
  /** 是否启用 Mock（后端还没起来时，前端可独立开发） */
  VITE_USE_MOCK: boolean
  /** 构建时是否生成体积分析 treemap */
  VITE_REPORT: boolean
}

/** 'true'/'1'/'yes'/'on' 都算真，其余一律假 —— 避免 'TRUE' 这种大小写坑 */
function toBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === '')
    return fallback
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase())
}

function toNumber(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/**
 * 把 loadEnv 的原始 Record<string, string> 收敛成 ViteEnv
 * @param raw `loadEnv(mode, cwd, '')` 的返回值（第三个参数传 '' 表示不加前缀过滤）
 */
export function wrapperEnv(raw: Record<string, string>): ViteEnv {
  return {
    VITE_APP_TITLE: raw.VITE_APP_TITLE || '老赵财务管理系统',
    VITE_PORT: toNumber(raw.VITE_PORT, 5173),
    VITE_BASE_API: raw.VITE_BASE_API || '/api',
    VITE_PROXY_TARGET: raw.VITE_PROXY_TARGET || 'http://localhost:8080',
    VITE_USE_MOCK: toBoolean(raw.VITE_USE_MOCK, false),
    VITE_REPORT: toBoolean(raw.VITE_REPORT, false),
  }
}
