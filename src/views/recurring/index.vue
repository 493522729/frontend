<script setup lang="ts">
import type { RecurringType } from '@/types/recurring'
import {
  NButton,
  NCard,
  NDatePicker,
  NEmpty,
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
import { mockListAccounts } from '@/api/modules/account/mock'
import { mockListCategories } from '@/api/modules/category/mock'
import EmptyState from '@/components/business/empty-state/index.vue'
import { useBookStore } from '@/stores/modules/book'
import { useRecurringStore } from '@/stores/modules/recurring'
import { formatCents } from '@/utils/money'

const recurring = useRecurringStore()
const book = useBookStore()
const { templates, pending, loading } = storeToRefs(recurring)

const message = useMessage()
const dialog = useDialog()

// 字典：分类 / 账户（同步读 mock，仅做展示映射）
const categories = mockListCategories()
const accounts = computed(() => mockListAccounts(book.currentBookId))
const categoryMap = computed(() => new Map(categories.map(c => [c.id, c])))
const accountMap = computed(() => new Map(accounts.value.map(a => [a.id, a])))

// ── 模板表单（新增 / 编辑共用） ──────────────────────
const showForm = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({
  type: 'expense' as RecurringType,
  amountYuan: '',
  categoryId: null as number | null,
  accountId: null as number | null,
  note: '',
  startDate: '',
  autoConfirm: false,
  active: true,
})
/** 起始日时间戳（NDatePicker 绑定 number），提交时转成 YYYY-MM-DD 字符串 */
const startDateTs = ref<number | null>(null)

const categoryOptions = computed(() =>
  categories.filter(c => c.type === form.type).map(c => ({ label: `${c.icon} ${c.name}`, value: c.id })),
)
const accountOptions = computed(() =>
  accounts.value.map(a => ({ label: `${a.icon} ${a.name}`, value: a.id })),
)

function resetForm() {
  form.type = 'expense'
  form.amountYuan = ''
  form.categoryId = null
  form.accountId = null
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

function openEdit(t: { id: number, type: RecurringType, amount: number, categoryId: number, accountId: number, note: string, startDate: string, autoConfirm: boolean, active: boolean }) {
  editingId.value = t.id
  form.type = t.type
  form.amountYuan = (t.amount / 100).toString()
  form.categoryId = t.categoryId
  form.accountId = t.accountId
  form.note = t.note
  form.startDate = t.startDate
  form.autoConfirm = t.autoConfirm
  form.active = t.active
  const [y, m, d] = t.startDate.split('-').map(Number)
  startDateTs.value = y ? new Date(y, (m ?? 1) - 1, d ?? 1).getTime() : null
  showForm.value = true
}

async function submitForm() {
  const amount = Math.round(Number(form.amountYuan) * 100)
  if (!form.amountYuan || !Number.isFinite(amount) || amount <= 0) {
    message.warning('请填写有效金额')
    return
  }
  if (form.categoryId == null) {
    message.warning('请选择分类')
    return
  }
  if (form.accountId == null) {
    message.warning('请选择账户')
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
    categoryId: form.categoryId,
    accountId: form.accountId,
    note: form.note.trim(),
    startDate: form.startDate,
    autoConfirm: form.autoConfirm,
    active: form.active,
  }
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
const confirmTarget = ref<{ templateId: number, amount: number, categoryId: number, accountId: number, note: string, dueDate: string } | null>(null)
const confirmForm = reactive({ amountYuan: '', categoryId: null as number | null, accountId: null as number | null, note: '' })

function openConfirm(p: { templateId: number, amount: number, categoryId: number, accountId: number, note: string, dueDate: string }) {
  confirmTarget.value = p
  confirmForm.amountYuan = (p.amount / 100).toString()
  confirmForm.categoryId = p.categoryId
  confirmForm.accountId = p.accountId
  confirmForm.note = p.note
  showConfirm.value = true
}

async function submitConfirm() {
  if (!confirmTarget.value)
    return
  const amount = Math.round(Number(confirmForm.amountYuan) * 100)
  if (!confirmForm.amountYuan || !Number.isFinite(amount) || amount <= 0) {
    message.warning('请填写有效金额')
    return
  }
  if (confirmForm.categoryId == null || confirmForm.accountId == null) {
    message.warning('请选择分类与账户')
    return
  }
  try {
    await recurring.confirmPendingEntry({
      bookId: book.currentBookId,
      templateId: confirmTarget.value.templateId,
      amount,
      categoryId: confirmForm.categoryId,
      accountId: confirmForm.accountId,
      note: confirmForm.note.trim(),
    })
    message.success('已确认入账')
    showConfirm.value = false
  }
  catch (e) {
    message.error((e as Error).message || '确认失败')
  }
}

async function dismiss(p: { templateId: number }) {
  await recurring.dismissEntry(p.templateId)
  message.info('已跳过本月该笔')
}

onMounted(() => {
  recurring.ensureLoaded()
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
                <NTag size="small" :type="p.type === 'income' ? 'success' : 'error'" :bordered="false">
                  {{ p.type === 'income' ? '收入' : '支出' }}
                </NTag>
                <NText :type="p.type === 'income' ? 'success' : 'error'">
                  {{ p.type === 'income' ? '+' : '-' }}{{ formatCents(p.amount) }}
                </NText>
                <NText depth="3" class="pending-meta">
                  {{ categoryMap.get(p.categoryId)?.name }} · {{ accountMap.get(p.accountId)?.name }} · 计划 {{ p.dueDate }}
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
        <NEmpty v-else description="本月没有待确认的周期账单" />
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
                <NTag size="small" :type="t.type === 'income' ? 'success' : 'error'" :bordered="false">
                  {{ t.type === 'income' ? '收入' : '支出' }}
                </NTag>
                <NText :type="t.type === 'income' ? 'success' : 'error'">
                  {{ t.type === 'income' ? '+' : '-' }}{{ formatCents(t.amount) }}
                </NText>
                <NText depth="3" class="tpl-meta">
                  {{ categoryMap.get(t.categoryId)?.name }} · {{ accountMap.get(t.accountId)?.name }} · 自 {{ t.startDate }}
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
            </NRadioGroup>
          </NFormItemGi>
          <NFormItemGi label="金额（元）">
            <NInput v-model:value="form.amountYuan" placeholder="如 3000" />
          </NFormItemGi>
          <NFormItemGi label="起始日">
            <NDatePicker v-model:value="startDateTs" type="date" clearable style="width: 100%" />
          </NFormItemGi>
          <NFormItemGi label="分类">
            <NSelect v-model:value="form.categoryId" :options="categoryOptions" placeholder="选择分类" />
          </NFormItemGi>
          <NFormItemGi label="账户">
            <NSelect v-model:value="form.accountId" :options="accountOptions" placeholder="选择账户" />
          </NFormItemGi>
          <NFormItemGi :span="2" label="备注">
            <NInput v-model:value="form.note" placeholder="如 房租 / 工资" />
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
          <NButton type="primary" :loading="loading" @click="submitForm">
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
          <NFormItemGi label="分类">
            <NSelect v-model:value="confirmForm.categoryId" :options="categoryOptions" />
          </NFormItemGi>
          <NFormItemGi label="账户">
            <NSelect v-model:value="confirmForm.accountId" :options="accountOptions" />
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
          <NButton type="primary" @click="submitConfirm">
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
