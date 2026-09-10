/**
 * 错误「说人话」转换器
 * ====================================================================
 * 后端联调后接口会抛各种错（网络/超时/4xx/5xx），但用户不应该看到
 * `TypeError: Failed to fetch` 这种机器语言。这里把常见错误归一成
 * 标题 + 说明 + 错误码，给 toast / notification 用。
 *
 * 设计原则：
 *   - 不依赖具体 HTTP 库（axios/fetch 都行），只认 Error 的 message / name
 *   - 永远返回一个可读对象，绝不让上层再 try/catch 兜底
 *   - code 仅用于「一键复制错误码」类诉求（PRD 9.2），不影响展示
 */

export interface HumanizedError {
  /** 一句话标题（给 notification 的 title） */
  title: string
  /** 补充说明（给 notification 的 content） */
  detail?: string
  /** 机器码，便于排查 / 复制 */
  code: string
}

/** 把任意抛出的东西（Error / string / unknown）转成可读结构 */
export function humanizeError(err: unknown): HumanizedError {
  if (err instanceof Error) {
    const msg = err.message || ''
    // 网络层：断网 / 跨域被拦 / DNS 失败 / 超时，统一归为「网络异常」
    if (/network|failed to fetch|ECONN|离线|timeout|超时|abort/i.test(msg) || err.name === 'NetworkError') {
      return { title: '网络异常', detail: '请检查网络连接后重试', code: 'NETWORK' }
    }
    // 4xx：请求本身有问题（参数/权限/未登录）
    if (/40\d/.test(msg)) {
      return { title: '请求被拒绝', detail: msg, code: 'CLIENT' }
    }
    // 5xx：服务端炸了
    if (/50\d/.test(msg)) {
      return { title: '服务器开小差了', detail: '请稍后重试', code: 'SERVER' }
    }
    // 其余：带上原始信息，至少让人知道出了什么错
    return { title: '操作失败', detail: msg || undefined, code: 'UNKNOWN' }
  }
  if (typeof err === 'string') {
    return { title: '操作失败', detail: err, code: 'UNKNOWN' }
  }
  return { title: '操作失败', detail: undefined, code: 'UNKNOWN' }
}

/** 兜底取原始信息（复制错误码 / 日志用） */
export function errorMessage(err: unknown): string {
  if (err instanceof Error)
    return err.message
  return String(err)
}
