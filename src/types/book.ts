/**
 * 账本领域类型契约
 * ====================================================================
 * 对应 PRD 10.x 数据模型 Book(id, name, type, currency, icon, is_default)。
 *
 * 隔离边界（US-005 的核心语义）：
 *   Book 是**数据隔离的最小单位** —— 交易、账户都挂在账本下，切账本
 *   等于换一整套数据。分类（Category）**不属于账本**，全局共享：
 *   「餐饮」在日常账本和装修账本里是同一个分类，否则跨账本统计无从谈起。
 */
import type { BookScope, BookType, MemberRole } from '@/enums/book'
// 再导出 MemberRole：bookMember 接口、BookMemberDrawer 都从 @/types/book 取它
export type { MemberRole }

/** 账本（前端视角） */
export interface Book {
  id: number
  name: string
  type: BookType
  /** 记账本位币（v1 仅 CNY，字段保留以便将来做多币种） */
  currency: 'CNY'
  /** emoji 图标；为空时由 type 推导 */
  icon: string
  /** 是否默认账本（登录后进入的那一个，全局唯一） */
  isDefault: boolean
  /**
   * 归属范围：PERSONAL 个人 / SHARED 共享。
   * 与 type（用途分类）正交，新增独立字段（设计文档 §2）。后端恒返回。
   */
  scope?: BookScope
}

/** 账本 + 统计摘要（切换器下拉里要显示笔数，帮用户认账本） */
export interface BookWithStats extends Book {
  /** 该账本下的交易笔数 */
  txnCount: number
  /** 该账本下的账户数 */
  accountCount: number
  /** 成员数：共享账本显示「N 位成员」（个人账本恒 1，前端不展示） */
  memberCount?: number
}

/** 共享账本成员（= 后端 BookMemberDTO，字段名对齐，改后端须同步） */
export interface BookMember {
  /** 用户 id（remove / changeRole / transfer 的目标标识） */
  userId: number
  /** 登录用户名（展示降级用） */
  username: string
  /** 昵称：有则显示，无则回落 username */
  nickname: string
  /** 头像 url，可能为空 */
  avatar: string | null
  /** 角色 */
  role: MemberRole
  /** 成员状态：ACTIVE / PENDING */
  status: string
  /** 加入时间戳（ms） */
  joinedAt: number
  /** 是否为当前登录用户（后端按 uid 标记，键名即 isMe） */
  isMe: boolean
}
