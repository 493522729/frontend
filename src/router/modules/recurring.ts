import type { RouteRecordRaw } from 'vue-router'

/** 周期账单（US-009）：模板配置 + 待确认队列 */
const recurringRoute: RouteRecordRaw = {
  path: '/recurring',
  name: 'Recurring',
  component: () => import('@/views/recurring/index.vue'),
  meta: {
    title: '周期账单',
    icon: 'calendar',
    order: 9,
    requiresAuth: true,
  },
}

export default recurringRoute
