import { compression } from 'vite-plugin-compression2'

/**
 * 产物压缩：gzip + brotli 双份
 * 服务器只需开启 `gzip_static` / brotli 即可命中，不用实时压
 *
 * 阈值 10KB 以下不压 —— 小文件压完省不了几个字节，还多了两个文件
 */
export function compressionPlugin() {
  return compression({
    threshold: 10 * 1024,
    algorithms: ['gzip', 'brotliCompress'],
    // 不删原文件：部分服务器没开静态压缩，留原文件兜底
    skipIfLargerOrEqual: true,
  })
}
