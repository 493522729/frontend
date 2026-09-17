/**
 * 规则引擎单测（US-010）
 * ====================================================================
 * 守 4 个核心口径：
 *   1) 单条条件：contains/equals/gt/startsWith 行为正确
 *   2) 单条动作：setCategory/appendNote/addTag 应用正确，notify 不改 txn
 *   3) 批量合并：多规则链式 + 后者覆盖前者字段
 *   4) 启用开关：active=false 的规则被跳过
 *   5) 字段语义：counterparty 复用 note
 */
import type { Transaction } from '@/types/transaction'
import { describe, expect, it } from 'vitest'
import {
  applyRulesToTransaction,
  mockCreateRule,
  mockDeleteRule,
  mockListRules,
  runRule,
} from './mock'

function makeTxn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 1,
    bookId: 1,
    type: 'expense',
    amount: 1000,
    currency: 'CNY',
    accountId: 1,
    toAccountId: null,
    categoryId: 0,
    transDate: '2026-01-01',
    note: '',
    source: 'manual',
    status: 'confirmed',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

describe('runRule — 单条规则评估', () => {
  it('contains 条件：note 命中关键词即匹配', () => {
    const rule = {
      id: 1,
      bookId: null,
      name: '',
      conditions: [{ field: 'note' as const, op: 'contains' as const, value: '星巴克' }],
      actions: [],
      trigger: 'onSave' as const,
      active: true,
      createdAt: 0,
      updatedAt: 0,
    }
    expect(runRule(rule, makeTxn({ note: '星巴克 大杯拿铁' })).matched).toBe(true)
    expect(runRule(rule, makeTxn({ note: '奶茶' })).matched).toBe(false)
  })

  it('equals 条件：金额相等才算匹配（分单位）', () => {
    const rule = {
      id: 1,
      bookId: null,
      name: '',
      conditions: [{ field: 'amount' as const, op: 'equals' as const, value: 1000 }],
      actions: [],
      trigger: 'onSave' as const,
      active: true,
      createdAt: 0,
      updatedAt: 0,
    }
    expect(runRule(rule, makeTxn({ amount: 1000 })).matched).toBe(true)
    expect(runRule(rule, makeTxn({ amount: 1001 })).matched).toBe(false)
  })

  it('gt 条件：金额大于阈值匹配', () => {
    const rule = {
      id: 1,
      bookId: null,
      name: '',
      conditions: [{ field: 'amount' as const, op: 'gt' as const, value: 5000 }],
      actions: [],
      trigger: 'onSave' as const,
      active: true,
      createdAt: 0,
      updatedAt: 0,
    }
    expect(runRule(rule, makeTxn({ amount: 6000 })).matched).toBe(true)
    expect(runRule(rule, makeTxn({ amount: 5000 })).matched).toBe(false)
  })

  it('startsWith 条件：note 以指定前缀开头才匹配', () => {
    const rule = {
      id: 1,
      bookId: null,
      name: '',
      conditions: [{ field: 'note' as const, op: 'startsWith' as const, value: '星' }],
      actions: [],
      trigger: 'onSave' as const,
      active: true,
      createdAt: 0,
      updatedAt: 0,
    }
    expect(runRule(rule, makeTxn({ note: '星巴克' })).matched).toBe(true)
    expect(runRule(rule, makeTxn({ note: '吉星高照' })).matched).toBe(false)
  })

  it('aND 组合：所有条件都满足才匹配', () => {
    const rule = {
      id: 1,
      bookId: null,
      name: '',
      conditions: [
        { field: 'type' as const, op: 'equals' as const, value: 'expense' },
        { field: 'amount' as const, op: 'gt' as const, value: 1000 },
      ],
      actions: [],
      trigger: 'onSave' as const,
      active: true,
      createdAt: 0,
      updatedAt: 0,
    }
    expect(runRule(rule, makeTxn({ type: 'expense', amount: 2000 })).matched).toBe(true)
    expect(runRule(rule, makeTxn({ type: 'income', amount: 2000 })).matched).toBe(false)
    expect(runRule(rule, makeTxn({ type: 'expense', amount: 500 })).matched).toBe(false)
  })

  it('match=any（OR）：任一条件满足即匹配，缺省仍为 AND', () => {
    const anyRule = {
      id: 1,
      bookId: null,
      name: '',
      match: 'any' as const,
      conditions: [
        { field: 'note' as const, op: 'contains' as const, value: '星巴克' },
        { field: 'note' as const, op: 'contains' as const, value: '瑞幸' },
        { field: 'note' as const, op: 'contains' as const, value: '奶茶' },
      ],
      actions: [],
      trigger: 'onSave' as const,
      active: true,
      createdAt: 0,
      updatedAt: 0,
    }
    expect(runRule(anyRule, makeTxn({ note: '瑞幸' })).matched).toBe(true)
    expect(runRule(anyRule, makeTxn({ note: '一点点奶茶' })).matched).toBe(true)
    expect(runRule(anyRule, makeTxn({ note: '便利店' })).matched).toBe(false)
    // 无 match 字段（历史数据）按 AND：只满足 1/3 不命中
    const legacyRule = { ...anyRule, match: undefined }
    expect(runRule(legacyRule, makeTxn({ note: '瑞幸' })).matched).toBe(false)
  })

  it('不匹配时不应用动作，modifiedTxn 等于原交易', () => {
    const rule = {
      id: 1,
      bookId: null,
      name: '',
      conditions: [{ field: 'note' as const, op: 'contains' as const, value: '不存在' }],
      actions: [{ type: 'setCategory' as const, payload: { categoryId: 99 } }],
      trigger: 'onSave' as const,
      active: true,
      createdAt: 0,
      updatedAt: 0,
    }
    const txn = makeTxn({ note: '正常' })
    const exec = runRule(rule, txn)
    expect(exec.matched).toBe(false)
    expect(exec.appliedActions).toEqual([])
    expect(exec.modifiedTxn).toEqual(txn)
  })

  it('counterparty 字段复用 note，避免迁移期字段空缺', () => {
    const rule = {
      id: 1,
      bookId: null,
      name: '',
      conditions: [{ field: 'counterparty' as const, op: 'contains' as const, value: '美团' }],
      actions: [],
      trigger: 'onSave' as const,
      active: true,
      createdAt: 0,
      updatedAt: 0,
    }
    expect(runRule(rule, makeTxn({ note: '美团外卖' })).matched).toBe(true)
  })
})

describe('runRule — 动作应用', () => {
  it('setCategory：把分类 ID 写到 modifiedTxn.categoryId', () => {
    const rule = {
      id: 1,
      bookId: null,
      name: '',
      conditions: [{ field: 'note' as const, op: 'contains' as const, value: '咖啡' }],
      actions: [{ type: 'setCategory' as const, payload: { categoryId: 6 } }],
      trigger: 'onSave' as const,
      active: true,
      createdAt: 0,
      updatedAt: 0,
    }
    const exec = runRule(rule, makeTxn({ note: '瑞幸咖啡' }))
    expect(exec.modifiedTxn.categoryId).toBe(6)
  })

  it('appendNote：在备注末尾追加（空格分隔）', () => {
    const rule = {
      id: 1,
      bookId: null,
      name: '',
      conditions: [{ field: 'note' as const, op: 'contains' as const, value: '午饭' }],
      actions: [{ type: 'appendNote' as const, payload: { suffix: '客户请客' } }],
      trigger: 'onSave' as const,
      active: true,
      createdAt: 0,
      updatedAt: 0,
    }
    const exec = runRule(rule, makeTxn({ note: '午饭' }))
    expect(exec.modifiedTxn.note).toBe('午饭 客户请客')
  })

  it('addTag：在备注前加 #tag，已存在则不重复加', () => {
    const rule = {
      id: 1,
      bookId: null,
      name: '',
      conditions: [{ field: 'note' as const, op: 'contains' as const, value: '美团' }],
      actions: [{ type: 'addTag' as const, payload: { tag: '外卖' } }],
      trigger: 'onSave' as const,
      active: true,
      createdAt: 0,
      updatedAt: 0,
    }
    // 第一次加
    const e1 = runRule(rule, makeTxn({ note: '美团订单' }))
    expect(e1.modifiedTxn.note.startsWith('#外卖')).toBe(true)
    // 已有 #外卖，不重复
    const e2 = runRule(rule, makeTxn({ note: '#外卖 美团订单' }))
    expect(e2.modifiedTxn.note.split('#外卖').length - 1).toBe(1)
  })

  it('notify 动作不改 txn 字段，仅出现在 appliedActions 里', () => {
    const rule = {
      id: 1,
      bookId: null,
      name: '',
      conditions: [{ field: 'amount' as const, op: 'gt' as const, value: 1000 }],
      actions: [{ type: 'notify' as const, payload: { message: '大额支出' } }],
      trigger: 'onSave' as const,
      active: true,
      createdAt: 0,
      updatedAt: 0,
    }
    const txn = makeTxn({ amount: 2000 })
    const exec = runRule(rule, txn)
    expect(exec.matched).toBe(true)
    expect(exec.modifiedTxn).toEqual(txn)
    expect(exec.appliedActions[0]?.type).toBe('notify')
  })
})

describe('applyRulesToTransaction — 批量合并', () => {
  // 默认 _rules 里有 3 条 seed 规则，会干扰本 describe 的断言。
  // 这里所有 applyRulesToTransaction 都传「只跑测试规则」的数组，避免被 seed 串台。
  it('按顺序应用多个规则：后者的 setCategory 覆盖前者', () => {
    const r1 = mockCreateRule({
      bookId: null,
      name: 'r1',
      conditions: [{ field: 'note', op: 'contains', value: '星巴克' }],
      actions: [{ type: 'setCategory', payload: { categoryId: 1 } }],
      trigger: 'onSave',
      active: true,
    })
    const r2 = mockCreateRule({
      bookId: null,
      name: 'r2',
      conditions: [{ field: 'note', op: 'contains', value: '星巴克' }],
      actions: [{ type: 'setCategory', payload: { categoryId: 2 } }],
      trigger: 'onSave',
      active: true,
    })
    const { txn, executions } = applyRulesToTransaction(makeTxn({ note: '星巴克' }), [r1, r2])
    expect(txn.categoryId).toBe(2)
    expect(executions.find(e => e.ruleId === r1.id)?.matched).toBe(true)
    expect(executions.find(e => e.ruleId === r2.id)?.matched).toBe(true)
  })

  it('appendNote 不冲突：多条都追加', () => {
    const r1 = mockCreateRule({
      bookId: null,
      name: 'a',
      conditions: [{ field: 'note', op: 'contains', value: '星巴克' }],
      actions: [{ type: 'appendNote', payload: { suffix: 'A' } }],
      trigger: 'onSave',
      active: true,
    })
    const r2 = mockCreateRule({
      bookId: null,
      name: 'b',
      conditions: [{ field: 'note', op: 'contains', value: '星巴克' }],
      actions: [{ type: 'appendNote', payload: { suffix: 'B' } }],
      trigger: 'onSave',
      active: true,
    })
    const { txn } = applyRulesToTransaction(makeTxn({ note: '星巴克' }), [r1, r2])
    expect(txn.note).toContain('A')
    expect(txn.note).toContain('B')
  })

  it('active=false 的规则被跳过', () => {
    const inactive = mockCreateRule({
      bookId: null,
      name: 'inactive',
      conditions: [{ field: 'note', op: 'contains', value: '星巴克' }],
      actions: [{ type: 'setCategory', payload: { categoryId: 99 } }],
      trigger: 'onSave',
      active: false,
    })
    const { txn, executions } = applyRulesToTransaction(makeTxn({ note: '星巴克' }), [inactive])
    const inactiveExec = executions.find(e => e.ruleId === inactive.id)
    expect(inactiveExec).toBeUndefined()
    expect(txn.categoryId).not.toBe(99)
  })
})

describe('mockCreateRule / mockDeleteRule', () => {
  it('创建后可在列表查到，删除后查不到', () => {
    const before = mockListRules().length
    const r = mockCreateRule({
      bookId: 1,
      name: '临时',
      conditions: [],
      actions: [],
      trigger: 'onSave',
      active: true,
    })
    expect(mockListRules().length).toBe(before + 1)
    mockDeleteRule(r.id)
    expect(mockListRules().find(x => x.id === r.id)).toBeUndefined()
  })

  it('bookId 过滤：只返回该账本 + 全账本规则', () => {
    const before = mockListRules(2).length
    mockCreateRule({
      bookId: 2,
      name: 'book2 专用',
      conditions: [],
      actions: [],
      trigger: 'onSave',
      active: true,
    })
    mockCreateRule({
      bookId: 3,
      name: 'book3 专用',
      conditions: [],
      actions: [],
      trigger: 'onSave',
      active: true,
    })
    expect(mockListRules(2).length).toBe(before + 1) // book2 + 全账本
  })
})
