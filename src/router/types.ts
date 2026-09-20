import type { RouteRecordRaw } from 'vue-router'

/**
 * 路由 meta 契约（架构文档 ADR-5）
 * 菜单由 meta 自动生成，加页面零心智成本
 */
declare module 'vue-router' {
  interface RouteMeta {
    /** 页面标题（进 tab / document.title） */
    title: string
    /** 菜单图标 key，由 Sidebar 映射为内联 SVG */
    icon?: string
    /** 是否缓存（keep-alive，列表页回来不丢状态） */
    keepAlive?: boolean
    /** 不出现在菜单里（详情页、404 等） */
    hidden?: boolean
    /** 菜单高亮项：当前路由指向该 path 的菜单（详情页挂到列表页） */
    activeMenu?: string
    /** 排序，越小越靠前 */
    order?: number
    /**
     * 是否需要登录态才能访问。
     * - true：未登录会被路由守卫踢到 /login
     * - false / 缺省：公开页面（登录页、404 等）
     */
    requiresAuth?: boolean
    /**
     * 页面使用哪种布局。
     * - 'default'：带侧边栏 + Header 的后台布局（缺省）
     * - 'blank'：  全屏空白布局，用于登录页、404、全屏大屏等
     */
    layout?: 'default' | 'blank'
    /**
     * 角色白名单（菜单可见 + 路由守卫放行）。
     * - 缺省/空：所有登录用户可见。
     * - 非空：仅当用户 roles 命中其一才显示菜单、才允许进入。
     *   例：勋章管理仅超管 → roles: ['SUPER_ADMIN']
     */
    roles?: string[]
  }
}

/** 路由模块的统一形状：default export 一个路由数组 */
export type RouteModule = RouteRecordRaw[]
