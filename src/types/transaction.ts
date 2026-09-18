/**
 * 交易领域类型契约（前端单点真相）
 * ====================================================================
 * 整个前端任何地方提到「交易」，都引用这里的形状，避免到处硬编码字符串字段。
 * 后端联调时若字段调整，只动这里。
 *
 * 字段枚举的字面量值来自 src/enums/，这里只定义「结构形状」；这样不会与单点真相源脱节。
 */
import type { AccountType } from '@/enums/account'
import type { TransactionSource, TransactionType } from '@/enums/transaction'
import type { Tag } from '@/types/tag'

/** 交易入账状态：待确认（导入/系统生成待用户复核）/ 已记（已确认入账） */
export type TransactionStatus = 'pending' | 'confirmed'

/** 单笔交易（前端视角） */
export interface Transaction {
  id: number
  /** 所属账本 */
  bookId: number
  /** 类型 */
  type: TransactionType
  /** 金额（分，Long）—— 永不允许 double */
  amount: number
  /** 币种（v1 仅 CNY） */
  currency: 'CNY'
  /** 账户 ID */
  accountId: number
  /** 转账场景下的目标账户；非转账时为 null */
  toAccountId: number | null
  /** 分类 ID */
  categoryId: number
  /** 交易日期（YYYY-MM-DD） */
  transDate: string
  /** 备注 */
  note: string
  /** 来源 */
  source: TransactionSource
  /** 入账状态；缺省视为已记（存量/手动数据无需复核） */
  status?: TransactionStatus
  /** 关联标签 id 列表（前端引擎 / 批量打标维护，后端以真实标签关联存储） */
  tagIds?: number[]
  /** 关联标签明细（列表响应携带，直接渲染用，避免再查字典） */
  tags?: Tag[]
  /** 创建时间戳（ms） */
  createdAt: number
  /** 更新时间戳（ms） */
  updatedAt: number
  /**
   * 记录者 uid（= 后端 Transaction.userId，语义见 共享账本技术设计.md §3.3）。
   * 个人账本恒为本人；共享账本下用于展示「谁记的」。
   */
  recordedBy?: number | null
  /** 记录者昵称/用户名（后端回填，仅共享账本需要展示） */
  recordedByUsername?: string | null
}

/** 交易列表查询参数 */
export interface TransactionListParams {
  bookId?: number
  /** ISO 日期或 YYYY-MM-DD */
  startDate?: string
  endDate?: string
  categoryIds?: number[]
  accountIds?: number[]
  types?: TransactionType[]
  /** 标签筛选：任一命中（与 categoryIds 同样的传参语义） */
  tagIds?: number[]
  /** 模糊匹配备注 / 分类名 */
  keyword?: string
  /** 入账状态筛选：pending=待确认 / confirmed=已记；不传=全部 */
  status?: 'pending' | 'confirmed'
  /** 页码（1-based） */
  page: number
  /** 每页条数 */
  pageSize: number
}

/** 交易列表响应 */
export interface TransactionListResult {
  list: Transaction[]
  total: number
}

/** 账户（前端视角） */
export interface Account {
  id: number
  bookId: number
  name: string
  type: AccountType
  icon: string
  /** 期初余额（分） */
  initBalance: number
  /** 信用额度（分），仅 credit 类型 */
  creditLimit: number
}

/**
 * 账户 + 派生余额（账户管理页 / 记账弹层用）
 *
 * 余额是「期初 + 流水」现算的派生值（口径见 types/stats.ts 的 AccountBalance），
 * 不落存储 —— 改一笔流水余额立刻跟着变，不存在账户表与流水表对不上账的可能。
 */
export interface AccountWithBalance extends Account {
  /** 当前余额（分，信用卡为负 = 欠款） */
  balance: number
  income: number
  expense: number
  transferIn: number
  transferOut: number
  /** 参与的流水笔数 */
  txnCount: number
}

/** 分类（前端视角） */
export interface Category {
  id: number
  /** 'income' / 'expense'；转账不挂分类 */
  type: 'income' | 'expense'
  name: string
  icon: string
  color: string
  parentId: number | null
  /** 排序权重：同 type+parentId 组内升序 */
  sortOrder?: number
}
