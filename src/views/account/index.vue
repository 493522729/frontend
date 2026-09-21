<script setup lang="ts">
import type { AccountCreateInput } from '@/api/modules/account'
import type { AccountType } from '@/enums/account'
import type { BookMember, MemberRole } from '@/types/book'
import type { AccountWithBalance } from '@/types/transaction'
import { NButton, NInput, NModal, NSelect, NSkeleton, NSwitch, useMessage } from 'naive-ui'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { findFallbackAccount } from '@/api/modules/account'
import { fetchBookMembers } from '@/api/modules/bookMember'
import { countAccountUsage } from '@/api/modules/transaction'
import AnimatedMoney from '@/components/base/animated-money/index.vue'
import EmptyState from '@/components/business/empty-state/index.vue'
import FlowRail from '@/components/business/flow-rail/index.vue'
import TwemojiIcon from '@/components/business/twemoji-icon/index.vue'
import { ACCOUNT_TYPE_META, ACCOUNT_TYPES, accountTypeIcon, accountTypeLabel } from '@/enums/account'
import { useAccountStore } from '@/stores/modules/account'
import { useBookStore } from '@/stores/modules/book'
import { useQuickEntryStore } from '@/stores/modules/quickEntry'
import { formatCents, parseYuanToCents } from '@/utils/money'
import { emojiOption, renderEmojiLabel } from '@/utils/select-option'

/**
 * 账户管理页（Next 清单 #1，PRD §15.3 / US-004）
 * ====================================================================
 * 账户 = 「钱放在哪」。它是真实记账闭环的最后一公里：
 * 快速记账弹层早就有转账 UI，但账户一直是写死的种子数据，
 * 于是余额不会变、转账也无处可转 —— 这个页面把账户变成可管理的实体。
 *
 * 三条铁律：
 *  1. 账户属于账本：切账本换一批账户，页面 watch currentBookId 重载
 *  2. 余额不落库：由「期初 + 流水」现算（stats.listAccountBalances），改一笔流水余额立刻变
 *  3. 删账户先迁流水：顺序反了会留下指向不存在账户的孤儿流水；
 *     转账两端都是账户，缺一端就讲不通，所以转账笔会被一并清掉（删前必须告知用户）
 */

const accountStore = useAccountStore()
const book = useBookStore()
const quickEntry = useQuickEntryStore()
const message = useMessage()

const accounts = computed<AccountWithBalance[]>(() => accountStore.accounts)
const loading = computed(() => accountStore.loading)

/** 信用卡的可用额度 = 额度 + 余额（余额为负表示已欠款） */
function availableText(a: AccountWithBalance): string {
  return formatCents(a.creditLimit + a.balance, { withSymbol: true })
}

/**
 * 按账户类型分组
 * ───────────────────────────────────────────────────────────
 * 「钱放在哪」天然是个分类问题：6 张卡平铺时每张都要重复印一遍类型标签，
 * 那是视觉噪音；分组后类型只在组头出现一次，扫视路径变成「先看哪一类、再看哪一张」。
 *
 * 组的顺序固定走 ACCOUNT_TYPES 的定义顺序（现金 → 储蓄卡 → 信用卡 → …），
 * 不用余额排序 —— 每次刷新顺序都变会让人找不到上次看的那张卡。
 * 组内则按 |余额| 降序：钱多的账户在前，符合「先看大头」的阅读习惯。
 *
 * 空组（该类型下没有账户）不渲染，避免页面上出现一排空标题。
 */
interface AccountGroup {
  type: AccountType
  label: string
  icon: string
  items: AccountWithBalance[]
  /** 该组余额合计（分，信用卡为负） */
  total: number
}

/**
 * 按账户类型分组（「我的账户 / 成员账户」两个分区各自再按类型分）。
 *
 * ⚠️ 类型可自定义 ⇒ 只遍历预设数组会**漏掉**自定义类型的账户（它们会在账户页彻底不渲染）。
 *    这里把「预设之外的类型」按出现顺序补在后面，并统一走 `accountTypeLabel/Icon`（带兜底）。
 */
function buildTypeGroups(list: AccountWithBalance[]): AccountGroup[] {
  const presetTypes: readonly string[] = ACCOUNT_TYPES
  const customTypes = [...new Set(list.map(a => a.type).filter(t => !presetTypes.includes(t)))]

  return [...presetTypes, ...customTypes]
    .map((type) => {
      const items = list
        .filter(a => a.type === type)
        .slice()
        .sort((x, y) => Math.abs(y.balance) - Math.abs(x.balance))
      return {
        type,
        label: accountTypeLabel(type),
        icon: accountTypeIcon(type),
        items,
        total: items.reduce((sum, a) => sum + a.balance, 0),
      }
    })
    .filter(g => g.items.length > 0)
}

/**
 * 归属分区（共享账本）：我的账户 / 成员账户。
 *
 * 「我的净资产」与资产负债结构只统计「我的账户」；成员账户（他人账户）可见但明确标注不计入 ——
 * 转账给对方账户后，那笔钱不该再算成自己的资产。
 * 两层结构 = 分区（归属）→ 组（类型），所以页面上不会出现两个「现金」标题。
 */
interface AccountSection {
  key: 'mine' | 'member'
  title: string
  hint: string
  groups: AccountGroup[]
}

const sections = computed<AccountSection[]>(() =>
  [
    { key: 'mine' as const, title: '我的账户', hint: '', groups: buildTypeGroups(accountStore.myAccounts) },
    { key: 'member' as const, title: '成员账户', hint: '不计入我的净资产', groups: buildTypeGroups(accountStore.memberAccounts) },
  ].filter(s => s.groups.length > 0),
)

/**
 * 单个账户「占净资产多少」
 *
 * 这是原来缺的一层信息：卡片上只有绝对余额，看不出这个账户在全局里的分量。
 * 只在净资产为正、且本账户余额为正时给 —— 净资产为负时百分比没有可解释的含义。
 * 份额不足 0.1% 也省掉，否则会出现一排「占净资产 0.0%」。
 */
function shareText(a: AccountWithBalance): string | null {
  // 成员账户不属于「我的净资产」，占比对它没有意义
  if (a.mine === false)
    return null
  if (a.balance <= 0 || accountStore.netAssets <= 0)
    return null
  const pct = Math.round((a.balance / accountStore.netAssets) * 1000) / 10
  return pct >= 0.1 ? `占净资产 ${pct}%` : null
}

/** 信用卡已用额度百分比（0~100）；没设额度时返回 null，调用方不画条 */
function usedPercent(a: AccountWithBalance): number | null {
  if (a.creditLimit <= 0)
    return null
  return Math.max(0, Math.min(100, (-a.balance / a.creditLimit) * 100))
}

/** 已用额度是否接近刷爆（≥80%），用来决定条的颜色 */
function isHighUsage(a: AccountWithBalance): boolean {
  const pct = usedPercent(a)
  return pct != null && pct >= 80
}

// ── 表单弹层 ─────────────────────────────────────────────
/**
 * 图标候选：财务场景常用的 12 个，点一下就选上。
 * 输入框保留 —— 账户图标有时要迁就真实卡面（比如某张卡的专属图案），
 * 候选只能是「高频」而不是「全集」。
 */
const ICON_CANDIDATES = ['💵', '🏦', '💳', '💙', '💚', '📈', '💰', '🏧', '🧧', '🪙', '🏛️', '🧾']

const formVisible = ref(false)
const submitting = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({
  name: '',
  type: 'debit' as AccountType,
  icon: ACCOUNT_TYPE_META.debit.icon,
  /** 以「元」为单位的输入串，提交时才转分 —— 避免用户输入过程中被数值格式化打断 */
  initBalanceYuan: '0',
  creditLimitYuan: '0',
  isCredit: false,
  /** 账户归属人 userId（null = 建给自己）；仅共享账本 + OWNER/ADMIN 时可选他人 */
  ownerUserId: null as number | null,
})

/**
 * 类型下拉选项：预设 6 项 + 当前值（自定义类型）。
 *
 * ⚠️ 必须把**当前值**补进 options：编辑一个自定义类型的账户（如「花呗」）时，
 *    值不在选项里会让 NSelect 显示成空白。表单上配 `filterable` + `tag` 允许直接输入新类型名。
 * ⚠️ 定义在 form 之后：这里读 form.type，写在前面会触发 `ts/no-use-before-define`。
 */
const typeOptions = computed(() => {
  // value 显式放宽成 string：预设项要和「自定义类型」放进同一个数组，否则 push 时泛型不兼容
  const base = ACCOUNT_TYPES.map(t =>
    emojiOption(ACCOUNT_TYPE_META[t].icon, ACCOUNT_TYPE_META[t].label, t as string),
  )
  const current = form.type
  if (current && !(ACCOUNT_TYPES as readonly string[]).includes(current))
    base.push(emojiOption(accountTypeIcon(current), current, current))
  return base
})

/*
 * 「归属」——共享账本里 OWNER/ADMIN 可以**替其他成员**建账户。
 *
 * 为什么需要：把家人的卡记在自己名下，那笔钱会算进自己的净资产（口径就错了）；
 * 指定归属后，对方账户会落进账户页的「成员账户」分组，不进我的净资产。
 * 后端 create 会二次校验「调用者 OWNER/ADMIN + 归属人是本账本成员」，前端这层只是提前收敛选项。
 */
const members = ref<BookMember[]>([])
/** 当前登录用户在该账本的 userId（从成员列表 isMe 那行取） */
const myUserId = computed(() => members.value.find(m => m.isMe)?.userId ?? null)
const myRole = computed<MemberRole | null>(() => members.value.find(m => m.isMe)?.role ?? null)

/** 能否为他人建账户：共享账本 + 我是 OWNER/ADMIN */
const canAssignOwner = computed(() =>
  book.currentBook?.scope === 'SHARED'
  && (myRole.value === 'OWNER' || myRole.value === 'ADMIN'),
)

/** 归属候选：全部成员（label 用昵称，自己的那行加「（我）」） */
const ownerOptions = computed(() =>
  members.value.map(m =>
    emojiOption('👤', `${m.nickname || m.username}${m.isMe ? '（我）' : ''}`, m.userId),
  ),
)

/**
 * 拉当前账本成员（打开新建弹层时调）。
 * ⚠️ 个人账本没有「他人」，直接清空 —— 别为它白跑一次请求。
 *    拉失败也清空：**宁可不给选，也不能默认选错归属**。
 */
async function loadMembers() {
  if (book.currentBook?.scope !== 'SHARED') {
    members.value = []
    return
  }
  try {
    members.value = await fetchBookMembers(book.currentBookId)
  }
  catch {
    members.value = []
  }
}

function openCreate() {
  editingId.value = null
  form.name = ''
  form.type = 'debit'
  form.icon = ACCOUNT_TYPE_META.debit.icon
  form.initBalanceYuan = '0'
  form.creditLimitYuan = '0'
  form.isCredit = false
  form.ownerUserId = null
  formVisible.value = true
  // 共享账本才需要「归属」：打开时拉一次成员（个人账本内部直接清空，不发请求）
  void loadMembers()
}

function openEdit(a: AccountWithBalance) {
  editingId.value = a.id
  form.name = a.name
  form.type = a.type
  form.icon = a.icon
  // 分 → 元：展示时回到用户输入的量纲（(cents/100) 用 toFixed 只影响展示，不进存储）
  form.initBalanceYuan = (a.initBalance / 100).toFixed(2)
  form.creditLimitYuan = (a.creditLimit / 100).toFixed(2)
  form.isCredit = a.type === 'credit'
  formVisible.value = true
}

// 切类型时，若图标仍是上一种类型的默认图标，自动换成新类型的默认图标
watch(() => form.type, (type, prev) => {
  // 用带兜底的取值函数：自定义类型没有预设图标，兜底 💰（原来直接下标会拿到 undefined）
  if (!form.icon || form.icon === accountTypeIcon(prev ?? ''))
    form.icon = accountTypeIcon(type)
  // 信用卡没有「期初余额」概念：欠款由刷卡的支出流水累积出来，所以建卡时置 0
  if (type === 'credit')
    form.initBalanceYuan = '0'
})

async function submitForm() {
  /*
   * 连点防护：函数入口拦一道。
   * 按钮上的 `:loading` 只是视觉 + 屏蔽鼠标点击，回车 / 读屏等非鼠标路径不经过它；
   * 而建账户接口没有幂等键，重复提交会真的建出两个同名账户。
   */
  if (submitting.value)
    return
  const name = form.name.trim()
  if (!name)
    return message.warning('请输入账户名称')
  // 类型可自定义（tag 模式下允许清空）⇒ 必须校验非空，否则后端 require(type) 会拒
  const type = String(form.type ?? '').trim()
  if (!type)
    return message.warning('请选择或输入账户类型')

  const initBalance = parseYuanToCents(form.initBalanceYuan || '0')
  const creditLimit = form.isCredit ? parseYuanToCents(form.creditLimitYuan || '0') : 0
  if (!Number.isFinite(initBalance) || !Number.isFinite(creditLimit))
    return message.warning('金额格式不正确，最多两位小数')
  if (initBalance < 0 || creditLimit < 0)
    return message.warning('金额不能为负')

  submitting.value = true
  try {
    const payload: AccountCreateInput = {
      bookId: book.currentBookId,
      name,
      type,
      icon: form.icon || accountTypeIcon(type),
      initBalance,
      creditLimit: form.isCredit ? creditLimit : 0,
    }
    // 归属：只有「新建 + 明确选了别人」才带（后端还会二次校验权限与成员资格）
    if (form.ownerUserId && form.ownerUserId !== myUserId.value)
      payload.ownerUserId = form.ownerUserId

    if (editingId.value == null) {
      await accountStore.createAccountEntry(payload)
      message.success('账户已创建')
    }
    else {
      // ⚠️ 归属建后不可改：编辑时不带 ownerUserId，免得把已有账户搬到别人名下
      const { ownerUserId: _ignored, ...patch } = payload
      await accountStore.updateAccountEntry(editingId.value, patch)
      message.success('账户已更新')
    }
    formVisible.value = false
  }
  finally {
    submitting.value = false
  }
}

// ── 删除（先迁流水，再删账户）───────────────────────────────
const deleteVisible = ref(false)
const deleting = ref(false)
const target = ref<AccountWithBalance | null>(null)
const usage = ref<{ total: number, transfer: number }>({ total: 0, transfer: 0 })
const migrateTo = ref<number | null>(null)

/** 迁移目标候选：同账本、排除自身 */
const migrateOptions = computed(() =>
  accounts.value
    .filter(a => a.id !== target.value?.id)
    .map(a => emojiOption(a.icon, a.name, a.id)),
)

async function openDelete(a: AccountWithBalance) {
  // 至少留一个账户：全删光后记账弹层没有可选账户，产品直接不可用
  if (accounts.value.length <= 1) {
    message.warning('至少保留一个账户')
    return
  }
  target.value = a
  usage.value = await countAccountUsage(a.id)
  const fallback = await findFallbackAccount(a.bookId, a.id)
  migrateTo.value = fallback?.id ?? migrateOptions.value[0]?.value ?? null
  deleteVisible.value = true
}

async function confirmDelete() {
  // 连点防护（删账户会连带迁移/清理流水，重复执行代价高）
  if (deleting.value)
    return
  if (!target.value || migrateTo.value == null) {
    message.warning('请选择流水迁移到的账户')
    return
  }
  deleting.value = true
  try {
    const { migrated, removed } = await accountStore.deleteAccountEntry(target.value.id, migrateTo.value)
    const parts = [`${migrated} 笔流水已迁移`]
    if (removed > 0)
      parts.push(`${removed} 笔转账已清理`)
    message.success(`已删除「${target.value.name}」，${parts.join('，')}`)
    deleteVisible.value = false
  }
  finally {
    deleting.value = false
  }
}

onMounted(() => accountStore.ensureLoaded())
// 切账本 = 换一整批账户（US-005）
watch(() => book.currentBookId, () => accountStore.refresh())

/**
 * 记一笔 / 撤销后余额自动更新
 * ───────────────────────────────────────────────────────────
 * 弹层挂在 layout 层，和本页没有父子关系，变更信号走 quickEntry.dataChangedAt
 * （仪表盘 / 报表 / 资产 / 预算 / 交易大表都订阅了它，唯独本页漏了 ——
 * 这就是「记完一笔要手动刷新」的根因）。
 *
 * 必须用 refresh()（force）而不是 ensureLoaded()：后者是幂等的，
 * 同账本直接跳过，拿到的一直是旧余额。
 *
 * 页面被 keep-alive 缓存时不影响：watcher 在 deactivated 下仍然活着，
 * 弹层保存的瞬间余额就会更新，切回菜单看到的就是新数据。
 * 0 = 本次会话还没变更过，跳过首次触发。
 */
watch(() => quickEntry.dataChangedAt, (at) => {
  if (at > 0)
    void accountStore.refresh()
})
</script>

<template>
  <div class="account-page">
    <header class="page-header">
      <div class="heading">
        <span class="page-eyebrow">
          {{ book.currentBook?.name ?? '当前账本' }} · {{ accounts.length }} 个账户
        </span>
        <h1 class="page-title">
          账户管理
        </h1>
        <p class="page-subtitle">
          钱放在哪，余额就算到哪 —— 余额由「期初 + 流水」现算，不落库
        </p>
      </div>
      <NButton type="primary" @click="openCreate">
        + 新建账户
      </NButton>
    </header>

    <!--
      总览带：结论（净资产）→ 证据（资产负债结构）
      原来三张平铺的汇总卡主次不分，且看不出「资产里有多少是借来的」；
      换成带结构轨的一条，净资产是唯一的视觉主角。
    -->
    <section class="net-band" aria-label="账户总览">
      <div class="net-figure">
        <span class="net-label">我的净资产</span>
        <NSkeleton v-if="loading && !accounts.length" text width="70%" :height="30" />
        <span v-else class="net-value" :class="accountStore.netAssets < 0 ? 'is-debt' : ''">
          <AnimatedMoney :cents="accountStore.netAssets" />
        </span>
        <span class="net-hint">只统计你自己的账户；成员账户不计入，信用卡欠款已扣减</span>
      </div>

      <span class="net-divider" aria-hidden="true" />

      <div class="net-rail">
        <FlowRail
          :income="accountStore.totalAssets"
          :expense="accountStore.totalDebt"
          :labels="['资产', '负债']"
          caption="资产负债结构"
          empty-text="还没有账户余额"
          show-values
        />
      </div>
    </section>

    <!-- 首屏骨架：与真实卡片同构，避免数据到位时整块跳一下 -->
    <div v-if="loading && accounts.length === 0" class="account-grid">
      <div v-for="i in 3" :key="`sk-${i}`" class="account-card account-card--skeleton">
        <div class="card-top">
          <NSkeleton circle :width="40" :height="40" />
          <div class="card-titles">
            <NSkeleton text width="52%" :height="16" />
            <NSkeleton text width="36%" :height="12" />
          </div>
        </div>
        <NSkeleton text width="44%" :height="14" />
      </div>
    </div>
    <EmptyState
      v-else-if="accounts.length === 0"
      variant="wallet"
      title="还没有账户"
      desc="当前账本还没有账户，先建一个才能记账"
    >
      <NButton size="small" type="primary" @click="openCreate">
        + 新建账户
      </NButton>
    </EmptyState>

    <section v-else class="groups">
      <div v-for="sec in sections" :key="sec.key" class="owner-block">
        <header class="owner-head">
          <span class="owner-name">{{ sec.title }}</span>
          <span v-if="sec.hint" class="owner-hint">{{ sec.hint }}</span>
        </header>

        <div v-for="g in sec.groups" :key="`${sec.key}-${g.type}`" class="group">
          <header class="group-head" :class="g.total < 0 ? 'is-debt' : ''">
            <TwemojiIcon class="group-icon" :emoji="g.icon" :size="16" />
            <span class="group-name">{{ g.label }}</span>
            <span class="group-count">{{ g.items.length }}</span>
            <span class="group-total">
              <AnimatedMoney :cents="g.total" />
            </span>
          </header>

          <div class="account-grid">
            <article
              v-for="a in g.items"
              :key="a.id"
              class="account-card"
              :class="a.balance < 0 ? 'is-debt' : ''"
            >
              <div class="card-top">
                <span class="card-icon">
                  <TwemojiIcon :emoji="a.icon" :size="20" :alt="a.name" />
                </span>
                <div class="card-titles">
                  <span class="card-name">{{ a.name }}</span>
                  <span class="card-meta">{{ a.txnCount.toLocaleString('zh-CN') }} 笔流水</span>
                  <!-- 成员账户（他人账户）：可见，但余额不计入「我的净资产」 -->
                  <span v-if="a.mine === false" class="card-member">成员账户</span>
                </div>
                <div class="card-amount">
                  <span class="card-balance">
                    <AnimatedMoney :cents="a.balance" />
                  </span>
                  <span v-if="shareText(a)" class="card-share">{{ shareText(a) }}</span>
                </div>
              </div>

              <!-- 信用卡：额度用了多少比期初余额更有意义 -->
              <div v-if="usedPercent(a) !== null" class="credit">
                <div class="credit-head">
                  <span class="credit-label">可用 {{ availableText(a) }}</span>
                  <span class="credit-limit">额度 {{ formatCents(a.creditLimit, { withSymbol: true }) }}</span>
                </div>
                <div
                  class="credit-track"
                  role="progressbar"
                  :aria-label="`${a.name} 已用额度 ${Math.round(usedPercent(a) ?? 0)}%`"
                  :aria-valuenow="Math.round(usedPercent(a) ?? 0)"
                  aria-valuemin="0"
                  aria-valuemax="100"
                >
                  <span
                    class="credit-fill"
                    :class="isHighUsage(a) ? 'is-high' : ''"
                    :style="{ width: `${usedPercent(a)}%` }"
                  />
                </div>
              </div>
              <div v-else class="init-row">
                <span class="init-label">期初余额</span>
                <span class="init-value">{{ formatCents(a.initBalance, { withSymbol: true }) }}</span>
              </div>

              <div class="card-actions">
                <NButton size="small" tertiary @click="openEdit(a)">
                  编辑
                </NButton>
                <NButton size="small" tertiary type="error" @click="openDelete(a)">
                  删除
                </NButton>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>

    <!-- 新增 / 编辑 -->
    <NModal
      v-model:show="formVisible"
      preset="card"
      :title="editingId == null ? '新建账户' : '编辑账户'"
      style="width: min(460px, 92vw)"
    >
      <div class="form-body">
        <div class="field">
          <label class="field-label" for="acc-name">名称</label>
          <NInput
            id="acc-name"
            v-model:value="form.name"
            placeholder="如：招商储蓄卡、支付宝"
            maxlength="20"
          />
        </div>

        <div class="field">
          <span class="field-label">类型</span>
          <!--
            filterable + tag：预设之外**可自由输入**自定义类型名（如「花呗」「公积金」）。
            自定义类型按普通账户处理（只有预设「信用卡」有额度/欠款语义）。
          -->
          <NSelect
            v-model:value="form.type"
            :options="typeOptions"
            :render-label="renderEmojiLabel"
            filterable
            tag
            placeholder="选择或输入自定义类型"
          />
          <span class="field-hint">预设里没有的，直接输入新类型名，例如「花呗」「公积金」</span>
        </div>

        <!--
          归属（仅共享账本 + 我是 OWNER/ADMIN，且只在**新建**时出现）：
          默认建给自己；选其他成员即建到他/她名下 —— 该账户会落进账户页的「成员账户」分组、不计入我的净资产。
          编辑时不给改：把已有账户搬到别人名下是低频高风险操作。
        -->
        <div v-if="canAssignOwner && editingId == null" class="field">
          <span class="field-label">归属</span>
          <NSelect
            v-model:value="form.ownerUserId"
            :options="ownerOptions"
            :render-label="renderEmojiLabel"
            placeholder="建给自己"
          />
          <span class="field-hint">默认建给自己；选其他成员即建到他/她名下（不算进你的净资产）</span>
        </div>

        <div class="field">
          <span class="field-label">图标</span>
          <div class="icon-picker">
            <button
              v-for="ic in ICON_CANDIDATES"
              :key="ic"
              type="button"
              class="icon-picker__item"
              :class="{ 'is-active': form.icon === ic }"
              :aria-pressed="form.icon === ic"
              :title="`使用 ${ic}`"
              @click="form.icon = ic"
            >
              <TwemojiIcon :emoji="ic" :size="18" :alt="ic" />
            </button>
          </div>
          <!-- 候选只是高频集合，保留手填通路 -->
          <NInput v-model:value="form.icon" class="icon-input" placeholder="或手动输入任意 emoji" maxlength="4" />
        </div>

        <div v-if="form.type !== 'credit'" class="field">
          <label class="field-label" for="acc-init">期初余额</label>
          <NInput
            id="acc-init"
            v-model:value="form.initBalanceYuan"
            placeholder="0.00"
            inputmode="decimal"
          >
            <template #suffix>
              元
            </template>
          </NInput>
          <span class="field-hint">建账时这个账户里已有的钱，之后会跟着流水变</span>
        </div>

        <label class="field-row">
          <span>这是信用卡（可透支）</span>
          <NSwitch v-model:value="form.isCredit" />
        </label>

        <div v-if="form.isCredit" class="field">
          <label class="field-label" for="acc-limit">信用额度</label>
          <NInput
            id="acc-limit"
            v-model:value="form.creditLimitYuan"
            placeholder="0.00"
            inputmode="decimal"
          >
            <template #suffix>
              元
            </template>
          </NInput>
          <span class="field-hint">欠款由刷卡流水累积，信用卡不填期初余额</span>
        </div>
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

    <!-- 删除：先迁流水，再删账户 -->
    <NModal
      v-model:show="deleteVisible"
      preset="card"
      title="删除账户"
      style="width: min(460px, 92vw)"
    >
      <div class="delete-body">
        <p class="delete-warn">
          确定删除「<b>{{ target?.name }}</b>」吗？
        </p>
        <p v-if="usage.total > 0" class="delete-detail">
          该账户下有 <b>{{ usage.total }}</b> 笔流水，
          <template v-if="usage.transfer > 0">
            其中 <b>{{ usage.transfer }}</b> 笔是转账（两端都是账户，删除后无法成立，将一并清理）。
          </template>
          其余收支将迁移到下方账户，账目不会丢。
        </p>
        <div class="field">
          <span class="field-label">流水迁移到</span>
          <NSelect
            v-model:value="migrateTo"
            :options="migrateOptions"
            :render-label="renderEmojiLabel"
            placeholder="选择目标账户"
          />
        </div>
      </div>
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
.account-page {
  display: flex;
  flex-direction: column;
  gap: var(--lz-space-6);
  padding: var(--lz-content-padding);
  max-width: 1120px;
  margin: 0 auto;
}

// ── 页头 ────────────────────────────────────────────────
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.page-eyebrow {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--lz-text-secondary);
  letter-spacing: 0.04em;
  margin-bottom: 2px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--lz-text-primary);
  margin: 0 0 4px;
}

.page-subtitle {
  font-size: 13px;
  color: var(--lz-text-secondary);
  margin: 0;
}

// ── 总览带：净资产 + 资产负债结构 ────────────────────────
.net-band {
  display: grid;
  grid-template-columns: minmax(200px, auto) 1px minmax(0, 1fr);
  align-items: center;
  gap: var(--lz-space-6);
  padding: var(--lz-space-5) var(--lz-space-6);
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  box-shadow: var(--lz-shadow-sm);
}

.net-figure {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.net-label {
  font-size: 13px;
  color: var(--lz-text-secondary);
}

.net-value {
  @include tabular;

  font-size: 26px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  // 净资产是本页主角，用主色和普通账户卡片拉开层级；只有资不抵债才转警示色
  color: var(--lz-primary-600);

  &.is-debt {
    color: var(--lz-danger);
  }
}

.net-hint {
  font-size: 12px;
  color: var(--lz-text-secondary);
}

.net-divider {
  align-self: stretch;
  background: var(--lz-border);
}

.net-rail {
  min-width: 0;
}

// ── 分组 ────────────────────────────────────────────────
.groups {
  display: flex;
  flex-direction: column;
  gap: var(--lz-space-6);
}

/* 归属分区（我的账户 / 成员账户）：比类型组头更重一档，形成「分区 → 类型」两级层次 */
.owner-block {
  display: flex;
  flex-direction: column;
  gap: var(--lz-space-4);
}

.owner-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.owner-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--lz-text-primary);
}

/* 成员账户分区的说明（「不计入我的净资产」）：弱化但必须看得见 */
.owner-hint {
  font-size: 12px;
  color: var(--lz-text-disabled);
}

.group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--lz-border-light);

  &.is-debt .group-total {
    color: var(--lz-danger);
  }
}

.group-icon {
  display: inline-flex;
  flex-shrink: 0;
}

.group-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--lz-text-primary);
}

.group-count {
  font-size: 12px;
  font-weight: 500;
  padding: 1px 7px;
  border-radius: var(--lz-radius-full);
  background: var(--lz-bg-hover);
  color: var(--lz-text-secondary);
  @include tabular;
}

.group-total {
  margin-left: auto;
  font-size: 13px;
  font-weight: 600;
  color: var(--lz-text-regular);
  @include tabular;
}

// ── 账户卡片 ─────────────────────────────────────────────
.account-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--lz-space-4);
}

.account-card {
  --card-tone: var(--lz-text-primary);
  --card-tone-bg: var(--lz-bg-hover);

  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: var(--lz-space-4);
  background: var(--lz-bg-card);
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-xl);
  box-shadow: var(--lz-shadow-sm);
  min-width: 0;
  @include transition-paint();

  &:hover,
  &:focus-within {
    box-shadow: var(--lz-shadow-md);
  }

  // 欠款账户：图标底与余额一起转警示色，扫视时能立刻挑出来
  &.is-debt {
    --card-tone: var(--lz-danger);
    --card-tone-bg: var(--lz-danger-bg);
  }

  &--skeleton {
    box-shadow: none;
  }
}

.card-top {
  display: flex;
  align-items: center;
  gap: 12px;
}

.card-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--lz-radius-lg);
  background: var(--card-tone-bg);
  flex-shrink: 0;
  @include transition-paint();
}

.card-titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.card-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--lz-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-meta {
  font-size: 12px;
  color: var(--lz-text-secondary);
  @include tabular;
}

/* 「成员账户」小标：他人账户 —— 余额可见，但不计入我的净资产 */
.card-member {
  align-self: flex-start;
  padding: 0 6px;
  border-radius: var(--lz-radius-sm);
  font-size: 11px;
  line-height: 16px;
  background: var(--lz-border-light);
  color: var(--lz-text-secondary);
}

.card-amount {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
  max-width: 46%;
}

.card-balance {
  @include tabular;

  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--card-tone);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.card-share {
  font-size: 11px;
  color: var(--lz-text-secondary);
  @include tabular;

  white-space: nowrap;
}

// 信用卡：额度使用条
.credit {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.credit-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--lz-text-secondary);
  @include tabular;
}

.credit-label {
  color: var(--lz-text-regular);
  font-weight: 500;
}

.credit-limit {
  font-size: 11px;
}

.credit-track {
  height: 6px;
  border-radius: var(--lz-radius-full);
  background: var(--lz-border);
  overflow: hidden;
}

.credit-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--lz-primary-600);
  transition: width var(--lz-duration-slow) var(--lz-ease-decelerate);

  // 刷过八成就转警示色 —— 和预算页同一个「离上限不远了」的口径
  &.is-high {
    background: var(--lz-warning);
  }
}

// 非信用卡：期初余额
.init-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--lz-text-secondary);
}

.init-value {
  @include tabular;

  color: var(--lz-text-regular);
  font-weight: 500;
}

/**
 * 操作按钮默认隐身
 *
 * 编辑/删除是低频操作，常显会和余额抢注意力；改成 hover 才浮出，
 * 卡片看起来就只是一张「信息卡」。
 * focus-within 保证键盘 Tab 进来时按钮也在（否则焦点落在一个看不见的按钮上）。
 * 触屏没有 hover，@media (hover: none) 下常显。
 */
.card-actions {
  display: flex;
  gap: 8px;
  opacity: 0;
  transition: opacity var(--lz-duration-base);
}

.account-card:hover .card-actions,
.account-card:focus-within .card-actions {
  opacity: 1;
}

@media (hover: none) {
  .card-actions {
    opacity: 1;
  }
}

// ── 表单 ────────────────────────────────────────────────
.form-body {
  display: flex;
  flex-direction: column;
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

.field-hint {
  font-size: 11px;
  color: var(--lz-text-secondary);
}

.field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--lz-text-regular);
}

// 图标候选：6 列铺两行，和分类管理页的候选区手感一致
.icon-picker {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
}

.icon-picker__item {
  display: grid;
  place-items: center;
  height: 34px;
  border: 1px solid var(--lz-border);
  border-radius: var(--lz-radius-lg);
  background: transparent;
  cursor: pointer;
  @include transition-paint();

  &:hover {
    background: var(--lz-bg-hover);
  }

  &.is-active {
    border-color: var(--lz-primary-600);
    background: var(--lz-bg-hover);
  }
}

.icon-input {
  margin-top: 2px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.delete-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.delete-warn {
  font-size: 14px;
  color: var(--lz-text-regular);
  margin: 0;

  b {
    color: var(--lz-text-primary);
  }
}

.delete-detail {
  font-size: 13px;
  line-height: 1.6;
  color: var(--lz-text-secondary);
  margin: 0 0 6px;

  b {
    color: var(--lz-warning);
  }
}

// ── 响应式 ──────────────────────────────────────────────
@media (max-width: 767px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  // 竖线在窄屏没有意义，改成上下分区
  .net-band {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--lz-space-4);
  }

  .net-divider {
    height: 1px;
    align-self: auto;
  }
}

@media (max-width: 575px) {
  .account-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
