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

- **体验补强（P1 收尾）**：键盘导航 ↑↓/Enter/Esc、状态筛选（待确认 / 已记）、网络错误重试 toast（PRD §15.2.2 未完项）。
- 已知毛刺：装修 / 旅行账本余额深度负数（全账本「负债 170 万」），待造数脚本修正。
- P2 候选（按需）：US-010 规则引擎、US-011 命令面板、US-012 智能洞察、US-013 移动端 PWA、US-014 可视化大屏。
