import { contextBridge, ipcRenderer } from 'electron'

// [修复] 下面这些通道都是"单回调"语义（每个通道全项目只注册一处），
// 但 ipcRenderer.on 只会累积、不会替换：Vite HMR 每次热更新组件都会重新注册一次，
// 旧监听器留在 ipcRenderer 上不会自动摘掉 →
// 点一次托盘菜单会触发 N 次回调（N = 热更新次数），start/pause 交替执行互相抵消，
// 表现为"点了没反应"。
// 统一走 onSingle：注册前先清掉同通道的旧监听器，保证任何时刻只有一个。
function onSingle<T extends unknown[]>(channel: string, callback: (...args: T) => void) {
  ipcRenderer.removeAllListeners(channel)
  ipcRenderer.on(channel, (_event, ...args) => callback(...(args as T)))
}

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
    onEnd: (callback: () => void) => onSingle('audio:ended', callback)
  },
  power: {
    // [L4 睡眠精确处理] 系统唤醒通知，gap 为睡眠时长(ms)
    onSystemResume: (callback: (gapMs: number) => void) => onSingle('power:resumed', callback)
  },
  focus: {
    open: (data: { timeLeft: number; mode: string; isRunning: boolean; total: number; currentTaskName: string; currentTaskIds: string[] }, mode?: 'compact') =>
      ipcRenderer.invoke('focus:open', data, mode),
    close: () => ipcRenderer.invoke('focus:close'),
    getInitData: () => ipcRenderer.invoke('focus:getInitData'),
    sendState: (data: { timeLeft: number; mode: string; isRunning: boolean; justCompleted: boolean; total: number; currentTaskName: string; currentTaskIds: string[] }) => {
      ipcRenderer.send('focus:sendState', data)
    },
    onStateUpdate: (callback: (data: { timeLeft: number; mode: string; isRunning: boolean; justCompleted: boolean; total: number; currentTaskName: string; currentTaskIds: string[] }) => void) =>
      onSingle('focus:stateUpdate', callback),
    onFocusModeChange: (callback: (active: boolean) => void) =>
      onSingle('focus:modeChange', callback),
    // [方案1] 小窗控制按钮：暂停/继续/跳过，经主进程转发给主窗口 timer store
    control: (action: 'start' | 'pause' | 'skip') => ipcRenderer.send('focus:control', action),
    onControl: (callback: (action: 'start' | 'pause' | 'skip') => void) =>
      onSingle('focus:control', callback),
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
    onMaxState: (callback: (maximized: boolean) => void) =>
      onSingle('window:maxState', callback)
    // [改版·原生缩放] resizeTo / resizePreview / resizePreviewHide 已删除：
    // 宽度缩放走 Windows 原生边框，渲染端不需要发目标宽度
  },
  tray: {
    updateState: (data: { timeLeft: number; isRunning: boolean; total: number }) => {
      ipcRenderer.send('tray:updateState', data)
    },
    // 托盘菜单那行（开始 / 继续 / 暂停）被点击 → 主进程发这个事件，渲染侧自己判断 start/pause
    onToggleTimer: (callback: () => void) => onSingle('tray:toggleTimer', callback)
  }
})
