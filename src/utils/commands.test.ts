import type { CommandItem } from './commands'
import { describe, expect, it } from 'vitest'
import { filterCommands, matchScore } from './commands'

function cmd(id: string, title: string, group = '跳转', keywords?: string[]): CommandItem {
  return { id, title, group, keywords, run: () => {} }
}

const QUICK_ENTRY = cmd('a:1', '记一笔', '操作', ['jyb', 'jizhang'])

const COMMANDS: CommandItem[] = [
  QUICK_ENTRY,
  cmd('go:/report', '报表中心', '跳转'),
  cmd('go:/budget', '预算', '跳转'),
  cmd('book:2', '切换到「旅行账本」', '账本'),
]

describe('matchScore', () => {
  it('空查询得 1（全量展示）', () => {
    expect(matchScore(QUICK_ENTRY, '')).toBe(1)
    expect(matchScore(QUICK_ENTRY, '   ')).toBe(1)
  })

  it('完全相等 > 前缀 > 包含 > 子序列', () => {
    expect(matchScore(cmd('x', '预算'), '预算')).toBe(110)
    expect(matchScore(cmd('x', '报表中心'), '报表')).toBe(100)
    expect(matchScore(cmd('x', '报表中心'), '中心')).toBe(80)
    expect(matchScore(cmd('x', 'report'), 'rp')).toBe(40)
  })

  it('关键词命中得 60（支持拼音首字母）', () => {
    expect(matchScore(QUICK_ENTRY, 'jyb')).toBe(60)
  })

  it('完全不匹配得 0', () => {
    expect(matchScore(cmd('x', '报表中心'), 'zzz')).toBe(0)
  })

  it('大小写不敏感', () => {
    expect(matchScore(cmd('x', 'Report'), 'rep')).toBe(100)
  })
})

describe('filterCommands', () => {
  it('空查询：全量返回，按分组顺序（操作→跳转→账本）排', () => {
    const ids = filterCommands(COMMANDS, '').map(c => c.id)
    expect(ids).toEqual(['a:1', 'go:/report', 'go:/budget', 'book:2'])
  })

  it('过滤掉不匹配的项', () => {
    const result = filterCommands(COMMANDS, '报表')
    expect(result.map(c => c.id)).toEqual(['go:/report'])
  })

  it('前缀命中排在包含命中之前', () => {
    const list = [cmd('1', '预算中心'), cmd('2', '预算')]
    expect(filterCommands(list, '预算').map(c => c.id)).toEqual(['2', '1'])
  })

  it('同分时保持原始顺序（稳定排序）', () => {
    const list = [cmd('1', '账户管理', '跳转'), cmd('2', '账本管理', '跳转')]
    expect(filterCommands(list, '管').map(c => c.id)).toEqual(['1', '2'])
  })

  it('子序列命中：rp → report', () => {
    const list = [cmd('go:/report', 'Report')]
    expect(filterCommands(list, 'rp').map(c => c.id)).toEqual(['go:/report'])
  })

  it('无匹配时返回空数组', () => {
    expect(filterCommands(COMMANDS, 'qqqq')).toEqual([])
  })
})
