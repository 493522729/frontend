import type { RouteRecordRaw } from 'vue-router'

const categoryRoutes: RouteRecordRaw[] = [
  {
    path: '/category',
    name: 'Category',
    component: () => import('@/views/category/index.vue'),
    meta: {
      title: '分类管理',
      // 「tags」留给标签页，分类用三形状图标避免撞车
      icon: 'category',
      // 基础配置组：账本(4) / 账户(3) 之后，标签(6) 之前
      order: 5,
      requiresAuth: true,
    },
  },
]

export default categoryRoutes
