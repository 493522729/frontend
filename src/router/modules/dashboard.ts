import type { RouteModule } from '../types'

/**
 * 仪表盘 —— 默认首页
 */
export default [
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/dashboard/index.vue'),
    meta: {
      title: '仪表盘',
      icon: 'dashboard',
      order: 1,
      // 仪表盘是受保护页面：未登录访问会被路由守卫踢到 /login
      requiresAuth: true,
    },
  },
] satisfies RouteModule
