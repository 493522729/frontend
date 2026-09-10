/**
 * 多账本 mock 种子（共享层，避免循环依赖）
 * ====================================================================
 * 为什么单独抽一个文件：
 *   transaction/mock 要用它给交易/账户**分片**（每笔交易归属哪个账本），
 *   book/mock 要用它生成账本列表，还要向 transaction/mock 问「每个账本多少笔」。
 *   如果种子放在 book/mock 里，就会形成 transaction ↔ book 的循环依赖。
 *   抽到中立模块后依赖是单向的：book → transaction → 本文件。
 *
 * 真实后端这些都该由数据库给出（book 表 + 外键），这里只是 mock 阶段的数据源。
 */
import type { BookType } from '@/enums/book'

export interface BookSeed {
  id: number
  name: string
  type: BookType
  icon: string
  /** 登录后默认进入的账本（全局唯一） */
  isDefault: boolean
  /**
   * 该账本生成的交易笔数
   *
   * 刻意让三个账本规模不同（6000 / 2500 / 1500）—— 切账本时
   * 仪表盘数字和列表总数肉眼可见地变，US-005 的验收才看得出来。
   */
  txnCount: number
  /** 该账本下启用哪些账户（值是 ACCOUNT_TEMPLATES 的下标） */
  accountTemplateIndexes: number[]
  /** 金额倍率：装修单笔几千起、旅行中等、日常零散 —— 让各账本统计数字明显不同 */
  amountScale: number
  /** 收入占比：装修/旅行几乎只有支出（0.12 = 12% 是收入） */
  incomeRatio: number
  /**
   * 启动资金（一次性大额收入，单位**元**）
   *
   * 模拟真实场景里这两类账本「先有钱再花钱」的逻辑：
   *   - 装修：业主先拨款，再分批买材料（没有拨款就会出现「负债 350 万」的荒唐数字）
   *   - 旅行：出行前一次性预算划拨
   * 日常账本走正常发工资路径，不需要。
   *
   * 设计成「多笔而非一笔」：更贴近真实（装修分两期拨款/亲友借款），且防止「单笔超大」
   * 让 stats 曲线在某一天出现断崖式跳变。日期按「最早」排（覆盖 24 个月时间窗的起点）。
   */
  startupFunds: number[]
}

/** 与 src/api/modules/transaction/mock.ts 的 ACCOUNT_TEMPLATES 顺序一致 */
export const ACCOUNT_TEMPLATE_ORDER = [
  '招商储蓄卡',
  '支付宝',
  '微信',
  '现金',
  '招商信用卡',
] as const

export const BOOK_SEEDS: readonly BookSeed[] = [
  {
    id: 1,
    name: '日常账本',
    type: 'daily',
    icon: '🏠',
    isDefault: true,
    txnCount: 6000,
    accountTemplateIndexes: [0, 1, 2, 3, 4],
    amountScale: 1,
    incomeRatio: 0.12,
    startupFunds: [],
  },
  {
    id: 2,
    name: '装修账本',
    type: 'renovation',
    icon: '🔨',
    isDefault: false,
    txnCount: 2500,
    accountTemplateIndexes: [0, 4, 1],
    // 装修单笔几千起（瓷砖/家具），但别太夸张 —— 2500 笔要撑得住「一套房」的量级
    amountScale: 8,
    incomeRatio: 0.02,
    // 三笔 50 万 = 150 万启动金，模拟「材料/软装/家电」三个拨款阶段，
    // 让净余额（账户期初 + income - expense）接近持平：
    //   已知随机收支差 ≈ -143 万 → startup 150 万 → 净 ≈ +5 万（合理）。
    // 多笔避免曲线在单日跳变；日期均分到过去 24 个月。
    startupFunds: [500000, 500000, 500000],
  },
  {
    id: 3,
    name: '旅行账本',
    type: 'travel',
    icon: '✈️',
    isDefault: false,
    txnCount: 1500,
    // 现金 + 支付宝 + 储蓄卡：留够 2 个「可转账账户」，否则转账全被降级成支出
    accountTemplateIndexes: [1, 3, 0],
    amountScale: 3,
    incomeRatio: 0.01,
    // 单笔 50 万预拨覆盖 ~87.5 万支出 - 0.9 万小额收入 - 0.25 万账户初始 ≈ 36 万缺口。
    // 旅行 cost 通常比预算低，但 mock 不预设这种关系；净负 30 万左右合理。
    startupFunds: [500000],
  },
]

/** 默认账本 ID（persist 无值时的兜底） */
export const DEFAULT_BOOK_ID = BOOK_SEEDS.find(b => b.isDefault)?.id ?? BOOK_SEEDS[0]!.id
