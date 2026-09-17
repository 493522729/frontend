import type { RouteRecordRaw } from 'vue-router'

const RuleRoute: RouteRecordRaw = {
  path: 'rule',
  name: 'Rule',
  component: () => import('@/views/rule/index.vue'),
  meta: {
    title: '规则引擎',
    icon: 'wand',
    // 自动化工具组头位：分析规划组(≤9)之后
    order: 10,
    requiresAuth: true,
  },
}

export default RuleRoute
