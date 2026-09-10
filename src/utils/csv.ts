/**
 * CSV 导出工具（RFC 4180）
 * ====================================================================
 * 报表中心、交易大表都要导出 CSV，逻辑收敛到一处，避免两处各写一份、
 * 各漏一个转义规则。
 *
 * 三个必须踩对的点：
 *   1. **BOM（\uFEFF）**：Excel 不靠 charset 猜编码，没有 BOM 中文表头直接乱码。
 *   2. **转义**：字段里出现 逗号 / 双引号 / 换行 / 回车，必须整段用双引号包起来，
 *      内部的双引号写成两个（""）。备注是自由文本，逗号和引号太常见了。
 *   3. **行分隔用 \r\n**：Excel 对纯 \n 的兼容不稳定，老版本会挤成一行。
 *
 * 另外注意：导出金额统一写成「元」的纯数字（如 1234.56），**不带 ¥、不带千分位**，
 * 否则 Excel 会当文本，没法直接求和。
 */

/**
 * 单元格转义：含特殊字符时加双引号包裹 + 内部引号翻倍
 * @param v 任意值；null / undefined 导出为空串（不要写 "null" 字符串污染表格）
 */
export function escapeCsvCell(v: unknown): string {
  if (v == null)
    return ''
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * 二维数组 → CSV 文本（含 BOM）
 * @param rows 第一行通常是表头
 */
export function buildCsv(rows: unknown[][]): string {
  return `\uFEFF${rows.map(r => r.map(escapeCsvCell).join(',')).join('\r\n')}`
}

/**
 * 浏览器端触发下载
 *
 * 用 Blob + 临时 <a download>，不走后端；
 * 记得 revokeObjectURL，否则大文件会一直占着内存。
 *
 * @param filename 建议带 .csv 后缀；含中文时浏览器会自动处理
 * @param rows 二维数组
 */
export function downloadCsv(filename: string, rows: unknown[][]): void {
  const blob = new Blob([buildCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * 任意字符串 → 文件名安全串
 *
 * 冒号 / 斜杠 / 反斜杠 / 空白 都换成 `-`：
 * 空白如果直接删掉，`'2026-09-10 16:30:00'` 会挤成 `'2026-09-1016-30-00'` 这种读不了的名字。
 *
 * 例：'2026-09-10 16:30:00' → '2026-09-10-16-30-00'
 */
export function safeFilePart(s: string): string {
  return s.replace(/[:\\/\s]+/g, '-')
}
