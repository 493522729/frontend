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
 * 交互约定：
 *   - 金额自动聚焦，大字 + ¥ 前缀，inputmode=decimal 唤数字键盘
 *   - Enter        → 保存并关闭弹层（最常用，符合表单直觉）
 *   - Shift+Enter  → 保存并继续（连续记账）
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

// ── 金额输入做限制：只保留数字 + 单个小数点，最多 2 位小数 ─
function sanitizeAmount(text: string): string {
  // 1. 先删掉除数字和小数点以外的字符
  let s = text.replace(/[^0-9.]/g, '')
  // 2. 只保留第一个小数点
  const parts = s.split('.')
  if (parts.length > 2)
    s = `${parts[0]}.${parts.slice(1).join('')}`
  // 3. 小数点后最多两位
  if (s.includes('.')) {
    const [intPart, decPart] = s.split('.')
    s = `${intPart}.${(decPart ?? '').slice(0, 2)}`
  }
  // 4. 去掉无意义的前导零（保留 0 本身）
  s = s.replace(/^0+(?=\d)/, '')
  return s
}

// ── 金额输入实时过滤 ─────────────────────────────────
watch(() => form.amountText, (val) => {
  const sanitized = sanitizeAmount(val)
  if (sanitized !== val)
    form.amountText = sanitized
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
  const notice = notification.success({
    title: '已记录',
    content: formatCents(tx.amount, { withSymbol: true }),
    duration: 10_000,
    action: () => h(NButton, {
      size: 'tiny',
      quaternary: true,
      onClick: async () => {
        await deleteTransaction(tx.id)
        // 撤销完成后立即关闭通知：既防重复点击（二次删除已不存在的记录），
        // 也避免「已记录」的提示在记录已被撤走后还挂在屏幕上误导人
        notice.destroy()
        notification.info({ title: '已撤销该笔记录' })
        // 广播变更信号：列表把这笔移除
        quickEntry.notifyDataChanged()
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
    // 广播「数据已变更」信号：交易列表等页面 watch 它刷新数据
    quickEntry.notifyDataChanged()
    showSavedToast(created)

    // 清空金额/备注、保留类型/分类/账户，聚焦金额准备下一笔
    form.amountText = ''
    form.note = ''
    if (closeAfter) {
      quickEntry.close()
    }
    else {
      nextTick(() => amountInputRef.value?.focus())
    }
  }
  finally {
    submitting.value = false
  }
}

/** 键盘：Enter 保存关闭、Shift+Enter 保存继续；焦点在 select/日期面板时不拦截 */
function onKeydown(e: KeyboardEvent) {
  if (!quickEntry.visible)
    return
  if (e.key !== 'Enter')
    return
  const target = e.target as HTMLElement | null
  if (target?.closest('.n-base-selection') || target?.closest('.n-date-panel'))
    return
  e.preventDefault()
  submit(!e.shiftKey)
}

useEventListener(document, 'keydown', onKeydown)
</script>

<template>
  <!-- 宽度用内联 style：NModal 会把 class/style 透传到 Teleport 里的卡片元素，
       该元素不带本组件的 scoped 属性，scoped 样式选择器永远匹配不到（曾导致弹层全屏宽） -->
  <NModal
    v-model:show="quickEntry.visible"
    preset="card"
    class="quick-entry-modal"
    style="width: min(480px, 92vw)"
    title="记一笔"
    :mask-closable="false"
    :close-on-esc="true"
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
        <div v-if="form.type !== 'transfer'" class="field field-category">
          <label class="field-label">分类</label>
          <NSelect
            v-model:value="form.categoryId"
            :options="categoryOptions"
            placeholder="选择分类"
            filterable
            clearable
          />
        </div>
        <div class="field field-account">
          <label class="field-label">{{ form.type === 'transfer' ? '转出账户' : '账户' }}</label>
          <NSelect
            v-model:value="form.accountId"
            :options="accountOptions"
            placeholder="选择账户"
          />
        </div>
        <div v-if="form.type === 'transfer'" class="field field-transfer-to">
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
          />
        </div>
      </div>
    </div>

    <template #footer>
      <div class="footer">
        <span class="footer-hint">Enter 保存 · Shift+Enter 继续 · Esc 关闭</span>
        <div class="footer-actions">
          <NButton size="small" quaternary :disabled="submitting" @click="submit(false)">
            保存并继续
          </NButton>
          <NButton type="primary" :loading="submitting" @click="submit(true)">
            保存
          </NButton>
        </div>
      </div>
    </template>
  </NModal>
</template>

<style scoped lang="scss">
.quick-entry {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 4px 2px;
}

// ── 类型切换：分段按钮，选中态更突出 ──────────────────
.type-group {
  display: flex;
  gap: 8px;
  padding: 4px;
  background: var(--lz-bg-page);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);

  :deep(.n-radio-button) {
    flex: 1;
    border: none;
    border-radius: var(--lz-radius-lg);
    background: transparent;
    color: var(--lz-text-regular);
    transition: all 200ms var(--lz-ease-standard);

    &.n-radio-button--checked {
      background: var(--lz-primary-600);
      color: var(--lz-text-primary);
      box-shadow: var(--lz-shadow-sm);
    }
  }

  // Naive 把按钮边框 / focus ring 全画在 __state-border 装饰层的 box-shadow 上
  // （.n-radio-button:focus:not(:active) .n-radio-button__state-border），
  // 写 border:none 无效 —— 选中态是自绘的，这层装饰直接整体隐藏
  :deep(.n-radio-button__state-border),
  :deep(.n-radio-button__border) {
    display: none !important;
  }

  // 按钮间的分隔竖线是真实 DOM 元素（.n-radio-group__splitor），不是伪元素
  :deep(.n-radio-group__splitor) {
    display: none;
  }

  :deep(.n-radio-button__label) {
    width: 100%;
    display: block;
    padding: 8px 0;
    font-weight: 500;
    font-size: 13px;
  }
}

// ── 金额：更强的视觉重心和聚焦反馈 ──────────────────
.amount-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.amount-input-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 18px;
  background: var(--lz-bg-page);
  border: 2px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  transition: all 200ms var(--lz-ease-standard);

  &:focus-within {
    border-color: var(--lz-primary-600);
    box-shadow: 0 0 0 3px var(--lz-primary-100);
    background: var(--lz-bg-card);
  }
}

.amount-symbol {
  font-size: 22px;
  font-weight: 600;
  color: var(--lz-text-secondary);
}

.amount-input {
  flex: 1;

  // Naive 的垂直居中全部由 --n-height 推导：input-el 的 height/line-height、
  // placeholder 的 padding 都从它计算。该变量以内联 style 注入在根元素上，
  // 样式表覆盖必须 !important。设 48px 后高度/行高/垂直 padding 联动，
  // 28px 大字的光标垂直居中且不顶满（caret ≈ 33px，上下各余 ~7px）
  --n-height: 48px !important;

  :deep(.n-input__input-el) {
    font-size: 20px;
    font-weight: 600;
    color: var(--lz-text-primary);
    font-variant-numeric: tabular-nums;
    text-align: left;
    padding: 0;
    background: transparent;
  }

  // Naive 的边框实际画在 state-border 的 box-shadow 上，
  // 只写 border:none 删不掉 —— 聚焦时内层会残留一圈蓝框
  :deep(.n-input__border),
  :deep(.n-input__state-border) {
    border: none;
    box-shadow: none;
  }
}

.amount-preview {
  font-size: 14px;
  color: var(--lz-text-secondary);
  padding-left: 4px;
  font-variant-numeric: tabular-nums;
}

// ── 字段网格：加大间距和标签可读性 ──────────────────
.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--lz-text-regular);
}

.date-picker {
  width: 100%;
}

// ── 底部操作：按钮和提示分两边，更清晰 ──────────────
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}

.footer-hint {
  font-size: 13px;
  color: var(--lz-text-secondary);
  white-space: nowrap;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
