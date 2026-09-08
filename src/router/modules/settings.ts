import type { RouteRecordRaw } from 'vue-router'

const settingsRoutes: RouteRecordRaw[] = [
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/settings/index.vue'),
    meta: {
      title: '设置',
      icon: 'settings',
      order: 9,
      requiresAuth: true,
    },
  },
]

export default settingsRoutes
