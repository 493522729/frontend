/**
 * 银行流水导入 API（已切真实后端）
 * ====================================================================
 * - buildPreview：把解析后的原始行 + 列映射发给后端，由 /api/import/preview
 *   完成「解析 + 去重 + 分类建议」（去重依赖真实账本交易，必须服务端做）。
 * - commitImport：把预览结果 + 选项发给 /api/import/commit 写入交易表。
 * - autoDetectColumns：列识别纯函数（列名匹配，无数据依赖），保留前端实现（见 engine.ts）。
 */
import type {
  AutoMapResult,
  ColumnMapping,
  CommitImportOptions,
  ImportPreview,
  ImportResult,
  ParsedImportTxn,
  RawRow,
} from '@/types/import'
import { http } from '@/api/request'
import { autoDetectColumns } from './engine'

export { autoDetectColumns }

/** 列自动识别（纯函数，前端完成） */
export function detectColumns(headers: string[]): AutoMapResult {
  return autoDetectColumns(headers)
}

/** 预览：解析 + 去重 + 分类建议（后端聚合，依赖真实账本交易） */
export function buildPreview(rows: RawRow[], mapping: ColumnMapping, bookId?: number): Promise<ImportPreview> {
  return http.post<ImportPreview>('/import/preview', { rows, mapping, bookId })
}

/** 确认导入：写入账本（默认置 pending 待复核） */
export function commitImport(parsed: ParsedImportTxn[], options: CommitImportOptions): Promise<ImportResult> {
  return http.post<ImportResult>('/import/commit', { parsed, options })
}
