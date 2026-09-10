/**
 * 规则 store（US-010）
 * - 内存镜像 mock 字典（与 transaction store 同款处理 —— 刷新重置）
 * - save / toggle / remove 走 api/index.ts（统一 simulateLatency 包裹）
 * - 视图层（views/rule）只调 action，不直接 import mock —— 这样将来切真接口零改动
 */
import type { Rule, RuleExecution, RuleInput } from '@/types/rule'
import { defineStore } from 'pinia'
import {
  createRule as apiCreate,
  deleteRule as apiDelete,
  updateRule as apiUpdate,
  listRules,
  previewRules,
} from '@/api/modules/rule'

export const useRuleStore = defineStore('rule', {
  state: () => ({
    list: [] as Rule[],
    loading: false,
    /** 最近一次试算结果（页面内「试算」按钮展示用） */
    lastPreview: [] as RuleExecution[],
  }),
  getters: {
    active: state => state.list.filter(r => r.active),
    /** 按账本过滤：返回「全账本规则 + 该账本专属规则」 */
    forBook: state => (bookId: number | null) =>
      state.list.filter(r => r.bookId == null || r.bookId === bookId),
  },
  actions: {
    async load(bookId?: number) {
      this.loading = true
      try {
        this.list = await listRules(bookId)
      }
      finally {
        this.loading = false
      }
    },
    async create(input: RuleInput): Promise<Rule> {
      const r = await apiCreate(input)
      this.list.unshift(r)
      return r
    },
    async update(id: number, patch: Partial<RuleInput>): Promise<Rule> {
      const r = await apiUpdate(id, patch)
      const idx = this.list.findIndex(x => x.id === id)
      if (idx >= 0)
        this.list[idx] = r
      return r
    },
    async toggleActive(rule: Rule): Promise<Rule> {
      return this.update(rule.id, { active: !rule.active })
    },
    async remove(id: number): Promise<void> {
      await apiDelete(id)
      this.list = this.list.filter(r => r.id !== id)
    },
    async preview(ruleId?: number, sampleTxnId?: number): Promise<RuleExecution[]> {
      const execs = await previewRules(ruleId, sampleTxnId)
      this.lastPreview = execs
      return execs
    },
  },
})
