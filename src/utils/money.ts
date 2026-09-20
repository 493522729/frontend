/**
 * 金额工具 —— 系统内所有金额的唯一出入口
 *
 * 架构文档 ADR-7（铁律，违反即事故）：
 *   1. 金额在系统内一律以「分」为单位的整数流转，禁止用 number 存「元」
 *   2. 禁止任何地方裸写 toFixed(2)（ESLint 已配置规则拦截）
 *   3. 只有展示层才把「分」转成「元」
 *
 * 为什么这么严格：
 *   0.1 + 0.2 !== 0.3，在记账本里是"我明明没花钱余额却对不上"；
 *   在财务系统里这是对不上账的事故。整数分运算从根上消灭这个问题。
 */

/** 1 元 = 100 分 */
export const CENTS_PER_YUAN = 100

/** 金额的合法格式：可选正负号 + 整数部分 + 最多两位小数 */
const AMOUNT_PATTERN = /^[+-]?\d+(?:\.\d{1,2})?$/

/**
 * 千分位分组器缓存（按 locale）。
 *
 * ⚠️ 刻意不用 `Intl.NumberFormat`：小程序 iOS 真机运行时**不提供 `Intl`**，
 *   `new Intl.NumberFormat()` 会抛 `ReferenceError: Intl is not defined`，
 *   且发生在页面模块加载期 ⇒ 整页 `load failed`（2026-09-20 体验版真机踩过）。
 *   记账金额只需「三位一组、逗号分隔」，自行实现即可，不依赖运行环境。
 *   `locale` 作为缓存键保留，仅为不改公开 API（Web 端测试会传 zh-CN / en-US）。
 */
const formatterCache = new Map<string, (value: number) => string>()

/** 三位一组插逗号：`1234567` → `"1,234,567"`（入参为非负整数） */
function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function getIntegerFormatter(locale: string): (value: number) => string {
  const cached = formatterCache.get(locale)
  if (cached)
    return cached

  formatterCache.set(locale, groupThousands)
  return groupThousands
}

/**
 * 把用户粘贴进来的各种脏输入清洗成可解析的数字字符串
 *
 * 覆盖的真实粘贴场景：
 *   "¥1,234.56" / "1234.56元" / "1 234,56"（欧式：逗号是小数点）/ "１２３４"（全角）/ "1，234.56"（中文逗号）
 */
function normalizeInput(input: string): string {
  let text = input
    // 全角转半角：FF01–FF5E（！～）减 0xFEE0 得对应 ASCII，数字/小数点/加减号全在这一区
    .replace(/[\uFF01-\uFF5E]/gu, char => String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
    // 空格（含 PDF 复制出来的不换行空格）
    .replace(/\s/g, '')
    // 货币符号
    .replace(/[¥￥$]/g, '')
    // 中文标点：，、。当千分位或小数点处理
    .replace(/[，、]/g, ',')

  text = text.replace(/元$/, '')

  // 逗号语义二义性：
  //   同时有 . 和 , → 逗号是千分位（1,234.56）
  //   只有逗号且末尾跟 1~2 位 → 欧式小数点（1 234,56）
  //   其余 → 当千分位去掉
  if (text.includes('.') && text.includes(',')) {
    text = text.replaceAll(',', '')
  }
  else if (text.includes(',') && /,\d{1,2}$/.test(text)) {
    text = text.replace(',', '.')
  }
  else {
    text = text.replaceAll(',', '')
  }

  return text
}

/**
 * 「元」字符串 → 「分」整数
 *
 * @returns 合法返回分（整数），非法返回 NaN（刻意不用 0，0 是合法金额）
 *
 * 注意：这里用字符串拆分而不是 `Math.round(元 * 100)`。
 * 因为 19.99 * 100 === 1998.9999999999998，靠 Math.round 兜底在多数情况能救，
 * 但 1.005 * 100 === 100.49999999999999，四舍五入会得到 100 而不是 101 —— 差一分钱。
 */
export function parseYuanToCents(input: string): number {
  if (typeof input !== 'string')
    return Number.NaN

  const cleaned = normalizeInput(input)
  if (!AMOUNT_PATTERN.test(cleaned))
    return Number.NaN

  const negative = cleaned.startsWith('-')
  const digits = cleaned.replace(/^[+-]/, '')
  const [integerPart, fractionPart = ''] = digits.split('.')

  // 小数位右补 0 到 2 位：'5' → '50' 分；'' → '00' 分
  const cents = Number(integerPart) * CENTS_PER_YUAN + Number(fractionPart.padEnd(2, '0'))
  return negative ? -cents : cents
}

/**
 * 直观的反向操作：parseYuanToCents 的逆运算
 * @see parseYuanToCents
 */
export function isValidAmount(input: string): boolean {
  return Number.isFinite(parseYuanToCents(input))
}

export interface FormatCentsOptions {
  /** 带正负号：收入 `+12.00`，支出 `-12.00`。财务表格里颜色不该是唯一编码，符号必须有 */
  withSign?: boolean
  /** 带人民币符号 ¥ */
  withSymbol?: boolean
  /** 零值显示成什么，默认 `0.00` */
  zeroText?: string
  locale?: string
}

/**
 * 「分」→ 展示字符串
 *
 * 全程整数运算，不碰浮点：
 *   1234567 → "12,345.67"
 *   -1234567（withSign）→ "-12,345.67"
 */
export function formatCents(cents: number, options: FormatCentsOptions = {}): string {
  const {
    withSign = false,
    withSymbol = false,
    zeroText,
    locale = 'zh-CN',
  } = options

  if (!Number.isFinite(cents))
    return '--'

  if (cents === 0 && zeroText !== undefined)
    return zeroText

  // 0 元既不是收入也不是支出，刻意不带正负号
  const sign = cents < 0 ? '-' : (withSign && cents > 0) ? '+' : ''
  const abs = Math.abs(Math.trunc(cents))

  const yuan = Math.trunc(abs / CENTS_PER_YUAN)
  const fraction = abs % CENTS_PER_YUAN

  const yuanText = getIntegerFormatter(locale)(yuan)
  const fractionText = String(fraction).padStart(2, '0')

  return `${sign}${withSymbol ? '¥' : ''}${yuanText}.${fractionText}`
}

/**
 * 紧凑展示：大额数字用「万 / 亿」收口，仪表盘总额卡片用
 *   123456789 分 → "123.46万"
 */
export function formatCentsCompact(cents: number, withSymbol = false): string {
  if (!Number.isFinite(cents))
    return '--'

  const yuan = Math.trunc(Math.abs(cents)) / CENTS_PER_YUAN
  const sign = cents < 0 ? '-' : ''
  const symbol = withSymbol ? '¥' : ''

  if (Math.abs(yuan) >= 1e8)
    return `${sign}${symbol}${(yuan / 1e8).toFixed(2)}亿`
  if (Math.abs(yuan) >= 1e4)
    return `${sign}${symbol}${(yuan / 1e4).toFixed(2)}万`
  return `${sign}${symbol}${yuan.toFixed(2)}`
}

/** Neumaier 补偿求和：把每一步舍入掉的零头累积起来补回去 */
function neumaierSum(values: readonly number[]): number {
  let sum = 0
  let compensation = 0

  for (const value of values) {
    const next = sum + value
    // 谁的量级大，就以谁为基准补零头
    compensation += Math.abs(sum) >= Math.abs(value)
      ? sum - next + value
      : value - next + sum
    sum = next
  }

  return sum + compensation
}

/**
 * 金额求和
 *
 * [ES2026 Math.sumPrecise] 原生实现走 Neumaier 补偿求和，中间不丢精度。
 * 整数「分」在 2^53 以内本来就是精确相加的，这里保留它是为了将来引入
 * 比例运算（税费、分摊产生的中间小数）时不至于重新踩坑。
 *
 * 注意：刻意【不】在模块顶层缓存特性探测结果。
 * 这样运行时再挂载 polyfill 也能生效，单元测试也能直接 mock 掉两条分支。
 */
export function sumCents(values: readonly number[]): number {
  const native = (Math as Math & {
    sumPrecise?: (values: readonly number[]) => number
  }).sumPrecise

  if (native)
    return Math.trunc(native(values))

  return Math.trunc(neumaierSum(values))
}

/**
 * 按权重分摊金额，保证各份之和 === 总额（多出来的零头给权重最大的那一份）
 *
 * AA 分账、按科目拆账都靠它。用整数运算，不会出现「三份各 33.33，加起来 99.99」的尴尬。
 *
 * @returns 与 weights 等长的「分」数组；weights 全为 0 或为空时返回空数组
 */
export function allocateCents(total: number, weights: readonly number[]): number[] {
  if (weights.length === 0)
    return []

  const totalWeight = weights.reduce((acc, w) => acc + w, 0)
  if (totalWeight === 0)
    return weights.map(() => 0)

  const results = weights.map(w => Math.floor((total * w) / totalWeight))

  // 找权重最大的那一份来承担舍入差，避免出现 -1 分这种怪值
  // 分摊场景的权重数量很小（几个人、几个科目），扩展运算符不会有性能问题
  const maxIndex = weights.indexOf(Math.max(...weights))
  const remainder = total - results.reduce((acc, v) => acc + v, 0)
  // 索引必定存在（maxIndex 来自 weights 自身），用非空断言而不是 `?? 0`：
  // 后者会生成一个永远走不到的分支，拖累分支覆盖率
  results[maxIndex] = results[maxIndex]! + remainder

  return results
}

/** 取反：收入 ↔ 支出互转 */
export function negateCents(cents: number): number {
  return -cents
}

/** 比较两个金额（用减法而不是 < >，保持整数语义一致） */
export function compareCents(a: number, b: number): -1 | 0 | 1 {
  if (a < b)
    return -1
  if (a > b)
    return 1
  return 0
}

/**
 * 计算百分比（返回 0~100 的数字，保留 2 位小数）
 * @param part 分子（分）
 * @param whole 分母（分）；为 0 时返回 0，避免除零得到 NaN/Infinity
 */
export function percentOf(part: number, whole: number): number {
  if (whole === 0)
    return 0
  return Math.round((part / whole) * 10000) / 100
}
