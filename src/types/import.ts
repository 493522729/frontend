/**
 * 银行流水导入领域类型（前端单点真相）
 * ====================================================================
 * US-008 银行流水导入：上传 → 列映射 → 预览 → 确认导入。
 * 这里的类型只描述「导入流程」的形状，与后端联调时仅替换 api/modules/import 的实现。
 *
 * 关键解耦：Excel→行 的解析（依赖 xlsx）与 行→交易 的映射/去重/分类建议
 * （纯函数、可单测、不依赖 xlsx）分离。本文件描述的是后者所需的契约。
 */

/** 原始单元格：Excel 读出后每列的值（字符串或数字，未归一化） */
export type RawCell = string | number
/** 一行原始数据：列名 → 值 */
export type RawRow = Record<string, RawCell>

/** 业务字段 → 源表头列名 的映射（列映射步骤产出；? 为可选列） */
export interface ColumnMapping {
  /** 交易日期列 */
  date: string
  /** 金额列（正数=发生额，方向由 type 或正负决定） */
  amount: string
  /** 收支类型列（收/支/借贷），缺失时按金额方向或默认支出 */
  type?: string
  /** 余额列（可选，仅展示，不参与聚合） */
  balance?: string
  /** 对方户名 / 商户（可选） */
  counterparty?: string
  /** 摘要 / 备注（可选，用于去重与分类建议） */
  remark?: string
}

/** 解析后的单笔候选交易（导入预览态，尚未写入账本） */
export interface ParsedImportTxn {
  /** 在原始行中的序号（0-based） */
  index: number
  /** 归一化后的交易日期 YYYY-MM-DD */
  date: string
  /** 金额（分，正数） */
  amount: number
  direction: 'income' | 'expense'
  counterparty: string
  remark: string
  /** 冲突合并：建议分类 ID（分类缺失时给出最相似分类） */
  suggestedCategoryId?: number
  /**
   * 可能重复组标识：相同 (金额|日期|备注) 的行共享同一 key。
   * 存在即「可能重复」（与本地已有交易重复 或 本批内重复）。
   */
  duplicateGroupId?: string
  isDuplicate: boolean
  /** 原始行（用于回退 / 调试） */
  raw: RawRow
}

/** 列头自动识别结果 */
export interface AutoMapResult {
  mapping: ColumnMapping
  /** 未被识别的源列名 */
  unmapped: string[]
}

/** 预览结果（解析 + 去重 + 分类建议后的全貌） */
export interface ImportPreview {
  mapping: ColumnMapping
  rows: ParsedImportTxn[]
  duplicateCount: number
  conflictCount: number
  total: number
}

/** 确认导入选项 */
export interface CommitImportOptions {
  /** 导入目标账户 ID */
  accountId: number
  /** 导入目标账本 ID */
  bookId: number
  /** 是否保留被标记为「可能重复」的项；false = 跳过重复项 */
  keepDuplicates: boolean
  /** 逐笔分类覆盖：行 index → categoryId */
  categoryOverrides: Record<number, number>
  /** 无建议分类且未覆盖时的兜底分类 ID（通常同方向「其他」） */
  fallbackCategoryId: number
}

/** 导入结果统计 */
export interface ImportResult {
  inserted: number
  skipped: number
  total: number
}
