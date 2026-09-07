import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { createVitePlugins } from './build/plugins/index.ts'
import { wrapperEnv } from './build/utils/env.ts'

/**
 * 测试专用配置
 * --------------------------------------------------------------------
 * 为什么要单独一份而不是复用 vite.config 的 test 字段：
 *   1. 复用 vite 的插件链（auto-import / components / unocss），保证测试环境和
 *      开发环境对「自动导入」「@ 别名」的处理一致；
 *   2. 关键是 `server.deps.inline`：把 axios / vue / pinia 设为不走依赖优化。
 *      vitest 默认会预打包 node_modules 里的这些包，预打包后的 AxiosError 类
 *      与运行时不是同一个，导致「自定义 adapter 抛出的 error.response」在
 *      响应拦截器里被丢掉的诡异现象。inline 让它们走原始源码，行为一致。
 *   3. environment 显式设为 node（请求层是纯逻辑，不需要 DOM）。
 */
export default defineConfig(() => {
  const env = wrapperEnv(loadEnv('test', process.cwd(), ''))

  return {
    plugins: createVitePlugins(env, false),
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '#': fileURLToPath(new URL('./types', import.meta.url)),
      },
    },
    test: {
      environment: 'node',
      // 抑制测试环境特有的 pinia benign 警告（R1004：node 下没有 Vue app 上下文）。
      // 生产环境里请求层在组件内调用 useStore 有上下文，不会触发，故仅测试时屏蔽。
      onConsoleLog(log) {
        if (log.includes('PINIA_R1004'))
          return false
        return true
      },
      server: {
        deps: {
          inline: ['axios', 'vue', 'pinia'],
        },
      },
    },
  }
})
