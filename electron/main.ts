import { app, BrowserWindow, ipcMain, Notification, dialog, Menu, Tray, nativeImage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, appendFileSync } from 'fs'
import Store from 'electron-store'

// Windows 下修复中文乱码：将控制台代码页切换到 UTF-8 (65001)
// 必须在任何 console.log 之前执行，否则源码里的中文日志会按 GBK 解码乱码
if (process.platform === 'win32') {
  try {
    // shell: true 确保 chcp 在 cmd 解释器下运行（避免 spawn EINVAL）
    // stdio: 'ignore' 屏蔽 "Active code page: 65001" 输出，避免污染日志
    require('child_process').spawnSync('chcp', ['65001'], {
      stdio: 'ignore',
      shell: true
    })
  } catch (e) {
    // 切换失败也继续运行，不阻塞主流程
  }
}

// 设置 Windows 通知显示的应用名称
app.setAppUserModelId('番茄TODO')

// 设置 Electron 用户数据目录到项目根目录的 data 文件夹
app.setPath('userData', join(__dirname, '../../data'))

// [测试钩子] 开发模式下通过 CDP 远程驱动渲染进程做自动化验收。
// 仅在显式设置环境变量时启用，生产构建不带该 env，无任何副作用。
// 用法: REMOTE_DEBUG_PORT=9222 npm run dev → 连接 http://localhost:9222
if (process.env.REMOTE_DEBUG_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.REMOTE_DEBUG_PORT)
}

// 确保单实例运行
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

app.on('second-instance', () => {
  if (focusWindow && !focusWindow.isDestroyed()) {
    // 走 closed 事件统一清理
    focusWindow.close()
  }
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
let sharedTimerState = { timeLeft: 25 * 60, mode: 'focus', isRunning: false, justCompleted: false, total: 25 * 60, currentTaskName: '', currentTaskIds: [] as string[] }
let isQuitting = false

// 专注窗口状态机（单一权威源）
type FocusWindowState =
  | { kind: 'closed' }
  | { kind: 'open'; mode: 'compact' | 'fullscreen' }
let focusState: FocusWindowState = { kind: 'closed' }

// 关闭动画意图（与结构状态正交）
let closeAnimationNeeded = false

// 并发打开守卫（连续 Alt+F 保护）
let pendingFocusOpen = false

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
    // 窗口图标（dev 模式下让 Alt+Tab 切换和任务栏预览显示番茄；任务栏本身的图标由 .exe 决定，dev 模式改不了）
    icon: join(__dirname, '../../icon.ico'),
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

  // ===== 临时：监听 mainWindow/focusWindow 渲染进程的 console.log =====
  if (mainWindow) {
    mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      fileLog(`[MAIN_RENDER] ${message} (${sourceId}:${line})`)
    })
  }
  // mainWindow destroyed 监听
  if (mainWindow) {
    mainWindow.webContents.on('destroyed', () => {
      fileLog(`[MAIN] ⚠️ mainWindow.webContents destroyed!`)
    })
  }

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
      // 走 closed 事件统一清理
      focusWindow.close()
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('focus:modeChange', false)
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
          console.log('[Audio] player closed')
          // [P2-11 修复] 音频播放结束通知渲染进程，停止音频按钮据此自动隐藏
          if (mainWindow && !mainWindow.isDestroyed()) {
            console.log('[Audio] sending audio:ended to mainWindow')
            mainWindow.webContents.send('audio:ended')
          } else {
            console.log('[Audio] mainWindow not available, skip send')
          }
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
  return new Promise((resolve) => {
    try {
      // [P2-11 修复] 无条件清理所有 wmplayer 残留实例，且等 taskkill 完成后再 resolve：
      // - 之前只在 currentPlayer 非空时 taskkill，若上次播放残留（单实例转发/异常挂起）未清掉，
      //   下次播放会因单实例机制转发命令，导致 audio:ended 时序错乱（渲染进程 isAudioPlaying 卡 true）。
      // - taskkill 异步，若在回调完成前 resolve，渲染进程立即 playSound 会撞上旧实例被杀的窗口期，
      //   又触发单实例转发。等 taskkill 完成再 resolve，保证下一次播放绝对干净。
      if (process.platform === 'win32') {
        const { exec } = require('child_process')
        exec('taskkill /F /IM wmplayer.exe', { windowsHide: true }, () => {
          currentPlayer = null
          resolve(true)
        })
      } else if (process.platform === 'darwin') {
        const { exec } = require('child_process')
        exec('pkill afplay', () => {
          currentPlayer = null
          resolve(true)
        })
      } else {
        currentPlayer = null
        resolve(true)
      }
    } catch (e) {
      console.error('Failed to stop audio:', e)
      currentPlayer = null
      resolve(false)
    }
  })
})

// 从 store 中读 tasks，根据 currentTaskIds 计算 currentTaskName
function resolveCurrentTaskName(currentTaskIds: string[]): string {
  if (!currentTaskIds?.length) return ''
  const tasks = store.get('tasks', []) as { id: string; name: string }[]
  const task = tasks.find(t => t.id === currentTaskIds[0])
  return task?.name || ''
}

ipcMain.handle('focus:open', (_, data: { timeLeft: number; mode: string; isRunning: boolean; total: number; currentTaskName: string; currentTaskIds: string[] }, mode?: 'compact' | 'fullscreen') => {
  const targetMode = mode || 'compact'
  // 兜底：主进程用 currentTaskIds 重新计算 currentTaskName（数据源是 store 里的 tasks）
  if (data.currentTaskIds) {
    const resolved = resolveCurrentTaskName(data.currentTaskIds)
    if (resolved) {
      data.currentTaskName = resolved
    }
  }
  fileLog(`[Focus] IPC focus:open, mode=${targetMode}, currentTaskName="${data.currentTaskName}", currentTaskIds=${JSON.stringify(data.currentTaskIds)}`)
  console.log('[Focus] IPC focus:open, mode:', targetMode, 'data:', JSON.stringify(data))
  openFocusWindow(targetMode, data)
})

// 打开专注窗口的内部函数（被 focus:open 共用）
async function openFocusWindow(mode: 'compact' | 'fullscreen', data?: { timeLeft: number; mode: string; isRunning: boolean; total: number; currentTaskName: string; currentTaskIds: string[] }) {
  // 状态守门
  if (focusState.kind === 'open' || pendingFocusOpen) {
    fileLog(`[Focus] openFocusWindow 已在打开中或已打开,忽略本次请求 (state=${JSON.stringify(focusState)})`)
    return
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    fileLog('[Focus] openFocusWindow 失败: mainWindow 不可用')
    return
  }
  if (data) sharedTimerState = data
  fileLog(`[Focus] openFocusWindow 入口 → data.timeLeft=${data?.timeLeft} data.isRunning=${data?.isRunning} mode=${mode} sharedTimerState.timeLeft=${sharedTimerState.timeLeft}`)

  pendingFocusOpen = true
  let newWindow: BrowserWindow | null = null
  let isFullscreen = mode === 'fullscreen'

  try {
    const { screen } = require('electron')
    const display = screen.getPrimaryDisplay()
    const { width: sw, height: sh } = display.workAreaSize

    // 隐藏主窗口
    mainWindow.hide()
    mainWindow.webContents.send('focus:modeChange', true)
    fileLog(`[Focus] mainWindow.hide() 后 → 即将创建 focusWindow, mode=${mode}`)

    // 准备 BrowserWindow 配置
    const winConfig: any = {
      minWidth: 150,
      minHeight: 150,
      // 专注窗口图标（同样，dev 模式下改任务栏图标无能为力，只能让窗口本身有图标）
      icon: join(__dirname, '../../icon.ico'),
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
    }

    if (isFullscreen) {
      winConfig.width = sw
      winConfig.height = sh
      winConfig.x = 0
      winConfig.y = 0
      // 全屏专注模式禁止拖动 + 禁止调整大小(只允许 Alt+F 或左上 × 返回主窗口)
      winConfig.movable = false
      winConfig.resizable = false
    } else {
      winConfig.width = 250
      winConfig.height = 250
      winConfig.x = sw - 270
      winConfig.y = 20
    }

    newWindow = new BrowserWindow(winConfig)

    const focusUrl = process.env.VITE_DEV_SERVER_URL
      ? `${process.env.VITE_DEV_SERVER_URL}#/focus`
      : `file://${join(__dirname, '../dist/index.html')}#/focus`

    newWindow.loadURL(focusUrl)
    newWindow.webContents.setBackgroundThrottling(false)

    // 注册 closed 事件（统一清理点）
    newWindow.on('closed', () => {
      // 仅在 newWindow 仍是当前 focusWindow 时清理,防 stale 引用
      if (focusWindow === newWindow) {
        focusWindow = null
      }
      const prevMode = focusState.kind === 'open' ? focusState.mode : 'unknown'
      if (focusState.kind === 'open') {
        focusState = { kind: 'closed' }
      }
      fileLog(`[Focus] 状态转换: open(${prevMode}) → closed`)

      // 恢复主窗口
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (closeAnimationNeeded) {
          animateMainWindowRestore(mainWindow)
        } else {
          mainWindow.show()
        }
        mainWindow.webContents.send('focus:modeChange', false)
      }
      closeAnimationNeeded = false
    })

    // 加载失败日志(不会触发 closed,需要单独处理)
    newWindow.webContents.on('did-fail-load', (_e, code, desc) => {
      fileLog(`[Focus] ⚠️ focusWindow did-fail-load: code=${code} desc=${desc}`)
    })

    // 加载完成事件
    newWindow.webContents.on('did-finish-load', () => {
      fileLog(`[Focus] focusWindow did-finish-load → 共享 timeLeft=${sharedTimerState.timeLeft} isRunning=${sharedTimerState.isRunning}`)
      // 推迟到 did-finish-load 之后,避免 loadURL 未完成时 setFullScreen 触发 webContents 重建
      if (isFullscreen && newWindow && !newWindow.isDestroyed()) {
        if (newWindow.isFullScreen()) {
          fileLog(`[Focus] setFullScreen(true) 已被用户/系统切换,跳过`)
          return
        }
        if (newWindow.webContents.isCrashed() || !newWindow.isVisible()) {
          fileLog(`[Focus] setFullScreen(true) 跳过:webContents 异常或窗口不可见`)
          return
        }
        fileLog(`[Focus] 推迟 setFullScreen(true) (loadURL 后)`)
        newWindow.setFullScreen(true)
      }
    })

    // webContents 重建监听
    newWindow.webContents.on('destroyed', () => {
      fileLog(`[Focus] ⚠️ focusWindow.webContents destroyed!`)
    })

    // 提交状态(必须在所有 listener 注册完成后)
    focusWindow = newWindow
    focusState = { kind: 'open', mode }
    fileLog(`[Focus] 状态转换: closed → open(${mode})`)
  } catch (e) {
    // 回滚:销毁半成品窗口,恢复主窗口
    fileLog(`[Focus] openFocusWindow 失败,回滚: ${e instanceof Error ? e.message : String(e)}`)
    if (newWindow && !newWindow.isDestroyed()) {
      newWindow.destroy()
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.webContents.send('focus:modeChange', false)
    }
    pendingFocusOpen = false
    throw e
  } finally {
    pendingFocusOpen = false
  }
}

// 从 compact(250x250 角落位置)放大回主窗口(400x700 居中)动画
function animateMainWindowRestore(targetWindow: BrowserWindow) {
  const { screen } = require('electron')
  const display = screen.getPrimaryDisplay()
  const { width: sw, height: sh } = display.workAreaSize

  const targetW = 400
  const targetH = 700
  const targetX = Math.round((sw - targetW) / 2)
  const targetY = Math.round((sh - targetH) / 2)

  const startW = 250
  const startH = 250

  targetWindow.setBounds({
    x: targetX,
    y: targetY,
    width: startW,
    height: startH
  }, false)
  targetWindow.show()

  const duration = 300
  const startTime = Date.now()
  function easeOutCubic(t: number) {
    return 1 - Math.pow(1 - t, 3)
  }
  function animate() {
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)
    const eased = easeOutCubic(progress)
    targetWindow.setBounds({
      x: targetX,
      y: targetY,
      width: Math.round(startW + (targetW - startW) * eased),
      height: Math.round(startH + (targetH - startH) * eased)
    }, false)
    if (progress < 1) {
      setTimeout(animate, 16)
    }
  }
  animate()
  fileLog('[Focus] 主窗口恢复动画启动 (250x250 → 400x700, 300ms)')
}

ipcMain.handle('focus:getInitData', () => {
  const focusMode: 'compact' | 'fullscreen' | null = focusState.kind === 'open' ? focusState.mode : null
  fileLog(`[Focus] getInitData → timeLeft=${sharedTimerState.timeLeft} isRunning=${sharedTimerState.isRunning} currentTaskName="${sharedTimerState.currentTaskName}" focusMode=${focusMode}`)
  return {
    ...sharedTimerState,
    focusMode
  }
})

ipcMain.handle('focus:updateState', (_, data: { timeLeft: number; mode: string; isRunning: boolean }) => {
  sharedTimerState = data
})

ipcMain.on('focus:getState', (event) => {
  // focusWindow 请求获取当前状态，直接从 sharedTimerState 返回
  event.returnValue = sharedTimerState
})

ipcMain.on('focus:sendState', (event, data: { timeLeft: number; mode: string; isRunning: boolean; justCompleted: boolean; total: number; currentTaskName: string; currentTaskIds: string[] }) => {
  // 兜底：用主进程视角重新计算 currentTaskName
  if (data.currentTaskIds) {
    const resolved = resolveCurrentTaskName(data.currentTaskIds)
    if (resolved) {
      data.currentTaskName = resolved
    }
  }
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
  // 状态守门
  if (focusState.kind !== 'open' || !focusWindow || focusWindow.isDestroyed()) {
    fileLog(`[Focus] focus:close 忽略: focusState=${JSON.stringify(focusState)} focusWindow=${!!focusWindow}`)
    return
  }

  closeAnimationNeeded = true
  // 先退出全屏（如果处于全屏状态），避免动画异常
  if (focusWindow.isFullScreen()) {
    fileLog('[Focus] close: 退出全屏状态')
    focusWindow.setFullScreen(false)
  }
  // 触发 closed 事件,所有状态清理与动画在那里统一执行
  focusWindow.close()
})
