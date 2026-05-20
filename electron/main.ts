import { app, BrowserWindow, ipcMain, Notification, dialog, Menu } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import Store from 'electron-store'

// 设置 Electron 用户数据目录到项目根目录的 data 文件夹
app.setPath('userData', join(__dirname, '../../data'))

const store = new Store()

let mainWindow: BrowserWindow | null = null
let focusWindow: BrowserWindow | null = null
let sharedTimerState = { timeLeft: 25 * 60, mode: 'focus', isRunning: false, justCompleted: false, total: 25 * 60 }
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 700,
    minWidth: 360,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    frame: false,
    transparent: false,
    show: false,
    backgroundColor: '#1a1614'
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // 禁用主窗口背景节流，确保隐藏时计时器仍运行
  mainWindow.webContents.setBackgroundThrottling(false)
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC handlers
ipcMain.on('window:minimize', () => {
  mainWindow?.minimize()
})

ipcMain.on('window:close', () => {
  mainWindow?.close()
})

ipcMain.handle('store:get', (_, key: string) => {
  return store.get(key)
})

ipcMain.handle('store:set', (_, key: string, value: unknown) => {
  store.set(key, value)
})

ipcMain.handle('store:delete', (_, key: string) => {
  store.delete(key)
})

ipcMain.handle('notification:show', (_, options: { title: string; body: string }) => {
  if (Notification.isSupported()) {
    new Notification(options).show()
  }
})

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  return result.filePaths[0] || ''
})

ipcMain.handle('dialog:saveFile', async (_, data: string, defaultName: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: defaultName,
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (result.filePath) {
    try {
      writeFileSync(result.filePath, data, 'utf-8')
      return true
    } catch (e) {
      console.error('Failed to save file:', e)
      return false
    }
  }
  return false
})

ipcMain.handle('dialog:openJsonFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (result.filePaths[0]) {
    try {
      const data = readFileSync(result.filePaths[0], 'utf-8')
      return data
    } catch (e) {
      console.error('Failed to read file:', e)
      return null
    }
  }
  return null
})

let currentPlayer = null

ipcMain.handle('audio:play', (_, filePath: string) => {
  return new Promise((resolve) => {
    try {
      if (process.platform === 'win32') {
        const { spawn } = require('child_process')
        // 使用 Windows Media Player 播放
        currentPlayer = spawn('C:\\Program Files\\Windows Media Player\\wmplayer.exe', [
          '/play', '/close', filePath
        ], { windowsHide: true })

        currentPlayer.on('error', (e: Error) => {
          console.error('Failed to play audio:', e)
          currentPlayer = null
          resolve(false)
        })

        currentPlayer.on('spawn', () => {
          resolve(true)
        })

        currentPlayer.on('close', () => {
          currentPlayer = null
        })
      } else if (process.platform === 'darwin') {
        const { exec } = require('child_process')
        currentPlayer = exec(`afplay "${filePath}"`, (e: Error) => {
          if (e) {
            console.error('Failed to play audio:', e)
            resolve(false)
          } else {
            resolve(true)
          }
          currentPlayer = null
        })
      } else {
        resolve(false)
      }
    } catch (e) {
      console.error('Failed to play audio:', e)
      resolve(false)
    }
  })
})

ipcMain.handle('audio:stop', () => {
  try {
    if (currentPlayer) {
      if (process.platform === 'win32') {
        const { exec } = require('child_process')
        exec('taskkill /F /IM wmplayer.exe', { windowsHide: true })
      } else if (process.platform === 'darwin') {
        const { exec } = require('child_process')
        exec('pkill afplay')
      }
      currentPlayer = null
      return true
    }
    return false
  } catch (e) {
    console.error('Failed to stop audio:', e)
    return false
  }
})

ipcMain.handle('focus:open', (_, data: { timeLeft: number; mode: string; isRunning: boolean; total: number }) => {
  if (!mainWindow || focusWindow) return

  // 保存初始数据
  sharedTimerState = data

  // 获取屏幕尺寸
  const { screen } = require('electron')
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth } = primaryDisplay.workAreaSize

  // 放在屏幕右上角，距离边缘 20px
  const focusWidth = 250
  const focusHeight = 250
  const focusX = screenWidth - focusWidth - 20
  const focusY = 20

  mainWindow.hide()

  // 通知主窗口进入专注模式，停止本地计时器
  mainWindow.webContents.send('focus:modeChange', true)

  // 创建专注窗口，可调节大小
  focusWindow = new BrowserWindow({
    width: focusWidth,
    height: focusHeight,
    x: focusX,
    y: focusY,
    minWidth: 150,
    minHeight: 150,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const focusUrl = process.env.VITE_DEV_SERVER_URL
    ? `${process.env.VITE_DEV_SERVER_URL}#/focus`
    : `file://${join(__dirname, '../dist/index.html')}#/focus`

  focusWindow.loadURL(focusUrl)
  focusWindow.setIgnoreMouseEvents(false)
  focusWindow.webContents.setBackgroundThrottling(false)

  // 页面加载完成后立即发送当前状态
  focusWindow.webContents.once('did-finish-load', () => {
    if (focusWindow && !focusWindow.isDestroyed()) {
      focusWindow.webContents.send('focus:stateUpdate', sharedTimerState)
    }
  })

  focusWindow.on('closed', () => {
    focusWindow = null
    if (mainWindow) {
      mainWindow.show()
    }
  })
})

ipcMain.handle('focus:getInitData', () => {
  return sharedTimerState
})

ipcMain.handle('focus:updateState', (_, data: { timeLeft: number; mode: string; isRunning: boolean }) => {
  sharedTimerState = data
})

ipcMain.on('focus:getState', (event) => {
  // focusWindow 请求获取当前状态，直接从 sharedTimerState 返回
  event.returnValue = sharedTimerState
})

ipcMain.on('focus:sendState', (event, data) => {
  // 同步所有状态
  sharedTimerState = data

  // 同时发送给 focusWindow
  if (focusWindow && !focusWindow.isDestroyed()) {
    focusWindow.webContents.send('focus:stateUpdate', sharedTimerState)
  }
})

ipcMain.handle('focus:close', () => {
  if (!mainWindow || !focusWindow) return

  const { screen } = require('electron')
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

  // 目标：屏幕居中
  const targetWidth = 400
  const targetHeight = 700
  const targetX = Math.round((screenWidth - targetWidth) / 2)
  const targetY = Math.round((screenHeight - targetHeight) / 2)

  // 从当前小窗口位置放大回原始大小
  const startWidth = 250
  const startHeight = 250

  focusWindow.close()
  focusWindow = null

  if (mainWindow) {
    mainWindow.setBounds({
      x: targetX,
      y: targetY,
      width: startWidth,
      height: startHeight
    }, false)
    mainWindow.show()

    // 通知主窗口退出专注模式，恢复本地计时器
    mainWindow.webContents.send('focus:modeChange', false)

    const duration = 300
    const startTime = Date.now()

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3)
    }

    function animate() {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeOutCubic(progress)

      mainWindow.setBounds({
        x: targetX,
        y: targetY,
        width: Math.round(startWidth + (targetWidth - startWidth) * eased),
        height: Math.round(startHeight + (targetHeight - startHeight) * eased)
      }, false)

      if (progress < 1) {
        setTimeout(animate, 16)
      }
    }

    animate()
  }
})

ipcMain.on('focus:update', (event, data) => {
  if (focusWindow && !focusWindow.isDestroyed()) {
    focusWindow.webContents.send('focus:update', data)
  }
})
