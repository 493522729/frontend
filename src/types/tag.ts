/**
 * 标签类型契约（前端单点真相）
 * ====================================================================
 * 与后端 TagDTO 对齐：{ id, name, color }。
 * 全局标签（用户级、不区分账本），流水通过 tagIds 关联。
 */

/** 单个标签 */
export interface Tag {
  id: number
  name: string
  /** CSS 颜色值（hex） */
  color: string
}
