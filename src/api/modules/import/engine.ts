/**
 * 银行流水导入 - 列识别纯函数（US-008）
 * ====================================================================
 * 从 mock.ts 抽出的无副作用算法，供「上传后自动识别列」使用，不依赖任何 mock 数据。
 * 行→交易解析、去重、分类建议已在后端 /api/import/preview 完成（依赖真实账本数据）。
 */
import type { AutoMapResult, ColumnMapping } from '@/types/import'

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
export function autoDetectColumns(headers: string[]): AutoMapResult {
  const mapping: ColumnMapping = { date: '', amount: '' }
  const used = new Set<string>()
  const setField = (field: keyof ColumnMapping, h: string) => {
    mapping[field] = h
    used.add(norm(h))
  }

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
