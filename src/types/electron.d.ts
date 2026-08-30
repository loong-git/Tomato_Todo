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
    saveCSV: (data: string, defaultName: string) => Promise<boolean>
    openJsonFile: () => Promise<string | null>
  }
  audio: {
    play: (filePath: string) => Promise<boolean>
    stop: () => Promise<boolean>
    // [P2-11 修复] 音频播放结束通知（自定义文件播放完毕）
    onEnd: (callback: () => void) => void
  }
  focus: {
    open: (data: { timeLeft: number; mode: string; isRunning: boolean; total: number; currentTaskName: string; currentTaskIds: string[] }, mode?: 'compact' | 'fullscreen') => Promise<void>
    close: () => Promise<void>
    getInitData: () => Promise<{ timeLeft: number; mode: string; isRunning: boolean; total: number; currentTaskName: string; currentTaskIds: string[]; focusMode: 'compact' | 'fullscreen' | null }>
    sendState: (data: { timeLeft: number; mode: string; isRunning: boolean; justCompleted: boolean; total: number; currentTaskName: string; currentTaskIds: string[] }) => void
    onStateUpdate: (callback: (data: { timeLeft: number; mode: string; isRunning: boolean; justCompleted: boolean; total: number; currentTaskName: string; currentTaskIds: string[] }) => void) => void
    onFocusModeChange: (callback: (active: boolean) => void) => void
  }
  window: {
    minimize: () => void
    close: () => void
    bringToFront: () => void
  }
  tray: {
    updateState: (data: { timeLeft: number; isRunning: boolean }) => void
    onToggleTimer: (callback: () => void) => void
  }
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
