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
    stop: () => ipcRenderer.invoke('audio:stop')
  },
  focus: {
    open: (data: { timeLeft: number; mode: string; isRunning: boolean }) => ipcRenderer.invoke('focus:open', data),
    close: () => ipcRenderer.invoke('focus:close'),
    getInitData: () => ipcRenderer.invoke('focus:getInitData'),
    sendState: (data: { timeLeft: number; mode: string; isRunning: boolean }) => {
      ipcRenderer.send('focus:sendState', data)
    },
    onStateUpdate: (callback: (data: { timeLeft: number; mode: string; isRunning: boolean }) => void) => {
      ipcRenderer.on('focus:stateUpdate', (_, data) => callback(data))
    },
    onTick: (callback: (data: { timeLeft: number }) => void) => {
      ipcRenderer.on('focus:tick', (_, data) => callback(data))
    },
    onCompleted: (callback: () => void) => {
      ipcRenderer.on('focus:completed', () => callback())
    },
    onFocusModeChange: (callback: (active: boolean) => void) => {
      ipcRenderer.on('focus:modeChange', (_, active) => callback(active))
    }
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    close: () => ipcRenderer.send('window:close'),
    bringToFront: () => ipcRenderer.send('window:bringToFront')
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
