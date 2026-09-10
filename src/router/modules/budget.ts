import type { RouteRecordRaw } from 'vue-router'

const budgetRoutes: RouteRecordRaw[] = [
  {
    path: '/budget',
    name: 'Budget',
    component: () => import('@/views/budget/index.vue'),
    meta: {
      title: '预算',
      icon: 'flag',
      // 排在「规划」组：账户(5) / 资产趋势(6) 之后
      order: 7,
      requiresAuth: true,
    },
  },
]

export default budgetRoutes
