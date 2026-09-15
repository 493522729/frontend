<script setup lang="ts">
import type { ColumnMapping, ParsedImportTxn } from '@/types/import'
import {
  NAlert,
  NButton,
  NSelect,
  NSpace,
  NStatistic,
  NStep,
  NSteps,
  NSwitch,
  NTag,
  useMessage,
} from 'naive-ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import TwemojiIcon from '@/components/business/twemoji-icon/index.vue'
import { useImportStore } from '@/stores/modules/import'
import { emojiOption, renderEmojiLabel } from '@/utils/select-option'

const store = useImportStore()
const message = useMessage()
const {
  step,
  headers,
  mapping,
  unmapped,
  preview,
  importing,
  result,
  categories,
  accounts,
  accountId,
  keepDuplicates,
  categoryOverrides,
  fallbackByDirection,
} = storeToRefs(store)

const categoryOptionsByDir = computed(() => ({
  income: categories.value.filter(c => c.type === 'income').map(c => emojiOption(c.icon, c.name, c.id)),
  expense: categories.value.filter(c => c.type === 'expense').map(c => emojiOption(c.icon, c.name, c.id)),
}))

const accountOptions = computed(() => accounts.value.map(a => emojiOption(a.icon, a.name, a.id)))

const columnOptions = computed(() => [
  { label: '（不映射）', value: '' },
  ...headers.value.map(h => ({ label: h, value: h })),
])

const mappingFields: { key: keyof ColumnMapping, label: string, required: boolean }[] = [
  { key: 'date', label: '交易日期', required: true },
  { key: 'amount', label: '金额', required: true },
  { key: 'type', label: '收支类型', required: false },
  { key: 'counterparty', label: '对方户名 / 商户', required: false },
  { key: 'remark', label: '备注 / 摘要', required: false },
  { key: 'balance', label: '余额', required: false },
]

const fileInput = ref<HTMLInputElement>()
const isDragging = ref(false)

function pick(file: File | undefined | null) {
  if (!file)
    return
  store.loadFile(file).catch((err) => {
    message.error(String(err?.message ?? err))
  })
}

function onFileChange(e: Event) {
  pick((e.target as HTMLInputElement).files?.[0])
  ;(e.target as HTMLInputElement).value = '' // 允许重复选同一文件
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  pick(e.dataTransfer?.files?.[0])
}

function effectiveCategory(row: ParsedImportTxn): number {
  return (
    categoryOverrides.value[row.index]
    ?? row.suggestedCategoryId
    ?? (row.direction === 'income' ? fallbackByDirection.value.income : fallbackByDirection.value.expense)
  )
}

function onSelectCategory(row: ParsedImportTxn, val: string | number | null) {
  if (val == null)
    return
  store.setCategoryOverride(row.index, Number(val))
}

function onMappingChange(field: keyof ColumnMapping, val: string | number | null) {
  store.setMappingField(field, String(val ?? ''))
}
</script>

<template>
  <div class="import-page">
    <h1 class="page-title">
      银行流水导入
    </h1>

    <NSteps
      class="import-steps"
      :current="['upload', 'mapping', 'preview', 'done'].indexOf(step) + 1"
      size="small"
    >
      <NStep title="上传" />
      <NStep title="列映射" />
      <NStep title="预览" />
      <NStep title="完成" />
    </NSteps>

    <!-- 上传：可拖拽的拖放区，点击也能选文件 -->
    <div
      v-if="step === 'upload'"
      class="upload-zone"
      :class="{ 'is-dragover': isDragging }"
      role="button"
      tabindex="0"
      @click="fileInput?.click()"
      @keydown.enter.prevent="fileInput?.click()"
      @dragenter.prevent="isDragging = true"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="onDrop"
    >
      <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" style="display: none" @change="onFileChange">
      <TwemojiIcon name="upload" :size="64" class="upload-art" />
      <p class="upload-title">
        拖拽银行流水文件到此处
      </p>
      <p class="upload-desc">
        支持招行等导出的 Excel / CSV，自动去重 + 匹配账户
      </p>
      <NButton type="primary" @click.stop="fileInput?.click()">
        选择文件
      </NButton>
    </div>

    <!-- 列映射 -->
    <div v-else-if="step === 'mapping'" class="card">
      <p class="tip">
        已读取 <b>{{ headers.length }}</b> 列，系统已自动识别，可手动调整：
      </p>
      <table class="kv">
        <tbody>
          <tr v-for="f in mappingFields" :key="f.key">
            <td class="k">
              {{ f.label }}<i v-if="f.required" class="req">*</i>
            </td>
            <td>
              <NSelect
                :options="columnOptions"
                :value="(mapping?.[f.key] as string) || ''"
                @update:value="(v: string | number | null) => onMappingChange(f.key, v)"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="unmapped.length" class="tip warn">
        未识别列：{{ unmapped.join('、') }}
      </p>
      <NSpace class="form-actions" justify="end">
        <NButton @click="store.reset()">
          重新选择
        </NButton>
        <NButton
          type="primary"
          :disabled="!mapping?.date || !mapping?.amount"
          @click="store.toPreview()"
        >
          下一步：预览
        </NButton>
      </NSpace>
    </div>

    <!-- 预览 -->
    <div v-else-if="step === 'preview'" class="card">
      <NSpace class="stats">
        <NStatistic label="总笔数" :value="preview?.total ?? 0" />
        <NStatistic label="可能重复" :value="preview?.duplicateCount ?? 0" />
        <NStatistic label="待选分类" :value="preview?.conflictCount ?? 0" />
      </NSpace>

      <NSpace class="options">
        <span>导入账户：</span>
        <NSelect v-model:value="accountId" :options="accountOptions" :render-label="renderEmojiLabel" placeholder="选择账户" style="width: 200px" />
        <span>保留重复项：</span>
        <NSwitch v-model:value="keepDuplicates" />
      </NSpace>

      <div class="table-wrap">
        <table class="preview-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>金额(元)</th>
              <th>方向</th>
              <th>对方/备注</th>
              <th>建议分类</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in preview?.rows" :key="row.index" :class="{ dup: row.isDuplicate }">
              <td>{{ row.date }}</td>
              <td class="amount">
                {{ (row.amount / 100).toFixed(2) }}
              </td>
              <td>{{ row.direction === 'income' ? '收入' : '支出' }}</td>
              <td>{{ row.remark || row.counterparty || '-' }}</td>
              <td>
                <NSelect
                  size="small"
                  :options="categoryOptionsByDir[row.direction]"
                  :render-label="renderEmojiLabel"
                  :value="effectiveCategory(row)"
                  style="width: 130px"
                  @update:value="(v: string | number | null) => onSelectCategory(row, v)"
                />
              </td>
              <td>
                <NTag v-if="row.isDuplicate" type="warning" size="small">
                  可能重复
                </NTag>
                <NTag v-else-if="row.suggestedCategoryId" type="success" size="small">
                  已建议
                </NTag>
                <NTag v-else type="default" size="small">
                  已兜底
                </NTag>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <NSpace class="form-actions" justify="end">
        <NButton @click="store.toPreview()">
          刷新预览
        </NButton>
        <NButton @click="store.reset()">
          取消
        </NButton>
        <NButton
          type="primary"
          :loading="importing"
          :disabled="!accountId"
          @click="store.confirmImport()"
        >
          确认导入
        </NButton>
      </NSpace>
    </div>

    <!-- 完成 -->
    <div v-else-if="step === 'done'" class="card done-card">
      <NAlert type="success" :title="`导入完成：新增 ${result?.inserted ?? 0} 条，跳过 ${result?.skipped ?? 0} 条`">
        流水已写入所选账户，可在「交易大表」查看；重复项已按你的设置处理。
      </NAlert>
      <NSpace>
        <NButton type="primary" @click="store.reset()">
          再导入一次
        </NButton>
      </NSpace>
    </div>
  </div>
</template>

<style scoped lang="scss">
.import-page {
  padding: 24px;
  max-width: 960px;
  margin: 0 auto;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--lz-text-primary);
  margin: 0 0 16px;
}

.import-steps {
  margin-bottom: 24px;
}

.card {
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  padding: 20px;
}

// 上传拖放区：虚线边框，拖拽悬停时高亮（晨雾蓝描边 + 浅填充）
.upload-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 24px;
  text-align: center;
  background: var(--lz-bg-card);
  border: 2px dashed var(--lz-border);
  border-radius: var(--lz-radius-xl);
  cursor: pointer;
  transition: border-color var(--lz-duration-base), background-color var(--lz-duration-base);

  &:hover {
    border-color: var(--lz-primary-400);
  }

  &.is-dragover {
    border-color: var(--lz-primary-500);
    background: rgb(var(--lz-primary-rgb) / 8%);
  }

  &:focus-visible {
    outline: 2px solid var(--lz-primary-400);
    outline-offset: 2px;
  }
}

.upload-art {
  margin-bottom: 4px;
}

.upload-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--lz-text-primary);
}

.upload-desc {
  margin: 0 0 8px;
  max-width: 360px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--lz-text-secondary);
}

.done-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tip {
  font-size: 14px;
  color: var(--lz-text-regular);
  margin: 0 0 12px;

  &.warn {
    color: var(--lz-warning);
  }
}

.kv {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;

  td {
    padding: 8px 4px;
    border-bottom: 1px solid var(--lz-border);
    vertical-align: middle;
  }

  .k {
    width: 160px;
    color: var(--lz-text-primary);
    font-weight: 500;
  }

  .req {
    color: var(--lz-danger);
    margin-left: 4px;
    font-style: normal;
  }
}

.stats {
  margin-bottom: 16px;
}

.options {
  margin-bottom: 16px;
  align-items: center;
}

.table-wrap {
  max-height: 420px;
  overflow: auto;
  border: 1px solid var(--lz-border);
  border-radius: 8px;
  margin-bottom: 16px;
}

.form-actions {
  margin-top: 4px;
}

.preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th,
  td {
    padding: 8px 10px;
    text-align: left;
    border-bottom: 1px solid var(--lz-border);
    white-space: nowrap;
  }

  th {
    position: sticky;
    top: 0;
    background: var(--lz-bg-card);
    color: var(--lz-text-secondary);
    font-weight: 600;
  }

  .amount {
    font-variant-numeric: tabular-nums;
  }

  tr.dup {
    background: var(--lz-warning-bg);
  }
}
</style>
