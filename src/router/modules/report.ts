import type { RouteRecordRaw } from 'vue-router'

const reportRoutes: RouteRecordRaw[] = [
  {
    path: '/report',
    name: 'Report',
    component: () => import('@/views/report/index.vue'),
    meta: {
      title: '报表中心',
      icon: 'chart',
      // 「分析」组：资产趋势(6) / 预算(7) 之后
      order: 8,
      requiresAuth: true,
    },
  },
]

export default reportRoutes
