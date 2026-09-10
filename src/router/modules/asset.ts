import type { RouteRecordRaw } from 'vue-router'

const assetRoutes: RouteRecordRaw[] = [
  {
    path: '/asset',
    name: 'Asset',
    component: () => import('@/views/asset/index.vue'),
    meta: {
      title: '资产趋势',
      icon: 'trending',
      // 排在「分析」组：账户（order 5）之后，与报表同组
      order: 6,
      requiresAuth: true,
    },
  },
]

export default assetRoutes
