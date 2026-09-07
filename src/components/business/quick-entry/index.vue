<script setup lang="ts">
import type { InputInst } from 'naive-ui'
import type { TransactionType } from '@/enums/transaction'
import type { Transaction } from '@/types/transaction'
import { NButton, useMessage, useNotification } from 'naive-ui'
import { h, nextTick, reactive, ref, watch } from 'vue'
import { createTransaction, deleteTransaction } from '@/api/modules/transaction'
import { TRANSACTION_TYPE_META, TRANSACTION_TYPES } from '@/enums/transaction'
import { useDictStore } from '@/stores/modules/dict'
import { useQuickEntryStore } from '@/stores/modules/quickEntry'
import { formatCents, parseYuanToCents } from '@/utils/money'
import { formatDate, today } from '@/utils/temporal'

/**
 * 快速记账弹层 —— 全局「30 秒记一笔」入口（PRD US-001 / 8.3）
 * ====================================================================
 * 交互约定（与 PRD 8.3 对齐）：
 *   - 金额自动聚焦，大字 + ¥ 前缀，inputmode=decimal 唤数字键盘
 *   - Enter        → 保存并清空金额/备注，弹层不关（连续记账）
 *   - ⌘/Ctrl+Enter → 保存并关闭弹层
 *   - Esc          → 关闭（n-modal close-on-esc）
 *   - 类型切换时分类联动过滤；转账时隐藏分类、展开「转入账户」
 *
 * 金额以「元」字符串录入，提交时 parseYuanToCents 转「分」整数 —— 全程遵守
 * money.ts ADR-7 铁律，禁止 Math.round(元*100) 这种浮点运算。
 */

const quickEntry = useQuickEntryStore()
const dict = useDictStore()
const message = useMessage()
const notification = useNotification()

const amountInputRef = ref<InputInst | null>(null)
const submitting = ref(false)

const form = reactive({
  type: 'expense' as TransactionType,
  /** 金额（元）字符串，提交时才转分，避免输入过程受浮点污染 */
  amountText: '',
  categoryId: null as number | null,
  accountId: null as number | null,
  toAccountId: null as number | null,
  transDate: formatDate(today()),
  note: '',
})

// ── 分类选项：按类型过滤，转账不挂分类 ─────────────────
const availableCategories = computed(() => {
  if (form.type === 'transfer')
    return []
  return dict.categories.filter(c => c.type === form.type)
})

const categoryOptions = computed(() =>
  availableCategories.value.map(c => ({ label: `${c.icon} ${c.name}`, value: c.id })),
)

const accountOptions = computed(() =>
  dict.accounts.map(a => ({ label: `${a.icon} ${a.name}`, value: a.id })),
)

/** 金额实时预览：输入合法且非 0 时显示「= ¥1,234.56」 */
const previewText = computed(() => {
  const cents = parseYuanToCents(form.amountText)
  if (!Number.isFinite(cents) || cents === 0)
    return ''
  return formatCents(cents, { withSymbol: true })
})

// ── 打开弹层：加载字典 + 回填默认值 + 聚焦金额 ─────────
watch(() => quickEntry.visible, async (visible) => {
  if (!visible)
    return
  await dict.ensureLoaded()

  // 回填上次的分类/账户（PRD 8.3 默认值记忆）
  form.categoryId = quickEntry.lastCategoryId
  form.accountId = quickEntry.lastAccountId

  // 根据记忆分类的类型反推默认类型：上次记的是「工资」就默认切到「收入」
  const rememberedCategory = form.categoryId == null ? null : dict.categoryMap.get(form.categoryId)
  if (rememberedCategory)
    form.type = rememberedCategory.type
  else
    form.type = 'expense'

  nextTick(() => amountInputRef.value?.focus())
})

// ── 类型切换：清理不匹配的分类 ──────────────────────────
watch(() => form.type, (type) => {
  if (type === 'transfer') {
    form.categoryId = null
    return
  }
  const category = form.categoryId == null ? null : dict.categoryMap.get(form.categoryId)
  if (category && category.type !== type)
    form.categoryId = null
})

// ── 校验（就近反馈，PRD 9.2）───────────────────────────
function validate(): string | null {
  const cents = parseYuanToCents(form.amountText)
  if (!Number.isFinite(cents) || cents <= 0)
    return '请输入大于 0 的金额'
  if (form.type !== 'transfer' && form.categoryId == null)
    return '请选择分类'
  if (form.accountId == null)
    return '请选择账户'
  if (form.type === 'transfer') {
    if (form.toAccountId == null)
      return '请选择转入账户'
    if (form.toAccountId === form.accountId)
      return '转出账户与转入账户不能相同'
  }
  return null
}

/** 组装交易入参（mock 阶段 bookId 固定 1，US-005 多账本后从 book store 取） */
function buildInput(): Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> {
  const isTransfer = form.type === 'transfer'
  return {
    bookId: 1,
    type: form.type,
    amount: parseYuanToCents(form.amountText),
    currency: 'CNY',
    accountId: form.accountId!,
    toAccountId: isTransfer ? form.toAccountId : null,
    categoryId: isTransfer ? 0 : form.categoryId!,
    transDate: form.transDate,
    note: form.note.trim(),
    source: 'manual',
  }
}

/** 保存成功提示 + 撤销（10s 内可撤回，PRD 9.2 操作可撤销）
 *  message 无 action 能力，改用 notification 挂撤销按钮 */
function showSavedToast(tx: Transaction) {
  notification.success({
    title: '已记录',
    content: formatCents(tx.amount, { withSymbol: true }),
    duration: 10_000,
    action: () => h(NButton, {
      size: 'tiny',
      quaternary: true,
      onClick: async () => {
        await deleteTransaction(tx.id)
        notification.info({ title: '已撤销该笔记录' })
      },
    }, { default: () => '撤销' }),
  })
}

async function submit(closeAfter: boolean) {
  if (submitting.value)
    return
  const error = validate()
  if (error) {
    message.warning(error)
    return
  }

  submitting.value = true
  try {
    const created = await createTransaction(buildInput())

    // 记忆本次选择，作为下次默认值
    quickEntry.remember(form.categoryId, form.accountId)
    showSavedToast(created)

    // 清空金额/备注、保留类型/分类/账户，聚焦金额准备下一笔（PRD 8.3 连续记账）
    form.amountText = ''
    form.note = ''
    if (closeAfter)
      quickEntry.close()
    else
      nextTick(() => amountInputRef.value?.focus())
  }
  finally {
    submitting.value = false
  }
}

/** 键盘：Enter 保存清空、⌘/Ctrl+Enter 保存并关闭；焦点在 select/日期面板时不拦截 */
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Enter')
    return
  const target = e.target as HTMLElement | null
  if (target?.closest('.n-base-selection') || target?.closest('.n-date-panel'))
    return
  e.preventDefault()
  submit(e.metaKey || e.ctrlKey)
}
</script>

<template>
  <NModal
    v-model:show="quickEntry.visible"
    preset="card"
    class="quick-entry-modal"
    title="记一笔"
    :mask-closable="false"
    :close-on-esc="true"
    @keydown="onKeydown"
  >
    <div class="quick-entry">
      <!-- 类型：支出 / 收入 / 转账 -->
      <NRadioGroup v-model:value="form.type" name="quick-entry-type" class="type-group">
        <NRadioButton
          v-for="t in TRANSACTION_TYPES"
          :key="t"
          :value="t"
          class="type-btn"
        >
          {{ TRANSACTION_TYPE_META[t].label }}
        </NRadioButton>
      </NRadioGroup>

      <!-- 金额：大字聚焦 + ¥ 前缀 + 实时预览 -->
      <div class="amount-field">
        <div class="amount-input-wrap">
          <span class="amount-symbol">¥</span>
          <NInput
            ref="amountInputRef"
            v-model:value="form.amountText"
            placeholder="0.00"
            :input-props="{ inputmode: 'decimal', autocomplete: 'off' }"
            class="amount-input"
            aria-label="金额"
          />
        </div>
        <div v-if="previewText" class="amount-preview" aria-live="polite">
          = {{ previewText }}
        </div>
      </div>

      <!-- 分类 / 账户 -->
      <div class="field-grid">
        <div v-if="form.type !== 'transfer'" class="field">
          <label class="field-label">分类</label>
          <NSelect
            v-model:value="form.categoryId"
            :options="categoryOptions"
            placeholder="选择分类"
            filterable
            clearable
          />
        </div>
        <div class="field">
          <label class="field-label">{{ form.type === 'transfer' ? '转出账户' : '账户' }}</label>
          <NSelect
            v-model:value="form.accountId"
            :options="accountOptions"
            placeholder="选择账户"
          />
        </div>
        <div v-if="form.type === 'transfer'" class="field">
          <label class="field-label">转入账户</label>
          <NSelect
            v-model:value="form.toAccountId"
            :options="accountOptions"
            placeholder="选择账户"
          />
        </div>
      </div>

      <!-- 日期 / 备注 -->
      <div class="field-grid">
        <div class="field">
          <label class="field-label">日期</label>
          <NDatePicker
            v-model:formatted-value="form.transDate"
            value-format="yyyy-MM-dd"
            type="date"
            :clearable="false"
            class="date-picker"
          />
        </div>
        <div class="field">
          <label class="field-label">备注</label>
          <NInput
            v-model:value="form.note"
            placeholder="可选，写点备注"
            :input-props="{ maxlength: 100 }"
            @keydown.enter.prevent="submit(false)"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <div class="footer">
        <span class="footer-hint">Enter 保存 · ⌘Enter 保存并关闭 · Esc 关闭</span>
        <NButton type="primary" :loading="submitting" @click="submit(true)">
          保存
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped lang="scss">
.quick-entry {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 460px;
  max-width: 100%;
}

.type-group {
  display: flex;
  gap: 8px;
}

.type-btn {
  flex: 1;
  text-align: center;
}

// ── 金额：大字聚焦是快速记账的核心视觉重心 ──────────────
.amount-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.amount-input-wrap {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 16px;
  background: var(--lz-bg-page);
  border: 1px solid var(--lz-border);
  border-radius: 10px;
  transition: border-color 200ms;

  &:focus-within {
    border-color: var(--lz-primary-600);
    box-shadow: 0 0 0 3px var(--lz-primary-100);
  }
}

.amount-symbol {
  font-size: 24px;
  font-weight: 600;
  color: var(--lz-text-secondary);
}

// 覆盖 n-input 默认样式，放大金额字号（架构文档 8.2：金额右对齐、tabular-nums）
.amount-input {
  flex: 1;

  :deep(.n-input__input-el) {
    font-size: 34px;
    font-weight: 600;
    color: var(--lz-text-primary);
    font-variant-numeric: tabular-nums;
    text-align: left;
    padding: 0;
  }

  :deep(.n-input__border),
  :deep(.n-input__state-border) {
    border: none;
  }
}

.amount-preview {
  font-size: 13px;
  color: var(--lz-text-secondary);
  padding-left: 4px;
  font-variant-numeric: tabular-nums;
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  color: var(--lz-text-secondary);
}

.date-picker {
  width: 100%;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.footer-hint {
  font-size: 12px;
  color: var(--lz-text-secondary);
}
</style>
