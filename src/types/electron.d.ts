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
    saveFile: (data: string, defaultName: string) => Promise<boolean>
    openJsonFile: () => Promise<string | null>
  }
  audio: {
    play: (filePath: string) => Promise<boolean>
    stop: () => Promise<boolean>
  }
  focus: {
    open: (data: { timeLeft: number; mode: string; isRunning: boolean; total: number }) => Promise<void>
    close: () => Promise<void>
    getInitData: () => Promise<{ timeLeft: number; mode: string; isRunning: boolean; total: number }>
    sendState: (data: { timeLeft: number; mode: string; isRunning: boolean; justCompleted: boolean; total: number }) => void
    onStateUpdate: (callback: (data: { timeLeft: number; mode: string; isRunning: boolean; justCompleted: boolean; total: number }) => void) => void
    onTick: (callback: (data: { timeLeft: number }) => void) => void
    onCompleted: (callback: () => void) => void
    onFocusModeChange: (callback: (active: boolean) => void) => void
  }
  window: {
    minimize: () => void
    close: () => void
  }
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
