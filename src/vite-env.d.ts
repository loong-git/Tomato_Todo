/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// ElectronAPI 接口定义在 src/types/electron.d.ts（含 declare global）
// 这里不再重复声明
export {}

