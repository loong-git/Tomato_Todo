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
  power: {
    // [L4 睡眠精确处理] 系统唤醒通知，gapMs 为睡眠时长
    onSystemResume: (callback: (gapMs: number) => void) => void
  }
  focus: {
    open: (data: { timeLeft: number; mode: string; isRunning: boolean; total: number; currentTaskName: string; currentTaskIds: string[] }, mode?: 'compact') => Promise<void>
    close: () => Promise<void>
    getInitData: () => Promise<{ timeLeft: number; mode: string; isRunning: boolean; total: number; currentTaskName: string; currentTaskIds: string[]; focusMode: 'compact' | null }>
    sendState: (data: { timeLeft: number; mode: string; isRunning: boolean; justCompleted: boolean; total: number; currentTaskName: string; currentTaskIds: string[] }) => void
    onStateUpdate: (callback: (data: { timeLeft: number; mode: string; isRunning: boolean; justCompleted: boolean; total: number; currentTaskName: string; currentTaskIds: string[] }) => void) => void
    onFocusModeChange: (callback: (active: boolean) => void) => void
    // [方案1] 小窗控制按钮（经主进程转发）
    control: (action: 'start' | 'pause' | 'skip') => void
    onControl: (callback: (action: 'start' | 'pause' | 'skip') => void) => void
    // [需求] 小窗锁定：锁定后禁止拖动移动位置
    toggleLock: (locked: boolean) => void
  }
  window: {
    minimize: () => void
    close: () => void
    bringToFront: () => void
    // [改版] 程序化最大化/还原
    toggleMaximize: () => void
    // [需求] 最大化状态回传：驱动 ▢ 按钮切换 最大化/向下还原 图标与提示
    onMaxState: (callback: (maximized: boolean) => void) => void
    // [改版] 仅右缘调宽：目标宽度（主进程夹紧到 [1056, 屏幕可用宽]）
    resizeTo: (width: number) => void
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
