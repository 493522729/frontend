/**
 * mock 阶段的统一延迟模拟
 * ====================================================================
 * 目的不是「假装慢」，而是让 loading / 骨架屏 / 防抖这些真实存在的状态
 * 在开发期就能被看到和验证 —— 接口 0ms 返回时，骨架屏永远测不出来。
 *
 * 后端联调后整个文件连同各模块的 mock 一起删掉，调用方无需改动。
 */

/** 各接口按「真实世界的预期耗时」分档，让 loading 状态有区分度 */
export const MOCK_LATENCY = {
  /** 字典、详情类小查询 */
  fast: 60,
  /** 列表查询（带筛选/分页） */
  list: 120,
  /** 聚合统计（仪表盘这类要扫全量的） */
  aggregate: 220,
  /** 写操作（保存/删除），比读慢一点，让提交中的 loading 可见 */
  write: 180,
} as const

/** 延迟后 resolve，保持与真接口一致的 Promise 形态 */
export function simulateLatency<T>(value: T, ms: number = MOCK_LATENCY.fast): Promise<T> {
  return new Promise(resolve => setTimeout(resolve, ms, value))
}
