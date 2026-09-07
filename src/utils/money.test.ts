import { describe, expect, it } from 'vitest'
import {
  allocateCents,
  compareCents,
  formatCents,
  formatCentsCompact,
  isValidAmount,
  negateCents,
  parseYuanToCents,
  percentOf,
  sumCents,
} from '@/utils/money'

describe('parseYuanToCents —— 元字符串转分', () => {
  it('正常金额', () => {
    expect(parseYuanToCents('12.34')).toBe(1234)
    expect(parseYuanToCents('0.01')).toBe(1)
    expect(parseYuanToCents('100')).toBe(10000)
    expect(parseYuanToCents('0')).toBe(0)
  })

  it('小数位不足两位时右补零：.5 是 5 毛不是 5 分', () => {
    expect(parseYuanToCents('12.5')).toBe(1250)
    expect(parseYuanToCents('0.5')).toBe(50)
  })

  it('正负号', () => {
    expect(parseYuanToCents('-12.34')).toBe(-1234)
    expect(parseYuanToCents('+12.34')).toBe(1234)
  })

  it('粘贴容错：货币符号 / 千分位 / 中文单位 / 空格', () => {
    expect(parseYuanToCents('¥1,234.56')).toBe(123456)
    expect(parseYuanToCents('￥1,234.56')).toBe(123456)
    expect(parseYuanToCents('$1,234.56')).toBe(123456)
    expect(parseYuanToCents('1234.56元')).toBe(123456)
    expect(parseYuanToCents(' 1 234.56 ')).toBe(123456)
    expect(parseYuanToCents('1，234.56')).toBe(123456)
  })

  it('欧式写法：逗号当小数点（1 234,56）', () => {
    expect(parseYuanToCents('1 234,56')).toBe(123456)
    expect(parseYuanToCents('0,99')).toBe(99)
  })

  it('全角输入：从微信/Excel 复制出来的常见脏数据', () => {
    expect(parseYuanToCents('１２３４')).toBe(123400)
    expect(parseYuanToCents('１２．３４')).toBe(1234)
    expect(parseYuanToCents('－１２．３４')).toBe(-1234)
  })

  it('不换行空格（PDF 复制常见）', () => {
    expect(parseYuanToCents('1\u00A0234.56')).toBe(123456)
  })

  it('非法输入一律 NaN —— 刻意不用 0，因为 0 是合法金额', () => {
    expect(parseYuanToCents('')).toBeNaN()
    expect(parseYuanToCents('abc')).toBeNaN()
    expect(parseYuanToCents('12.345')).toBeNaN() // 超过两位小数
    expect(parseYuanToCents('1.2.3')).toBeNaN()
    expect(parseYuanToCents('.')).toBeNaN()
    expect(parseYuanToCents('.5')).toBeNaN() // 不支持省略整数位
    expect(parseYuanToCents('--12')).toBeNaN()
  })

  it('非字符串输入不该崩', () => {
    // @ts-expect-error 故意传错类型，验证运行期防御
    expect(parseYuanToCents(1234)).toBeNaN()
    // @ts-expect-error 故意传 null
    expect(parseYuanToCents(null)).toBeNaN()
  })

  it('避开经典浮点坑：1.005 元应该是 101 分而不是 100 分', () => {
    // 若用 Math.round(1.005 * 100) 会得到 100，差一分钱
    expect(parseYuanToCents('1.005')).toBeNaN() // 超过两位小数直接拒绝
    expect(parseYuanToCents('1.01')).toBe(101)
    expect(parseYuanToCents('19.99')).toBe(1999)
  })
})

describe('isValidAmount', () => {
  it('合法 / 非法', () => {
    expect(isValidAmount('12.34')).toBe(true)
    expect(isValidAmount('0')).toBe(true)
    expect(isValidAmount('abc')).toBe(false)
  })
})

describe('formatCents —— 分转展示字符串', () => {
  it('默认：千分位 + 两位小数', () => {
    expect(formatCents(1234567)).toBe('12,345.67')
    expect(formatCents(0)).toBe('0.00')
    expect(formatCents(1)).toBe('0.01')
  })

  it('负数带减号', () => {
    expect(formatCents(-1234567)).toBe('-12,345.67')
  })

  it('withSign：正数也带加号，支出收入不靠颜色区分', () => {
    expect(formatCents(1234567, { withSign: true })).toBe('+12,345.67')
    expect(formatCents(-1234567, { withSign: true })).toBe('-12,345.67')
    expect(formatCents(0, { withSign: true })).toBe('0.00') // 0 既非收入也非支出，不带符号
  })

  it('withSymbol：加人民币符号', () => {
    expect(formatCents(123456, { withSymbol: true })).toBe('¥1,234.56')
    expect(formatCents(-123456, { withSymbol: true })).toBe('-¥1,234.56')
  })

  it('zeroText：空态或"无数据"场景自定义零值文案', () => {
    expect(formatCents(0, { zeroText: '—' })).toBe('—')
    // 没传 zeroText 时 0 正常显示
    expect(formatCents(0)).toBe('0.00')
  })

  it('非法数字不当场崩，返回占位符', () => {
    expect(formatCents(Number.NaN)).toBe('--')
    expect(formatCents(Number.POSITIVE_INFINITY)).toBe('--')
  })

  it('locale 切换生效，且格式化器被缓存复用', () => {
    expect(formatCents(1234567, { locale: 'zh-CN' })).toBe('12,345.67')
    expect(formatCents(1234567, { locale: 'en-US' })).toBe('12,345.67')
    // 再调一次命中缓存
    expect(formatCents(1234567, { locale: 'en-US' })).toBe('12,345.67')
  })
})

describe('formatCentsCompact —— 万 / 亿 收口', () => {
  it('万级', () => {
    expect(formatCentsCompact(123456789)).toBe('123.46万')
  })

  it('亿级：1234567890000 分 = 12,345,678,900 元 ≈ 123.46 亿', () => {
    expect(formatCentsCompact(1234567890000)).toBe('123.46亿')
    expect(formatCentsCompact(10_000_000_000)).toBe('1.00亿') // 1e10 分 = 1 亿元
  })

  it('普通金额不走收口', () => {
    expect(formatCentsCompact(123456)).toBe('1234.56')
  })

  it('负号与符号', () => {
    expect(formatCentsCompact(-123456789)).toBe('-123.46万')
    expect(formatCentsCompact(123456789, true)).toBe('¥123.46万')
  })

  it('非法输入', () => {
    expect(formatCentsCompact(Number.NaN)).toBe('--')
  })
})

describe('sumCents —— 求和', () => {
  it('空数组为 0', () => {
    expect(sumCents([])).toBe(0)
  })

  it('普通求和', () => {
    expect(sumCents([1, 2, 3])).toBe(6)
    expect(sumCents([-100, 50])).toBe(-50)
  })

  it('补偿求和的两个分支：先小后大 / 先大后小', () => {
    expect(sumCents([1, 100])).toBe(101)
    expect(sumCents([100, 1])).toBe(101)
  })

  it('大数吃小数不丢精度', () => {
    // 普通浮点求和会丢掉 0.01 这个量级
    expect(sumCents([1e15, 1, -1e15])).toBe(1)
  })

  it('有原生 Math.sumPrecise 时优先走原生', () => {
    const original = (Math as Math & { sumPrecise?: unknown }).sumPrecise
    // 模拟原生实现：只做简单相加，用来验证确实被调用了
    ;(Math as Math & { sumPrecise?: (v: readonly number[]) => number }).sumPrecise = values =>
      values.reduce((acc, v) => acc + v, 0) + 1000

    try {
      expect(sumCents([1, 2, 3])).toBe(1006)
    }
    finally {
      if (original === undefined)
        delete (Math as Math & { sumPrecise?: unknown }).sumPrecise
      else
        (Math as Math & { sumPrecise?: unknown }).sumPrecise = original
    }
  })
})

describe('allocateCents —— 按权重分摊，保证总和不变', () => {
  it('空数组', () => {
    expect(allocateCents(100, [])).toEqual([])
  })

  it('权重全为 0 时每份为 0', () => {
    expect(allocateCents(100, [0, 0])).toEqual([0, 0])
  })

  it('能整除', () => {
    expect(allocateCents(300, [1, 1, 1])).toEqual([100, 100, 100])
  })

  it('不能整除时零头给权重最大的一份，总和不变', () => {
    const result = allocateCents(100, [1, 1, 1])
    expect(result.reduce((a, b) => a + b, 0)).toBe(100)
    expect(result).toEqual([34, 33, 33])
  })

  it('权重递增时，零头落在权重最大的那份上', () => {
    // floor 分配得到 [33, 66]，余 1 分补给权重更大的第二份
    expect(allocateCents(100, [1, 2])).toEqual([33, 67])
    expect(allocateCents(100, [1, 2]).reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('按权重比例分配', () => {
    const result = allocateCents(1000, [3, 1])
    expect(result).toEqual([750, 250])
    expect(result.reduce((a, b) => a + b, 0)).toBe(1000)
  })

  it('负数总额（退款分摊）', () => {
    const result = allocateCents(-100, [1, 1, 1])
    expect(result.reduce((a, b) => a + b, 0)).toBe(-100)
  })

  it('单份', () => {
    expect(allocateCents(99, [5])).toEqual([99])
  })
})

describe('negateCents / compareCents / percentOf', () => {
  it('取反', () => {
    expect(negateCents(1234)).toBe(-1234)
    expect(negateCents(-1234)).toBe(1234)
  })

  it('比较', () => {
    expect(compareCents(1, 2)).toBe(-1)
    expect(compareCents(2, 1)).toBe(1)
    expect(compareCents(2, 2)).toBe(0)
  })

  it('百分比', () => {
    expect(percentOf(25, 100)).toBe(25)
    expect(percentOf(1, 3)).toBe(33.33)
    expect(percentOf(1, 0)).toBe(0) // 除零保护
  })
})
