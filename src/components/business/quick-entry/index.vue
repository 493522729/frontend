<script setup lang="ts">
import type { InputInst } from 'naive-ui'
import type { TransactionType } from '@/enums/transaction'
import type { Transaction } from '@/types/transaction'
import { NButton, useMessage, useNotification } from 'naive-ui'
import { h, nextTick, reactive, ref, watch } from 'vue'
import { createTag } from '@/api/modules/tag'
import { createTransaction, deleteTransaction, newClientRequestId } from '@/api/modules/transaction'
import { budgetAlertAfterSave } from '@/composables/budgetAlert'
import { TRANSACTION_TYPE_META, TRANSACTION_TYPES } from '@/enums/transaction'
import { useAccountStore } from '@/stores/modules/account'
import { useBookStore } from '@/stores/modules/book'
import { useDictStore } from '@/stores/modules/dict'
import { useQuickEntryStore } from '@/stores/modules/quickEntry'
import { useSettingsStore } from '@/stores/modules/settings'
import { useTagStore } from '@/stores/modules/tag'
import { formatCents, parseYuanToCents } from '@/utils/money'
import { dotOption, emojiOption, renderDotLabel, renderEmojiLabel } from '@/utils/select-option'
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
const book = useBookStore()
const accountStore = useAccountStore()
const settings = useSettingsStore()
const tagStore = useTagStore()
const message = useMessage()
const notification = useNotification()

const amountInputRef = ref<InputInst | null>(null)
const submitting = ref(false)

const TAG_COLORS = ['#378ADD', '#0F6E56', '#993C1D', '#993556', '#854F0B', '#534AB7', '#1D9E75', '#D85A30', '#A32D2D', '#5F5E5A']
let tagColorCursor = 0

const form = reactive({
  type: 'expense' as TransactionType,
  /** 金额（元）字符串，提交时才转分，避免输入过程受浮点污染 */
  amountText: '',
  categoryId: null as number | null,
  accountId: null as number | null,
  toAccountId: null as number | null,
  transDate: formatDate(today()),
  note: '',
  /** 标签：number = 已有标签，string = 待创建的新标签名 */
  tagIds: [] as Array<number | string>,
})

/** 标签下拉选项（来自 tag store，色点 + 名称） */
const tagOptions = computed(() => tagStore.tags.map(t => dotOption(t.color, t.name, t.id)))

/**
 * NSelect（multiple + tag）值变化：用户回车输入的「新名字」以字符串进入 value，
 * 这里逐条识别并 createTag 入库，再把字符串替换成 id，保证提交时都是数字 id。
 */
async function onTagChange(val: Array<number | string>) {
  const resolved: number[] = []
  for (const v of val) {
    if (typeof v === 'number') {
      resolved.push(v)
      continue
    }
    const name = String(v).trim()
    if (!name)
      continue
    try {
      const created = await createTag({ name, color: TAG_COLORS[tagColorCursor++ % TAG_COLORS.length]! })
      tagStore.tags.push(created)
      resolved.push(created.id)
    }
    catch {
      message.error(`标签「${name}」创建失败`)
    }
  }
  form.tagIds = resolved
}

// ── 分类选项：按类型过滤，转账不挂分类 ─────────────────
const availableCategories = computed(() => {
  if (form.type === 'transfer')
    return []
  return dict.categories.filter(c => c.type === form.type)
})

const categoryOptions = computed(() =>
  availableCategories.value.map(c => emojiOption(c.icon, c.name, c.id)),
)

const accountOptions = computed(() =>
  dict.accounts.map(a => emojiOption(a.icon, a.name, a.id)),
)

/** 金额实时预览：输入合法且非 0 时显示「= ¥1,234.56」 */
const previewText = computed(() => {
  const cents = parseYuanToCents(form.amountText)
  if (!Number.isFinite(cents) || cents === 0)
    return ''
  return formatCents(cents, { withSymbol: true })
})

/**
 * 转出账户的可用余额（支出 / 转账前给个底）
 *
 * 信用卡返回「剩余额度」而不是余额 —— 刷信用卡花的是额度，
 * 显示余额（负数）只会让人以为卡里没钱了。
 *
 * 只做提示不做硬校验：mock 数据是随机生成的，账户余额本就是负的，
 * 硬拦会让弹层在演示环境里根本存不进去；真后端数据平衡后可升级为校验。
 */
const fromAvailableText = computed(() => {
  if (form.accountId == null)
    return ''
  const a = accountStore.accountMap.get(form.accountId)
  if (!a)
    return ''
  const available = accountStore.availableOf(form.accountId)
  const label = a.type === 'credit' ? '可用额度' : '可用'
  // 余额为负（mock 常见）时加个后缀说明，免得用户以为算错了
  const suffix = available < 0 ? '（已透支）' : ''
  return `${label} ${formatCents(available, { withSymbol: true })}${suffix}`
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
  // 账户按账本加载（dict 内部记账本标记，切过账本会重新拉）
  await dict.ensureLoaded(book.currentBookId)
  // 标签是用户级资源，打开弹层时懒加载一次
  void tagStore.ensureLoaded()
  // 余额（可用额度）来自账户 store，单独按需加载：它只在支出/转账时用于提示，
  // 不阻塞上面的字典加载，避免为了一句「可用 ¥x」把弹层打开变慢
  void accountStore.ensureLoaded()

  // 回填上次的分类/账户（PRD 8.3 默认值记忆）
  form.categoryId = quickEntry.lastCategoryId
  // 账户是账本隔离的：记忆里的账户可能属于别的账本，回填前必须校验。
  // 否则会把「日常账本的招商卡」塞给装修账本，一保存就串账本了
  form.accountId = dict.accounts.some(a => a.id === quickEntry.lastAccountId)
    ? quickEntry.lastAccountId
    : null

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

/** 组装交易入参 —— 落到当前账本下（US-005） */
function buildInput(): Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> {
  const isTransfer = form.type === 'transfer'
  return {
    bookId: book.currentBookId,
    type: form.type,
    amount: parseYuanToCents(form.amountText),
    currency: 'CNY',
    accountId: form.accountId!,
    toAccountId: isTransfer ? form.toAccountId : null,
    categoryId: isTransfer ? 0 : form.categoryId!,
    transDate: form.transDate,
    note: form.note.trim(),
    tagIds: form.tagIds.filter((v): v is number => typeof v === 'number'),
    source: 'manual',
  }
}

/**
 * 幂等重试快照（2026-09-19）。
 *
 * 后端 `POST /transactions` 会按 `(userId, clientRequestId)` 去重，键由这里维护，
 * 规则就三条（**别简化成「内容哈希」**，那会让「故意记两笔一模一样的账」的第二笔被静默吞掉）：
 *   ① 内容没变的重试 ⇒ **复用上一次的键** —— 超时的那个请求很可能其实已经落库了，
 *      带同一个键再发，服务端会命中幂等并把原来那笔返回来（前端照常走成功路径）；
 *   ② 内容变了（改了金额/分类/日期/备注）⇒ 换新键 —— 用户确实要记的是另一笔，
 *      沿用旧键只会让服务端把旧内容返回来、把用户刚改的东西吞掉；
 *   ③ 提交成功 ⇒ **清空** —— 下一次记账必须用新键。
 *
 * ⚠️ **「故意记两笔一模一样的账」为什么不会被吞**（最容易被想歪的一处，改这块前先读）：
 *    键的来源是**提交意图**（每次 `newClientRequestId()` 都是新的随机串），不是内容 ——
 *    复用只发生在「上一次提交**没成功**、且内容逐字没变」这**一个**窗口里。
 *    而「连记两笔相同的账」中间必然夹着一次**成功** ⇒ 那一刻 `pendingAttempt` 已被清空
 *    ⇒ 第二笔拿到的必定是全新键 ⇒ 服务端查不到 ⇒ 照常新建。
 *    ⇒ 推论：**任何「由内容派生键」的写法（`hash(内容)`、取内容里的字段拼一个）都会把第二笔吞掉**，
 *      因为它们把「两次成功的提交」也算成了同一个意图。宁可重复也不能静默吞账，别这么改。
 *
 * 为什么不能只靠按钮 loading：`submitting` 在 `finally` 里复位，而「请求超时」正是
 * 「前端以为失败、服务端已经写进去了」—— 用户看到报错再点一次，就是实打实的第二笔。
 */
let pendingAttempt: { key: string, snapshot: string } | null = null

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
        void book.refresh()
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

  /*
   * 组装入参 + 定幂等键（规则见上面 pendingAttempt 的注释）：
   * 快照在**组装之后、提交之前**取，所以「用户改了内容再点」天然是新快照 ⇒ 新键。
   */
  const input = buildInput()
  const snapshot = JSON.stringify(input)
  if (!pendingAttempt || pendingAttempt.snapshot !== snapshot)
    pendingAttempt = { key: newClientRequestId(), snapshot }
  // 取局部引用：下面中途会把 pendingAttempt 置空，但这一次请求用的键必须固定
  const attemptKey = pendingAttempt.key

  submitting.value = true
  try {
    const created = await createTransaction({ ...input, clientRequestId: attemptKey })
    // 成功才清空：下一次记账用新键（见 pendingAttempt 注释的第 ③ 条）
    pendingAttempt = null

    // 记忆本次选择，作为下次默认值
    quickEntry.remember(form.categoryId, form.accountId)
    // 广播「数据已变更」信号：交易列表等页面 watch 它刷新数据
    quickEntry.notifyDataChanged()
    // 账本摘要里的笔数变了，顶栏切换器同步（不影响当前输入）
    void book.refresh()
    showSavedToast(created)

    // 预算预警（US-006 验收：超 80% toast）——只对支出查；未设预算 / 未达阈值返回 null
    const budgetAlert = await budgetAlertAfterSave(created)
    if (budgetAlert) {
      if (budgetAlert.level === 'error')
        message.error(budgetAlert.text, { duration: 6000 })
      else
        message.warning(budgetAlert.text, { duration: 6000 })
    }

    // 清空金额/备注、保留类型/分类/账户，聚焦金额准备下一笔
    form.amountText = ''
    form.note = ''
    form.tagIds = []
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
      <!-- 类型：支出 / 收入 / 转账（语义色随「金额配色偏好」走，见 styles 里的说明） -->
      <NRadioGroup v-model:value="form.type" name="quick-entry-type" class="type-group">
        <NRadioButton
          v-for="t in TRANSACTION_TYPES"
          :key="t"
          :value="t"
          class="type-btn"
          :style="{ '--type-tone': settings.typeColor(t) }"
        >
          {{ TRANSACTION_TYPE_META[t].label }}
        </NRadioButton>
      </NRadioGroup>

      <!-- 金额：大字聚焦 + ¥ 前缀 + 实时预览 -->
      <div class="amount-field">
        <div class="amount-input-wrap">
          <span class="amount-symbol">¥</span>
          <!-- bordered=false：Naive 在 mergedBordered 为真时会额外渲染
               __border / __state-border 两层绝对定位的装饰元素（border: var(--n-border)），
               这两层就是「大框套小框」里那个小框。与其在样式里和它赛跑，
               不如从源头让它不渲染；下面的变量打平与 :deep 隐藏是双保险。 -->
          <NInput
            ref="amountInputRef"
            v-model:value="form.amountText"
            placeholder="0.00"
            :bordered="false"
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
            :render-label="renderEmojiLabel"
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
            :render-label="renderEmojiLabel"
            placeholder="选择账户"
          />
          <span v-if="fromAvailableText" class="field-hint">{{ fromAvailableText }}</span>
        </div>
        <div v-if="form.type === 'transfer'" class="field field-transfer-to">
          <label class="field-label">转入账户</label>
          <NSelect
            v-model:value="form.toAccountId"
            :options="accountOptions"
            :render-label="renderEmojiLabel"
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

      <!-- 标签 -->
      <div class="field">
        <label class="field-label">标签</label>
        <NSelect
          :value="form.tagIds"
          :options="tagOptions"
          :render-label="renderDotLabel"
          multiple
          filterable
          tag
          placeholder="可选，输入新标签回车即创建"
          :input-props="{ 'aria-label': '标签' }"
          @update:value="(v: any) => onTagChange(v)"
        />
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
    @include transition-paint();

    &:hover:not(.n-radio-button--checked) {
      background: var(--lz-bg-hover);
    }

    /**
     * 选中态：不做「实心色块 + 白字」。
     *
     * 原来写的是 background: primary-600 + color: text-primary，两种模式都读不清：
     *   亮色档 primary-600(#2a6bb4) 上写 text-primary(#1a2233) —— 深蓝底压深蓝字；
     *   暗色档 primary-600 变成浅蓝(#94c4ea)，又配上浅色文字 #e8edf5。
     * 根本原因是「主色填充」和「正文色」是两套独立 token，没有任何一种主题下
     * 会恰好构成前后景关系，所以这组搭配从原理上就不成立。
     *
     * 改成 macOS 分段控件的做法：在轨道上「浮起一粒」。文字改用该类型的语义色
     * （支出红 / 收入绿 / 转账蓝），由 --type-tone 传入 —— 于是这里的选中色
     * 也跟着「系统设置 → 金额配色偏好」翻转，与全站金额配色同源。
     * bg-card 在亮色档是纯白、暗色档是深灰，两边都比轨道更亮，所以浮起感成立。
     */
    &.n-radio-button--checked {
      background: var(--lz-bg-card);
      color: var(--type-tone, var(--lz-text-primary));
      // 细内描边给暗色档兜底：暗色下弹层底色与 bg-card 相同，只靠阴影浮不起来
      box-shadow: var(--lz-shadow-sm), inset 0 0 0 1px var(--lz-border);

      .n-radio-button__label {
        font-weight: 600;
      }
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
  @include transition-paint();

  &:focus-within {
    border-color: var(--lz-primary-600);
    box-shadow: 0 0 0 3px var(--lz-primary-100);
    background: var(--lz-bg-card);
  }
}

.amount-symbol {
  @include tabular;

  font-size: 22px;
  font-weight: 600;
  color: var(--lz-text-secondary);
}

.amount-input {
  flex: 1;
  /**
   * Naive 的输入框外壳是「一堆主题变量 + 四层 DOM」拼出来的，只写一次
   * border: none 删不掉 —— 外层 .amount-input-wrap 已经是那个「框」了，
   * 内层必须整体清空，否则会看到「外框 + 内框」的双层描边叠一个白底方块。
   *
   *   ① 根元素 .n-input 自带 background-color: var(--n-color)，
   *      并且 :hover / .n-input--focus 会分别换成 --n-color-hover / --n-color-focus；
   *   ② .n-input__border 画 1px 描边（border: var(--n-border)）；
   *   ③ .n-input__state-border 承担 hover 描边与 focus 的 box-shadow 光圈。
   *
   * 之所以不逐个 DOM 层去覆盖：这样写等于和 Naive 的内部实现赛跑，它换个
   * 状态类名就又漏一个。直接把外壳相关的变量一次打成 transparent / none，
   * 所有状态（含 disabled、以及未来新增的状态类）都自动走同一条路。
   *
   * 这些变量是 Naive 以行内 style 注入在根元素上的，样式表要盖住必须 !important。
   */
  --n-height: 48px !important; // 垂直居中相关的一切尺寸（含 placeholder）都由它推导
  --n-color: transparent !important;
  --n-color-hover: transparent !important;
  --n-color-focus: transparent !important;
  --n-color-disabled: transparent !important;
  --n-border: none !important;
  --n-border-hover: none !important;
  --n-border-disabled: none !important;
  --n-box-shadow-focus: none !important;
  // 左右内边距归零：留白统一交给外层 wrap，避免文字被二次缩进
  --n-padding-left: 0 !important;
  --n-padding-right: 0 !important;
  // placeholder 与已输入文字同号同重，否则一聚焦就「跳字」
  --n-placeholder-color: var(--lz-text-placeholder) !important;

  // 万一上面的变量注入被 Naive 的内部层绕过（不同版本注入位置不一样），
  // 这里再显式卸载这两层装饰元素本身。display:none 是终局手段，
  // 它们不参与布局（position:absolute），隐藏不会影响输入区尺寸
  :deep(.n-input__border),
  :deep(.n-input__state-border) {
    display: none !important;
  }

  :deep(.n-input__input-el) {
    @include tabular;

    font-size: 20px;
    font-weight: 600;
    color: var(--lz-text-primary);
    text-align: left;
    padding: 0;
    background: transparent;
  }

  // placeholder 是绝对定位铺满的独立元素（原生 ::placeholder 被 Naive 设成了透明），
  // 所以字号要单独给，并且要自己垂直居中
  :deep(.n-input__placeholder) {
    display: flex;
    align-items: center;
    font-size: 20px;
    font-weight: 600;
  }
}

.amount-preview {
  @include tabular;

  font-size: 14px;
  color: var(--lz-text-secondary);
  padding-left: 4px;
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

// 账户可用余额提示：弱化到辅助层级，不抢主输入框的注意力
.field-hint {
  font-size: 12px;
  color: var(--lz-text-secondary);
  font-variant-numeric: tabular-nums;
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
