import type { RouteRecordRaw } from 'vue-router'
import type { RouteModule } from './types'
import { createRouter, createWebHistory } from 'vue-router'
import { setupRouterGuards } from './guard'

/**
 * 路由模块自动注册（架构文档 ADR-5）
 *
 * [Vite import.meta.glob] modules/ 下每个文件就是一个路由模块，
 * 新增页面 = 新增一个文件，不用来 index.ts 登记。
 * eager: true 让模块在启动时同步注册（路由表本来就是启动期数据）。
 */
const modules = import.meta.glob<RouteModule>('./modules/*.ts', { eager: true, import: 'default' })

// 模块路由各自独立成组，flat 摊平成一个路由表
// eager + import: 'default'：让 Vite 编译成 `import dashboardRoutes from '...'`
// 这样 modules[key] 直接就是 default 导出的路由数组，不再是模块命名空间
const dynamicRoutes = Object.values(modules).flat()

// 按 meta.layout 拆分：缺省走 default layout；标记为 'blank' 的走空白布局
const defaultRoutes = dynamicRoutes.filter(r => r.meta?.layout !== 'blank')

// ── 根路由：layout 挂载点 ────────────────────────────────
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/default/index.vue'),
    redirect: '/dashboard',
    children: defaultRoutes,
  },
  // 登录页走 BlankLayout：无侧边栏、无 Header，全屏独立
  {
    path: '/login',
    component: () => import('@/layouts/blank/index.vue'),
    meta: {
      title: '登录',
      hidden: true,
      requiresAuth: false,
      layout: 'blank',
    },
    children: [
      {
        path: '',
        name: 'Login',
        component: () => import('@/views/auth/login/index.vue'),
        meta: {
          title: '登录',
          hidden: true,
          requiresAuth: false,
          layout: 'blank',
        },
      },
    ],
  },
  // 注册页走 BlankLayout（与登录页同一布局，复用品牌区）
  {
    path: '/register',
    component: () => import('@/layouts/blank/index.vue'),
    meta: {
      title: '注册',
      hidden: true,
      requiresAuth: false,
      layout: 'blank',
    },
    children: [
      {
        path: '',
        name: 'Register',
        component: () => import('@/views/auth/register/index.vue'),
        meta: {
          title: '注册',
          hidden: true,
          requiresAuth: false,
          layout: 'blank',
        },
      },
    ],
  },

  // 可视化大屏（US-014）：走 BlankLayout 全屏沉浸。
  // 注意它**不能**写成 modules/ 下的文件 —— 那里 layout:'blank' 的模块会被
  // defaultRoutes 的 filter 排除掉（只有 login/register 是手写进 routes 的）。
  {
    path: '/screen',
    component: () => import('@/layouts/blank/index.vue'),
    meta: {
      title: '可视化大屏',
      icon: 'screen',
      order: 20,
      requiresAuth: true,
      layout: 'blank',
    },
    children: [
      {
        path: '',
        name: 'Screen',
        component: () => import('@/views/screen/index.vue'),
        meta: {
          title: '可视化大屏',
          icon: 'screen',
          order: 20,
          requiresAuth: true,
          layout: 'blank',
        },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  // 切页面记住滚动位置：列表翻页后退回来还在原地
  scrollBehavior: (_to, _from, savedPosition) => savedPosition ?? { top: 0 },
})

setupRouterGuards(router)

export default router
