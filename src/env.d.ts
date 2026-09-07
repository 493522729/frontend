/// <reference types="vite/client" />

/**
 * 前端运行时能读到的环境变量类型声明
 * --------------------------------------------------------------------
 * 这里的名字必须和 .env.* 文件里的 `VITE_xxx` 一一对应，
 * 否则 TS 会报「属性不存在」，编辑器也没有补全。
 *
 * 注意：之前这里写的是 `VITE_API_BASE_URL` / `VITE_MOCK_ENABLE`，
 * 但实际 .env 里叫 `VITE_BASE_API` / `VITE_USE_MOCK`，对不上会报错。
 * 已修正为与 .env 一致。
 */
interface ImportMetaEnv {
  /** 站点标题（构建期注入 <title>） */
  readonly VITE_APP_TITLE: string
  /** 接口前缀：所有请求以它开头，dev 下走 vite proxy 转发到后端 */
  readonly VITE_BASE_API: string
  /** 是否启用 Mock（后端没起来时前端可独立开发） */
  readonly VITE_USE_MOCK?: string
}

interface ImportMeta {
  /** 任意 `import.meta.env.XXX` 读取都在这里登记 */
  readonly env: ImportMetaEnv
}
