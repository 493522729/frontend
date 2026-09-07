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
import type { BookType } from '@/enums/book'

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
}

/** 账本 + 统计摘要（切换器下拉里要显示笔数，帮用户认账本） */
export interface BookWithStats extends Book {
  /** 该账本下的交易笔数 */
  txnCount: number
  /** 该账本下的账户数 */
  accountCount: number
}
