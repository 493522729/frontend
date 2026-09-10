import type { RouteRecordRaw } from 'vue-router'

const accountRoutes: RouteRecordRaw[] = [
  {
    path: '/account',
    name: 'Account',
    component: () => import('@/views/account/index.vue'),
    meta: {
      title: '账户管理',
      icon: 'wallet',
      // 排在「规划」组：账户和账本一样，是「钱怎么放」的配置
      order: 5,
      requiresAuth: true,
    },
  },
]

export default accountRoutes
