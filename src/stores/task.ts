import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Task } from '@/types'
import { generateId } from '@/utils'
import { useStatsStore } from './stats'

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<Task[]>([])

  // 今天添加的任务（无论完成与否）
  const activeTasks = computed(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStart = today.getTime()
    return tasks.value.filter(t => !t.archivedAt && t.createdAt >= todayStart)
  })

  // 历史任务：昨天及之前的所有任务
  const historyTasks = computed(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStart = today.getTime()
    return tasks.value.filter(t => !t.archivedAt && t.createdAt < todayStart)
  })

  const completedTasks = computed(() => tasks.value.filter(t => t.isCompleted && !t.archivedAt))

  const archivedTasks = computed(() => tasks.value.filter(t => t.archivedAt))

  let saveTimeout: ReturnType<typeof setTimeout> | null = null

  function debouncedSave() {
    if (saveTimeout) {
      clearTimeout(saveTimeout)
    }
    saveTimeout = setTimeout(() => {
      saveTasks()
      saveTimeout = null
    }, 500)
  }

  function addTask(name: string): Task {
    const task: Task = {
      id: generateId(),
      name,
      completedPomodoros: 0,
      isCompleted: false,
      createdAt: Date.now(),
      completedAt: null,
      archivedAt: null
    }
    tasks.value.unshift(task)
    debouncedSave()
    return task
  }

  function updateTask(id: string, updates: Partial<Task>) {
    const task = tasks.value.find(t => t.id === id)
    if (task) {
      Object.assign(task, updates)
      debouncedSave()
    }
  }

  function deleteTask(id: string) {
    const task = tasks.value.find(t => t.id === id)
    if (task) {
      // 同步清理该任务的 records 和统计
      const statsStore = useStatsStore()
      statsStore.removeRecordsByTaskId(task.id)
      tasks.value.splice(tasks.value.indexOf(task), 1)
      debouncedSave()
    }
  }

  function completeTask(id: string) {
    const task = tasks.value.find(t => t.id === id)
    if (task) {
      task.isCompleted = true
      task.completedAt = Date.now()
      debouncedSave()
    }
  }

  function uncompleteTask(id: string) {
    const task = tasks.value.find(t => t.id === id)
    if (task) {
      task.isCompleted = false
      task.completedAt = null
      debouncedSave()
    }
  }

  function incrementPomodoro(id: string) {
    const task = tasks.value.find(t => t.id === id)
    if (task) {
      task.completedPomodoros++
      debouncedSave()
    }
  }

  function archiveTask(id: string) {
    const task = tasks.value.find(t => t.id === id)
    if (task) {
      task.archivedAt = Date.now()
      debouncedSave()
    }
  }

  function unarchiveTask(id: string) {
    const task = tasks.value.find(t => t.id === id)
    if (task) {
      task.archivedAt = null
      debouncedSave()
    }
  }

  function deleteArchivedTask(id: string) {
    const task = tasks.value.find(t => t.id === id)
    if (task && task.archivedAt) {
      const statsStore = useStatsStore()
      statsStore.removeRecordsByTaskId(task.id)
      tasks.value.splice(tasks.value.indexOf(task), 1)
      debouncedSave()
    }
  }

  async function exportAllData(): Promise<string> {
    const { useSettingsStore } = await import('./settings')
    const { useStatsStore } = await import('./stats')
    const { useTimerStore } = await import('./timer')

    const settingsStore = useSettingsStore()
    const statsStore = useStatsStore()
    const timerStore = useTimerStore()

    const data = {
      version: 1,
      exportedAt: Date.now(),
      tasks: JSON.parse(JSON.stringify(tasks.value)),
      records: JSON.parse(JSON.stringify(statsStore.records)),
      settings: JSON.parse(JSON.stringify(settingsStore.settings)),
      streakData: {
        streakCount: timerStore.streakCount,
        lastCompletionDate: timerStore.lastCompletionDate
      }
    }
    return JSON.stringify(data, null, 2)
  }

  async function exportAsCSV(): Promise<string> {
    const { useStatsStore } = await import('./stats')
    const statsStore = useStatsStore()

    const lines: string[] = []

    // 提示用户调整列宽
    lines.push('提示: 请双击列头分隔线调整列宽以显示完整内容')

    // 任务汇总
    lines.push('=== 任务汇总 ===')
    lines.push('任务名称,完成番茄数,创建时间,完成时间,状态')

    for (const task of tasks.value) {
      const createdDate = new Date(task.createdAt).toLocaleDateString('zh-CN')
      const completedDate = task.completedAt ? new Date(task.completedAt).toLocaleDateString('zh-CN') : '-'
      const status = task.isCompleted ? '已完成' : (task.archivedAt ? '已归档' : '进行中')
      lines.push(`"${task.name}",${task.completedPomodoros},${createdDate},${completedDate},${status}`)
    }

    lines.push('')

    // 番茄记录
    lines.push('=== 番茄记录 ===')
    lines.push('日期,时间,类型,时长(分钟),关联任务')

    for (const record of statsStore.records) {
      const date = new Date(record.completedAt).toLocaleDateString('zh-CN')
      const time = new Date(record.completedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      const typeText = record.type === 'focus' ? '专注' : (record.type === 'shortBreak' ? '短休息' : '长休息')
      const taskName = tasks.value.find(t => t.id === record.taskId)?.name || '-'
      lines.push(`${date},${time},${typeText},${Math.round(record.duration / 60)},"${taskName}"`)
    }

    lines.push('')

    // 统计信息
    lines.push('=== 统计信息 ===')

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const yearStart = new Date(now.getFullYear(), 0, 1).getTime()
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

    const todayRecords = statsStore.records.filter(r => r.completedAt >= todayStart && r.type === 'focus')
    const weekRecords = statsStore.records.filter(r => r.completedAt >= weekStart && r.type === 'focus')
    const monthRecords = statsStore.records.filter(r => r.completedAt >= monthStart && r.type === 'focus')
    const yearRecords = statsStore.records.filter(r => r.completedAt >= yearStart && r.type === 'focus')
    const last30Records = statsStore.records.filter(r => r.completedAt >= thirtyDaysAgo && r.type === 'focus')

    const sumMinutes = (arr: typeof statsStore.records) => Math.round(arr.reduce((s, r) => s + r.duration, 0) / 60)
    const sumHours = (arr: typeof statsStore.records) => (arr.reduce((s, r) => s + r.duration, 0) / 3600).toFixed(1)

    lines.push(`今日专注次数,${todayRecords.length}`)
    lines.push(`今日专注分钟,${sumMinutes(todayRecords)}`)
    lines.push(`本周专注次数,${weekRecords.length}`)
    lines.push(`本周专注分钟,${sumMinutes(weekRecords)}`)
    lines.push(`本月专注次数,${monthRecords.length}`)
    lines.push(`本月专注分钟,${sumMinutes(monthRecords)}`)

    // 年度完成 - 列出所有有数据的年份
    const yearStatsMap = statsStore.yearStats
    const yearKeys = Object.keys(yearStatsMap).map(Number).sort((a, b) => b - a)
    if (yearKeys.length > 0) {
      lines.push('')
      lines.push('=== 年度完成（所有年份）===')
      lines.push('年份,完成番茄,累计小时,累计分钟')
      for (const y of yearKeys) {
        const ys = yearStatsMap[y]
        lines.push(`${y}年,${ys.count},${(ys.seconds / 3600).toFixed(2)},${Math.round(ys.seconds / 60)}`)
      }
    }

    // 累计详细数据 - 改用 lifetimeStats / yearStats
    const lifetime = statsStore.lifetimeStats
    const year = now.getFullYear()
    const yStats = statsStore.yearStats[year] || { count: 0, seconds: 0 }

    lines.push('')
    lines.push('=== 累计详细数据 ===')
    lines.push(`累计完成番茄,${lifetime.totalCount}`)
    lines.push(`累计小时数,${(lifetime.totalSeconds / 3600).toFixed(2)}`)
    lines.push(`累计分钟数,${Math.round(lifetime.totalSeconds / 60)}`)
    lines.push(`${year}年完成番茄,${yStats.count}`)
    lines.push(`${year}年累计小时,${(yStats.seconds / 3600).toFixed(2)}`)
    lines.push(`${year}年累计分钟,${Math.round(yStats.seconds / 60)}`)
    lines.push(`30天完成番茄,${last30Records.length}`)
    lines.push(`30天累计小时,${sumHours(last30Records)}`)
    lines.push(`30天累计分钟,${sumMinutes(last30Records)}`)

    // 计算连续记录天数
    const focusRecords = statsStore.records.filter(r => r.type === 'focus')
    const focusDays = new Set<string>()
    focusRecords.forEach(r => {
      const d = new Date(r.completedAt)
      d.setHours(0, 0, 0, 0)
      focusDays.add(d.getTime().toString())
    })
    const sortedDays = Array.from(focusDays).map(Number).sort((a, b) => b - a)
    let streak = 0
    const todayTs = new Date().setHours(0, 0, 0, 0)
    let checkDate = sortedDays[0] === todayTs ? todayTs : todayTs - 86400000
    for (const dayTs of sortedDays) {
      if (dayTs === checkDate) {
        streak++
        checkDate -= 86400000
      } else if (dayTs < checkDate) {
        break
      }
    }
    lines.push(`连续记录,${streak}`)

    // 最高连续记录
    const sortedAsc = Array.from(focusDays).map(Number).sort((a, b) => a - b)
    let maxStreak = 0
    let current = 1
    for (let i = 1; i < sortedAsc.length; i++) {
      if (sortedAsc[i] - sortedAsc[i - 1] === 86400000) {
        current++
        maxStreak = Math.max(maxStreak, current)
      } else {
        current = 1
      }
    }
    maxStreak = Math.max(maxStreak, current)
    lines.push(`最高连续记录,${maxStreak}`)

    lines.push(`总任务数,${tasks.value.length}`)
    lines.push(`已完成任务,${tasks.value.filter(t => t.isCompleted).length}`)

    // 任务状态分类：今天未完成 = 进行中；昨天及之前未完成 = 过期
    const todayStartForTasks = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const inProgressTasks = tasks.value.filter(t => !t.isCompleted && !t.archivedAt && t.createdAt >= todayStartForTasks)
    const expiredTasks = tasks.value.filter(t => !t.isCompleted && !t.archivedAt && t.createdAt < todayStartForTasks)
    const archivedCount = tasks.value.filter(t => t.archivedAt).length

    lines.push(`进行中任务,${inProgressTasks.length}`)
    lines.push(`过期任务,${expiredTasks.length}`)
    lines.push(`已归档任务,${archivedCount}`)

    return lines.join('\n')
  }

  async function importAllData(jsonStr: string, merge: boolean = true): Promise<{ success: boolean; message: string }> {
    try {
      const data = JSON.parse(jsonStr)
      if (!data.tasks || !Array.isArray(data.tasks)) {
        return { success: false, message: '无效的数据格式' }
      }

      const { useSettingsStore } = await import('./settings')
      const { useStatsStore } = await import('./stats')

      const settingsStore = useSettingsStore()
      const statsStore = useStatsStore()

      // 导入任务
      if (merge) {
        const existingTaskIds = new Set(tasks.value.map(t => t.id))
        const newTasks = data.tasks.filter((t: Task) => !existingTaskIds.has(t.id))
        tasks.value.push(...newTasks)
      } else {
        tasks.value = data.tasks
      }
      saveTasks()

      // 导入记录
      if (data.records && Array.isArray(data.records)) {
        if (merge) {
          const existingRecordIds = new Set(statsStore.records.map(r => r.id))
          const newRecords = data.records.filter((r: any) => !existingRecordIds.has(r.id))
          statsStore.records.push(...newRecords)
        } else {
          statsStore.records = data.records
        }
        statsStore.saveRecords()
      }

      // 导入设置
      if (data.settings && typeof data.settings === 'object') {
        if (merge) {
          Object.assign(settingsStore.settings, data.settings)
        } else {
          settingsStore.settings = { ...settingsStore.settings, ...data.settings }
        }
        settingsStore.saveSettings()
      }

      const taskCount = Array.isArray(data.tasks) ? data.tasks.length : 0
      const recordCount = Array.isArray(data.records) ? data.records.length : 0

      return {
        success: true,
        message: `成功导入 ${taskCount} 个任务、${recordCount} 条记录`
      }
    } catch (e) {
      console.error('Failed to import data:', e)
      return { success: false, message: '导入失败：文件格式错误' }
    }
  }

  function saveTasks() {
    if (window.electronAPI) {
      const data = JSON.parse(JSON.stringify(tasks.value))
      window.electronAPI.store.set('tasks', data)
    }
  }

  async function loadTasks() {
    if (window.electronAPI) {
      const saved = await window.electronAPI.store.get('tasks') as Task[] | undefined
      if (saved) {
        tasks.value = saved
      }
    }
  }

  return {
    tasks,
    activeTasks,
    historyTasks,
    completedTasks,
    archivedTasks,
    addTask,
    updateTask,
    deleteTask,
    completeTask,
    uncompleteTask,
    incrementPomodoro,
    archiveTask,
    unarchiveTask,
    deleteArchivedTask,
    exportAllData,
    exportAsCSV,
    importAllData,
    loadTasks
  }
})
