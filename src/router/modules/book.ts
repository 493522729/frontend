import type { RouteRecordRaw } from 'vue-router'

const bookRoutes: RouteRecordRaw[] = [
  {
    path: '/book',
    name: 'Book',
    component: () => import('@/views/book/index.vue'),
    meta: {
      title: '账本管理',
      icon: 'books',
      // 基础配置组：账户(3)之后
      order: 4,
      requiresAuth: true,
    },
  },
]

export default bookRoutes
