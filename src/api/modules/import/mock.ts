/**
 * 银行流水导入 mock 数据源（解析 / 自动映射 / 去重 / 分类建议 / 提交）
 * ====================================================================
 * 与 account/category 同款拆分：本文件是「行 → 交易」的纯逻辑，不依赖 xlsx。
 * Excel → 行 的解析（依赖 xlsx 的适配层）放在 view 里，只把 RawRow[] 喂进来。
 *
 * 依赖方向单向：import/mock → transaction/mock（写入 / 取已有交易做去重与历史分类）
 *                            → category/mock（分类建议）
 * import 绝不反向被依赖，避免循环引用。
 *
 * 数据落地在内存（刷新重置）—— mock 预期行为，真接口联调时整体替换本文件。
 */

import type {
  AutoMapResult,
  ColumnMapping,
  CommitImportOptions,
  ImportPreview,
  ImportResult,
  ParsedImportTxn,
  RawCell,
  RawRow,
} from '@/types/import'
import type { Category, Transaction } from '@/types/transaction'
import { mockListCategories } from '@/api/modules/category/mock'
import {
  mockCreateTransaction,
  mockGetAllTransactions,
} from '@/api/modules/transaction/mock'

// ── 金额 / 日期归一化 ─────────────────────────────────

/**
 * 把任意金额表示转成「分」（正数绝对值）。
 * 支持：千分位逗号、货币符号(¥$￥)、空格、中文「元」、括号负、尾随正负号。
 * 金额为绝对值，方向由 type 列或默认支出决定（见 detectDirection）。
 */
export function parseAmount(raw: RawCell | undefined): number {
  if (raw == null)
    return 0
  if (typeof raw === 'number')
    return Math.round(Math.abs(raw) * 100)
  let s = raw.trim()
  if (!s)
    return 0
  // 括号表示负数：(1,234.50) 只是表达形式，金额取绝对值
  if (/^\(.*\)$/.test(s))
    s = s.slice(1, -1)
  // 去掉货币符号 / 空格 / 中文「元」/ 千分位逗号
  s = s.replace(/[¥$￥\s元]/g, '').replace(/,(?=\d)/g, '')
  // 尾部正负号（如 "1,234.00-"）只是方向表达，金额取绝对值
  s = s.replace(/[+\-]$/, '')
  const n = Number.parseFloat(s)
  if (Number.isNaN(n))
    return 0
  return Math.round(Math.abs(n) * 100)
}

/**
 * 把任意日期表示归一化为 YYYY-MM-DD。
 * 支持：2024/01/02、2024-01-02、2024.01.02、2024年01月02日、Excel 序列号(数字>30000)。
 */
export function parseDate(raw: RawCell | undefined): string {
  if (raw == null)
    return ''
  if (typeof raw === 'number') {
    // Excel 1900 日期系统：序列号转毫秒
    if (raw > 30000) {
      const ms = (raw - 25569) * 86400000
      const d = new Date(ms)
      if (!Number.isNaN(d.getTime()))
        return d.toISOString().slice(0, 10)
    }
    return ''
  }
  let s = raw.trim().replace(/[年月]/g, '-').replace(/日/g, '')
  s = s.replace(/\./g, '-')
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m) {
    const y = m[1]
    const mo = m[2]!.padStart(2, '0')
    const d = m[3]!.padStart(2, '0')
    return `${y}-${mo}-${d}`
  }
  const iso = s.match(/^\d{4}-\d{2}-\d{2}/)
  if (iso)
    return iso[0]
  return ''
}

/** 根据收支类型列判断方向；缺失时默认支出（银行流水多数场景） */
export function detectDirection(typeRaw: RawCell | undefined): 'income' | 'expense' {
  const t = typeof typeRaw === 'string' ? typeRaw.trim() : ''
  if (t) {
    if (/[收贷进]|存入|工资|代发|退款/.test(t))
      return 'income'
    if (/[支借出扣]|取出|消费|转出|还款/.test(t))
      return 'expense'
  }
  return 'expense'
}

// ── 列头自动识别 ─────────────────────────────────────

const KEYWORDS: Record<string, string[]> = {
  date: ['交易日期', '日期', '记账日期', '记账日', '交易时间', '日期时间'],
  amount: ['交易金额', '金额', '发生额', '收支金额', '交易额', '账面金额'],
  type: ['收支类型', '借贷标志', '交易类型', '收/支', '方向', '收支'],
  balance: ['余额', '账户余额', '当前余额'],
  counterparty: ['对方户名', '交易对手', '对方账号', '商户名称', '商户', '对方'],
  remark: ['摘要', '备注', '用途', '说明', '交易摘要', '附言', '摘要说明'],
}

const norm = (s: string) => s.replace(/\s/g, '').toLowerCase()

/**
 * 系统自动识别列映射：先匹配可选字段，再强制匹配必填的 date/amount。
 * 返回未被识别的源列（供「手动调整」时展示）。
 */
export function mockAutoDetectColumns(headers: string[]): AutoMapResult {
  const mapping: ColumnMapping = { date: '', amount: '' }
  const used = new Set<string>()
  const setField = (field: keyof ColumnMapping, h: string) => {
    mapping[field] = h
    used.add(norm(h))
  }

  // 可选字段
  ;(['type', 'balance', 'counterparty', 'remark'] as (keyof ColumnMapping)[]).forEach((field) => {
    for (const h of headers) {
      if (used.has(norm(h)))
        continue
      if (KEYWORDS[field]!.some(k => norm(h).includes(norm(k)))) {
        setField(field, h)
        break
      }
    }
  })

  // 必填字段：取第一个未占用且最像的列
  const takeFirstUnused = (prefer: string[]): string => {
    for (const h of headers) {
      if (used.has(norm(h)))
        continue
      if (prefer.some(p => norm(h).includes(norm(p))))
        return h
    }
    return ''
  }
  if (!mapping.date)
    setField('date', takeFirstUnused(KEYWORDS.date!))
  if (!mapping.amount)
    setField('amount', takeFirstUnused(KEYWORDS.amount!))

  const unmapped = headers.filter(h => !used.has(norm(h)))
  return { mapping, unmapped }
}

// ── 分类建议（冲突合并） ─────────────────────────────

/**
 * 分类缺失时建议最相似分类（US-008 冲突合并）：
 *  策略1：历史上相同备注用得最多的分类（最准）
 *  策略2：分类名作为关键词命中备注（最长匹配，如「外卖」优先「餐饮」）
 *  都没有返回 undefined，由 UI 兜底到同方向「其他」。
 */
export function mockSuggestCategory(
  remark: string,
  direction: 'income' | 'expense',
  existing?: readonly Transaction[],
): number | undefined {
  const cats: Category[] = mockListCategories().filter(c => c.type === direction)
  const note = remark.trim()
  if (!note)
    return undefined
  const lower = note.toLowerCase()

  if (existing && existing.length) {
    const score = new Map<number, number>()
    for (const t of existing) {
      if (t.type === direction && t.note && t.note === note)
        score.set(t.categoryId, (score.get(t.categoryId) ?? 0) + 1)
    }
    let best: number | undefined
    let bestN = 0
    for (const [cid, n] of score) {
      if (n > bestN) {
        bestN = n
        best = cid
      }
    }
    if (best)
      return best
  }

  let hit: number | undefined
  let hitLen = 0
  for (const c of cats) {
    if (c.name && lower.includes(c.name.toLowerCase()) && c.name.length > hitLen) {
      hit = c.id
      hitLen = c.name.length
    }
  }
  return hit
}

// ── 行 → 候选交易 ───────────────────────────────────

/** 把原始行按映射解析为候选交易；空日期 / 零金额行直接跳过。 */
export function mockParseRows(rows: RawRow[], mapping: ColumnMapping): ParsedImportTxn[] {
  const existing = mockGetAllTransactions()
  const result: ParsedImportTxn[] = []
  rows.forEach((row, index) => {
    const date = parseDate(row[mapping.date])
    const amount = parseAmount(row[mapping.amount])
    const typeRaw = mapping.type ? row[mapping.type] : undefined
    const direction = detectDirection(typeRaw)
    const counterparty = mapping.counterparty ? String(row[mapping.counterparty] ?? '').trim() : ''
    const remark = mapping.remark ? String(row[mapping.remark] ?? '').trim() : ''
    if (!date || amount <= 0)
      return
    const suggestedCategoryId = mockSuggestCategory(remark || counterparty, direction, existing)
    result.push({
      index,
      date,
      amount,
      direction,
      counterparty,
      remark,
      suggestedCategoryId,
      isDuplicate: false,
      raw: row,
    })
  })
  return result
}

// ── 重复检测 ─────────────────────────────────────────

/**
 * 标记「可能重复」：同 (金额|日期|备注) 的行，与本地已有交易重复 或 本批内重复。
 * 命中即标记 isDuplicate + duplicateGroupId（用于预览高亮与提交跳过）。
 */
export function mockDetectDuplicates(parsed: ParsedImportTxn[], bookId?: number): ParsedImportTxn[] {
  const existing = mockGetAllTransactions(bookId)
  const localKeys = new Set<string>()
  for (const t of existing) {
    if (t.type === 'transfer')
      continue
    localKeys.add(`${t.amount}|${t.transDate}|${t.note}`)
  }
  const batchCount = new Map<string, number>()
  for (const p of parsed) {
    const key = `${p.amount}|${p.date}|${p.remark}`
    batchCount.set(key, (batchCount.get(key) ?? 0) + 1)
  }
  return parsed.map((p) => {
    const key = `${p.amount}|${p.date}|${p.remark}`
    const dupLocal = localKeys.has(key)
    const dupBatch = (batchCount.get(key) ?? 0) > 1
    const isDup = dupLocal || dupBatch
    return isDup
      ? { ...p, isDuplicate: true, duplicateGroupId: key }
      : { ...p, isDuplicate: false }
  })
}

/** 组合：解析 + 去重 + 统计（预览一步到位） */
export function mockBuildPreview(rows: RawRow[], mapping: ColumnMapping, bookId?: number): ImportPreview {
  const parsed = mockParseRows(rows, mapping)
  const withDup = mockDetectDuplicates(parsed, bookId)
  const duplicateCount = withDup.filter(p => p.isDuplicate).length
  const conflictCount = withDup.filter(p => p.suggestedCategoryId == null).length
  return { mapping, rows: withDup, duplicateCount, conflictCount, total: withDup.length }
}

// ── 提交写入 ─────────────────────────────────────────

/**
 * 确认导入：按 options 写入 transaction mock。
 * keepDuplicates=false 时跳过被标记重复的行；分类优先级：覆盖 > 建议 > 兜底。
 */
export function mockCommitImport(parsed: ParsedImportTxn[], options: CommitImportOptions): ImportResult {
  let inserted = 0
  let skipped = 0
  for (const p of parsed) {
    if (!options.keepDuplicates && p.isDuplicate) {
      skipped++
      continue
    }
    const categoryId
      = options.categoryOverrides[p.index]
        ?? p.suggestedCategoryId
        ?? options.fallbackCategoryId
    mockCreateTransaction({
      bookId: options.bookId,
      type: p.direction,
      amount: p.amount,
      currency: 'CNY',
      accountId: options.accountId,
      toAccountId: null,
      categoryId,
      transDate: p.date,
      note: p.remark || p.counterparty,
      source: 'import',
      // 导入进来的流水先置「待确认」，用户在交易表复核确认后才转为已记
      status: 'pending',
    })
    inserted++
  }
  return { inserted, skipped, total: parsed.length }
}
