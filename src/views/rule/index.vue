<script setup lang="ts">
/**
 * 规则引擎页（US-010）
 * ====================================================================
 * - 顶部：新建规则 + 试算按钮
 * - 列表：规则卡片（name、启用开关、条件/动作摘要、编辑/删除）
 * - 创建/编辑 Modal：条件构建器 + 动作链
 * - 试算 Modal：拿样本交易跑一遍，返回每个规则的命中与改后差异
 */
import type { Rule, RuleAction, RuleCondition, RuleField, RuleInput, RuleMatch } from '@/types/rule'
import type { Category, Transaction } from '@/types/transaction'
import { useDialog, useMessage } from 'naive-ui'
import { computed, onMounted, reactive, ref } from 'vue'
import { runRule } from '@/api/modules/rule'
import { listTransactions } from '@/api/modules/transaction'
import EmptyState from '@/components/business/empty-state/index.vue'
import { useBookStore } from '@/stores/modules/book'
import { useDictStore } from '@/stores/modules/dict'
import { useRuleStore } from '@/stores/modules/rule'
import { useSettingsStore } from '@/stores/modules/settings'
import { useTagStore } from '@/stores/modules/tag'
import {
  FIELD_DEFAULTS,
  OPERATOR_LABELS,
  operatorsForField,
  RULE_ACTIONS,
  RULE_FIELDS,
  TRANSACTION_TYPE_OPTIONS,
} from '@/types/rule'
import { formatCents } from '@/utils/money'
import { dotOption, emojiOption, renderDotLabel, renderEmojiLabel } from '@/utils/select-option'

const message = useMessage()
const dialog = useDialog()
const ruleStore = useRuleStore()
const bookStore = useBookStore()
const dict = useDictStore()
const tagStore = useTagStore()
const settings = useSettingsStore()

// ── 列表加载 ──────────────────────────────────────────────
onMounted(async () => {
  await Promise.all([ruleStore.load(), dict.ensureCategories(), tagStore.ensureLoaded()])
})

// 全账本 option 的 value 用 0 表示，提交时若 === 0 → null（业务上「全账本」= 不绑账本）
const ALL_BOOKS = 0
const bookOptions = computed(() => [
  { label: '全账本', value: ALL_BOOKS },
  ...bookStore.books.map(b => emojiOption(b.icon, b.name, b.id)),
])

// ── 编辑态 ────────────────────────────────────────────────
const showForm = ref(false)
const editingId = ref<number | null>(null)

interface FormState {
  bookId: number
  name: string
  match: RuleMatch
  conditions: RuleCondition[]
  actions: RuleAction[]
  active: boolean
}

function emptyForm(): FormState {
  return {
    bookId: ALL_BOOKS,
    name: '',
    match: 'all',
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
  form.match = rule.match ?? 'all'
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
  for (const a of form.actions) {
    if (a.type === 'setCategory' && Number(a.payload.categoryId) <= 0) {
      message.warning('「修改分类」动作请选择目标分类')
      return
    }
    if (a.type === 'addTag' && Number(a.payload.tagId) <= 0) {
      message.warning('「加标签」动作请选择标签')
      return
    }
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
    match: form.match,
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
/** 条件上限：防止误连点把弹窗撑爆（引擎语义上 10 条也足够） */
const MAX_CONDITIONS = 10
function addCondition() {
  if (form.conditions.length >= MAX_CONDITIONS) {
    message.warning(`最多 ${MAX_CONDITIONS} 条条件`)
    return
  }
  form.conditions.push({ field: 'note', op: 'contains', value: '' })
}
function removeCondition(idx: number) {
  form.conditions.splice(idx, 1)
}
function onConditionFieldChange(idx: number, field: RuleField) {
  const c = form.conditions[idx]!
  c.field = field
  // 同步 op：限定到字段允许的子集
  const ops = operatorsForField(field)
  if (!ops.includes(c.op))
    c.op = ops[0]!
  // 切换字段时清空 value，避免金额 5000 切换到类型后显示 5000 这类不匹配残留
  c.value = ''
}

/** 动作上限：与条件同样防止撑爆弹窗 */
const MAX_ACTIONS = 5
function addAction() {
  if (form.actions.length >= MAX_ACTIONS) {
    message.warning(`最多 ${MAX_ACTIONS} 个动作`)
    return
  }
  form.actions.push({ type: 'setCategory', payload: { categoryId: 0 } })
}
function removeAction(idx: number) {
  form.actions.splice(idx, 1)
}

function operatorOptions(field: RuleField) {
  return operatorsForField(field).map(op => ({ label: OPERATOR_LABELS[op], value: op }))
}

const fieldLabelMap = Object.fromEntries(RULE_FIELDS.map(f => [f.value, f.label]))
const typeLabelMap = Object.fromEntries(TRANSACTION_TYPE_OPTIONS.map(t => [t.value, t.label]))

/** 条件里的「类型」取值选项：带语义色点，取色同筛选栏（settings.typeColor） */
const typeValueOptions = computed(() => TRANSACTION_TYPE_OPTIONS.map(o => dotOption(
  settings.typeColor(o.value),
  o.label,
  o.value,
)))

function conditionPreview(c: RuleCondition): string {
  const field = fieldLabelMap[c.field] ?? c.field
  const op = OPERATOR_LABELS[c.op] ?? c.op
  let value = String(c.value)
  if (c.field === 'type')
    value = typeLabelMap[value] ?? value
  return `${field} ${op} ${value}`
}

function categoryNameOf(id: number | string | undefined): string {
  if (id == null || Number(id) <= 0)
    return '未选择'
  const cat = dict.categoryMap.get(Number(id))
  return cat ? `${cat.icon} ${cat.name}` : `#${id}`
}

function actionPreview(a: RuleAction): string {
  if (a.type === 'setCategory')
    return `分类→${categoryNameOf(a.payload.categoryId)}`
  if (a.type === 'appendNote')
    return `追加「${a.payload.suffix}」`
  if (a.type === 'addTag')
    return `打标签「${a.payload.tag || a.payload.tagId}」`
  return `通知「${a.payload.message}」`
}

/** 标签下拉选项（真实标签，色点 + 名称） */
const tagOptions = computed(() => tagStore.tags.map(t => dotOption(t.color, t.name, t.id)))

/** 选标签：写 tagId + 冗余存一份名字（用于展示/兼容） */
function onAddTagChange(a: RuleAction, v: number | null) {
  a.payload.tagId = v ?? 0
  const t = v != null ? tagStore.tagMap.get(v) : undefined
  a.payload.tag = t?.name ?? ''
}

// 分类选择器选项：按支出/收入分组，根→二级缩进展示（缩进交给 renderEmojiLabel 转 padding）
const categorySelectOptions = computed(() => {
  const sort = (a: Category, b: Category) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  const buildForType = (type: 'expense' | 'income') => {
    const roots = dict.categories.filter(c => c.type === type && c.parentId == null).sort(sort)
    const children: { label: string, value: number }[] = []
    for (const r of roots) {
      children.push(emojiOption(r.icon, r.name, r.id))
      const subs = dict.categories.filter(c => c.type === type && c.parentId === r.id).sort(sort)
      for (const s of subs)
        children.push(emojiOption(s.icon, s.name, s.id, 1))
    }
    return { type: 'group' as const, label: type === 'expense' ? '支出' : '收入', key: type, children }
  }
  return [buildForType('expense'), buildForType('income')]
})

// ── 试算 ──────────────────────────────────────────────────
const showPreview = ref(false)
const previewLoading = ref(false)
const recentTxns = ref<Transaction[]>([])
const selectedTxnId = ref<number | null>(null)

interface PreviewResult {
  ruleName: string
  /** true=命中 false=未命中 null=跳过（停用/不适用账本） */
  matched: boolean | null
  skipReason?: string
  diff: string[]
  /** 未命中时的逐条诊断（AND/OR 语义下让用户看清差哪条） */
  conditionStatus?: { text: string, hit: boolean }[]
  matchMode?: RuleMatch
}
const previewResults = ref<PreviewResult[]>([])

/** 交易下拉选项：日期 · 分类 · 金额 · 备注 */
const txnOptions = computed(() => recentTxns.value.map(t => ({
  label: `${t.transDate} · ${categoryNameOf(t.categoryId)} · ${t.type === 'income' ? '+' : '-'}${formatCents(t.amount)} · ${t.note || '无备注'}`,
  value: t.id,
})))

async function openPreview() {
  showPreview.value = true
  previewResults.value = []
  selectedTxnId.value = null
  previewLoading.value = true
  try {
    const res = await listTransactions({ page: 1, pageSize: 20, bookId: bookStore.currentBookId })
    recentTxns.value = res.list
  }
  catch {
    message.error('加载最近交易失败')
    recentTxns.value = []
  }
  finally {
    previewLoading.value = false
  }
}

/** 规则动作只会改分类/备注，试算差异就展示这两个字段的语义化前后对比 */
function diffOf(before: Transaction, after: Transaction): string[] {
  const diff: string[] = []
  if (before.categoryId !== after.categoryId)
    diff.push(`分类 ${categoryNameOf(before.categoryId)} → ${categoryNameOf(after.categoryId)}`)
  if (before.note !== after.note)
    diff.push(`备注「${before.note || '空'}」→「${after.note}」`)
  return diff
}

function runPreview() {
  const txn = recentTxns.value.find(t => t.id === selectedTxnId.value)
  if (!txn) {
    message.warning('请先选择一笔真实交易')
    return
  }
  previewResults.value = ruleStore.list.map((rule) => {
    if (!rule.active)
      return { ruleName: rule.name, matched: null, skipReason: '已停用，跳过', diff: [] }
    if (rule.bookId != null && rule.bookId !== txn.bookId)
      return { ruleName: rule.name, matched: null, skipReason: '不适用该账本，跳过', diff: [] }
    const exec = runRule(rule, txn)
    return {
      ruleName: rule.name,
      matched: exec.matched,
      diff: exec.matched ? diffOf(txn, exec.modifiedTxn) : [],
      conditionStatus: rule.conditions.map(c => ({
        text: conditionPreview(c),
        hit: exec.matchedConditions.includes(c),
      })),
      matchMode: rule.match ?? 'all',
    }
  })
  const hit = previewResults.value.filter(r => r.matched === true).length
  if (hit > 0)
    message.success(`${hit} 条规则命中，看下方改动明细`)
  else
    message.info('这笔交易没有命中任何规则 —— 可放宽条件后重试')
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

    <EmptyState
      v-if="!hasResult && !ruleStore.loading"
      variant="rule"
      title="还没有规则"
      desc="建一条「包含星巴克 → 归到咖啡」，以后就不用手动分类了"
    >
      <NButton type="primary" @click="openCreate">
        新建规则
      </NButton>
    </EmptyState>

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
            <span class="block-label">条件（{{ rule.conditions.length }}{{ rule.conditions.length > 1 ? ` · ${rule.match === 'any' ? '任一满足' : '全部满足'}` : '' }}）</span>
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
          <NSelect v-model:value="form.bookId" :options="bookOptions" :render-label="renderEmojiLabel" />
        </div>

        <div>
          <div class="form-section-head">
            <label class="form-label">条件</label>
            <NRadioGroup v-model:value="form.match" size="small">
              <NRadioButton value="all">
                满足全部（AND）
              </NRadioButton>
              <NRadioButton value="any">
                满足任一（OR）
              </NRadioButton>
            </NRadioGroup>
            <NButton size="tiny" :disabled="form.conditions.length >= MAX_CONDITIONS" @click="addCondition">
              + 添加{{ form.conditions.length >= MAX_CONDITIONS ? `（已达 ${MAX_CONDITIONS} 条）` : '' }}
            </NButton>
          </div>
          <div class="cond-scroll">
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
                <NInputNumber v-if="c.field === 'amount'" v-model:value="c.value as number" :show-button="false" placeholder="金额（分）" style="width: 120px" />
                <NSelect v-else-if="c.field === 'type'" :value="c.value as string" :options="typeValueOptions" :render-label="renderDotLabel" placeholder="选择类型" style="width: 140px" @update:value="v => (c.value = String(v))" />
                <NInput v-else :value="c.value as string" :placeholder="FIELD_DEFAULTS[c.field]" style="flex: 1" @update:value="v => (c.value = String(v))" />
                <NButton v-if="form.conditions.length > 1" text type="error" @click="removeCondition(idx)">
                  删除
                </NButton>
              </div>
            </NSpace>
          </div>
        </div>

        <div>
          <div class="form-section-head">
            <label class="form-label">动作（按顺序应用）</label>
            <NButton size="tiny" :disabled="form.actions.length >= MAX_ACTIONS" @click="addAction">
              + 添加{{ form.actions.length >= MAX_ACTIONS ? `（已达 ${MAX_ACTIONS} 个）` : '' }}
            </NButton>
          </div>
          <div class="cond-scroll">
            <NSpace vertical size="small">
              <div v-for="(a, idx) in form.actions" :key="idx" class="form-row">
                <NSelect :value="a.type" :options="RULE_ACTIONS.map(o => ({ label: o.label, value: o.value }))" style="width: 140px" @update:value="v => (a.type = v as typeof a.type)" />
                <NSelect v-if="a.type === 'setCategory'" :value="a.payload.categoryId || undefined" :options="categorySelectOptions" :render-label="renderEmojiLabel" placeholder="选择分类" clearable style="flex: 1" @update:value="v => (a.payload.categoryId = v || 0)" />
                <NInput v-else-if="a.type === 'appendNote'" :value="a.payload.suffix as string" placeholder="追加文本" style="flex: 1" @update:value="v => (a.payload.suffix = v)" />
                <NSelect v-else-if="a.type === 'addTag'" :value="(a.payload.tagId as number) || undefined" :options="tagOptions" :render-label="renderDotLabel" placeholder="选择标签" clearable filterable style="flex: 1" @update:value="v => onAddTagChange(a, v as number | null)" />
                <NInput v-else :value="a.payload.message as string" placeholder="通知文案" style="flex: 1" @update:value="v => (a.payload.message = v)" />
                <NButton v-if="form.actions.length > 1" text type="error" @click="removeAction(idx)">
                  删除
                </NButton>
              </div>
            </NSpace>
          </div>
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
        选一笔真实交易，用当前规则试跑一遍（只预览、不写入）——命中的规则会展示分类/备注会被改成什么样。
      </NAlert>
      <NSpace vertical size="medium">
        <NSelect
          v-model:value="selectedTxnId"
          :options="txnOptions"
          :loading="previewLoading"
          filterable
          placeholder="选择最近的一笔交易"
        />
        <NButton type="primary" :disabled="selectedTxnId == null" @click="runPreview">
          运行试算
        </NButton>
      </NSpace>
      <div v-if="previewResults.length > 0" class="preview-results">
        <NCard v-for="(r, i) in previewResults" :key="i" size="small" class="preview-card">
          <template #header>
            <span :class="{ matched: r.matched === true }">{{ r.ruleName }}</span>
            <NTag
              :type="r.matched === true ? 'success' : r.matched === false ? 'default' : 'warning'"
              size="small"
              style="margin-left: 8px"
            >
              {{ r.matched === true ? '命中' : r.matched === false ? '未命中' : r.skipReason }}
            </NTag>
          </template>
          <ul v-if="r.matched === true && r.diff.length > 0">
            <li v-for="(d, k) in r.diff" :key="k">
              {{ d }}
            </li>
          </ul>
          <template v-else-if="r.matched === false">
            <NText depth="3" style="font-size: 12px">
              {{ r.matchMode === 'any' ? '条件为 OR 组合、任一满足即命中' : '条件为 AND 组合、需全部满足' }} —— 命中
              {{ r.conditionStatus?.filter(c => c.hit).length ?? 0 }}/{{ r.conditionStatus?.length ?? 0 }} 条：
            </NText>
            <div class="cond-diag">
              <NTag
                v-for="(cs, k) in r.conditionStatus"
                :key="k"
                size="small"
                :type="cs.hit ? 'success' : 'error'"
                :bordered="false"
              >
                {{ cs.hit ? '✓' : '✗' }} {{ cs.text }}
              </NTag>
            </div>
          </template>
          <NText v-else depth="3" style="font-size: 12px">
            {{ r.matched === true ? '无字段差异' : '—' }}
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
/* 条件列表限高滚动：避免条件多时把弹窗撑出屏幕 */
.cond-scroll {
  max-height: 40vh;
  overflow-y: auto;
  padding-right: 4px;
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
.cond-diag {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
</style>
