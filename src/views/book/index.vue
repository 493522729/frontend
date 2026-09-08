<script setup lang="ts">
import type { BookType } from '@/enums/book'
import type { BookWithStats } from '@/types/book'
import { NButton, NInput, NModal, NSelect, NSwitch, useMessage } from 'naive-ui'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { BOOK_TYPE_META, BOOK_TYPES } from '@/enums/book'
import { useBookStore } from '@/stores/modules/book'

/**
 * 账本管理页（Now 清单 #2，PRD §15.2.1）
 * ====================================================================
 * 当前顶栏只有「切换」，没有「管理」。产品要成立，用户必须能新建
 * 「宝宝账本」「旅行账本」等 —— 这是 P0 闭环的硬缺口。
 *
 * 写操作全部走 book store（再转发到 api/modules/book），
 * store 内部在写完后 refresh() 让顶栏切换器与各业务页面同步。
 */
const book = useBookStore()
const message = useMessage()

const books = computed<BookWithStats[]>(() => book.books)
const currentId = computed(() => book.currentBookId)

const typeOptions = BOOK_TYPES.map(t => ({ label: BOOK_TYPE_META[t].label, value: t }))

// ── 表单弹层 ─────────────────────────────────────────────
const formVisible = ref(false)
const submitting = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({
  name: '',
  type: 'daily' as BookType,
  icon: '🏠',
  isDefault: false,
})

function openCreate() {
  editingId.value = null
  form.name = ''
  form.type = 'daily'
  form.icon = BOOK_TYPE_META.daily.icon
  form.isDefault = false
  formVisible.value = true
}

function openEdit(b: BookWithStats) {
  editingId.value = b.id
  form.name = b.name
  form.type = b.type
  form.icon = b.icon
  form.isDefault = b.isDefault
  formVisible.value = true
}

// 切类型时，若图标仍是上一种类型的默认图标（或为空），自动补成新类型的默认图标
watch(() => form.type, (type, prev) => {
  if (!form.icon || form.icon === BOOK_TYPE_META[prev]?.icon)
    form.icon = BOOK_TYPE_META[type].icon
})

async function submitForm() {
  const name = form.name.trim()
  if (!name)
    return message.warning('请输入账本名称')
  submitting.value = true
  try {
    if (editingId.value == null) {
      await book.createBookEntry({ name, type: form.type, icon: form.icon, isDefault: form.isDefault, currency: 'CNY' })
      message.success('账本已创建')
    }
    else {
      await book.updateBookEntry(editingId.value, { name, type: form.type, icon: form.icon, isDefault: form.isDefault })
      message.success('账本已更新')
    }
    formVisible.value = false
  }
  finally {
    submitting.value = false
  }
}

// ── 删除 ───────────────────────────────────────────────
const deleteVisible = ref(false)
const deleting = ref(false)
const target = ref<BookWithStats | null>(null)

function openDelete(b: BookWithStats) {
  target.value = b
  deleteVisible.value = true
}

async function confirmDelete() {
  if (!target.value)
    return
  deleting.value = true
  try {
    const wasCurrent = target.value.id === currentId.value
    await book.deleteBookEntry(target.value.id)
    message.success(wasCurrent ? '已删除，已切回可用账本' : '已删除账本')
    deleteVisible.value = false
  }
  finally {
    deleting.value = false
  }
}

async function setDefault(b: BookWithStats) {
  await book.setDefaultBookEntry(b.id)
  message.success(`已设「${b.name}」为默认账本`)
}

onMounted(() => book.ensureLoaded())
</script>

<template>
  <div class="book-page">
    <header class="page-head">
      <div>
        <h1 class="page-title">
          账本管理
        </h1>
        <p class="page-sub">
          每个账本是一套独立账，切换后交易、账户、统计互不干扰。
        </p>
      </div>
      <NButton type="primary" @click="openCreate">
        + 新建账本
      </NButton>
    </header>

    <div class="book-grid">
      <article
        v-for="b in books"
        :key="b.id"
        class="book-card"
        :class="{ 'book-card--current': b.id === currentId }"
      >
        <div class="book-card__head">
          <span class="book-card__icon">{{ b.icon || BOOK_TYPE_META[b.type].icon }}</span>
          <div class="book-card__titles">
            <span class="book-card__name">{{ b.name }}</span>
            <span class="book-card__type">{{ BOOK_TYPE_META[b.type].label }}</span>
          </div>
          <span v-if="b.isDefault" class="book-tag book-tag--default">默认</span>
          <span v-if="b.id === currentId" class="book-tag book-tag--current">当前</span>
        </div>

        <div class="book-card__stats">
          <div class="stat">
            <span class="stat__num">{{ b.txnCount.toLocaleString('zh-CN') }}</span>
            <span class="stat__label">笔交易</span>
          </div>
          <div class="stat">
            <span class="stat__num">{{ b.accountCount }}</span>
            <span class="stat__label">个账户</span>
          </div>
        </div>

        <div class="book-card__actions">
          <NButton
            v-if="!b.isDefault"
            size="small"
            tertiary
            @click="setDefault(b)"
          >
            设为默认
          </NButton>
          <NButton size="small" tertiary @click="openEdit(b)">
            编辑
          </NButton>
          <NButton size="small" tertiary type="error" @click="openDelete(b)">
            删除
          </NButton>
        </div>
      </article>
    </div>

    <!-- 新增 / 编辑 -->
    <NModal
      v-model:show="formVisible"
      preset="card"
      :title="editingId == null ? '新建账本' : '编辑账本'"
      style="width: min(440px, 92vw)"
    >
      <div class="form-body">
        <label class="form-label">名称</label>
        <NInput v-model:value="form.name" placeholder="如：宝宝账本、旅行账本" maxlength="20" />

        <label class="form-label">类型</label>
        <NSelect v-model:value="form.type" :options="typeOptions" />

        <label class="form-label">图标（emoji）</label>
        <NInput v-model:value="form.icon" placeholder="🏠" maxlength="4" />

        <label class="form-row">
          <span>设为默认账本</span>
          <NSwitch v-model:value="form.isDefault" />
        </label>
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

    <!-- 删除确认 -->
    <NModal
      v-model:show="deleteVisible"
      preset="card"
      title="删除账本"
      style="width: min(420px, 92vw)"
    >
      <p class="delete-warn">
        确定删除「<b>{{ target?.name }}</b>」吗？
        <template v-if="target?.id === currentId">
          当前正在使用，删除后将自动切回其他账本。
        </template>
        <template v-else>
          账本下的交易数据不会被自动清账，请谨慎操作。
        </template>
      </p>
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
.book-page {
  display: flex;
  flex-direction: column;
  gap: var(--lz-space-6);
  padding: var(--lz-content-padding);
  max-width: 1040px;
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

.book-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--lz-space-4);
}

.book-card {
  display: flex;
  flex-direction: column;
  gap: var(--lz-space-4);
  padding: var(--lz-space-4);
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  transition: border-color var(--lz-duration-base) var(--lz-ease-standard),
    box-shadow var(--lz-duration-base) var(--lz-ease-standard);

  &:hover {
    box-shadow: var(--lz-shadow-sm);
  }

  &--current {
    border-color: var(--lz-primary-300);
    box-shadow: 0 0 0 2px var(--lz-primary-100);
  }
}

.book-card__head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.book-card__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--lz-radius-lg);
  background: var(--lz-bg-page);
  font-size: 22px;
  flex-shrink: 0;
}

.book-card__titles {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.book-card__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--lz-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.book-card__type {
  font-size: 12px;
  color: var(--lz-text-secondary);
}

.book-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--lz-radius-full);
  flex-shrink: 0;

  &--default {
    color: var(--lz-primary-700);
    background: var(--lz-primary-50);
  }

  &--current {
    color: var(--lz-success);
    background: var(--lz-success-bg);
  }
}

.book-card__stats {
  display: flex;
  gap: var(--lz-space-5);
  padding: var(--lz-space-3) 0;
  border-top: 1px solid var(--lz-border-light);
  border-bottom: 1px solid var(--lz-border-light);
}

.stat {
  display: flex;
  flex-direction: column;
}

.stat__num {
  font-size: 18px;
  font-weight: 600;
  color: var(--lz-text-primary);
  font-family: var(--lz-font-num);
  font-variant-numeric: tabular-nums;
}

.stat__label {
  font-size: 12px;
  color: var(--lz-text-secondary);
}

.book-card__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
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

.delete-warn {
  font-size: 14px;
  color: var(--lz-text-regular);
  line-height: 1.6;
  margin: 0;

  b {
    color: var(--lz-text-primary);
  }
}
</style>
