/** 构建期常量（见 vite.config.ts define） */
declare const __APP_TITLE__: string

declare module 'nprogress' {
  export function start(): void
  export function done(force?: boolean): void
  export function configure(options: { showSpinner?: boolean, trickle?: boolean, minimum?: number }): void
  export function set(n: number): void
}
