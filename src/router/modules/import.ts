import type { RouteRecordRaw } from 'vue-router'

const importRoutes: RouteRecordRaw[] = [
  {
    path: '/import',
    name: 'Import',
    component: () => import('@/views/import/index.vue'),
    meta: {
      title: '导入对账',
      icon: 'upload',
      // 自动化工具组末位：规则(10) / 周期账单(11) 之后
      order: 12,
      requiresAuth: true,
    },
  },
]

export default importRoutes
