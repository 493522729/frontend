import { describe, expect, it } from 'vitest'
import { buildCsv, escapeCsvCell, safeFilePart } from './csv'

describe('escapeCsvCell', () => {
  it('null / undefined 导出空串，不写 "null" 污染表格', () => {
    expect(escapeCsvCell(null)).toBe('')
    expect(escapeCsvCell(undefined)).toBe('')
  })

  it('普通值原样返回，不加多余引号', () => {
    expect(escapeCsvCell('午饭')).toBe('午饭')
    expect(escapeCsvCell(1234)).toBe('1234')
    expect(escapeCsvCell(0)).toBe('0')
  })

  it('含逗号时整段用双引号包裹', () => {
    expect(escapeCsvCell('餐饮,外卖')).toBe('"餐饮,外卖"')
  })

  it('含双引号时包裹且内部引号翻倍（RFC 4180）', () => {
    expect(escapeCsvCell('他说"好"')).toBe('"他说""好"""')
  })

  it('含换行 / 回车时包裹，避免把一行拆成两行', () => {
    expect(escapeCsvCell('第一行\n第二行')).toBe('"第一行\n第二行"')
    expect(escapeCsvCell('a\r\nb')).toBe('"a\r\nb"')
  })
})

describe('buildCsv', () => {
  it('以 BOM 开头，否则 Excel 打开中文表头乱码', () => {
    expect(buildCsv([['日期']]).startsWith('\uFEFF')).toBe(true)
  })

  it('行分隔用 \\r\\n（Excel 对纯 \\n 兼容不稳定）', () => {
    const csv = buildCsv([['a', 'b'], ['1', '2']])
    expect(csv).toBe('\uFEFFa,b\r\n1,2')
  })

  it('表头 + 数据都能正确转义', () => {
    const csv = buildCsv([['备注'], ['含,逗号']])
    expect(csv).toBe('\uFEFF备注\r\n"含,逗号"')
  })
})

describe('safeFilePart', () => {
  it('冒号 / 斜杠 / 空格统一换成 -，避免非法字符与粘连', () => {
    // 空格若直接删掉会挤成 '2026-09-1016-30-00'，读不了
    expect(safeFilePart('2026-09-10 16:30:00')).toBe('2026-09-10-16-30-00')
    expect(safeFilePart('2026/09/10')).toBe('2026-09-10')
  })
})
