<script setup lang="ts">
import type { AccountType } from '@/enums/account'
import type { Account, AccountWithBalance } from '@/types/transaction'
import { NButton, NInput, NModal, NSelect, NSwitch, useMessage } from 'naive-ui'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { findFallbackAccount } from '@/api/modules/account'
import { countAccountUsage } from '@/api/modules/transaction'
import EmptyState from '@/components/business/empty-state/index.vue'
import { ACCOUNT_TYPE_META, ACCOUNT_TYPES } from '@/enums/account'
import { useAccountStore } from '@/stores/modules/account'
import { useBookStore } from '@/stores/modules/book'
import { formatCents, parseYuanToCents } from '@/utils/money'
import { emojiOption, renderEmojiLabel } from '@/utils/select-option'

/**
 * 账户管理页（Next 清单 #1，PRD §15.3 / US-004）
 * ====================================================================
 * 账户 = 「钱放在哪」。它是真实记账闭环的最后一公里：
 * 快速记账弹层早就有转账 UI，但账户一直是写死的种子数据，
 * 于是余额不会变、转账也无处可转 —— 这个页面把账户变成可管理的实体。
 *
 * 三条铁律：
 *  1. 账户属于账本：切账本换一批账户，页面 watch currentBookId 重载
 *  2. 余额不落库：由「期初 + 流水」现算（stats.listAccountBalances），改一笔流水余额立刻变
 *  3. 删账户先迁流水：顺序反了会留下指向不存在账户的孤儿流水；
 *     转账两端都是账户，缺一端就讲不通，所以转账笔会被一并清掉（删前必须告知用户）
 */

const accountStore = useAccountStore()
const book = useBookStore()
const message = useMessage()

const accounts = computed<AccountWithBalance[]>(() => accountStore.accounts)
const loading = computed(() => accountStore.loading)

const typeOptions = ACCOUNT_TYPES.map(t => ({ label: ACCOUNT_TYPE_META[t].label, value: t }))

/** 卡片上的余额文案：信用卡显示可用额度，其余显示余额 */
function balanceText(a: AccountWithBalance): string {
  return formatCents(a.balance, { withSymbol: true })
}

/** 信用卡的可用额度 = 额度 + 余额（余额为负表示已欠款） */
function availableText(a: AccountWithBalance): string {
  return formatCents(a.creditLimit + a.balance, { withSymbol: true })
}

/** 余额配色：欠钱（负）才是红，正数保持中性 —— 避免和「收支」的红绿语义打架 */
function toneOf(a: AccountWithBalance): string {
  if (a.balance < 0)
    return 'tone-danger'
  return 'tone-neutral'
}

// ── 表单弹层 ─────────────────────────────────────────────
const formVisible = ref(false)
const submitting = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({
  name: '',
  type: 'debit' as AccountType,
  icon: ACCOUNT_TYPE_META.debit.icon,
  /** 以「元」为单位的输入串，提交时才转分 —— 避免用户输入过程中被数值格式化打断 */
  initBalanceYuan: '0',
  creditLimitYuan: '0',
  isCredit: false,
})

function openCreate() {
  editingId.value = null
  form.name = ''
  form.type = 'debit'
  form.icon = ACCOUNT_TYPE_META.debit.icon
  form.initBalanceYuan = '0'
  form.creditLimitYuan = '0'
  form.isCredit = false
  formVisible.value = true
}

function openEdit(a: AccountWithBalance) {
  editingId.value = a.id
  form.name = a.name
  form.type = a.type
  form.icon = a.icon
  // 分 → 元：展示时回到用户输入的量纲（(cents/100) 用 toFixed 只影响展示，不进存储）
  form.initBalanceYuan = (a.initBalance / 100).toFixed(2)
  form.creditLimitYuan = (a.creditLimit / 100).toFixed(2)
  form.isCredit = a.type === 'credit'
  formVisible.value = true
}

// 切类型时，若图标仍是上一种类型的默认图标，自动换成新类型的默认图标
watch(() => form.type, (type, prev) => {
  if (!form.icon || form.icon === ACCOUNT_TYPE_META[prev]?.icon)
    form.icon = ACCOUNT_TYPE_META[type].icon
  // 信用卡没有「期初余额」概念：欠款由刷卡的支出流水累积出来，所以建卡时置 0
  if (type === 'credit')
    form.initBalanceYuan = '0'
})

async function submitForm() {
  const name = form.name.trim()
  if (!name)
    return message.warning('请输入账户名称')

  const initBalance = parseYuanToCents(form.initBalanceYuan || '0')
  const creditLimit = form.isCredit ? parseYuanToCents(form.creditLimitYuan || '0') : 0
  if (!Number.isFinite(initBalance) || !Number.isFinite(creditLimit))
    return message.warning('金额格式不正确，最多两位小数')
  if (initBalance < 0 || creditLimit < 0)
    return message.warning('金额不能为负')

  submitting.value = true
  try {
    const payload: Omit<Account, 'id'> = {
      bookId: book.currentBookId,
      name,
      type: form.type,
      icon: form.icon || ACCOUNT_TYPE_META[form.type].icon,
      initBalance,
      creditLimit: form.isCredit ? creditLimit : 0,
    }
    if (editingId.value == null) {
      await accountStore.createAccountEntry(payload)
      message.success('账户已创建')
    }
    else {
      await accountStore.updateAccountEntry(editingId.value, payload)
      message.success('账户已更新')
    }
    formVisible.value = false
  }
  finally {
    submitting.value = false
  }
}

// ── 删除（先迁流水，再删账户）───────────────────────────────
const deleteVisible = ref(false)
const deleting = ref(false)
const target = ref<AccountWithBalance | null>(null)
const usage = ref<{ total: number, transfer: number }>({ total: 0, transfer: 0 })
const migrateTo = ref<number | null>(null)

/** 迁移目标候选：同账本、排除自身 */
const migrateOptions = computed(() =>
  accounts.value
    .filter(a => a.id !== target.value?.id)
    .map(a => emojiOption(a.icon, a.name, a.id)),
)

async function openDelete(a: AccountWithBalance) {
  // 至少留一个账户：全删光后记账弹层没有可选账户，产品直接不可用
  if (accounts.value.length <= 1) {
    message.warning('至少保留一个账户')
    return
  }
  target.value = a
  usage.value = await countAccountUsage(a.id)
  const fallback = await findFallbackAccount(a.bookId, a.id)
  migrateTo.value = fallback?.id ?? migrateOptions.value[0]?.value ?? null
  deleteVisible.value = true
}

async function confirmDelete() {
  if (!target.value || migrateTo.value == null) {
    message.warning('请选择流水迁移到的账户')
    return
  }
  deleting.value = true
  try {
    const { migrated, removed } = await accountStore.deleteAccountEntry(target.value.id, migrateTo.value)
    const parts = [`${migrated} 笔流水已迁移`]
    if (removed > 0)
      parts.push(`${removed} 笔转账已清理`)
    message.success(`已删除「${target.value.name}」，${parts.join('，')}`)
    deleteVisible.value = false
  }
  finally {
    deleting.value = false
  }
}

onMounted(() => accountStore.ensureLoaded())
// 切账本 = 换一整批账户（US-005）
watch(() => book.currentBookId, () => accountStore.refresh())
</script>

<template>
  <div class="account-page">
    <header class="page-head">
      <div>
        <h1 class="page-title">
          账户管理
        </h1>
        <p class="page-sub">
          钱放在哪：现金、银行卡、支付宝、信用卡。账户属于当前账本，切换账本会换一批。
        </p>
      </div>
      <NButton type="primary" @click="openCreate">
        + 新建账户
      </NButton>
    </header>

    <!-- 汇总：净资产 = 各账户余额之和（信用卡为负，自然扣减） -->
    <section class="summary">
      <div class="summary-card summary-card--net">
        <span class="summary-card__label">净资产</span>
        <span class="summary-card__value" :class="accountStore.netAssets < 0 ? 'tone-danger' : 'tone-neutral'">
          {{ formatCents(accountStore.netAssets, { withSymbol: true }) }}
        </span>
        <span class="summary-card__hint">当前账本 · {{ accounts.length }} 个账户</span>
      </div>
      <div class="summary-card">
        <span class="summary-card__label">总资产</span>
        <span class="summary-card__value tone-neutral">
          {{ formatCents(accountStore.totalAssets, { withSymbol: true }) }}
        </span>
        <span class="summary-card__hint">不含信用卡欠款</span>
      </div>
      <div class="summary-card">
        <span class="summary-card__label">信用卡欠款</span>
        <span class="summary-card__value" :class="accountStore.totalDebt > 0 ? 'tone-danger' : 'tone-neutral'">
          {{ formatCents(accountStore.totalDebt, { withSymbol: true }) }}
        </span>
        <span class="summary-card__hint">负债合计</span>
      </div>
    </section>

    <div v-if="loading && accounts.length === 0" class="empty-state">
      加载中…
    </div>
    <EmptyState
      v-else-if="accounts.length === 0"
      variant="wallet"
      title="还没有账户"
      desc="当前账本还没有账户，先建一个才能记账"
    >
      <NButton size="small" type="primary" @click="openCreate">
        + 新建账户
      </NButton>
    </EmptyState>

    <div v-else class="account-grid">
      <article
        v-for="a in accounts"
        :key="a.id"
        class="account-card"
      >
        <div class="account-card__head">
          <span class="account-card__icon">{{ a.icon }}</span>
          <div class="account-card__titles">
            <span class="account-card__name">{{ a.name }}</span>
            <span class="account-card__type">{{ ACCOUNT_TYPE_META[a.type].label }}</span>
          </div>
          <span class="account-card__balance" :class="toneOf(a)">{{ balanceText(a) }}</span>
        </div>

        <div class="account-card__stats">
          <div v-if="a.type === 'credit'" class="stat">
            <span class="stat__num">{{ availableText(a) }}</span>
            <span class="stat__label">可用额度 / {{ formatCents(a.creditLimit, { withSymbol: true }) }}</span>
          </div>
          <div v-else class="stat">
            <span class="stat__num">{{ formatCents(a.initBalance, { withSymbol: true }) }}</span>
            <span class="stat__label">期初余额</span>
          </div>
          <div class="stat">
            <span class="stat__num">{{ a.txnCount.toLocaleString('zh-CN') }}</span>
            <span class="stat__label">笔流水</span>
          </div>
        </div>

        <div class="account-card__actions">
          <NButton size="small" tertiary @click="openEdit(a)">
            编辑
          </NButton>
          <NButton size="small" tertiary type="error" @click="openDelete(a)">
            删除
          </NButton>
        </div>
      </article>
    </div>

    <!-- 新增 / 编辑 -->
    <NModal
      v-model:show="formVisible"
      preset="card"
      :title="editingId == null ? '新建账户' : '编辑账户'"
      style="width: min(460px, 92vw)"
    >
      <div class="form-body">
        <label class="form-label">名称</label>
        <NInput v-model:value="form.name" placeholder="如：招商储蓄卡、支付宝" maxlength="20" />

        <label class="form-label">类型</label>
        <NSelect v-model:value="form.type" :options="typeOptions" />

        <label class="form-label">图标（emoji）</label>
        <NInput v-model:value="form.icon" placeholder="🏦" maxlength="4" />

        <label v-if="form.type !== 'credit'" class="form-label">期初余额（元）</label>
        <NInput
          v-if="form.type !== 'credit'"
          v-model:value="form.initBalanceYuan"
          placeholder="0.00"
          inputmode="decimal"
        />

        <label class="form-row">
          <span>这是信用卡（可透支）</span>
          <NSwitch v-model:value="form.isCredit" />
        </label>

        <template v-if="form.isCredit">
          <label class="form-label">信用额度（元）</label>
          <NInput v-model:value="form.creditLimitYuan" placeholder="0.00" inputmode="decimal" />
        </template>
      </div>
      <template #footer>
        <div class="modal-footer">
          <NButton quaternary @click="formVisible = false">
            取消
          </NButton>
          <NButton type="primary" :loading="submitting" @click="submitForm">
            保存
          </NButton>
        </div>
      </template>
    </NModal>

    <!-- 删除：先迁流水，再删账户 -->
    <NModal
      v-model:show="deleteVisible"
      preset="card"
      title="删除账户"
      style="width: min(460px, 92vw)"
    >
      <div class="delete-body">
        <p class="delete-warn">
          确定删除「<b>{{ target?.name }}</b>」吗？
        </p>
        <p v-if="usage.total > 0" class="delete-detail">
          该账户下有 <b>{{ usage.total }}</b> 笔流水，
          <template v-if="usage.transfer > 0">
            其中 <b>{{ usage.transfer }}</b> 笔是转账（两端都是账户，删除后无法成立，将一并清理）。
          </template>
          其余收支将迁移到下方账户，账目不会丢。
        </p>
        <label class="form-label">流水迁移到</label>
        <NSelect
          v-model:value="migrateTo"
          :options="migrateOptions"
          :render-label="renderEmojiLabel"
          placeholder="选择目标账户"
        />
      </div>
      <template #footer>
        <div class="modal-footer">
          <NButton quaternary @click="deleteVisible = false">
            取消
          </NButton>
          <NButton type="error" :loading="deleting" @click="confirmDelete">
            删除
          </NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped lang="scss">
.account-page {
  display: flex;
  flex-direction: column;
  gap: var(--lz-space-6);
  padding: var(--lz-content-padding);
  max-width: 1120px;
  margin: 0 auto;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--lz-text-primary);
  margin: 0;
}

.page-sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--lz-text-secondary);
}

// ── 汇总 ────────────────────────────────────────────────
.summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--lz-space-4);
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--lz-space-4);
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);

  &--net {
    border-color: var(--lz-primary-300);
  }
}

.summary-card__label {
  font-size: 12px;
  color: var(--lz-text-secondary);
}

.summary-card__value {
  font-size: 24px;
  font-weight: 600;
  font-family: var(--lz-font-num);
  font-variant-numeric: tabular-nums;
}

.summary-card__hint {
  font-size: 12px;
  color: var(--lz-text-secondary);
}

// ── 账户卡片 ─────────────────────────────────────────────
.account-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--lz-space-4);
}

.account-card {
  display: flex;
  flex-direction: column;
  gap: var(--lz-space-3);
  padding: var(--lz-space-4);
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  transition: border-color var(--lz-duration-base) var(--lz-ease-standard),
    box-shadow var(--lz-duration-base) var(--lz-ease-standard);

  &:hover {
    box-shadow: var(--lz-shadow-sm);
  }
}

.account-card__head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.account-card__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--lz-radius-lg);
  background: var(--lz-bg-page);
  font-size: 22px;
  flex-shrink: 0;
}

.account-card__titles {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.account-card__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--lz-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-card__type {
  font-size: 12px;
  color: var(--lz-text-secondary);
}

.account-card__balance {
  font-size: 16px;
  font-weight: 600;
  font-family: var(--lz-font-num);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.account-card__stats {
  display: flex;
  gap: var(--lz-space-5);
  padding: var(--lz-space-3) 0;
  border-top: 1px solid var(--lz-border-light);
  border-bottom: 1px solid var(--lz-border-light);
}

.stat {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stat__num {
  font-size: 15px;
  font-weight: 600;
  color: var(--lz-text-primary);
  font-family: var(--lz-font-num);
  font-variant-numeric: tabular-nums;
}

.stat__label {
  font-size: 12px;
  color: var(--lz-text-secondary);
}

.account-card__actions {
  display: flex;
  gap: 8px;
}

// ── 语义色 ──────────────────────────────────────────────
.tone-danger {
  color: var(--lz-danger);
}

.tone-neutral {
  color: var(--lz-text-primary);
}

// ── 表单 ────────────────────────────────────────────────
.form-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--lz-text-regular);
  margin-top: 4px;
}

.form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--lz-text-regular);
  margin-top: 8px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.delete-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.delete-warn {
  font-size: 14px;
  color: var(--lz-text-regular);
  margin: 0;

  b {
    color: var(--lz-text-primary);
  }
}

.delete-detail {
  font-size: 13px;
  line-height: 1.6;
  color: var(--lz-text-secondary);
  margin: 0 0 6px;

  b {
    color: var(--lz-warning);
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: var(--lz-space-8);
  color: var(--lz-text-secondary);
  background: var(--lz-bg-card);
  border: 1px dashed var(--lz-border);
  border-radius: var(--lz-radius-xl);
}
</style>
