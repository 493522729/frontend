import type { RouteRecordRaw } from 'vue-router'

const accountRoutes: RouteRecordRaw[] = [
  {
    path: '/account',
    name: 'Account',
    component: () => import('@/views/account/index.vue'),
    meta: {
      title: '账户管理',
      icon: 'wallet',
      // 基础配置组头位：交易流水(2)之后，钱先有去处（账户→账本→分类→标签）
      order: 3,
      requiresAuth: true,
    },
  },
]

export default accountRoutes
