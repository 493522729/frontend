# 全栈记账 · 知识点沉淀（P1 四大模块联调交付）

> 覆盖模块：账户 + 转账 (US-004)、资产趋势 (US-005)、预算 + 超支预警 (US-006)、报表中心 (US-007)
> 整理日期：2026-09-10 ｜ 技术栈：Vue3.5 `<script setup>` + Pinia(setup store) + Naive UI + vxe-grid(虚拟滚动) + ECharts6(按需 `use()`)
> 金额统一：整数分存储/传输，展示层格式化。

---

## 1. 工程纪律与质量门禁

- **提交规范**：Conventional Commits（`feat` / `fix` / `chore`）+ 中文说明；`simple-git-hooks` → `lint-staged`（eslint + prettier）→ `commitlint`。
- **质量门禁（每次交付必跑）**：
  | 命令 | 作用 | 历史耗时 | 注意事项 |
  |---|---|---|---|
  | `pnpm typecheck` | vue-tsc 类型零错误 | ~7 min | 老赵环境极慢，务必 `run_in_background`，靠 task-notification 回收 |
  | `pnpm lint` | eslint 全量 | ~6.5 min | 同上，后台跑 |
  | `pnpm test` | vitest | 快 | 最终 129 passed / 8 文件 |
  | `pnpm lint:fix` | 自动修格式 | 快 | ⚠️ 曾误删 import（`useMessage` 等需手工补回） |
- **测试策略**：mock-first。每个 `api/modules/<m>/` 配 `mock.test.ts` 守住聚合口径（如净值曲线末端必须 ≡ 仪表盘净值）。

---

## 2. 标准交付流水线（每模块必走）

```
数据层(mock + api) → 状态层(store) → 页面 + 组件 → 路由 + 侧边栏 → 单测 → 门禁 → 文档同步
```

- **数据层**：`api/modules/<m>/mock.ts` 与 `index.ts` 同目录；`index.ts` 用 `simulateLatency(mockXxx(...))` 包裹，业务层零改动。
- **路由**：`router/modules/*.ts` 由 glob 自动注册，**无需手动插**；`order` 控制侧边栏顺序。
- **文档同步**：PRD §15.x 交付记录 + `overview.md` + `.workbuddy/memory/YYYY-MM-DD.md`。（注：根 `docs/` 未被 git 追踪，`frontend/docs/` 才入库）

---

## 3. 跨模块依赖与数据口径（最关键约束）

### 3.1 依赖单向
```
transaction → account → category
```
- 账户种子从 `transaction/mock.ts` **抽离**到 `account/mock.ts`（与 category 同款模式）。
- `book/mock.ts` 跟随改为从 `@/api/modules/account/mock` 引入 `mockListAccounts`。
- 第三方向下依赖，禁止反向引用，否则账本切换会串数据。

### 3.2 余额口径 — `mockGetAccountBalances`
```
余额 = 期初 + 收入 - 支出 - 转出 + 转入
```
- 信用卡「**负余额 = 欠款**」，「**可用额度 = 额度 + 余额**」。
- 返回 `AccountWithBalance`（定义在 `types/transaction.ts`）。

### 3.3 净值口径 — `mockGetNetWorthTrend`
- 一次遍历流水 → 构建「账户 × 月份」变动矩阵 → 按月累加出**月末快照**。
- 快照字段：`净资产 / 总资产 / 负债 / 月度净增`。
- **硬约束**：曲线末端必须 ≡ 仪表盘净值（单测守死，防聚合口径漂移）。

### 3.4 预算口径 — `mockGetBudgetOverview`
- 当月分类花费从 `transaction` mock **现算**（`mockCategorySpent`）。
- `percent` 分母 = 0 时返回 `0` 防除零；进度按 `percent` **降序**（最危险排前）。
- `categoryId = 0` 表示总预算（`TOTAL_BUDGET_CATEGORY_ID = 0`）。

### 3.5 报表口径 — `report` mock
- 一次遍历 → 三维矩阵（**时间 × 分类 × 账户**），**筛选在前、分桶在后**。
- `bucketKeyOf` 按粒度分桶：`day / week / month / quarter / year`。
- `bucketRange` 供下钻使用（点击桶 → 复用 `listTransactions` + 分页）。

---

## 4. 通用约定

| 约定 | 说明 |
|---|---|
| 金额 | 整数分；展示层格式化；避免浮点 |
| 跨页刷新 | `quickEntry.dataChangedAt` 广播，记账后强制相关视图重载 |
| 账本隔离 | `bookId` 贯穿所有查询；切账本后筛选/下拉必须跟换，否则串账本 |
| 图表基建 | 下沉为共享：`src/utils/echarts.ts`（`ensureECharts` 按需注册 + `tooltipStyle`/`axisMoneyLabel`）+ `src/composables/useChartPalette.ts`；原 `views/dashboard/_echarts.ts`、`useChartPalette.ts` 已删除 |
| 搜索 | 项目内全文搜索一律用 **Grep 工具**；`bash grep` 对含中文路径项目静默失效 |
| cwd | 后台命令偶发 cwd 漂移，统一用绝对路径 `cd /Users/zhaoqi/WorkBuddy/老赵的全栈之路/frontend &&` |

---

## 5. 踩坑与修复（按根因）

| 模块 | 现象 | 根因 | 修复 |
|---|---|---|---|
| 报表 | typecheck 报错 | `temporal-polyfill` 无 `PlainDate` 导出，与全局 `Temporal` 冲突 | 改从 `@/utils/temporal` 引入 |
| 报表 | 索引越界 | `BucketAcc` 缺 `transfer` 字段，`b[t.type]` 索引发溢（`TransactionType` 含 transfer） | 抽 `addTo(b, type, amount)` 内置 narrow（`if type==='income' b.income+=...`） |
| 报表 | 类型不匹配 | Naive UI `RenderPrefix` 签名 `itemCount: number \| undefined` | 同步改严 |
| 通用 | 网络 502 | `getaddrinfo ENOTFOUND copilot.tencent.com` | 连接失败，重试即可，非代码问题 |
| 通用 | 路由疑似未注册 | 误以为 `router/index.ts` 需手动插新路由 | 读文件确认 glob 自动注册 `router/modules/*.ts` |
| 通用 | lint 18 处格式 | `pnpm lint:fix` 自动修复；曾误删 import | `useMessage` 等手工补回 |
| 通用 | cwd 漂移 | 后台命令偶发 cwd 不在 frontend | 改用绝对路径 |
| 搜索 | bash grep 静默空 | 沙箱 `bash grep` 对中文路径项目失效 | 一律用 Grep 工具 |

---

## 6. Mock 数据已知毛刺（未修，备忘）

- 装修 / 旅行账本余额被刷成**深度负数**，全账本视角「负债 170 万」。属 seed 数据缺陷，不影响功能，待后续造数脚本修正。

---

## 7. 各模块文件清单

### US-004 账户 + 转账
`api/modules/account/{mock,index}.ts` ｜ `api/modules/stats/{index,mock,mock.test}.ts` ｜ `stores/modules/account.ts` ｜ `views/account/index.vue` ｜ `router/modules/account.ts` ｜ `types/transaction.ts`(增) ｜ `types/stats.ts`(增) ｜ `api/modules/transaction/{index,mock}.ts`(改) ｜ `api/modules/book/{mock,mock.test}.ts`(改) ｜ `views/transaction/index.vue`(改) ｜ `components/business/quick-entry/index.vue`(余额提示)

### US-005 资产趋势
`views/asset/{index.vue, components/NetWorthLine.vue, components/MonthlyChangeBar.vue, components/AccountComposition.vue, composables/useAssetTrend.ts}` ｜ `router/modules/asset.ts` ｜ `utils/echarts.ts` ｜ `composables/useChartPalette.ts` ｜ `views/dashboard/_echarts.ts`(删) ｜ `views/dashboard/composables/useChartPalette.ts`(删) ｜ `views/dashboard/components/{CategoryPie,TrendLine}.vue`(改)

### US-006 预算 + 超支预警
`api/modules/budget/{mock,index}.ts` ｜ `types/budget.ts` ｜ `views/budget/{index.vue, components/BudgetCard.vue, composables/useBudgets.ts}` ｜ `router/modules/budget.ts` ｜ `composables/budgetAlert.ts` ｜ `components/business/quick-entry/index.vue`(预警回跑)

### US-007 报表中心
`api/modules/report/{mock,index}.ts` ｜ `types/report.ts` ｜ `views/report/{index.vue, components/ReportBar.vue, components/ReportLine.vue, components/ReportPie.vue, composables/useReport.ts}` ｜ `router/modules/report.ts` ｜ `layouts/default/Sidebar/index.vue`(改)

---

## 8. US-008 银行流水导入（已交付）

**流程**：上传 → 列映射（系统识别 + 手动调整）→ 预览 → 确认导入。

**关键实现**：
- `xlsx` (SheetJS) 仅做「File → 行」适配层；「行 → 交易」的映射 / 去重 / 分类建议是纯函数，可单测、不依赖 xlsx。
- 自动列识别：按中文关键词（交易日期 / 交易金额 / 收支类型 / 余额 / 对方户名 / 摘要）匹配表头；未识别列提示手动调整。
- 金额归一化：千分位、货币符号、`(88.00)` 括号负、尾随 `+/-`、Excel 序列号日期 → 绝对值分。
- 方向判定：优先「收支类型」列关键词（收 / 贷 / 进 → 收入，支 / 借 / 出 → 支出），缺失默认支出。
- 重复检测：相同 `(金额|日期|备注)` 即「可能重复」——与本地已有交易重复 或 本批内重复；预览高亮，提交可跳过。
- 冲突合并（分类建议）：① 历史相同备注用得最多的分类 ② 分类名子串命中（最长匹配，如「外卖」优先「餐饮」）③ 兜底同方向「其他」。
- 提交写入：分类优先级 覆盖 > 建议 > 兜底；`keepDuplicates = false` 跳过重复项。

**文件清单**：
`types/import.ts` ｜ `api/modules/import/{mock,index}.ts` ｜ `stores/modules/import.ts` ｜ `views/import/index.vue` ｜ `router/modules/import.ts` ｜ `layouts/default/Sidebar/index.vue`(upload 图标) ｜ `package.json`(xlsx 依赖)

**单测**：`api/modules/import/mock.test.ts`（23 例，覆盖金额 / 日期 / 方向 / 自动映射 / 分类建议 / 解析 / 去重 / 提交计数）。

### US-009 周期账单自动待记（已交付）

**流程**：模板配置（金额 / 分类 / 账户 / 起始日 / 类型 / 自动确认 / 启用）→ 每月派生待确认队列 → 一键确认 / 改 / 跳过。

**关键实现**：
- 待确认项是**派生**的：不落库，按「当前月 + 模板」现算；当月「已处理」（确认或驳回）用 `_resolved` 集合（key = `模板id|YYYY-MM`）记录，**天然防重复入账**（重复确认抛错）。
- 确认：`mockConfirmRecurring` 写 Transaction（source='recurring'）+ 标记已处理；驳回：`mockDismissRecurring` 仅标记不写流水。
- 自动确认：store 加载待确认队列时把 `willAutoConfirm` 项自动 `confirmRecurring` 入账再重取（mock 阶段近似；真接口应在月切换时触发）。
- 周期账单**仅收入 / 支出**，排除 transfer（转账需两端账户，语义不适用）。
- 账本隔离：`bookId` 贯穿；切账本换整批模板与待确认项（loadedBookId 守卫）。

**文件清单**：
`types/recurring.ts` ｜ `api/modules/recurring/{mock,index}.ts` ｜ `stores/modules/recurring.ts` ｜ `views/recurring/index.vue` ｜ `router/modules/recurring.ts` ｜ `layouts/default/Sidebar/index.vue`(calendar 图标)

**单测**：`api/modules/recurring/mock.test.ts`（11 例：种子 / 派生不重不漏 / 确认写交易 / 重复确认抛错 / 驳回不写流水 / 账本隔离 / 自动确认标记 / 未来月不生成 / 停用不生成 / 删除后不再生成 / 覆盖生效）。

## 9. Next 队列（待办）

- **体验补强（P1 收尾）**：键盘导航 ↑↓/Enter/Esc、状态筛选（待确认 / 已记）、网络错误重试 toast —— 已于工作区交付（未提交，待老赵 review 代码后自提）。详见 §10。
- 已知毛刺：装修 / 旅行账本余额深度负数（全账本「负债 170 万」），待造数脚本修正。
- P2 候选（按需）：US-010 规则引擎、US-011 命令面板、US-012 智能洞察、US-013 移动端 PWA、US-014 可视化大屏。

## 10. 体验补强知识点（键盘导航 / 状态筛选 / 网络重试）

> 本轮落地的三件「专业感」补强，集中在交易大表（`views/transaction/`）。代码已写、门禁全绿（typecheck 0 / lint 0 / 168 测试通过），但**按老赵要求未提交**。

### 10.1 键盘导航（↑↓ 移焦点 / Enter 编辑 / Esc 退出）
- **高亮行**靠 vxe-grid 的 `rowClassName` 配置项，函数参数为 `{ rowIndex }`，与 `list` 数组下标对齐；active 行加 `.is-active-row` 类。
- **样式命中**：vxe 运行时生成的 `<tr>` 不带本组件 scoped 属性，scoped CSS 命中不到，必须用 `:deep(.is-active-row)`。
- **滚动跟随**：`grid.scrollToRow(row)` 把高亮行滚进可视区（虚拟滚动下必需，否则高亮可能在视口外）。
- **进入编辑**：`grid.setEditCell(row, 'amount')`；退出用 `grid.clearEdit()`。
- **判断编辑态**：vxe-table 4.x **没有 `isEdit()`**！要用 `grid.getEditRecord()` 返回是否非空来判断；之前误用 `isEdit?.()` 导致编辑态判断永远为 false，Esc 只清 activeIndex 而不退出单元格编辑。
- **Esc 双保险**：`editConfig` 开启 `escToCancel: true`（vxe 原生取消编辑）；自定义 `keydown` handler 里再用 `getEditRecord()` 判断，编辑态下 Esc 调用 `clearEdit()` 并 `preventDefault/stopPropagation`，避免和 vxe 内部 handler 冲突。
- **事件让权原则**（避免和正常输入打架）：
  - 正在编辑单元格（getEditRecord 非空）→ Esc 取消编辑并阻止冒泡，方向键不插手；
  - 焦点在 `input/select/textarea` 或 `contentEditable` → 那是打字，方向键留给光标；
  - 其余才由本 handler 接管方向键 / Enter / Esc。
- `activeIndex` 状态放在 composable（与 `list` 同生命周期），reload 成功后重置为 -1；点单元格用 `@cell-click` 同步高亮，鼠标 / 键盘状态一致。

### 10.2 状态筛选（待确认 / 已记）
- **语义**：`Transaction.status?: 'pending' | 'confirmed'`，缺省视为 `confirmed`（存量 / 手动数据无需复核）。
  - 导入进来的流水（US-008）置 `pending` —— 用户需在交易表复核确认；
  - 周期账单确认入账（US-009）置 `confirmed` —— 区别于导入待复核。
- **过滤链路**：`FilterState.status('all'|'pending'|'confirmed')` → URL 同步（`?status=pending`）→ `TransactionListParams.status` → `mockListTransactions` 按 `(t.status ?? 'confirmed') === status` 过滤。
- **确认动作**：行内「确认」按钮调 `confirmRow(id)`，乐观更新 `status='confirmed'` + `updateTransaction` 回滚策略同 `saveRow`；筛「待确认」时确认后该行移出当前视图。
- 这是和 US-008 导入对账的**闭环**：导入 → 待确认 → 交易表确认 → 已记。

### 10.3 网络错误重试 + 统一错误 toast
- **两层 API**（`composables/useRetryable.ts`）：
  - `withRetry(fn, { retries=2, delay=400 })` —— 纯函数，自动重试（默认 1 原始 + 2 重试 = 共 3 次，对齐 PRD 9.5「重试 3 次」），全失败抛最后一次错误；可单测。
  - `useRetryable(fn, opts)` —— Vue 组合式封装，额外管 `loading/error/data`，适合组件直接挂。
- **错误说人话**（`utils/errorHumanizer.ts`）：把 `Error` 按网络 / 4xx / 5xx / 其他归一成 `{ title, detail, code }`，供 notification 用，不再抛 `Failed to fetch` 这类机器语言。
- **接线**：`useTransactionList.load()` 用 `withRetry(() => listTransactions(params))` 包裹；失败时 `notification.error`（带「重试」按钮，duration:0 不自动消失） + 页面顶部错误条（`<NButton @click="reload">`）。
- **演示用故障注入**：`api/modules/transaction/index.ts` 的 `listTransactions` 在「浏览器 + URL 带 `?chaos=1`」时 `Promise.reject`，用于看完整的「重试 3 次 → 失败 toast → 手动重试」链路；Node / 测试环境（无 `window`）永远走正常分支，**不影响单测**。删 mock 时连同本段一起删。
- **教训**：重试默认 2 次 = 共 3 次尝试；mock 阶段不建议加指数退避（没必要），真后端再上 backoff。

**本轮新增 / 改动文件**：
`utils/errorHumanizer.ts`（新）｜ `composables/useRetryable.ts`（新）＋ `useRetryable.test.ts`（新，5 例）｜ `types/transaction.ts`（`TransactionStatus` + `status` 字段 + 列表 `status` 参数）｜ `api/modules/transaction/{mock,index}.ts`（状态过滤 + chaos 注入）｜ `api/modules/import/mock.ts`（提交置 pending）｜ `api/modules/recurring/mock.ts`（确认置 confirmed）｜ `views/transaction/composables/useTransactionList.ts`（status 筛选 / 键盘 activeIndex / 重试 / 确认）｜ `views/transaction/components/FilterPanel.vue`（状态筛选项）｜ `views/transaction/index.vue`（rowClassName / 键盘 handler / 待确认徽标 + 确认按钮 / 错误条）。
