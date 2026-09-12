import type { RouteRecordRaw } from 'vue-router'

const profileRoutes: RouteRecordRaw[] = [
  {
    path: '/profile',
    name: 'Profile',
    component: () => import('@/views/profile/index.vue'),
    meta: {
      title: '账号设置',
      icon: 'user',
      order: 98,
      requiresAuth: true,
      hidden: true,
    },
  },
]

export default profileRoutes
