/**
 * 勋章相关类型（与后端 Dtos.* 对齐）
 * - BadgeDef   勋章定义
 * - UserBadge  用户持有的勋章（带展示信息，服务端回填）
 * - BadgeStat  单枚勋章统计
 */

/** 勋章定义 */
export interface BadgeDef {
  id: number
  name: string
  category?: string
  description?: string
  /** 图标缺失时的兜底渐变："135deg,#FFD56B,#FF9A3D" */
  gradient?: string
  /** 达成条件类型：MANUAL / TXN_COUNT / REGISTER_DAYS / STREAK */
  conditionType?: string
  threshold?: number
  /** 图标静态 URL（/uploads/badges/xxx.png） */
  iconUrl?: string
  sortOrder?: number
  enabled?: boolean
  code?: string
  createdAt?: number
  updatedAt?: number
}

/** 用户持有的勋章（带勋章展示信息） */
export interface UserBadge {
  id: number
  badgeId: number
  name: string
  category?: string
  description?: string
  iconUrl?: string
  gradient?: string
  source?: string
  grantedAt?: number
  grantedBy?: number
}

/** 单枚勋章统计：持有人数 */
export interface BadgeStat {
  badgeId: number
  name: string
  category?: string
  iconUrl?: string
  earnedCount: number
}
