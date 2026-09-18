<script setup lang="ts">
import type { BookScope, BookType } from '@/enums/book'
import type { BookWithStats } from '@/types/book'
import { NButton, NDrawer, NDrawerContent, NInput, NModal, NSelect, NSwitch, useMessage } from 'naive-ui'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import EmptyState from '@/components/business/empty-state/index.vue'
import { BOOK_SCOPE_META, BOOK_SCOPES, BOOK_TYPE_CUSTOM, BOOK_TYPE_META, BOOK_TYPES, bookTypeIcon, bookTypeLabel } from '@/enums/book'
import { useBookStore } from '@/stores/modules/book'
import BookMemberDrawer from './BookMemberDrawer.vue'

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
const showEmpty = computed(() => !book.loading && books.value.length === 0)

const typeOptions = [
  ...BOOK_TYPES.map(t => ({ label: BOOK_TYPE_META[t]!.label, value: t })),
  { label: '自定义…', value: BOOK_TYPE_CUSTOM },
]
const scopeOptions = BOOK_SCOPES.map(s => ({ label: `${BOOK_SCOPE_META[s].icon} ${BOOK_SCOPE_META[s].label}`, value: s }))

// 按归属范围分组：个人 / 共享
const personalBooks = computed(() => books.value.filter(b => b.scope !== 'SHARED'))
const sharedBooks = computed(() => books.value.filter(b => b.scope === 'SHARED'))

// ── 表单弹层 ─────────────────────────────────────────────
const formVisible = ref(false)
const submitting = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({
  name: '',
  type: 'daily' as BookType,
  /** 自定义类型文本（type === BOOK_TYPE_CUSTOM 时生效，入库的就是它） */
  customType: '',
  icon: '🏠',
  isDefault: false,
  scope: 'PERSONAL' as BookScope,
})

function openCreate() {
  editingId.value = null
  form.name = ''
  form.type = 'daily'
  form.customType = ''
  form.icon = BOOK_TYPE_META.daily!.icon
  form.isDefault = false
  form.scope = 'PERSONAL'
  formVisible.value = true
}

function openEdit(b: BookWithStats) {
  editingId.value = b.id
  form.name = b.name
  // 预设类型直接回填；自定义类型（不在预设里）切到「自定义」并还原文本
  if (BOOK_TYPES.includes(b.type as never)) {
    form.type = b.type
    form.customType = ''
  }
  else {
    form.type = BOOK_TYPE_CUSTOM
    form.customType = b.type
  }
  form.icon = b.icon
  form.isDefault = b.isDefault
  form.scope = b.scope ?? 'PERSONAL'
  formVisible.value = true
}

// ── 成员管理抽屉 ─────────────────────────────────────────
const memberDrawer = reactive({
  visible: false,
  bookId: 0,
  bookName: '',
})
function openMembers(b: BookWithStats) {
  memberDrawer.bookId = b.id
  memberDrawer.bookName = b.name
  memberDrawer.visible = true
}
function onMemberChanged() {
  // 成员数可能变化，刷新账本摘要
  book.refresh()
}

// 切类型时，若图标仍是上一种类型的默认图标（或为空），自动补成新类型的默认图标；
// 切到「自定义」则不动图标（用户自己填 emoji，卡片有通用兜底）
watch(() => form.type, (type, prev) => {
  if (type === BOOK_TYPE_CUSTOM)
    return
  if (!form.icon || form.icon === BOOK_TYPE_META[prev]?.icon)
    form.icon = BOOK_TYPE_META[type]?.icon ?? '📒'
})

/** 实际入库的类型值：预设→id；自定义→用户填的文本 */
const resolvedType = computed(() =>
  form.type === BOOK_TYPE_CUSTOM ? form.customType.trim() : form.type,
)

async function submitForm() {
  const name = form.name.trim()
  if (!name)
    return message.warning('请输入账本名称')
  if (form.type === BOOK_TYPE_CUSTOM && !resolvedType.value)
    return message.warning('请输入自定义类型名称')
  submitting.value = true
  try {
    if (editingId.value == null) {
      await book.createBookEntry({ name, type: resolvedType.value, icon: form.icon, isDefault: form.isDefault, currency: 'CNY', scope: form.scope })
      message.success('账本已创建')
    }
    else {
      await book.updateBookEntry(editingId.value, { name, type: resolvedType.value, icon: form.icon, isDefault: form.isDefault })
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

    <div v-if="books.length > 0" class="book-sections">
      <!-- 共享账本：家庭 / 情侣 / 合租 / 小生意共记 -->
      <section v-if="sharedBooks.length" class="book-section">
        <h2 class="section-title">
          <span class="section-emoji">👥</span> 共享账本
          <span class="section-hint">和家人朋友一起记</span>
        </h2>
        <div class="book-grid">
          <article
            v-for="b in sharedBooks"
            :key="b.id"
            class="book-card"
            :class="{ 'book-card--current': b.id === currentId }"
          >
            <div class="book-card__head">
              <span class="book-card__icon">{{ b.icon || bookTypeIcon(b.type) }}</span>
              <div class="book-card__titles">
                <span class="book-card__name">{{ b.name }}</span>
                <span class="book-card__type">{{ bookTypeLabel(b.type) }}</span>
              </div>
              <span v-if="b.scope === 'SHARED'" class="book-tag book-tag--shared">共享</span>
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
              <div class="stat">
                <span class="stat__num">{{ b.memberCount ?? 1 }}</span>
                <span class="stat__label">位成员</span>
              </div>
            </div>

            <div class="book-card__actions">
              <NButton size="small" tertiary @click="openMembers(b)">
                成员
              </NButton>
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
      </section>

      <!-- 个人账本 -->
      <section v-if="personalBooks.length" class="book-section">
        <h2 class="section-title">
          <span class="section-emoji">🙋</span> 我的账本
        </h2>
        <div class="book-grid">
          <article
            v-for="b in personalBooks"
            :key="b.id"
            class="book-card"
            :class="{ 'book-card--current': b.id === currentId }"
          >
            <div class="book-card__head">
              <span class="book-card__icon">{{ b.icon || bookTypeIcon(b.type) }}</span>
              <div class="book-card__titles">
                <span class="book-card__name">{{ b.name }}</span>
                <span class="book-card__type">{{ bookTypeLabel(b.type) }}</span>
              </div>
              <!--
                归属标签：个人账本也标出来（与「共享」同一套位置与尺寸）。
                为什么要标「个人」而不是只标「共享」：**无声的默认最容易让人误会** ——
                只标共享的话，一张没标签的卡片没法自解释，用户分不清它是个人账本还是标签没渲染出来；
                而分组标题往下滚就看不见了，卡片得自己说清。（小程序「我的」页那张卡片同一套语言）
              -->
              <span class="book-tag book-tag--personal">个人</span>
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
      </section>
    </div>

    <EmptyState
      v-else-if="showEmpty"
      variant="ledger"
      title="还没有账本"
      desc="建一个账本开始记账 —— 日常开销、宝宝账本、旅行账本都能各管各的。"
    >
      <NButton type="primary" @click="openCreate">
        + 新建账本
      </NButton>
    </EmptyState>

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
        <NInput
          v-if="form.type === BOOK_TYPE_CUSTOM"
          v-model:value="form.customType"
          class="custom-type-input"
          placeholder="自定义类型，如：宝宝、宠物、留学"
          maxlength="10"
        />

        <label v-if="editingId == null" class="form-label">归属</label>
        <NSelect
          v-if="editingId == null"
          v-model:value="form.scope"
          :options="scopeOptions"
        />
        <label v-else class="form-row">
          <span>归属</span>
          <NTag :bordered="false" :color="{ color: 'var(--lz-bg-page)' }">
            {{ BOOK_SCOPE_META[form.scope].icon }} {{ BOOK_SCOPE_META[form.scope].label }}
          </NTag>
        </label>

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

    <!-- 成员管理（共享账本） -->
    <NDrawer v-model:show="memberDrawer.visible" :width="440" placement="right">
      <NDrawerContent :native-scrollbar="false" :show-footer="false">
        <BookMemberDrawer
          :book-id="memberDrawer.bookId"
          :book-name="memberDrawer.bookName"
          @changed="onMemberChanged"
        />
      </NDrawerContent>
    </NDrawer>

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

.book-sections {
  display: flex;
  flex-direction: column;
  gap: var(--lz-space-6);
}

.book-section {
  display: flex;
  flex-direction: column;
  gap: var(--lz-space-4);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--lz-text-primary);
}

.custom-type-input {
  margin-top: 8px;
}

.section-emoji {
  font-size: 17px;
}

.section-hint {
  font-size: 12px;
  font-weight: 400;
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

  &--shared {
    color: var(--lz-primary-700);
    background: var(--lz-primary-50);
  }

  /*
   * 「个人」：安静的中性底 —— 它是默认态，不该抢眼，但「是哪种」要一眼看得出来。
   * 与「共享」（主色，强调）形成强弱对比；token 与小程序那边同一对（--lz-info / --lz-info-bg）。
   */
  &--personal {
    color: var(--lz-info);
    background: var(--lz-info-bg);
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
