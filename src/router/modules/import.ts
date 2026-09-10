import type { RouteRecordRaw } from 'vue-router'

const importRoutes: RouteRecordRaw[] = [
  {
    path: '/import',
    name: 'Import',
    component: () => import('@/views/import/index.vue'),
    meta: {
      title: '导入对账',
      icon: 'upload',
      // 「分析」组之后：资产趋势(6) / 预算(7) / 报表(8) 之后
      order: 9,
      requiresAuth: true,
    },
  },
]

export default importRoutes
