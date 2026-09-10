/**
 * 规则引擎 API 入口（US-010）
 * - mock 实现，仅包一层 simulateLatency + 暴露纯函数 runRule / applyRulesToTransaction
 * - 真实后端：把这层替换成 axios 调用即可
 */
import type { Rule, RuleExecution, RuleInput } from '@/types/rule'
import { simulateLatency } from '@/api/mock-latency'
import {
  applyRulesToTransaction,
  mockCreateRule,
  mockDeleteRule,
  mockListRules,
  mockPreviewRules,
  mockUpdateRule,
  runRule,
} from './mock'

const MOCK_LATENCY = { list: 80, save: 120 } as const

export function listRules(bookId?: number): Promise<Rule[]> {
  return simulateLatency(mockListRules(bookId), MOCK_LATENCY.list)
}

export function createRule(input: RuleInput): Promise<Rule> {
  return simulateLatency(mockCreateRule(input), MOCK_LATENCY.save)
}

export function updateRule(id: number, patch: Partial<RuleInput>): Promise<Rule> {
  return simulateLatency(mockUpdateRule(id, patch), MOCK_LATENCY.save)
}

export function deleteRule(id: number): Promise<void> {
  return simulateLatency(mockDeleteRule(id), MOCK_LATENCY.save)
}

/** 试算：不写库，仅返回各规则对样本交易的执行情况 */
export function previewRules(ruleId?: number, sampleTxnId?: number): Promise<RuleExecution[]> {
  return simulateLatency(mockPreviewRules(ruleId, sampleTxnId), MOCK_LATENCY.list)
}

// 重导出纯函数，UI / store 可直接用（不需要走 simulateLatency）
export { applyRulesToTransaction, runRule }
