<script setup lang="ts">
import type { RecurringType } from '@/types/recurring'
import {
  NButton,
  NCard,
  NDatePicker,
  NForm,
  NFormItemGi,
  NGrid,
  NInput,
  NModal,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
  NText,
  useDialog,
  useMessage,
} from 'naive-ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, reactive, ref } from 'vue'
import EmptyState from '@/components/business/empty-state/index.vue'
import { useBookStore } from '@/stores/modules/book'
import { useDictStore } from '@/stores/modules/dict'
import { useRecurringStore } from '@/stores/modules/recurring'
import { formatCents } from '@/utils/money'
import { emojiOption, renderEmojiLabel } from '@/utils/select-option'

const recurring = useRecurringStore()
const book = useBookStore()
const dict = useDictStore()
const { templates, pending } = storeToRefs(recurring)
const { categories, accounts, categoryMap, accountMap } = storeToRefs(dict)

const message = useMessage()
const dialog = useDialog()

// 字典：分类 / 账户（走真实后端，由 dict store 按需缓存；账户按当前账本加载）

// ── 模板表单（新增 / 编辑共用） ──────────────────────
const showForm = ref(false)
const editingId = ref<number | null>(null)
/** 模板保存中（连点防护：建模板没有幂等键，双击会建出两个一样的模板） */
const formSubmitting = ref(false)
const form = reactive({
  type: 'expense' as RecurringType,
  amountYuan: '',
  categoryId: null as number | null,
  accountId: null as number | null,
  /** 转入账户：仅「转账」用（非转账恒为 null，提交时也不下发） */
  toAccountId: null as number | null,
  note: '',
  startDate: '',
  autoConfirm: false,
  active: true,
})
/** 起始日时间戳（NDatePicker 绑定 number），提交时转成 YYYY-MM-DD 字符串 */
const startDateTs = ref<number | null>(null)

/** 转账：不看分类（categoryOptions 会因 form.type='transfer' 过滤成空，正好），改看转出/转入两端 */
const isTransfer = computed(() => form.type === 'transfer')

const categoryOptions = computed(() =>
  categories.value.filter(c => c.type === form.type).map(c => emojiOption(c.icon, c.name, c.id)),
)
const accountOptions = computed(() =>
  accounts.value.map(a => emojiOption(a.icon, a.name, a.id)),
)

// ── 展示辅助：转账没有「正负号 / 分类」语义，模板行、待确认行、确认弹窗三处共用 ──
function typeLabel(type: RecurringType) {
  return type === 'income' ? '收入' : type === 'transfer' ? '转账' : '支出'
}
/** 标签色：转账用 info —— 它既不是收入也不是支出，别用红绿误导 */
function typeTagType(type: RecurringType) {
  return type === 'income' ? 'success' : type === 'transfer' ? 'info' : 'error'
}
/** 金额文案：转账不带正负号（钱只是在自己账户之间搬家） */
function amountText(type: RecurringType, amount: number) {
  if (type === 'transfer')
    return formatCents(amount)
  return `${type === 'income' ? '+' : '-'}${formatCents(amount)}`
}
/** 账户文案：转账显示「转出 → 转入」（只写转出会让人以为钱凭空少了） */
function accountText(type: RecurringType, accountId: number, toAccountId: number | null) {
  const from = accountMap.value.get(accountId)?.name ?? '-'
  if (type !== 'transfer')
    return from
  return `${from} → ${toAccountId == null ? '-' : (accountMap.value.get(toAccountId)?.name ?? '-')}`
}
/** 元信息：收支是「分类 · 账户」，转账没有分类 ⇒ 只写「转出 → 转入」 */
function metaText(type: RecurringType, categoryId: number, accountId: number, toAccountId: number | null) {
  const acct = accountText(type, accountId, toAccountId)
  return type === 'transfer' ? acct : `${categoryMap.value.get(categoryId)?.name ?? '-'} · ${acct}`
}

function resetForm() {
  form.type = 'expense'
  form.amountYuan = ''
  form.categoryId = null
  form.accountId = null
  form.toAccountId = null
  form.note = ''
  form.startDate = ''
  form.autoConfirm = false
  form.active = true
  startDateTs.value = null
}

function openCreate() {
  editingId.value = null
  resetForm()
  showForm.value = true
}

function openEdit(t: { id: number, type: RecurringType, amount: number, categoryId: number, accountId: number, toAccountId: number | null, note: string, startDate: string, autoConfirm: boolean, active: boolean }) {
  editingId.value = t.id
  form.type = t.type
  form.amountYuan = (t.amount / 100).toString()
  form.categoryId = t.categoryId
  form.accountId = t.accountId
  form.toAccountId = t.toAccountId
  form.note = t.note
  form.startDate = t.startDate
  form.autoConfirm = t.autoConfirm
  form.active = t.active
  const [y, m, d] = t.startDate.split('-').map(Number)
  startDateTs.value = y ? new Date(y, (m ?? 1) - 1, d ?? 1).getTime() : null
  showForm.value = true
}

async function submitForm() {
  // 连点防护：函数入口拦一道（按钮 :loading 只挡鼠标点击，建模板又没有幂等键）
  if (formSubmitting.value)
    return
  const amount = Math.round(Number(form.amountYuan) * 100)
  if (!form.amountYuan || !Number.isFinite(amount) || amount <= 0) {
    message.warning('请填写有效金额')
    return
  }
  if (form.accountId == null) {
    message.warning(isTransfer.value ? '请选择转出账户' : '请选择账户')
    return
  }
  if (isTransfer.value) {
    // 转账两端：缺一端记不成，撞成同一个账户等于「自转自」（后端也有同款校验）
    if (form.toAccountId == null) {
      message.warning('请选择转入账户')
      return
    }
    if (form.toAccountId === form.accountId) {
      message.warning('转出和转入不能是同一个账户')
      return
    }
  }
  else if (form.categoryId == null) {
    message.warning('请选择分类')
    return
  }
  if (startDateTs.value == null) {
    message.warning('请选择起始日')
    return
  }
  const dd = new Date(startDateTs.value)
  form.startDate = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`
  const payload = {
    bookId: book.currentBookId,
    type: form.type,
    amount,
    // 转账不看分类：与手工转账同口径存 0（后端也不会读它）
    categoryId: isTransfer.value ? 0 : (form.categoryId ?? 0),
    accountId: form.accountId,
    toAccountId: isTransfer.value ? form.toAccountId : null,
    note: form.note.trim(),
    startDate: form.startDate,
    autoConfirm: form.autoConfirm,
    active: form.active,
  }
  formSubmitting.value = true
  try {
    if (editingId.value != null) {
      await recurring.updateTemplateEntry(editingId.value, payload)
      message.success('模板已更新')
    }
    else {
      await recurring.createTemplateEntry(payload)
      message.success('模板已创建')
    }
    showForm.value = false
  }
  catch (e) {
    message.error((e as Error).message || '保存失败')
  }
  finally {
    formSubmitting.value = false
  }
}

async function toggleAutoConfirm(id: number) {
  await recurring.toggleAutoConfirmEntry(id)
}
async function toggleActive(id: number, active: boolean) {
  await recurring.updateTemplateEntry(id, { active })
}

function askDelete(id: number) {
  dialog.warning({
    title: '删除模板',
    content: '删除后该周期账单不再生成待确认项，已确认的历史流水不受影响。',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await recurring.deleteTemplateEntry(id)
      message.success('已删除')
    },
  })
}

// ── 待确认项：确认 / 改 / 删 ──────────────────────────
const showConfirm = ref(false)
/** 确认入账中（连点防护：每点一次就真写一笔流水） */
const confirmSubmitting = ref(false)
/** 待确认项的形状（带 type / toAccountId —— 转账确认时两端都要能改） */
interface ConfirmTarget {
  templateId: number
  type: RecurringType
  amount: number
  categoryId: number
  accountId: number
  toAccountId: number | null
  note: string
  dueDate: string
}
const confirmTarget = ref<ConfirmTarget | null>(null)
const confirmForm = reactive({ amountYuan: '', categoryId: null as number | null, accountId: null as number | null, toAccountId: null as number | null, note: '' })
/** 确认弹窗里这一笔是不是转账（决定「分类 / 转入账户」哪一项可见、校验哪一条） */
const confirmIsTransfer = computed(() => confirmTarget.value?.type === 'transfer')
/*
 * 确认弹窗的分类候选要按**这一笔的类型**过滤，不能复用表单那个 categoryOptions
 * —— 后者跟着 form.type 走，改过模板类型后再确认另一笔会列出不匹配的分类。
 */
const confirmCategoryOptions = computed(() => {
  const t = confirmTarget.value
  if (t == null)
    return []
  return categories.value.filter(c => c.type === t.type).map(c => emojiOption(c.icon, c.name, c.id))
})

function openConfirm(p: ConfirmTarget) {
  confirmTarget.value = p
  confirmForm.amountYuan = (p.amount / 100).toString()
  confirmForm.categoryId = p.categoryId
  confirmForm.accountId = p.accountId
  confirmForm.toAccountId = p.toAccountId
  confirmForm.note = p.note
  showConfirm.value = true
}

async function submitConfirm() {
  // 连点防护：确认会真的写一笔流水进去
  if (confirmSubmitting.value)
    return
  if (!confirmTarget.value)
    return
  const amount = Math.round(Number(confirmForm.amountYuan) * 100)
  if (!confirmForm.amountYuan || !Number.isFinite(amount) || amount <= 0) {
    message.warning('请填写有效金额')
    return
  }
  if (confirmForm.accountId == null) {
    message.warning(confirmIsTransfer.value ? '请选择转出账户' : '请选择账户')
    return
  }
  if (confirmIsTransfer.value) {
    if (confirmForm.toAccountId == null) {
      message.warning('请选择转入账户')
      return
    }
    if (confirmForm.toAccountId === confirmForm.accountId) {
      message.warning('转出和转入不能是同一个账户')
      return
    }
  }
  else if (confirmForm.categoryId == null) {
    message.warning('请选择分类')
    return
  }
  confirmSubmitting.value = true
  try {
    await recurring.confirmPendingEntry({
      bookId: book.currentBookId,
      templateId: confirmTarget.value.templateId,
      amount,
      // 转账不看分类（存 0，与手工转账一致）
      categoryId: confirmIsTransfer.value ? 0 : (confirmForm.categoryId ?? 0),
      accountId: confirmForm.accountId,
      // 只有转账才下发转入账户；非转账留 undefined = 不覆盖（后端本来也不会带）
      toAccountId: confirmIsTransfer.value ? (confirmForm.toAccountId ?? undefined) : undefined,
      note: confirmForm.note.trim(),
    })
    message.success('已确认入账')
    showConfirm.value = false
  }
  catch (e) {
    message.error((e as Error).message || '确认失败')
  }
  finally {
    confirmSubmitting.value = false
  }
}

async function dismiss(p: { templateId: number }) {
  await recurring.dismissEntry(p.templateId)
  message.info('已跳过本月该笔')
}

onMounted(async () => {
  recurring.ensureLoaded()
  await dict.ensureLoaded(book.currentBookId)
})
</script>

<template>
  <div class="recurring-page">
    <NSpace vertical :size="16">
      <!-- 待确认队列（本月） -->
      <NCard title="待确认队列 · 本月" :bordered="false">
        <template v-if="pending.length">
          <NSpace vertical :size="10">
            <div v-for="p in pending" :key="p.key" class="pending-row">
              <div class="pending-main">
                <NText strong>
                  {{ p.note }}
                </NText>
                <NTag size="small" :type="typeTagType(p.type)" :bordered="false">
                  {{ typeLabel(p.type) }}
                </NTag>
                <NText :type="typeTagType(p.type)">
                  {{ amountText(p.type, p.amount) }}
                </NText>
                <NText depth="3" class="pending-meta">
                  {{ metaText(p.type, p.categoryId, p.accountId, p.toAccountId) }} · 计划 {{ p.dueDate }}
                </NText>
              </div>
              <NSpace :size="8">
                <NButton size="small" type="primary" @click="openConfirm(p)">
                  确认
                </NButton>
                <NButton size="small" @click="openConfirm(p)">
                  改
                </NButton>
                <NButton size="small" tertiary @click="dismiss(p)">
                  跳过
                </NButton>
              </NSpace>
            </div>
          </NSpace>
        </template>
        <EmptyState
          v-else
          variant="inbox"
          size="sm"
          title="本月没有待确认的周期账单"
          desc="周期账单会在到期日自动生成，到时来这里确认"
        />
      </NCard>

      <!-- 模板配置 -->
      <NCard title="周期账单模板">
        <template #header-extra>
          <NButton size="small" type="primary" @click="openCreate">
            + 新增模板
          </NButton>
        </template>
        <template v-if="templates.length">
          <NSpace vertical :size="10">
            <div v-for="t in templates" :key="t.id" class="tpl-row">
              <div class="tpl-main">
                <NText strong>
                  {{ t.note }}
                </NText>
                <NTag size="small" :type="typeTagType(t.type)" :bordered="false">
                  {{ typeLabel(t.type) }}
                </NTag>
                <NText :type="typeTagType(t.type)">
                  {{ amountText(t.type, t.amount) }}
                </NText>
                <NText depth="3" class="tpl-meta">
                  {{ metaText(t.type, t.categoryId, t.accountId, t.toAccountId) }} · 自 {{ t.startDate }}
                </NText>
              </div>
              <NSpace :size="10" align="center">
                <NSwitch :value="t.autoConfirm" size="small" @update:value="() => toggleAutoConfirm(t.id)">
                  <template #checked>
                    自动
                  </template>
                  <template #unchecked>
                    手动
                  </template>
                </NSwitch>
                <NSwitch :value="t.active" size="small" @update:value="(v: boolean) => toggleActive(t.id, v)" />
                <NButton size="small" tertiary @click="openEdit(t)">
                  编辑
                </NButton>
                <NButton size="small" tertiary type="error" @click="askDelete(t.id)">
                  删除
                </NButton>
              </NSpace>
            </div>
          </NSpace>
        </template>
        <EmptyState
          v-else
          variant="recurring"
          size="sm"
          title="还没有周期账单模板"
          desc="房租、订阅、工资这类每月固定的收支，建个模板自动生成"
        >
          <NButton size="small" type="primary" @click="openCreate">
            新建模板
          </NButton>
        </EmptyState>
      </NCard>
    </NSpace>

    <!-- 模板表单 -->
    <NModal v-model:show="showForm" :title="editingId != null ? '编辑模板' : '新增周期账单模板'" preset="card" style="width: 520px">
      <NForm>
        <NGrid :cols="2" :x-gap="12">
          <NFormItemGi :span="2" label="类型">
            <NRadioGroup v-model:value="form.type">
              <NRadioButton value="expense">
                支出
              </NRadioButton>
              <NRadioButton value="income">
                收入
              </NRadioButton>
              <!-- 转账：每月固定给某个账户转钱（如「1 号给家人转 5000」），不计收支、不进预算 -->
              <NRadioButton value="transfer">
                转账
              </NRadioButton>
            </NRadioGroup>
          </NFormItemGi>
          <NFormItemGi label="金额（元）">
            <NInput v-model:value="form.amountYuan" placeholder="如 3000" />
          </NFormItemGi>
          <NFormItemGi label="起始日">
            <NDatePicker v-model:value="startDateTs" type="date" clearable style="width: 100%" />
          </NFormItemGi>
          <!-- 转账不看分类（与手工转账同口径），直接不渲染这一项 -->
          <NFormItemGi v-if="!isTransfer" label="分类">
            <NSelect v-model:value="form.categoryId" :options="categoryOptions" :render-label="renderEmojiLabel" placeholder="选择分类" />
          </NFormItemGi>
          <NFormItemGi :label="isTransfer ? '转出账户' : '账户'">
            <NSelect v-model:value="form.accountId" :options="accountOptions" :render-label="renderEmojiLabel" :placeholder="isTransfer ? '选择转出账户' : '选择账户'" />
          </NFormItemGi>
          <NFormItemGi v-if="isTransfer" label="转入账户">
            <NSelect v-model:value="form.toAccountId" :options="accountOptions" :render-label="renderEmojiLabel" placeholder="选择转入账户" />
          </NFormItemGi>
          <NFormItemGi :span="2" label="备注">
            <NInput v-model:value="form.note" :placeholder="isTransfer ? '如 给家人转账' : '如 房租 / 工资'" />
          </NFormItemGi>
          <NFormItemGi label="自动确认">
            <NSwitch v-model:value="form.autoConfirm" />
          </NFormItemGi>
          <NFormItemGi label="启用">
            <NSwitch v-model:value="form.active" />
          </NFormItemGi>
        </NGrid>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showForm = false">
            取消
          </NButton>
          <NButton type="primary" :loading="formSubmitting" @click="submitForm">
            保存
          </NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 确认 / 改 弹窗 -->
    <NModal v-model:show="showConfirm" title="确认入账" preset="card" style="width: 480px">
      <NForm v-if="confirmTarget">
        <NGrid :cols="2" :x-gap="12">
          <NFormItemGi label="金额（元）">
            <NInput v-model:value="confirmForm.amountYuan" />
          </NFormItemGi>
          <NFormItemGi label="计划日">
            <NText>{{ confirmTarget.dueDate }}</NText>
          </NFormItemGi>
          <NFormItemGi v-if="!confirmIsTransfer" label="分类">
            <NSelect v-model:value="confirmForm.categoryId" :options="confirmCategoryOptions" :render-label="renderEmojiLabel" />
          </NFormItemGi>
          <NFormItemGi :label="confirmIsTransfer ? '转出账户' : '账户'">
            <NSelect v-model:value="confirmForm.accountId" :options="accountOptions" :render-label="renderEmojiLabel" />
          </NFormItemGi>
          <NFormItemGi v-if="confirmIsTransfer" label="转入账户">
            <NSelect v-model:value="confirmForm.toAccountId" :options="accountOptions" :render-label="renderEmojiLabel" />
          </NFormItemGi>
          <NFormItemGi :span="2" label="备注">
            <NInput v-model:value="confirmForm.note" />
          </NFormItemGi>
        </NGrid>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showConfirm = false">
            取消
          </NButton>
          <NButton type="primary" :loading="confirmSubmitting" @click="submitConfirm">
            确认入账
          </NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.recurring-page {
  padding: 16px;
}
.pending-row,
.tpl-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--n-border-color, #e5e7eb);
  border-radius: 10px;
}
.pending-main,
.tpl-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.pending-meta,
.tpl-meta {
  font-size: 12px;
}
</style>
