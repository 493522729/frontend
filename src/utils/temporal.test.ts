import { Temporal } from 'temporal-polyfill'
import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatMonth,
  lastNMonths,
  monthLabel,
  monthRange,
  monthsBetween,
  parseDate,
  parseMonth,
  startOfWeek,
  today,
  yearRange,
} from './temporal'

describe('parse / format', () => {
  it('parseDate / formatDate 往返一致', () => {
    expect(formatDate(parseDate('2026-09-06'))).toBe('2026-09-06')
  })

  it('parseMonth / formatMonth 去掉日部分', () => {
    expect(formatMonth(parseMonth('2026-09'))).toBe('2026-09')
  })

  it('非法输入抛错', () => {
    expect(() => parseDate('2026-13-01')).toThrow(RangeError)
    expect(() => parseMonth('2026-9')).toThrow(RangeError)
  })
})

describe('monthRange（会计期间区间）', () => {
  it('平年二月 28 天', () => {
    const { start, end } = monthRange(parseMonth('2026-02'))
    expect(formatDate(start)).toBe('2026-02-01')
    expect(formatDate(end)).toBe('2026-02-28')
  })

  it('闰年二月 29 天', () => {
    const { end } = monthRange(parseMonth('2028-02'))
    expect(formatDate(end)).toBe('2028-02-29')
  })

  it('大小月', () => {
    expect(monthRange(parseMonth('2026-09')).end.day).toBe(30)
    expect(monthRange(parseMonth('2026-10')).end.day).toBe(31)
  })
})

describe('lastNMonths（近 N 月序列）', () => {
  it('从锚点起向前取，按时间正序返回', () => {
    const months = lastNMonths(6, parseMonth('2026-09'))
    expect(months.map(formatMonth)).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ])
  })

  it('跨年正确回退', () => {
    const months = lastNMonths(3, parseMonth('2026-01'))
    expect(months.map(formatMonth)).toEqual(['2025-11', '2025-12', '2026-01'])
  })

  it('n=1 只有当月', () => {
    expect(lastNMonths(1, parseMonth('2026-09')).map(formatMonth)).toEqual(['2026-09'])
  })

  it('非法 n 抛 RangeError', () => {
    expect(() => lastNMonths(0)).toThrow(RangeError)
    expect(() => lastNMonths(-3)).toThrow(RangeError)
    expect(() => lastNMonths(2.5)).toThrow(RangeError)
  })
})

describe('monthsBetween', () => {
  it('含端点，Q1 = 3 个月', () => {
    expect(monthsBetween(parseMonth('2026-01'), parseMonth('2026-03'))).toBe(3)
  })

  it('同月 = 1', () => {
    expect(monthsBetween(parseMonth('2026-09'), parseMonth('2026-09'))).toBe(1)
  })

  it('参数顺序无关', () => {
    expect(monthsBetween(parseMonth('2026-03'), parseMonth('2026-01'))).toBe(3)
  })

  it('跨年', () => {
    expect(monthsBetween(parseMonth('2025-11'), parseMonth('2026-02'))).toBe(4)
  })
})

describe('startOfWeek（ISO 周一为一周起点）', () => {
  it('周日对齐到上一个周一', () => {
    // 2026-09-06 是周日
    expect(formatDate(startOfWeek(parseDate('2026-09-06')))).toBe('2026-08-31')
  })

  it('周一就是本身', () => {
    // 2026-08-31 是周一
    expect(formatDate(startOfWeek(parseDate('2026-08-31')))).toBe('2026-08-31')
  })

  it('周中对齐到本周一', () => {
    // 2026-09-03 是周四
    expect(formatDate(startOfWeek(parseDate('2026-09-03')))).toBe('2026-08-31')
  })
})

describe('yearRange', () => {
  it('全年首尾', () => {
    const { start, end } = yearRange(parseDate('2026-09-06'))
    expect(formatDate(start)).toBe('2026-01-01')
    expect(formatDate(end)).toBe('2026-12-31')
  })

  it('闰年 366 天', () => {
    const { end } = yearRange(parseDate('2028-01-01'))
    expect(formatDate(end)).toBe('2028-12-31')
  })
})

describe('monthLabel', () => {
  it('中文标签', () => {
    expect(monthLabel(Temporal.PlainYearMonth.from('2026-09'))).toBe('2026年9月')
  })
})

describe('today', () => {
  it('today() = 系统当天（动态断言，避免跨日过期）', () => {
    // 不用硬编码日期，直接「自指 today() = formatDate(new Date())」即可
    expect(formatDate(today())).toBe(formatDate(Temporal.Now.plainDateISO()))
  })
})
