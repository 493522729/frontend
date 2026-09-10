import type { RouteRecordRaw } from 'vue-router'

const RuleRoute: RouteRecordRaw = {
  path: 'rule',
  name: 'Rule',
  component: () => import('@/views/rule/index.vue'),
  meta: {
    title: '规则引擎',
    icon: 'wand',
    order: 8,
    requiresAuth: true,
  },
}

export default RuleRoute
