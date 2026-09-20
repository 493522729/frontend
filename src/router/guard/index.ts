import type { RouteLocationNormalized, Router } from 'vue-router'
import NProgress from 'nprogress'
import { APP_TITLE } from '@/constants/app'
import { useAuthStore } from '@/stores/modules/auth'

/**
 * 路由守卫 —— 进度条 + 标题 + 鉴权拦截
 * --------------------------------------------------------------------
 * 三个阶段：
 *   1. 全局进度条 NProgress（NProgress.start / done 必须配对，否则卡死）
 *   2. 设置 document.title（架构文档 2.2）
 *   3. 鉴权拦截（本次新增）：
 *      - 目标页 requiresAuth = true 而未登录 → 重定向到 /login
 *      - 已登录访问 /login → 重定向到首页（不能重复登录）
 *      - 把原目标路径通过 redirect query 带上，登录成功后跳回去
 */
export function setupRouterGuards(router: Router) {
  // 进度条不显示右上角转圈动画，财务系统要安静
  NProgress.configure({ showSpinner: false })

  // vue-router 5：guard 不再用 next()，直接返回值
  //   - 不 return   → 放行
  //   - return false → 取消并 reset 当前导航
  //   - return '/x' / return { name, path, query, ... } → 重定向
  router.beforeEach((to: RouteLocationNormalized, _from) => {
    NProgress.start()

    // document.title：「仪表盘 · 简账」
    document.title = to.meta.title ? `${to.meta.title} · ${APP_TITLE}` : APP_TITLE

    // ─── 鉴权拦截 ─────────────────────────────────────────────────────
    const auth = useAuthStore()

    // 是否需要登录：meta.requiresAuth 缺省视为 false（公开页）
    const requiresAuth = to.meta.requiresAuth === true
    const isLoggedIn = auth.isLoggedIn

    if (requiresAuth && !isLoggedIn) {
      // 受保护页 + 未登录 → 跳登录页，把原路径放进 query 让登录成功后跳回来
      const redirect = to.fullPath !== '/' ? to.fullPath : undefined
      return { path: '/login', query: redirect ? { redirect } : undefined }
    }

    // 角色白名单：路由声明了 roles 但当前用户不命中 → 退回首页（无权限）
    // 菜单已按 roles 过滤，正常点不到；这里兜底防「直接改 URL / 书签」越权进入
    const roles = to.meta.roles as string[] | undefined
    if (roles && roles.length > 0) {
      const userRoles = auth.userInfo?.roles ?? []
      const allowed = roles.some(role => userRoles.includes(role))
      if (!allowed) {
        return { path: '/' }
      }
    }

    if (to.path === '/login' && isLoggedIn) {
      // 已登录再访问 /login → 跳过登录直接回首页（避免重复登录死循环）
      const target = (to.query.redirect as string | undefined) || '/'
      return target
    }

    // 其他情况：默认放行（vue-router 5 不需要显式 return）
  })

  router.afterEach(() => {
    NProgress.done()
  })

  router.onError(() => {
    NProgress.done()
  })
}
