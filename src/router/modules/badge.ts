import type { RouteRecordRaw } from 'vue-router'

const badgeRoutes: RouteRecordRaw[] = [
  {
    path: '/badge',
    name: 'Badge',
    component: () => import('@/views/badge/index.vue'),
    meta: {
      title: '勋章管理',
      icon: 'medal',
      // 超管专属：菜单只在持有 SUPER_ADMIN 时出现，守卫也会拦截越权进入
      roles: ['SUPER_ADMIN'],
      // 排在标签(6)之后
      order: 7,
      requiresAuth: true,
    },
  },
]

export default badgeRoutes
