/**
 * 命令面板（US-011）的命令模型与匹配算法
 * ====================================================================
 * 刻意做成**纯函数、不依赖 Vue**：
 *  - 匹配逻辑能直接单测（不必挂载组件、不必 mock store）
 *  - 面板的 run() 由调用方注入，这里只管「搜什么、怎么排」
 */

export interface CommandItem {
  /** 稳定唯一 id（如 `go:/report`、`book:3`），用作列表 key */
  id: string
  title: string
  /** 右侧次要说明（快捷键提示、账本笔数等） */
  subtitle?: string
  /** 分组名：展示时按顺序归并 */
  group: string
  /** 图标 key（与侧边栏 route.meta.icon 同源） */
  icon?: string
  /** 额外搜索词：拼音首字母、别名，用来兜住「记一笔 / jyb」这类输入 */
  keywords?: string[]
  run: () => void
}

/** 分组展示顺序：先动作、再页面、最后账本（账本数量多，放最后不挡路） */
export const GROUP_ORDER = ['操作', '跳转', '账本']

function groupIndex(group: string): number {
  const i = GROUP_ORDER.indexOf(group)
  return i === -1 ? GROUP_ORDER.length : i
}

/**
 * 子序列匹配（fuzzy）：'rp' 能命中 'report'
 * 只要求字符按顺序出现，不要求连续 —— 中文场景下用处不大，
 * 但对英文路由别名（/report、/budget）很实用。
 */
function isSubsequence(text: string, query: string): boolean {
  let i = 0
  for (const ch of text) {
    if (ch === query[i])
      i++
    if (i === query.length)
      return true
  }
  return i === query.length
}

/**
 * 单条命令的匹配得分：0 表示不匹配（会被过滤掉）
 *
 * 分值梯度（越"像"用户想找的越靠前）：
 *   110 标题与查询串完全相等（"预算" 打 "预算"，应压过"预算中心"）
 *   100 标题以查询串开头（"报表中心" 打 "报表"）
 *    80 标题包含查询串（"月度预算" 打 "预算")
 *    60 关键词命中（"记一笔" 打 "jyb"）
 *    40 子序列命中（"report" 打 "rp"）
 *     1 空查询：全量展示，交给分组顺序排
 */
export function matchScore(cmd: CommandItem, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q)
    return 1

  const title = cmd.title.toLowerCase()
  if (title === q)
    return 110
  if (title.startsWith(q))
    return 100
  if (title.includes(q))
    return 80
  if (cmd.keywords?.some(k => k.toLowerCase().includes(q)))
    return 60
  if (isSubsequence(title, q))
    return 40
  return 0
}

/**
 * 按查询串过滤并排序命令
 * 排序优先级：得分降序 → 分组顺序 → 原始顺序（稳定）
 */
export function filterCommands(commands: CommandItem[], query: string): CommandItem[] {
  const scored = commands
    .map((cmd, index) => ({ cmd, index, score: matchScore(cmd, query) }))
    .filter(x => x.score > 0)

  scored.sort((a, b) =>
    b.score - a.score
    || groupIndex(a.cmd.group) - groupIndex(b.cmd.group)
    || a.index - b.index)

  return scored.map(x => x.cmd)
}
