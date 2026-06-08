import { app, BrowserWindow, ipcMain, Notification, dialog, Menu, Tray, nativeImage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, appendFileSync } from 'fs'
import Store from 'electron-store'

// 设置 Windows 通知显示的应用名称
app.setAppUserModelId('番茄TODO')

// 设置 Electron 用户数据目录到项目根目录的 data 文件夹
app.setPath('userData', join(__dirname, '../../data'))

// 确保单实例运行
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

const store = new Store()

let mainWindow: BrowserWindow | null = null
let focusWindow: BrowserWindow | null = null
let tray: Tray | null = null
let sharedTimerState = { timeLeft: 25 * 60, mode: 'focus', isRunning: false, justCompleted: false, total: 25 * 60 }
let isQuitting = false

// 日志写入文件
const logFile = join(__dirname, '../../log.txt')
function fileLog(msg: string) {
  const time = new Date().toLocaleTimeString('zh-CN')
  const line = `[${time}] ${msg}\n`
  try {
    appendFileSync(logFile, line)
  } catch (e) {
    console.error('日志写入失败:', e)
  }
  console.log(msg)
}

// 创建托盘图标
function createTray() {
  console.log('[Tray] 创建托盘图标')

  // 创建一个 16x16 的番茄图标
  const iconSize = 16
  const canvas = Buffer.alloc(iconSize * iconSize * 4)

  // 绘制番茄 - 扁平的红色圆形带绿色茎
  for (let y = 0; y < iconSize; y++) {
    for (let x = 0; x < iconSize; x++) {
      const idx = (y * iconSize + x) * 4

      const cx = 8
      const cy = 9
      const rx = 6
      const ry = 5.5
      const dist = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)

      const stemCx = 8
      const stemCy = 3
      const stemDist = Math.sqrt((x - stemCx) ** 2 + (y - stemCy) ** 2)

      const leafY = 4
      const leafDist = Math.sqrt((x - 6) ** 2 + (y - leafY) ** 2)
      const leafDist2 = Math.sqrt((x - 10) ** 2 + (y - leafY) ** 2)

      if (stemDist <= 1.5 && y >= 1 && y <= 4) {
        canvas[idx] = 89
        canvas[idx + 1] = 124
        canvas[idx + 2] = 74
        canvas[idx + 3] = 255
      } else if (leafDist <= 2 || leafDist2 <= 2) {
        canvas[idx] = 89
        canvas[idx + 1] = 124
        canvas[idx + 2] = 74
        canvas[idx + 3] = 255
      } else if (dist <= 1) {
        canvas[idx] = 60
        canvas[idx + 1] = 76
        canvas[idx + 2] = 231
        canvas[idx + 3] = 255
      } else {
        canvas[idx] = 0
        canvas[idx + 1] = 0
        canvas[idx + 2] = 0
        canvas[idx + 3] = 0
      }
    }
  }

  const icon = nativeImage.createFromBuffer(canvas, { width: iconSize, height: iconSize })
  tray = new Tray(icon)

  updateTrayMenu()

  tray.on('double-click', () => {
    console.log('[Tray] 双击托盘')
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  console.log('[Tray] 托盘创建完成')
}

// 更新托盘菜单
function updateTrayMenu(timerState?: { timeLeft?: number; isRunning?: boolean }) {
  if (!tray) return

  const timeStr = timerState?.timeLeft !== undefined
    ? formatTime(timerState.timeLeft)
    : formatTime(sharedTimerState.timeLeft)

  const statusStr = timerState?.isRunning ? '运行中' : '已暂停'

  const contextMenu = Menu.buildFromTemplate([
    { label: `🍅 番茄TODO - ${timeStr}`, enabled: false },
    { label: `状态: ${statusStr}`, enabled: false },
    { type: 'separator' },
    {
      label: '显示窗口',
      click: () => {
        console.log('[Tray] 菜单 - 显示窗口')
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        console.log('[Tray] 菜单 - 退出应用')
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
  tray.setToolTip(`🍅 ${timeStr} (${statusStr})`)
}

// 格式化时间
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function createWindow() {
  // 从store读取主题设置
  const settings = store.get('settings', {}) as { theme?: string }
  const savedTheme = settings.theme || 'dark'
  const bgColor = savedTheme === 'light' ? '#f5f2ef' : '#1a1614'

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
    show: true,
    backgroundColor: bgColor
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
  fileLog('[App] 应用准备就绪')
  Menu.setApplicationMenu(null)
  createWindow()
  createTray()

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
  console.log('[Window] 关闭按钮点击')
  if (mainWindow && !isQuitting) {
    const settings = store.get('settings', {}) as { closeBehavior?: string }
    const closeBehavior = settings.closeBehavior || 'tray'
    console.log('[Window] closeBehavior:', closeBehavior)
    if (closeBehavior === 'quit') {
      console.log('[Window] 退出程序')
      isQuitting = true
      app.quit()
    } else {
      mainWindow.hide()
      console.log('[Window] 窗口隐藏到托盘')
    }
  }
})

ipcMain.on('window:bringToFront', () => {
  console.log('[Window] 切换到前台')
  if (mainWindow) {
    if (focusWindow && !focusWindow.isDestroyed()) {
      focusWindow.close()
      focusWindow = null
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    console.log('[Window] mainWindow 显示到前台')
  }
})

// 托盘状态更新
ipcMain.on('tray:updateState', (_, data: { timeLeft: number; isRunning: boolean }) => {
  console.log('[Tray] 更新状态:', data)
  sharedTimerState.timeLeft = data.timeLeft
  sharedTimerState.isRunning = data.isRunning
  updateTrayMenu(data)
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

ipcMain.handle('dialog:saveCSV', async (_, data: string, defaultName: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: defaultName,
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (result.filePath) {
    try {
      writeFileSync(result.filePath, '﻿' + data, 'utf-8')
      return true
    } catch (e) {
      console.error('Failed to save CSV:', e)
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

  // 不再自动发送，让Focus窗口onMounted时主动请求
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
  fileLog(`[主→专注] timeLeft:${data.timeLeft} isRunning:${data.isRunning}`)

  // 同时发送给 focusWindow
  if (focusWindow && !focusWindow.isDestroyed()) {
    focusWindow.webContents.send('focus:stateUpdate', sharedTimerState)
    fileLog(`[主进程已转发到专注窗口] timeLeft:${data.timeLeft}`)
  } else {
    fileLog(`[主进程转发失败] focusWindow不存在`)
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
