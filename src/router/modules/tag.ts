import type { RouteRecordRaw } from 'vue-router'

const tagRoutes: RouteRecordRaw[] = [
  {
    path: '/tag',
    name: 'Tag',
    component: () => import('@/views/tag/index.vue'),
    meta: {
      title: '标签',
      icon: 'tags',
      // 基础配置组末位：分类(5)之后
      order: 6,
      requiresAuth: true,
    },
  },
]

export default tagRoutes
