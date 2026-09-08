import type { RouteRecordRaw } from 'vue-router'

const bookRoutes: RouteRecordRaw[] = [
  {
    path: '/book',
    name: 'Book',
    component: () => import('@/views/book/index.vue'),
    meta: {
      title: '账本管理',
      icon: 'books',
      order: 4,
      requiresAuth: true,
    },
  },
]

export default bookRoutes
