import type { ColumnMapping, ImportPreview } from '@/types/import'
import type { Account, Category } from '@/types/transaction'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import * as XLSX from 'xlsx'
import { listAccounts } from '@/api/modules/account'
import { findFallbackCategory, listCategories } from '@/api/modules/category'
import { autoDetectColumns, buildPreview, commitImport } from '@/api/modules/import'
import { useBookStore } from '@/stores/modules/book'

/**
 * 导入向导状态机：upload → mapping → preview → done
 * 仅负责「流程编排 + 少量 UI 副作用」；解析/去重/分类建议/写入都在 api/modules/import。
 * xlsx 仅在此处做「File → 行」，与纯逻辑解耦，便于将来替换为后端直传。
 */
export const useImportStore = defineStore('import', () => {
  const bookStore = useBookStore()
  const { currentBookId } = storeToRefs(bookStore)

  const step = ref<'upload' | 'mapping' | 'preview' | 'done'>('upload')
  const fileName = ref('')
  const rawRows = ref<Record<string, string | number>[]>([])
  const headers = ref<string[]>([])
  const mapping = ref<ColumnMapping | null>(null)
  const unmapped = ref<string[]>([])
  const preview = ref<ImportPreview | null>(null)
  const importing = ref(false)
  const result = ref<{ inserted: number, skipped: number } | null>(null)

  // 导入落到「当前账本」，跟随用户切换的账本，而非写死的 1 号
  const bookId = currentBookId
  const accountId = ref<number | null>(null)
  const keepDuplicates = ref(false)
  const categoryOverrides = ref<Record<number, number>>({})

  const categories = ref<Category[]>([])
  const accountsList = ref<Account[]>([])
  const fallback = ref<{ income: number, expense: number }>({ income: 0, expense: 0 })
  const accounts = computed(() => accountsList.value)
  const fallbackByDirection = computed(() => fallback.value)

  /** 加载真实分类 / 账户 / 兜底分类（替换原 mock 假数据） */
  async function loadRefs() {
    const [cats, accs, finc, fexp] = await Promise.all([
      listCategories(),
      listAccounts(bookId.value),
      findFallbackCategory('income'),
      findFallbackCategory('expense'),
    ])
    categories.value = cats
    accountsList.value = accs
    fallback.value = { income: finc?.id ?? 0, expense: fexp?.id ?? 0 }
  }
  loadRefs()

  function reset() {
    step.value = 'upload'
    fileName.value = ''
    rawRows.value = []
    headers.value = []
    mapping.value = null
    unmapped.value = []
    preview.value = null
    importing.value = false
    result.value = null
    accountId.value = null
    keepDuplicates.value = false
    categoryOverrides.value = {}
    loadRefs()
  }

  async function loadFile(file: File) {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const firstSheet = wb.SheetNames[0]
    if (!firstSheet)
      throw new Error('Excel 中未找到工作表')
    const ws = wb.Sheets[firstSheet]!
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
    const rows = json.filter(r => Object.values(r).some(v => v !== '' && v != null)) as Record<string, string | number>[]
    rawRows.value = rows
    fileName.value = file.name
    headers.value = rows.length ? Object.keys(rows[0]!) : []
    const auto = await autoDetectColumns(headers.value)
    mapping.value = { ...auto.mapping }
    unmapped.value = auto.unmapped
    step.value = 'mapping'
  }

  function setMappingField(field: keyof ColumnMapping, col: string) {
    if (!mapping.value)
      return
    mapping.value = { ...mapping.value, [field]: col || undefined }
  }

  async function toPreview() {
    if (!mapping.value)
      return
    preview.value = await buildPreview(rawRows.value, mapping.value, bookId.value)
    step.value = 'preview'
  }

  function setCategoryOverride(index: number, categoryId: number) {
    categoryOverrides.value = { ...categoryOverrides.value, [index]: categoryId }
  }

  async function confirmImport() {
    if (!preview.value || accountId.value == null)
      return
    // 兜底分类预填进 overrides，确保 commitImport 始终有分类可落
    const overrides: Record<number, number> = { ...categoryOverrides.value }
    for (const p of preview.value.rows) {
      if (overrides[p.index] == null && p.suggestedCategoryId == null) {
        overrides[p.index] = p.direction === 'income'
          ? fallbackByDirection.value.income
          : fallbackByDirection.value.expense
      }
    }
    importing.value = true
    const res = await commitImport(preview.value.rows, {
      accountId: accountId.value,
      bookId: bookId.value,
      keepDuplicates: keepDuplicates.value,
      categoryOverrides: overrides,
      fallbackCategoryId: fallbackByDirection.value.expense,
    })
    result.value = { inserted: res.inserted, skipped: res.skipped }
    importing.value = false
    step.value = 'done'
  }

  return {
    step,
    fileName,
    rawRows,
    headers,
    mapping,
    unmapped,
    preview,
    importing,
    result,
    bookId,
    accountId,
    keepDuplicates,
    categoryOverrides,
    categories,
    accounts,
    fallbackByDirection,
    reset,
    loadFile,
    setMappingField,
    toPreview,
    setCategoryOverride,
    confirmImport,
  }
})
