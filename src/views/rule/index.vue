<script setup lang="ts">
/**
 * 规则引擎页（US-010）
 * ====================================================================
 * - 顶部：新建规则 + 试算按钮
 * - 列表：规则卡片（name、启用开关、条件/动作摘要、编辑/删除）
 * - 创建/编辑 Modal：条件构建器 + 动作链
 * - 试算 Modal：拿样本交易跑一遍，返回每个规则的命中与改后差异
 */
import type { Rule, RuleAction, RuleCondition, RuleField, RuleInput } from '@/types/rule'
import type { Transaction } from '@/types/transaction'
import { useDialog, useMessage } from 'naive-ui'
import { computed, onMounted, reactive, ref } from 'vue'
import { runRule } from '@/api/modules/rule'
import { useBookStore } from '@/stores/modules/book'
import { useRuleStore } from '@/stores/modules/rule'
import {
  FIELD_DEFAULTS,
  operatorsForField,
  RULE_ACTIONS,
  RULE_FIELDS,
  TRANSACTION_TYPE_OPTIONS,
} from '@/types/rule'

const message = useMessage()
const dialog = useDialog()
const ruleStore = useRuleStore()
const bookStore = useBookStore()

// ── 列表加载 ──────────────────────────────────────────────
onMounted(() => ruleStore.load())

// 全账本 option 的 value 用 0 表示，提交时若 === 0 → null（业务上「全账本」= 不绑账本）
const ALL_BOOKS = 0
const bookOptions = computed(() => [
  { label: '全账本', value: ALL_BOOKS },
  ...bookStore.books.map(b => ({ label: `${b.icon} ${b.name}`, value: b.id })),
])

// ── 编辑态 ────────────────────────────────────────────────
const showForm = ref(false)
const editingId = ref<number | null>(null)

interface FormState {
  bookId: number
  name: string
  conditions: RuleCondition[]
  actions: RuleAction[]
  active: boolean
}

function emptyForm(): FormState {
  return {
    bookId: ALL_BOOKS,
    name: '',
    conditions: [{ field: 'note', op: 'contains', value: '' }],
    actions: [{ type: 'setCategory', payload: { categoryId: 0 } }],
    active: true,
  }
}

const form = reactive<FormState>(emptyForm())

function openCreate() {
  editingId.value = null
  Object.assign(form, emptyForm())
  showForm.value = true
}

function openEdit(rule: Rule) {
  editingId.value = rule.id
  form.bookId = rule.bookId ?? ALL_BOOKS
  form.name = rule.name
  form.conditions = rule.conditions.map(c => ({ ...c }))
  form.actions = rule.actions.map(a => ({ ...a, payload: { ...a.payload } }))
  form.active = rule.active
  showForm.value = true
}

async function submitForm() {
  if (!form.name.trim()) {
    message.warning('请填写规则名称')
    return
  }
  if (form.conditions.length === 0) {
    message.warning('至少一条条件')
    return
  }
  if (form.actions.length === 0) {
    message.warning('至少一个动作')
    return
  }
  // 兜底空 value：填字段默认值，避免跑时空字符串匹配所有
  for (const c of form.conditions) {
    if (c.value === '' || c.value == null)
      c.value = FIELD_DEFAULTS[c.field]
  }
  const input: RuleInput = {
    // 全账本 sentinel（0）→ 业务上 null 表示「不绑账本」
    bookId: form.bookId === ALL_BOOKS ? null : form.bookId,
    name: form.name.trim(),
    conditions: form.conditions,
    actions: form.actions,
    trigger: 'onSave',
    active: form.active,
  }
  try {
    if (editingId.value == null)
      await ruleStore.create(input)
    else
      await ruleStore.update(editingId.value, input)
    showForm.value = false
    message.success('已保存')
  }
  catch {
    message.error('保存失败')
  }
}

async function onRemove(rule: Rule) {
  dialog.warning({
    title: '删除规则',
    content: `确认删除「${rule.name}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await ruleStore.remove(rule.id)
      message.success('已删除')
    },
  })
}

async function onToggle(rule: Rule) {
  try {
    await ruleStore.toggleActive(rule)
  }
  catch {
    message.error('切换失败')
  }
}

// ── 条件/动作编辑器 ──────────────────────────────────────
function addCondition() {
  form.conditions.push({ field: 'note', op: 'contains', value: '' })
}
function onConditionFieldChange(idx: number, field: RuleField) {
  const c = form.conditions[idx]!
  c.field = field
  // 同步 op：限定到字段允许的子集
  const ops = operatorsForField(field)
  if (!ops.includes(c.op))
    c.op = ops[0]!
  if (c.value === '' || c.value == null)
    c.value = FIELD_DEFAULTS[field]
}

function addAction() {
  form.actions.push({ type: 'setCategory', payload: { categoryId: 0 } })
}
function removeAction(idx: number) {
  form.actions.splice(idx, 1)
}

function operatorOptions(field: RuleField) {
  return operatorsForField(field).map(op => ({ label: op, value: op }))
}

function conditionPreview(c: RuleCondition): string {
  return `${c.field} ${c.op} ${c.value}`
}

function actionPreview(a: RuleAction): string {
  if (a.type === 'setCategory')
    return `分类→${a.payload.categoryId}`
  if (a.type === 'appendNote')
    return `追加「${a.payload.suffix}」`
  if (a.type === 'addTag')
    return `加 #${a.payload.tag}`
  return `通知「${a.payload.message}」`
}

// ── 试算 ──────────────────────────────────────────────────
const showPreview = ref(false)
const previewResults = ref<{ ruleName: string, matched: boolean, before: Transaction, after: Transaction, diff: string[] }[]>([])

function openPreview() {
  showPreview.value = true
  previewResults.value = []
}

function runPreview() {
  const sample: Transaction = {
    id: -1,
    bookId: bookStore.currentBookId,
    type: 'expense',
    amount: 0,
    currency: 'CNY',
    accountId: 0,
    toAccountId: null,
    categoryId: 0,
    transDate: '2026-01-01',
    note: '',
    source: 'manual',
    status: 'confirmed',
    createdAt: 0,
    updatedAt: 0,
  }
  // 简单试算：逐条规则跑，让用户填 sample 后看结果
  // 为方便演示，直接拿 mock 第一笔交易当样本
  previewResults.value = ruleStore.list.map((rule) => {
    const exec = runRule(rule, sample)
    const diff: string[] = []
    if (exec.matched) {
      if (exec.modifiedTxn.categoryId !== sample.categoryId)
        diff.push(`categoryId ${sample.categoryId} → ${exec.modifiedTxn.categoryId}`)
      if (exec.modifiedTxn.note !== sample.note)
        diff.push(`note "${sample.note}" → "${exec.modifiedTxn.note}"`)
    }
    return {
      ruleName: rule.name,
      matched: exec.matched,
      before: sample,
      after: exec.modifiedTxn,
      diff,
    }
  })
  if (previewResults.value.every(r => !r.matched))
    message.info('当前样本下没有规则匹配 —— 试算仅检查语法与配置')
}

// ── 视图辅助 ──────────────────────────────────────────────
const hasResult = computed(() => ruleStore.list.length > 0)
</script>

<template>
  <div class="rule-page">
    <header class="page-header">
      <div>
        <h1>规则引擎</h1>
        <NText depth="3">
          满足条件自动改分类、加备注、加标签或弹通知 —— 保存交易时即时触发
        </NText>
      </div>
      <NSpace>
        <NButton @click="openPreview">
          试算
        </NButton>
        <NButton type="primary" @click="openCreate">
          新建规则
        </NButton>
      </NSpace>
    </header>

    <NEmpty v-if="!hasResult && !ruleStore.loading" description="还没有规则，点「新建规则」起步">
      <template #extra>
        <NButton type="primary" @click="openCreate">
          新建规则
        </NButton>
      </template>
    </NEmpty>

    <div v-else class="rule-list">
      <NCard v-for="rule in ruleStore.list" :key="rule.id" hoverable class="rule-card">
        <div class="rule-card-head">
          <div class="rule-card-title">
            <NTag :type="rule.active ? 'success' : 'default'" size="small">
              {{ rule.active ? '启用' : '已停用' }}
            </NTag>
            <span class="rule-name">{{ rule.name }}</span>
            <NTag v-if="rule.bookId == null" size="small" :bordered="false">
              全账本
            </NTag>
            <NTag v-else size="small" :bordered="false">
              {{ bookStore.books.find(b => b.id === rule.bookId)?.name ?? `#${rule.bookId}` }}
            </NTag>
          </div>
          <NSpace>
            <NButton size="small" @click="openEdit(rule)">
              编辑
            </NButton>
            <NButton size="small" type="error" ghost @click="onRemove(rule)">
              删除
            </NButton>
          </NSpace>
        </div>
        <div class="rule-card-body">
          <div class="rule-block">
            <span class="block-label">条件（{{ rule.conditions.length }}）</span>
            <div class="block-items">
              <NTag v-for="(c, i) in rule.conditions" :key="i" size="small" :bordered="false">
                {{ conditionPreview(c) }}
              </NTag>
            </div>
          </div>
          <div class="rule-block">
            <span class="block-label">动作（{{ rule.actions.length }}）</span>
            <div class="block-items">
              <NTag v-for="(a, i) in rule.actions" :key="i" size="small" type="info" :bordered="false">
                {{ actionPreview(a) }}
              </NTag>
            </div>
          </div>
        </div>
        <div class="rule-card-foot">
          <NCheckbox :checked="rule.active" @update:checked="onToggle(rule)">
            启用
          </NCheckbox>
        </div>
      </NCard>
    </div>

    <!-- 创建 / 编辑 -->
    <NModal v-model:show="showForm" preset="card" :title="editingId == null ? '新建规则' : '编辑规则'" style="width: 720px">
      <NSpace vertical size="large">
        <div>
          <label class="form-label">规则名称</label>
          <NInput v-model:value="form.name" placeholder="如：星巴克 → 咖啡" maxlength="30" />
        </div>
        <div>
          <label class="form-label">适用账本</label>
          <NSelect v-model:value="form.bookId" :options="bookOptions" />
        </div>

        <div>
          <div class="form-section-head">
            <label class="form-label">条件（AND 组合）</label>
            <NButton size="tiny" @click="addCondition">
              + 添加
            </NButton>
          </div>
          <NSpace vertical size="small">
            <div v-for="(c, idx) in form.conditions" :key="idx" class="form-row">
              <NSelect
                :value="c.field"
                :options="RULE_FIELDS"
                style="width: 140px"
                @update:value="v => onConditionFieldChange(idx, v as RuleField)"
              />
              <NSelect
                v-model:value="c.op"
                :options="operatorOptions(c.field)"
                style="width: 110px"
              />
              <NInputNumber v-if="c.field === 'amount'" v-model:value="c.value as number" :show-button="false" style="width: 120px" />
              <NSelect v-else-if="c.field === 'type'" :value="c.value as string" :options="TRANSACTION_TYPE_OPTIONS" style="width: 140px" @update:value="v => (c.value = String(v))" />
              <NInput v-else :value="c.value as string" :placeholder="FIELD_DEFAULTS[c.field]" style="flex: 1" @update:value="v => (c.value = String(v))" />
            </div>
          </NSpace>
        </div>

        <div>
          <div class="form-section-head">
            <label class="form-label">动作（按顺序应用）</label>
            <NButton size="tiny" @click="addAction">
              + 添加
            </NButton>
          </div>
          <NSpace vertical size="small">
            <div v-for="(a, idx) in form.actions" :key="idx" class="form-row">
              <NSelect :value="a.type" :options="RULE_ACTIONS.map(o => ({ label: o.label, value: o.value }))" style="width: 140px" @update:value="v => (a.type = v as typeof a.type)" />
              <NInputNumber v-if="a.type === 'setCategory'" v-model:value="a.payload.categoryId as number" :show-button="false" style="width: 120px" placeholder="分类 ID" />
              <NInput v-else-if="a.type === 'appendNote'" :value="a.payload.suffix as string" placeholder="追加文本" style="flex: 1" @update:value="v => (a.payload.suffix = v)" />
              <NInput v-else-if="a.type === 'addTag'" :value="a.payload.tag as string" placeholder="标签名" style="flex: 1" @update:value="v => (a.payload.tag = v)" />
              <NInput v-else :value="a.payload.message as string" placeholder="通知文案" style="flex: 1" @update:value="v => (a.payload.message = v)" />
              <NButton text type="error" @click="removeAction(idx)">
                删除
              </NButton>
            </div>
          </NSpace>
        </div>

        <NCheckbox v-model:checked="form.active">
          启用规则
        </NCheckbox>
      </NSpace>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showForm = false">
            取消
          </NButton>
          <NButton type="primary" @click="submitForm">
            保存
          </NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 试算 -->
    <NModal v-model:show="showPreview" preset="card" title="试算" style="width: 720px">
      <NAlert type="info" :show-icon="false" style="margin-bottom: 12px">
        用占位样本（空 note / 金额 0 / 分类 0）跑所有规则 —— 主要看规则配置是否正确。生产试算需指定一笔真实交易。
      </NAlert>
      <NButton type="primary" @click="runPreview">
        运行试算
      </NButton>
      <div v-if="previewResults.length > 0" class="preview-results">
        <NCard v-for="(r, i) in previewResults" :key="i" size="small" class="preview-card">
          <template #header>
            <span :class="{ matched: r.matched }">{{ r.ruleName }}</span>
            <NTag :type="r.matched ? 'success' : 'default'" size="small" style="margin-left: 8px">
              {{ r.matched ? '匹配' : '不匹配' }}
            </NTag>
          </template>
          <ul v-if="r.matched && r.diff.length > 0">
            <li v-for="(d, k) in r.diff" :key="k">
              {{ d }}
            </li>
          </ul>
          <NText v-else depth="3" style="font-size: 12px">
            无字段差异
          </NText>
        </NCard>
      </div>
    </NModal>
  </div>
</template>

<style scoped>
.rule-page {
  padding: 24px;
  max-width: 1100px;
  margin: 0 auto;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.page-header h2 {
  margin: 0 0 4px;
}
.rule-list {
  display: grid;
  gap: 12px;
}
.rule-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.rule-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rule-name {
  font-weight: 600;
  font-size: 15px;
}
.rule-card-body {
  display: grid;
  gap: 8px;
}
.rule-block {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.block-label {
  color: var(--lz-text-secondary);
  font-size: 12px;
  min-width: 90px;
  flex-shrink: 0;
  padding-top: 2px;
}
.block-items {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.rule-card-foot {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px dashed var(--lz-border);
}
.form-label {
  display: block;
  font-size: 13px;
  color: var(--lz-text-regular);
  margin-bottom: 6px;
}
.form-section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.form-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.preview-results {
  margin-top: 16px;
  display: grid;
  gap: 8px;
}
.preview-card .matched {
  font-weight: 600;
  color: var(--lz-success);
}
.preview-card ul {
  margin: 4px 0 0;
  padding-left: 18px;
  font-size: 13px;
}
</style>
