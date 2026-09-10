/**
 * 银行流水导入 API（mock-first）
 * ====================================================================
 * 业务层只调用这里，不碰 mock 细节；真接口联调时整体替换本文件实现即可。
 * 延迟用 simulateLatency 包裹，让导入各步骤的 loading 状态在开发期可见。
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
import { MOCK_LATENCY, simulateLatency } from '@/api/mock-latency'
import {
  mockAutoDetectColumns,
  mockBuildPreview,
  mockCommitImport,
  mockDetectDuplicates,
  mockParseRows,
} from './mock'

/** 上传后系统自动识别列映射 */
export function autoDetectColumns(headers: string[]): Promise<AutoMapResult> {
  return simulateLatency(mockAutoDetectColumns(headers))
}

/** 按映射把原始行解析为候选交易 */
export function parseRows(rows: RawRow[], mapping: ColumnMapping): Promise<ParsedImportTxn[]> {
  return simulateLatency(mockParseRows(rows, mapping), MOCK_LATENCY.list)
}

/** 标记可能重复（与本地 / 本批内同 金额+日期+备注） */
export function detectDuplicates(parsed: ParsedImportTxn[], bookId?: number): Promise<ParsedImportTxn[]> {
  return simulateLatency(mockDetectDuplicates(parsed, bookId), MOCK_LATENCY.list)
}

/** 预览：解析 + 去重 + 分类建议一步到位 */
export function buildPreview(rows: RawRow[], mapping: ColumnMapping, bookId?: number): Promise<ImportPreview> {
  return simulateLatency(mockBuildPreview(rows, mapping, bookId), MOCK_LATENCY.aggregate)
}

/** 确认导入：写入账本 */
export function commitImport(parsed: ParsedImportTxn[], options: CommitImportOptions): Promise<ImportResult> {
  return simulateLatency(mockCommitImport(parsed, options), MOCK_LATENCY.write)
}
