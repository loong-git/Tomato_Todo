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

export interface Settings {
  focusDuration: number
  shortBreakDuration: number
  longBreakDuration: number
  longBreakInterval: number
  dailyGoal: number
  soundEnabled: boolean
  notificationEnabled: boolean
  soundPath: string
  theme: 'dark' | 'light'
}

export type TimerMode = 'focus' | 'shortBreak' | 'longBreak'

export interface TimerState {
  timeLeft: number
  isRunning: boolean
  mode: TimerMode
  pomodoroCount: number
  currentTaskIds: string[]
}
