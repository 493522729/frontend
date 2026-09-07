import type { RouteRecordRaw } from 'vue-router'

const transactionRoutes: RouteRecordRaw[] = [
  {
    path: '/transaction',
    name: 'Transaction',
    component: () => import('@/views/transaction/index.vue'),
    meta: {
      title: '交易流水',
      icon: 'list',
      order: 2,
      requiresAuth: true,
    },
  },
]

export default transactionRoutes
