import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed } from 'vue'
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
 */
export type MoneyColorMode = 'income-green' | 'income-red'
export type AmountTone = 'success' | 'danger' | 'neutral'

export const useSettingsStore = defineStore('settings', () => {
  /** 金额配色偏好：默认收入绿/支出红（记账直觉），A 股习惯可切。来源为落库的站点配置 */
  const moneyColorMode = computed<MoneyColorMode>(
    () => useSiteConfigStore().config.amountColorMode ?? 'income-green',
  )

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

  return { moneyColorMode, toneFor }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useSettingsStore, import.meta.hot))
