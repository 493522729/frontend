import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { createVitePlugins } from './build/plugins/index.ts'
import { wrapperEnv } from './build/utils/env.ts'

export default defineConfig(({ mode, command }) => {
  const rawEnv = loadEnv(mode, process.cwd(), '')
  const env = wrapperEnv(rawEnv)
  const isBuild = command === 'build'

  return {
    base: '/',

    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '#': fileURLToPath(new URL('./types', import.meta.url)),
      },
    },

    define: {
      __APP_TITLE__: JSON.stringify(env.VITE_APP_TITLE),
    },

    plugins: createVitePlugins(env, isBuild),

    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
          // 每个 SCSS 文件自动注入变量文件
          // 注意：variables.scss 里只能放变量 / mixin / 函数，不能写任何会输出 CSS 的规则，
          // 否则每个用到样式的组件都会重复输出一份
          additionalData: '@use "variables" as *;\n',
          loadPaths: [fileURLToPath(new URL('./src/styles', import.meta.url))],
        },
      },
    },

    server: {
      host: true,
      port: env.VITE_PORT,
      open: false,
      // 后端还没起来时，/api 会全部 502 —— 属正常，等 Spring Boot 起就有数据了
      proxy: {
        [env.VITE_BASE_API]: {
          target: env.VITE_PROXY_TARGET,
          changeOrigin: true,
          // 后端控制器已带 /api 前缀（如 /api/auth/login），原样转发，不要剥离
        },
        // 勋章图标等上传文件：后端经 WebConfig 以 /uploads/** 暴露，dev 下由 vite 转发到后端
        '/uploads': {
          target: env.VITE_PROXY_TARGET,
          changeOrigin: true,
        },
      },
    },

    build: {
      // 不做语法降级：ES2025 / ES2026 特性直出（架构文档 ADR-1）
      target: 'esnext',
      cssTarget: 'chrome107',
      chunkSizeWarningLimit: 1500,
      reportCompressedSize: false,
      rollupOptions: {
        output: {
          // 体积大户单独成包，配合长效缓存
          // 注意：Vite 8（Rolldown）只支持函数形式的 manualChunks，对象写法直接报错
          // vxe-table 刻意不在预分包里 —— 它只在交易大表页用到，走异步加载
          manualChunks(id) {
            if (id.includes('node_modules') && /[\\/]node_modules[\\/](?:vue|vue-router|pinia)[\\/]/.test(id))
              return 'vue-vendor'
            // echarts 单独分包在 ECharts 6 + Vite 8 下偶发运行时初始化顺序问题，
            // 先回归默认打包，确认是否由此导致。
            // if (id.includes('node_modules') && /[\\/]node_modules[\\/](?:echarts|vue-echarts)[\\/]/.test(id))
            //   return 'echarts'
          },
        },
      },
    },
  }
})
