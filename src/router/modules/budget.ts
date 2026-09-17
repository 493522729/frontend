import type { RouteRecordRaw } from 'vue-router'

const budgetRoutes: RouteRecordRaw[] = [
  {
    path: '/budget',
    name: 'Budget',
    component: () => import('@/views/budget/index.vue'),
    meta: {
      title: '预算',
      icon: 'flag',
      // 分析规划组：资产趋势(7) / 报表(8) 之后
      order: 9,
      requiresAuth: true,
    },
  },
]

export default budgetRoutes
