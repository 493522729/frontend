/**
 * 规则引擎 API 入口（US-010）
 * - 已切换真实后端：CRUD + 试算全部走 http，与后端 RuleController 对齐
 * - runRule / applyRulesToTransaction 是无副作用的本地纯函数（试算 UI 用），
 *   由 engine.ts 提供，前端零额外依赖
 */
import type { Rule, RuleExecution, RuleInput } from '@/types/rule'
import { http } from '@/api/request'

export function listRules(bookId?: number): Promise<Rule[]> {
  return http.get<Rule[]>('/rules', bookId == null ? undefined : { bookId })
}

export function createRule(input: RuleInput): Promise<Rule> {
  return http.post<Rule>('/rules', input)
}

export function updateRule(id: number, patch: Partial<RuleInput>): Promise<Rule> {
  return http.put<Rule>(`/rules/${id}`, patch)
}

export function deleteRule(id: number): Promise<void> {
  return http.delete<void>(`/rules/${id}`)
}

/** 试算：不写库，后端对样本交易跑各规则（复刻前端 runRule 语义），返回执行情况 */
export function previewRules(ruleId?: number, sampleTxnId?: number): Promise<RuleExecution[]> {
  const params: Record<string, number> = {}
  if (ruleId != null)
    params.ruleId = ruleId
  if (sampleTxnId != null)
    params.sampleTxnId = sampleTxnId
  return http.get<RuleExecution[]>('/rules/preview', params)
}

// 重导出纯函数，UI / store 可直接用（不需要走 http）
export { applyRulesToTransaction, runRule } from './engine'
