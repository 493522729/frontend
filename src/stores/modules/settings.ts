import type { TransactionType } from '@/enums/transaction'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed } from 'vue'
import { useAuthStore } from '@/stores/modules/auth'
import { useSiteConfigStore } from '@/stores/modules/siteConfig'

/**
 * 设置 store（Now 清单 #3）
 * ====================================================================
 * 只放「金额配色算法」：把逻辑色调映射成语义颜色（success / danger / neutral）。
 * 金额配色「偏好值」已落库到后端 SiteConfig（站点级），此处不再自管，
 * 直接从 siteConfig 读取，保证单一真相源。toneFor 的对外 API 不变，
 * 所有调用方（report / dashboard / asset / transaction）零改动。
 *
 * 为什么金额配色做成全局开关而不是各页面硬编码：
 *   架构文档 3.1 明确「颜色不是唯一编码」——金额永远带 +/− 符号，
 *   颜色只是辅助。但用户有 A 股习惯，必须能给一个统一开关，
 *   散落在各页面就改不全、还会和符号语义打架。
 *
 * typeColor / typeColorBg 是同一套语义色的「交易类型版」：
 * 交易大表的类型标签、筛选栏的色点、分类管理的分组色点都从这里取色，
 * 避免各处再写一遍红/绿硬编码（切一次偏好漏改一处就不一致）。
 */
export type MoneyColorMode = 'income-green' | 'income-red'
export type AmountTone = 'success' | 'danger' | 'neutral'

/** 语义色调 → 主色 token（明暗主题各自有值，下面只管映射，不写死色值） */
const TONE_VAR: Record<AmountTone, string> = {
  success: 'var(--lz-success)',
  danger: 'var(--lz-danger)',
  neutral: 'var(--lz-info)',
}

/** 语义色调 → 浅底色 token（标签底色用，和主色成对出现） */
const TONE_BG_VAR: Record<AmountTone, string> = {
  success: 'var(--lz-success-bg)',
  danger: 'var(--lz-danger-bg)',
  neutral: 'var(--lz-info-bg)',
}

export const useSettingsStore = defineStore('settings', () => {
  /**
   * 金额配色偏好：个人服务端偏好（UserInfo.amountColorMode）优先，
   * 没有则回退站点默认（SiteConfig.amountColorMode，仅超管可改），再不行用默认 income-green。
   * 2026-09-22：从「全局站点配置」改为「每用户服务端偏好」，普通用户即可改、随账号多端一致。
   */
  const moneyColorMode = computed<MoneyColorMode>(() => {
    const pref = useAuthStore().userInfo?.amountColorMode
    if (pref === 'income-green' || pref === 'income-red')
      return pref
    return useSiteConfigStore().config.amountColorMode ?? 'income-green'
  })

  /**
   * 把「逻辑色调」映射成语义颜色（success / danger / neutral）
   * ───────────────────────────────────────────────────────────
   * transfer / neutral 永远 neutral（转账不计入收支；neutral 是显式中性的场景）；
   * 收入/支出按用户偏好翻转，保证「符号 + 颜色」双编码一致。
   */
  function toneFor(type: 'income' | 'expense' | 'transfer' | 'neutral'): AmountTone {
    if (type === 'transfer' || type === 'neutral')
      return 'neutral'
    const incomeIsGreen = moneyColorMode.value === 'income-green'
    if (type === 'income')
      return incomeIsGreen ? 'success' : 'danger'
    return incomeIsGreen ? 'danger' : 'success'
  }

  /**
   * 交易类型 → 颜色（色点 / 标签文字色都用它）
   * ───────────────────────────────────────────────────────────
   * 支出、收入跟随「金额配色偏好」，用户切成 A 股习惯（income-red）时一起翻转；
   * 转账与金额无关，固定走中性信息蓝 —— 这也是「转账不参与偏好翻转」的落点，
   * 否则切一次偏好，转账的颜色也跟着变，等于失去了中性语义。
   * 返回的是 CSS 变量名而不是色值：明暗主题自动跟随（颜色永远走 token）。
   */
  function typeColor(type: TransactionType): string {
    return TONE_VAR[toneFor(type)]
  }

  /** 交易类型 → 浅底色（标签底色用；同样跟随偏好与主题，配对 --lz-*-bg 变量） */
  function typeColorBg(type: TransactionType): string {
    return TONE_BG_VAR[toneFor(type)]
  }

  /**
   * 语义色调 → 颜色 token
   * ───────────────────────────────────────────────────────────
   * 给「手上只有色调、没有交易类型」的场景用 —— 典型是数据卡：
   * 结余卡按正负推出 income / expense / neutral，再映射一次就成了色调，
   * 不需要为了拿个色值硬凑一个 TransactionType 出来。
   */
  function toneColor(tone: AmountTone): string {
    return TONE_VAR[tone]
  }

  /** 语义色调 → 浅底色 token（与 toneColor 成对） */
  function toneColorBg(tone: AmountTone): string {
    return TONE_BG_VAR[tone]
  }

  return { moneyColorMode, toneFor, typeColor, typeColorBg, toneColor, toneColorBg }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useSettingsStore, import.meta.hot))
