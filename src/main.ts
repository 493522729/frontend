import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createApp } from 'vue'
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

app.mount('#app')
