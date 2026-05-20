/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ElectronAPI {
  store: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<void>
    delete: (key: string) => Promise<void>
  }
  notification: {
    show: (options: { title: string; body: string }) => Promise<void>
  }
  dialog: {
    openFile: () => Promise<string>
  }
  audio: {
    play: (filePath: string) => Promise<boolean>
    stop: () => Promise<boolean>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
