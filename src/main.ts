import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createApp } from 'vue'
import { setUnauthorizedHandler } from '@/api'
import App from './App.vue'
import router from './router'
// 设计 token（晨雾蓝 CSS 变量，单一真相源）必须先于 index.scss
import './styles/tokens.css'
import './styles/index.scss'

const app = createApp(App)

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

app.use(pinia)
app.use(router)
// 注意：vxe-table 不在这里全局注册 —— 架构文档 1.3/7 节明确「体积大，只在交易大表页异步加载」
// 注册逻辑放在 src/views/transaction/index.vue 局部完成，chunk 自动按需分割

// 注册「登录过期」全局回调：请求层在 token 刷新也救不回来时调用 doLogout()，
// 由这里跳到登录页，并带上当前路径，让用户重新登录后能回到原页面。
// （请求层刻意不依赖 router，保持分层干净，跳转逻辑由应用层注入。）
setUnauthorizedHandler(() => {
  const { name, fullPath } = router.currentRoute.value
  // 已经在登录页就不重复跳，避免死循环
  if (name === 'Login')
    return
  router.replace({
    name: 'Login',
    query: fullPath !== '/' ? { redirect: fullPath } : undefined,
  })
})

app.mount('#app')
