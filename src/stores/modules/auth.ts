import type { LoginParams } from '@/api/modules/auth'
/**
 * 登录态 store —— token 的「唯一真相源」
 * ====================================================================
 * 整个应用里，accessToken / refreshToken 只在这里存一份。
 * 请求层（src/api/request.ts）需要带 token 时，来这个 store 拿；
 * 登录成功、退出登录、刷新令牌，也都只改这里。
 *
 * 为什么不放 localStorage 里随便读写？
 *   —— 散落各处的 localStorage 操作是后台项目最常见的腐化点。
 *      统一收敛到一个 store，再靠 pinia-plugin-persistedstate 自动同步到
 *      localStorage（刷新页面 token 不丢），业务代码完全不用管持久化细节。
 */
// 注意：这里显式导入 ref / computed，而不是依赖 auto-import 的全局注入。
// 原因：该 store 会被单元测试直接 import，而 auto-import 的「运行时注入」
// 在 vitest 环境下不可靠（dev/build 下正常）。显式导入在任何环境都 100% 有效，
// 且与 auto-import 的全局声明不冲突。
import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { accountLogin } from '@/api/modules/auth'
import { STORAGE_KEYS } from '@/constants/storage-keys'

export const useAuthStore = defineStore('auth', () => {
  /** 访问令牌：每次请求带在 Authorization 头里，有效期短（如 30 分钟） */
  const accessToken = ref<string>('')

  /** 刷新令牌：专门用来换新 accessToken，有效期长（如 7 天），不进请求头 */
  const refreshToken = ref<string>('')

  /** 是否已登录（有 accessToken 即视为已登录） */
  const isLoggedIn = computed(() => accessToken.value !== '')

  /** 登录成功 / 刷新成功后：把两个 token 一起写进来 */
  function setTokens(access: string, refresh: string) {
    accessToken.value = access
    refreshToken.value = refresh
  }

  /** 退出登录 / 刷新失败：清空 token，让应用回到「未登录」状态 */
  function clearTokens() {
    accessToken.value = ''
    refreshToken.value = ''
  }

  /**
   * 账号密码登录。
   * - 调用接口拿 token → 写进 store → 顺便返回结果给页面使用。
   * - 失败抛错（业务/网络/http 三类），由调用方（登录页）决定怎么展示。
   * 注意：这层只负责「token 入库 + 把结果回吐」，跳转和错误展示归 UI 层。
   */
  async function login(params: LoginParams) {
    const result = await accountLogin(params)
    setTokens(result.accessToken, result.refreshToken)
    return result
  }

  /** 微信扫码登录成功的回调（由登录页在收到 CONFIRMED 状态时调用） */
  function loginByScan(access: string, refresh: string) {
    setTokens(access, refresh)
  }

  return {
    accessToken,
    refreshToken,
    isLoggedIn,
    setTokens,
    clearTokens,
    login,
    loginByScan,
  }
}, {
  // 持久化：key 走 laozhao: 命名空间，和两个 token 一起落 localStorage
  persist: {
    key: STORAGE_KEYS.auth,
    pick: ['accessToken', 'refreshToken'],
  },
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot))
