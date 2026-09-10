/**
 * 记账后的预算预警（US-006 验收项：超 80% toast 预警）
 * ====================================================================
 * 放在 composables 而不是预算页里：预警的触发点是「快速记账弹层保存成功」，
 * 快记是全局组件，跟预算页没有从属关系 —— 谁触发谁就要能直接调。
 *
 * 返回文案而不是直接 toast：组件层的 useMessage 才有弹 toast 的能力，
 * 纯函数只负责「要不要预警、说什么」，展示形式留给调用方。
 */

import type { Transaction } from '@/types/transaction'
import { getBudgetOverview } from '@/api/modules/budget'
import { BUDGET_WARN_PERCENT } from '@/types/budget'
import { formatCents } from '@/utils/money'

/** 预警结果：null = 不预警 */
export interface BudgetAlert {
  /** 提示级别：warning = 逼近阈值，error = 已超支 */
  level: 'warning' | 'error'
  /** 完整文案（含分类名、百分比、剩余/超支金额） */
  text: string
}

export async function budgetAlertAfterSave(tx: Transaction): Promise<BudgetAlert | null> {
  // 只有支出会吃预算；转账 / 收入跟预算无关，不用多发一次请求
  if (tx.type !== 'expense' || tx.categoryId === 0)
    return null

  // 以**交易本身的月份**为准：用户完全可能补记上个月的账，
  // 那笔账吃的是上个月的预算，按当月算就会误报
  const month = tx.transDate.slice(0, 7)
  const overview = await getBudgetOverview({ bookId: tx.bookId, month })
  const item = overview.items.find(i => i.budget.categoryId === tx.categoryId)

  // 没给这个分类设预算，就没有预警一说
  if (!item || item.budget.amount <= 0)
    return null

  const name = item.categoryName
  if (item.percent > 100) {
    return {
      level: 'error',
      text: `「${name}」本月预算已超支 ${formatCents(-item.remaining, { withSymbol: true })}`,
    }
  }
  if (item.percent >= BUDGET_WARN_PERCENT) {
    return {
      level: 'warning',
      text: `「${name}」预算已用 ${item.percent.toFixed(1)}%，仅剩 ${formatCents(item.remaining, { withSymbol: true })}`,
    }
  }
  return null
}
