# frontend · 简账财务中台（Vue3 前端）

个人/家庭财务中台的前端工程。Vue3 + Vite8 + TS + Pinia + Naive UI + vxe-table + ECharts6 技术栈，从 0 到 1 全栈项目的前端部分（后端见仓库根 `backend/`）。

> 架构总纲：[`docs/frontend-architecture.md`](../docs/frontend-architecture.md) —— 目录结构、设计 token、交互规范、代码规范、14 条 ADR **全部以此为准**。
> 产品现状与技术总账：[`docs/product-summary.md`](../docs/product-summary.md) · [`docs/technical-summary.md`](../docs/technical-summary.md)

---

## 技术栈

- **Vue 3.5**（`script setup` 强制）+ **Vite 8**（Rolldown，`target: esnext` 不降级）
- **TypeScript 6.0**
- **Pinia 4**（setup store + persistedstate）
- **Naive UI 2.45**（themeOverrides 主题系统，晨雾蓝）
- **vxe-table 4.21**（交易大表：虚拟滚动 + 行内编辑）
- **ECharts 6**（按需 `use()` 注册，色板从 CSS token 读）
- **UnoCSS 66**（原子类）+ **scoped SCSS** + **CSS 变量**（三轨并行）
- **axios**（薄封装 + `Result<T>` 解包 + token 刷新队列）
- **@vueuse/core** / **temporal-polyfill**（Temporal 统一日期）/ **vue-i18n**（预留）
- 工程化：ESLint 10 + @antfu/eslint-config / Vitest 5 / simple-git-hooks + lint-staged + commitlint + czg

---

## 目录要点

```
frontend/
├── src/
│   ├── api/            # 请求定义 + 后端 DTO 契约（modules/* 对应后端 Controller）
│   │   └── request/    # axios 实例 / 拦截器 / 刷新队列 / Result<T> 解包
│   ├── views/          # 页面（只编排，不写业务逻辑），内部按业务域纵向切
│   ├── components/     # base（无业务）/ business（带业务）
│   ├── composables/    # 逻辑复用唯一出口（useTable/useRequest/useHotkey/useTheme...）
│   ├── stores/         # 仅跨页面共享状态（user/app/book/dict）
│   ├── utils/          # money.ts（金额唯一出入口）/ temporal.ts（日期唯一出入口）
│   ├── layouts/        # default（侧栏+顶栏+标签栏）/ blank
│   ├── router/         # modules/*.ts + import.meta.glob 自动注册
│   ├── styles/         # CSS 变量单一真相源
│   └── theme/naive.ts  # Naive 主题覆盖（晨雾蓝 + 暗色档）
├── build/              # vite 插件工厂（unocss/auto-import/compression/visualizer）
├── nginx.conf          # 生产反代 + HTTPS（80→443）
├── Dockerfile          # 多阶段：node 构建 → nginx 托管（BuildKit 缓存优化）
└── uno.config.ts / eslint.config.js / vite.config.ts / tsconfig*.json
```

**铁律**：`views/` 不直接调 axios（走 `api/`）；`base` 组件不出现业务字段名；金额全程 Long「分」（`utils/money.ts` 唯一出入口）；业务日期走 `utils/temporal.ts`。

---

## 常用命令

```bash
pnpm install        # 装依赖（registry = npmmirror）
pnpm dev            # 开发服务器（默认 5173，/api 代理到后端 8080）
pnpm build          # vue-tsc -b && vite build → dist/
pnpm build:report   # 带体积分析（treemap）
pnpm lint           # eslint（目标 0 error 0 warn）
pnpm typecheck      # vue-tsc --noEmit
pnpm test           # vitest（纯函数层：money/temporal/聚合）
pnpm commit         # czg 交互式 Conventional Commits
```

---

## 与后端联调

- 开发：`.env.development` 的 `VITE_BASE_API` 指向 `/api`，由 `vite.config.ts` proxy 原样转发到 `http://localhost:8080`。
- 生产：构建进包或运行时 `config.js` 注入；Nginx 把 `/api/` 反代到后端容器。
- 鉴权：每个请求自动带 `Authorization: Bearer <accessToken>`；收 `40101` 用 refreshToken 无感换新（并发只刷一次）。
- 响应信封：所有接口 HTTP 恒 200，成败看 `code`（200 成功 / 40100 未登录 / 40101 过期 / 40300 越权）。

> 切换后端只需改 `VITE_BASE_API` + proxy target，业务代码零改动。接口契约见 [`backend-roadmap.md`](../docs/backend-roadmap.md)。

---

## 质量门禁

- 首屏 JS gzip ≤ 350 KB（当前约 34 KB）
- `utils/money.ts` 单测覆盖 **100%**，`utils/temporal.ts` ≥ 90%
- 提交前：ts/vue → eslint+vue-tsc；json/md → prettier；commit-msg → commitlint

> 红线：代码提交由老赵手动完成，AI 不自动 commit。
