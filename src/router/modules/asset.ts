import type { RouteRecordRaw } from 'vue-router'

const assetRoutes: RouteRecordRaw[] = [
  {
    path: '/asset',
    name: 'Asset',
    component: () => import('@/views/asset/index.vue'),
    meta: {
      title: '资产趋势',
      icon: 'trending',
      // 分析规划组头位：基础配置组(≤6)之后
      order: 7,
      requiresAuth: true,
    },
  },
]

export default assetRoutes
