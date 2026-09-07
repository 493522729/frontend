import type { RouteModule } from '../types'

/**
 * 鉴权相关路由：登录页
 * 单独成模块，meta.hidden=true 不进左侧菜单（架构文档 ADR-5）。
 * routes/index.ts 会把它挂到「blank layout」下（无侧边栏 / 无 Header）。
 */
export default [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/auth/login/index.vue'),
    meta: {
      title: '登录',
      hidden: true,
      requiresAuth: false,
      layout: 'blank',
    },
  },
] satisfies RouteModule
