import type { RouteModule } from '../types'

/**
 * 兜底路由：404 必须放最后（vue-router 匹配顺序）
 */
export default [
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/error/404.vue'),
    meta: {
      title: '页面不存在',
      hidden: true,
    },
  },
] satisfies RouteModule
