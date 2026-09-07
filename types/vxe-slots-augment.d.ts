/**
 * vxe-table 4.x 类型补丁
 * ====================================================================
 * vxe-table 官方 VxeTableSlots 接口把「自定义 slot」用的 [key: string] 索引签名
 * 注释掉了（见 node_modules/vxe-pc-ui/types/components/table.d.ts line 7794-7806），
 * 导致 TS 在 vue-tsc 静态模板检查时会报：
 *   "Property 'type_cell' does not exist on type 'VxeTableSlots<any>'"
 * 这是 vxe-table 官方已知问题（issue 跟踪中）。
 *
 * 这里用 TS module augmentation 把索引签名加回来，让自定义 slot 能通过类型检查。
 * 运行时行为无影响 —— 运行时 vxe-table 本来就支持任意 slot。
 */
import type { VxeTableSlotTypes } from 'vxe-table'

declare module 'vxe-pc-ui/types/components/table' {
  interface VxeTableSlots<D = any> {
    /** 自定义 slot：覆盖 vxe-table 注释掉的索引签名 */
    [key: string]: ((params: VxeTableSlotTypes.DefaultSlotParams<D>) => any) | undefined
  }
}

export {}
