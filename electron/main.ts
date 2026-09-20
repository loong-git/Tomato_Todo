import { app, BrowserWindow, ipcMain, Notification, dialog, Menu, Tray, nativeImage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
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
// [L2 日志降噪] 状态转发签名去重：只记录 isRunning/justCompleted/mode 变化，不记录每秒 timeLeft 递减
let lastStateSignature = ''
let isQuitting = false

// 专注窗口状态机（单一权威源）
type FocusWindowState =
  | { kind: 'closed' }
  | { kind: 'open'; mode: 'compact' }
let focusState: FocusWindowState = { kind: 'closed' }

// 关闭动画意图（与结构状态正交）
let closeAnimationNeeded = false

// 并发打开守卫（连续 Alt+F 保护）
let pendingFocusOpen = false

// 日志统一走 logger.ts（userData/log.txt）
import { fileLog, debugLog } from './logger'

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

// [改版] 窗口基准：宽 1056、高 820（物理像素，按内容实测贴合无空底），按显示器缩放换算成 DIP
let MIN_WIN_W = 1056
let WIN_H = 820

function initWindowSize() {
  const { screen } = require('electron')
  const sf = screen.getPrimaryDisplay().scaleFactor || 1
  MIN_WIN_W = Math.round(1056 / sf)
  WIN_H = Math.round(820 / sf)
  fileLog(`[Window] initWindowSize: sf=${sf} MIN_WIN_W=${MIN_WIN_W} WIN_H=${WIN_H} display=${JSON.stringify(screen.getPrimaryDisplay().bounds)}`)
}

function createWindow() {
  // 从store读取主题设置
  const settings = store.get('settings', {}) as { theme?: string }
  const savedTheme = settings.theme || 'dark'
  const bgColor = savedTheme === 'light' ? '#f5f2ef' : '#1a1614'

  // 按当前显示器缩放换算窗口基准尺寸（物理 1056x752）
  initWindowSize()

  mainWindow = new BrowserWindow({
    width: MIN_WIN_W,
    height: WIN_H,
    // [改版] 高度锁死（min=max），宽度最小 = 截图基准（按缩放换算）。
    // resizable 必须为 true：Windows 下 resizable:false 会剥掉最大化样式位，
    // 导致双击标题最大化手势失效且窗口错位。仅右缘调宽的限制由下方
    // will-resize 守卫实现：x/高度变化一律拒绝，只放行"x 不动只变宽"的右缘拖拽。
    minWidth: MIN_WIN_W,
    minHeight: WIN_H,
    maxHeight: WIN_H,
    resizable: true,
    // 双击标题栏拖动区的原生最大化有半屏 bug（resizable+污染的还原位置），已禁用；
    // 最大化走自定义通道：双击 logo / ▢ 按钮 → window:toggle-maximize IPC
    maximizable: false,
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

  // [改版] 仅右缘调宽守卫：x 或高度变化（左缘/上下/角拖拽）一律拒绝，
  // 只放行"x 不动、高度不变、仅宽度变化"的右缘拖拽，宽度夹紧到 [MIN_WIN_W, 屏幕右界]。
  // 最大化/还原过程放行（目标≈工作区，否则会把最大化拦腰截断导致窗口跳左上角）
  mainWindow.on('will-resize', (event, newBounds) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    // 程序化 setBounds 放行（否则会拦截我们自己的最大化/还原/调宽）
    if (applyingBounds) return
    // 自定义最大化期间：锁死一切系统缩放
    if (customMaxBounds) {
      event.preventDefault()
      return
    }
    const cur = mainWindow.getBounds()
    const { screen } = require('electron')
    const wa = screen.getDisplayMatching(cur).workArea
    const nearWorkArea =
      Math.abs(newBounds.x - wa.x) < 12 &&
      Math.abs(newBounds.y - wa.y) < 12 &&
      Math.abs(newBounds.width - wa.width) < 24 &&
      Math.abs(newBounds.height - wa.height) < 24
    if (nearWorkArea) return
    if (newBounds.x !== cur.x || newBounds.height !== cur.height) {
      event.preventDefault()
      return
    }
    const maxW = Math.max(MIN_WIN_W, wa.width - cur.x - 8)
    if (newBounds.width < MIN_WIN_W || newBounds.width > maxW) {
      event.preventDefault()
      programmaticSetBounds({
        x: cur.x, y: cur.y,
        width: Math.max(MIN_WIN_W, Math.min(newBounds.width, maxW)),
        height: cur.height
      })
    }
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

// [L3 崩溃捕获] 全局异常兜底——崩溃类问题必须留痕，否则日志完全沉默
process.on('uncaughtException', (e) => {
  fileLog(`[CRASH] uncaughtException: ${e?.stack || e}`)
})
process.on('unhandledRejection', (reason) => {
  fileLog(`[CRASH] unhandledRejection: ${reason instanceof Error ? reason.stack : reason}`)
})

// [L4 睡眠精确处理] powerMonitor 监听系统睡眠/唤醒：
// 睡眠期间进程冻结、用户并未专注，唤醒后把睡眠时长精确通知渲染进程，
// 从计时基准中扣除（比 90s 启发式检测更可靠，不怕 NTP 校时误判）
let suspendAtMs = 0
app.whenReady().then(() => {
  const { powerMonitor } = require('electron')
  powerMonitor.on('suspend', () => {
    suspendAtMs = Date.now()
    fileLog('[Power] 系统睡眠')
  })
  powerMonitor.on('resume', () => {
    const gap = suspendAtMs > 0 ? Date.now() - suspendAtMs : 0
    suspendAtMs = 0
    fileLog(`[Power] 系统唤醒，睡眠时长 ${Math.round(gap / 1000)}s`)
    if (mainWindow && !mainWindow.isDestroyed() && gap > 2000) {
      mainWindow.webContents.send('power:resumed', gap)
    }
  })
})

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
    // [L3 崩溃捕获] 渲染进程异常退出必须留痕（白屏/闪退类问题的关键证据）
    mainWindow.webContents.on('render-process-gone', (_e, details) => {
      fileLog(`[CRASH] 渲染进程退出: reason=${details.reason} exitCode=${details.exitCode}`)
    })
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
// [改版] 仅右缘调宽：渲染进程拖拽把手发目标宽度，这里夹紧后改宽（高度/位置不变）
// 最大化状态下忽略（不打断系统最大化）
ipcMain.on('window:resize-to', (_event, width: number) => {
  if (!mainWindow || mainWindow.isDestroyed() || customMaxBounds) return
  const { screen } = require('electron')
  const display = screen.getDisplayMatching(mainWindow.getBounds())
  const maxW = Math.max(MIN_WIN_W, display.workArea.width - mainWindow.getPosition()[0] - 8)
  const w = Math.max(MIN_WIN_W, Math.min(Math.round(width), maxW))
  const [x, y] = mainWindow.getPosition()
  programmaticSetBounds({ x, y, width: w, height: WIN_H })
})

// [改版] 自定义最大化：不用原生 maximize()（其依赖的 Windows 还原位置会被
// will-resize preventDefault 污染成半屏），自己记住还原位置 + setBounds 到工作区
let customMaxBounds: Electron.Rectangle | null = null

// [改版] 程序化 setBounds 旗标：will-resize 守卫对程序化调用放行
// （will-resize 对 setBounds 也会触发，若不豁免会把我们自己的最大化拦腰截断）
let applyingBounds = false
function programmaticSetBounds(b: Electron.Rectangle) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  applyingBounds = true
  try {
    mainWindow.setBounds(b)
  } finally {
    applyingBounds = false
  }
}

ipcMain.on('window:toggle-maximize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (customMaxBounds) {
    // 还原：先回原尺寸（此时仍在放开的约束内），再恢复高度锁定
    const b = customMaxBounds
    customMaxBounds = null
    programmaticSetBounds(b)
    mainWindow.setMaximumSize(10000, WIN_H)
    mainWindow.webContents.send('window:maxState', false)
    fileLog(`[Window] 还原窗口: ${JSON.stringify(b)}（恢复 maxHeight=${WIN_H}）`)
  } else {
    // 最大化：BrowserWindow 的 maxHeight 会被 setBounds 遵守，
    // 不解除会把工作区高度夹成 WIN_H → "半屏"。先放开再铺满。
    // 用 display.bounds 整屏（含任务栏区域），用户要求最大化=铺满全屏
    const cur = mainWindow.getBounds()
    customMaxBounds = cur
    mainWindow.setMaximumSize(10000, 10000)
    const { screen } = require('electron')
    const db = screen.getDisplayMatching(cur).bounds
    programmaticSetBounds({ x: db.x, y: db.y, width: db.width, height: db.height })
    mainWindow.webContents.send('window:maxState', true)
    fileLog(`[Window] 自定义最大化 → 整屏: ${JSON.stringify(db)}（临时解除 maxHeight）`)
  }
})

ipcMain.on('window:minimize', () => {
  mainWindow?.minimize()
})

// [方案1] 小窗专注控制按钮：转发给主窗口渲染进程的 timer store 执行
ipcMain.on('focus:control', (_event, action: 'start' | 'pause' | 'skip') => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('focus:control', action)
  fileLog(`[Focus] control: ${action}`)
})

// [需求] 小窗锁定：锁定后窗口不可拖动移动位置（movable:false），解锁恢复
ipcMain.on('focus:toggle-lock', (_event, locked: boolean) => {
  if (!focusWindow || focusWindow.isDestroyed()) return
  focusWindow.setMovable(!locked)
  fileLog(`[Focus] 小窗锁定: ${locked ? '锁定（禁止拖动）' : '解锁（可拖动）'}`)
})

// [修复] 标题栏拖动已改回系统原生（-webkit-app-region: drag），drag-by IPC 通道废弃删除。
// 自实现 setPosition/setBounds 连发在 Windows DPI≠100% 下会拉宽窗口且失效。

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

ipcMain.handle('focus:open', (_, data: { timeLeft: number; mode: string; isRunning: boolean; total: number; currentTaskName: string; currentTaskIds: string[] }, mode?: 'compact') => {
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

// 打开小窗专注（compact 独立窗口）。[方案1] 全屏专注已改为主窗口内嵌覆盖层，此函数只服务 compact
async function openFocusWindow(mode: 'compact', data?: { timeLeft: number; mode: string; isRunning: boolean; total: number; currentTaskName: string; currentTaskIds: string[] }) {
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

  try {
    const { screen } = require('electron')
    const display = screen.getPrimaryDisplay()
    const { width: sw, height: sh } = display.workAreaSize

    // [需求] 固定 224x222（物理像素基准），按显示器缩放换算成 DIP——
    // 与主窗口 initWindowSize 同一模式，不换算会导致高分屏上窗口偏大
    const sf = display.scaleFactor || 1
    const FW_W = Math.round(224 / sf)
    const FW_H = Math.round(222 / sf)
    fileLog(`[Focus] 小窗基准: sf=${sf} 224x222 → DIP ${FW_W}x${FW_H}`)

    // 隐藏主窗口
    mainWindow.hide()
    mainWindow.webContents.send('focus:modeChange', true)
    fileLog(`[Focus] mainWindow.hide() 后 → 即将创建 focusWindow, mode=${mode}`)

    newWindow = new BrowserWindow({
      width: FW_W,
      height: FW_H,
      x: sw - FW_W - 20,
      y: 20,
      // 专注窗口图标（同样，dev 模式下改任务栏图标无能为力，只能让窗口本身有图标）
      icon: join(__dirname, '../../icon.ico'),
      frame: false,
      transparent: true,
      roundedCorners: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      fullscreenable: false,
      maximizable: false,
      webPreferences: {
        preload: join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    })

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

// 从 compact(250x250 角落位置)放大回主窗口(1056x752 居中)动画
function animateMainWindowRestore(targetWindow: BrowserWindow) {
  const { screen } = require('electron')
  const display = screen.getPrimaryDisplay()
  const { width: sw, height: sh } = display.workAreaSize

  const targetW = MIN_WIN_W
  const targetH = WIN_H
  const targetX = Math.round((sw - targetW) / 2)
  const targetY = Math.round((sh - targetH) / 2)

  const startW = 250
  const startH = 250

  // programmaticSetBounds：will-resize 对 setBounds 也会触发，豁免守卫
  // （动画高度从 250 变到 WIN_H，裸调会被守卫判为"高度变化"拦腰截断）
  programmaticSetBounds({
    x: targetX,
    y: targetY,
    width: startW,
    height: startH
  })
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
    programmaticSetBounds({
      x: targetX,
      y: targetY,
      width: Math.round(startW + (targetW - startW) * eased),
      height: Math.round(startH + (targetH - startH) * eased)
    })
    if (progress < 1) {
      setTimeout(animate, 16)
    }
  }
  animate()
  fileLog('[Focus] 主窗口恢复动画启动 (250x250 → 基准窗口, 300ms)')
}

ipcMain.handle('focus:getInitData', () => {
  const focusMode: 'compact' | null = focusState.kind === 'open' ? focusState.mode : null
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

  // [L2 日志降噪] 每秒一次的 tick 转发不逐条记录，只在"关键状态签名"变化时记录
  // （isRunning/justCompleted/mode 变化 = 事件；纯 timeLeft 递减 = 噪声）
  const signature = `${data.isRunning}|${data.justCompleted}|${data.mode}`
  if (signature !== lastStateSignature) {
    fileLog(`[主→专注] 状态变化: isRunning=${data.isRunning} justCompleted=${data.justCompleted} mode=${data.mode} timeLeft=${data.timeLeft}`)
    lastStateSignature = signature
  }

  // 同时发送给 focusWindow（窗口不存在是常态——用户没开专注模式，静默不记日志）
  if (focusWindow && !focusWindow.isDestroyed()) {
    focusWindow.webContents.send('focus:stateUpdate', sharedTimerState)
  }
})

ipcMain.handle('focus:close', () => {
  // 状态守门
  if (focusState.kind !== 'open' || !focusWindow || focusWindow.isDestroyed()) {
    fileLog(`[Focus] focus:close 忽略: focusState=${JSON.stringify(focusState)} focusWindow=${!!focusWindow}`)
    return
  }

  closeAnimationNeeded = true
  // 触发 closed 事件,所有状态清理与动画在那里统一执行
  focusWindow.close()
})
