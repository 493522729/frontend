import type { Ref } from 'vue'
/**
 * 账本级 SWR 缓存工厂（方案 B：数据上收模块作用域 + 先渲染旧数据再静默刷新）
 * ====================================================================
 * 每个页面在「模块顶层」调用一次 createBookCache(...) 得到一个单例：
 *   - 缓存 Map 在模块作用域，组件销毁不清空（= 缓存），替代 KeepAlive
 *   - 进入页面时若当前账本已有缓存，则立即 restore 旧数据、后台 refreshing 拉新；
 *     仅在「真·首次」或「无缓存」时 loading=true 显示骨架屏
 *   - 记完账（quickEntry.dataChangedAt）/ 切账本 等信号照常触发 run()，有缓存即静默刷新
 *
 * 不是 KeepAlive：组件仍销毁重建，但数据在模块层续命，骨架屏不再每次闪。
 */
import { ref } from 'vue'
import { useBookStore } from '@/stores/modules/book'

export interface BookCache {
  /** 首屏骨架屏（无缓存）。模板用它控制 NSkeleton 显示 */
  loading: Ref<boolean>
  /** 后台静默刷新（有缓存）。可选：给个轻量刷新指示 */
  refreshing: Ref<boolean>
  /** 进入页面 / 变更信号时调用。force=true 强制骨架屏重取 */
  run: (force?: boolean) => Promise<void>
  /** 清掉指定账本的缓存（一般不必调，切账本无缓存会自动走骨架屏） */
  invalidateBook: (bid: number) => void
}

export function createBookCache<T>(
  key: string,
  fetch: (bid: number) => Promise<void>,
  snapshot: () => T,
  restore: (snap: T) => void,
  cacheKey: (bid: number) => string = bid => String(bid),
): BookCache {
  const store = new Map<string, T>()
  const loading = ref(false)
  const refreshing = ref(false)

  async function run(force = false): Promise<void> {
    const bid = useBookStore().currentBookId
    if (bid == null)
      return
    const ck = `${key}:${cacheKey(bid)}`
    const hit = store.get(ck)
    if (hit && !force) {
      restore(hit)
      refreshing.value = true
      try {
        await fetch(bid)
        store.set(ck, snapshot())
      }
      finally {
        refreshing.value = false
      }
      return
    }
    loading.value = true
    try {
      await fetch(bid)
      store.set(ck, snapshot())
    }
    finally {
      loading.value = false
    }
  }

  function invalidateBook(bid: number): void {
    const prefix = `${key}:${String(bid)}`
    for (const k of [...store.keys()]) {
      if (k === prefix || k.startsWith(`${prefix}#`))
        store.delete(k)
    }
  }

  return { loading, refreshing, run, invalidateBook }
}
