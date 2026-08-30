export interface Task {
  id: string
  name: string
  completedPomodoros: number
  isCompleted: boolean
  createdAt: number
  completedAt: number | null
  archivedAt: number | null
}

export interface PomodoroRecord {
  id: string
  taskId: string
  type: 'focus' | 'shortBreak' | 'longBreak'
  duration: number
  completedAt: number
}

export type SoundType = 'bell' | 'forest' | 'ding' | 'tick' | 'custom'

export interface ShortcutConfig {
  /** 主窗口 → 切全屏专注(在 FocusWindow 内 = 返回主窗口) */
  toggleFullscreen: string
  /** 主窗口 → 切小窗专注(在 FocusWindow 内 = 返回主窗口) */
  toggleCompact: string
}

export interface Settings {
  focusDuration: number
  shortBreakDuration: number
  longBreakDuration: number
  longBreakInterval: number
  dailyGoal: number
  dailyHourGoal: number
  soundEnabled: boolean
  notificationEnabled: boolean
  soundType: SoundType
  soundPath: string
  theme: 'dark' | 'light'
  closeBehavior: 'tray' | 'quit'
  /** 自定义快捷键(人类可读,如 "Alt+F" / "Ctrl+Shift+M") */
  shortcuts: ShortcutConfig
}

export type TimerMode = 'focus' | 'shortBreak' | 'longBreak'

export interface TimerState {
  timeLeft: number
  isRunning: boolean
  mode: TimerMode
  pomodoroCount: number
  currentTaskIds: string[]
}
