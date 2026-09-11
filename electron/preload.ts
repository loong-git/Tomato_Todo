import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key)
  },
  notification: {
    show: (options: { title: string; body: string }) =>
      ipcRenderer.invoke('notification:show', options)
  },
  dialog: {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    saveFile: (data: string, defaultName: string) => ipcRenderer.invoke('dialog:saveFile', data, defaultName),
    saveCSV: (data: string, defaultName: string) => ipcRenderer.invoke('dialog:saveCSV', data, defaultName),
    openJsonFile: () => ipcRenderer.invoke('dialog:openJsonFile')
  },
  audio: {
    play: (filePath: string) => ipcRenderer.invoke('audio:play', filePath),
    stop: () => ipcRenderer.invoke('audio:stop'),
    // [P2-11 修复] 监听主进程音频播放结束信号（自定义文件播放完毕）
    onEnd: (callback: () => void) => { ipcRenderer.on('audio:ended', () => callback()) }
  },
  power: {
    // [L4 睡眠精确处理] 系统唤醒通知，gap 为睡眠时长(ms)
    onSystemResume: (callback: (gapMs: number) => void) => {
      ipcRenderer.on('power:resumed', (_, gapMs) => callback(gapMs))
    }
  },
  focus: {
    open: (data: { timeLeft: number; mode: string; isRunning: boolean; total: number; currentTaskName: string; currentTaskIds: string[] }, mode?: 'compact') =>
      ipcRenderer.invoke('focus:open', data, mode),
    close: () => ipcRenderer.invoke('focus:close'),
    getInitData: () => ipcRenderer.invoke('focus:getInitData'),
    sendState: (data: { timeLeft: number; mode: string; isRunning: boolean; justCompleted: boolean; total: number; currentTaskName: string; currentTaskIds: string[] }) => {
      ipcRenderer.send('focus:sendState', data)
    },
    onStateUpdate: (callback: (data: { timeLeft: number; mode: string; isRunning: boolean; justCompleted: boolean; total: number; currentTaskName: string; currentTaskIds: string[] }) => void) => {
      ipcRenderer.on('focus:stateUpdate', (_, data) => callback(data))
    },
    onFocusModeChange: (callback: (active: boolean) => void) => {
      ipcRenderer.on('focus:modeChange', (_, active) => callback(active))
    },
    // [方案1] 小窗控制按钮：暂停/继续/跳过，经主进程转发给主窗口 timer store
    control: (action: 'start' | 'pause' | 'skip') => ipcRenderer.send('focus:control', action),
    onControl: (callback: (action: 'start' | 'pause' | 'skip') => void) => {
      ipcRenderer.on('focus:control', (_, action) => callback(action))
    },
    // [需求] 小窗锁定：锁定后禁止拖动移动位置
    toggleLock: (locked: boolean) => ipcRenderer.send('focus:toggle-lock', locked)
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    close: () => ipcRenderer.send('window:close'),
    bringToFront: () => ipcRenderer.send('window:bringToFront'),
    // [改版] 程序化最大化/还原（双击标题或 ▢ 按钮触发）
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    // [需求] 最大化状态回传：驱动 ▢ 按钮切换 最大化/向下还原 图标与提示
    onMaxState: (callback: (maximized: boolean) => void) => {
      ipcRenderer.on('window:maxState', (_, maximized) => callback(maximized))
    },
    // [改版] 仅右缘调宽：把目标宽度发给主进程（主进程夹紧后 setBounds）
    resizeTo: (width: number) => ipcRenderer.send('window:resize-to', width)
  },
  tray: {
    updateState: (data: { timeLeft: number; isRunning: boolean }) => {
      ipcRenderer.send('tray:updateState', data)
    },
    onToggleTimer: (callback: () => void) => {
      ipcRenderer.on('tray:toggleTimer', () => callback())
    }
  }
})
