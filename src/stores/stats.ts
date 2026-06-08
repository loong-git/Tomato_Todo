import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PomodoroRecord } from '@/types'
import { generateId } from '@/utils'

const ONE_DAY = 24 * 60 * 60 * 1000

interface LifetimeStats {
  totalCount: number
  totalSeconds: number
}

interface YearStat {
  count: number
  seconds: number
}

export const useStatsStore = defineStore('stats', () => {
  const records = ref<PomodoroRecord[]>([])
  const todayCount = ref(0)
  const weekCount = ref(0)

  // 永久累计统计 - 由 addRecord 按 records.duration 累加（不依赖 settings）
  const lifetimeStats = ref<LifetimeStats>({ totalCount: 0, totalSeconds: 0 })

  // 按年累计统计 - 由 addRecord 按 records.duration 累加
  const yearStats = ref<Record<number, YearStat>>({})

  function updateCounts() {
    const now = Date.now()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStart = today.getTime()
    const weekAgo = now - 7 * ONE_DAY

    todayCount.value = records.value.filter(r =>
      r.completedAt >= todayStart && r.type === 'focus'
    ).length

    weekCount.value = records.value.filter(r =>
      r.completedAt >= weekAgo && r.type === 'focus'
    ).length
  }

  function addRecord(record: Omit<PomodoroRecord, 'id'>) {
    const newRecord: PomodoroRecord = {
      ...record,
      id: generateId()
    }
    records.value.push(newRecord)

    if (record.type === 'focus') {
      const duration = record.duration || 0
      const currentYear = new Date(record.completedAt).getFullYear()

      // 永久累计（不清理）
      lifetimeStats.value.totalCount += 1
      lifetimeStats.value.totalSeconds += duration

      // 按年累计（保留所有年份数据，UI 自动切到当前年显示）
      if (!yearStats.value[currentYear]) {
        yearStats.value[currentYear] = { count: 0, seconds: 0 }
      }
      yearStats.value[currentYear].count += 1
      yearStats.value[currentYear].seconds += duration

      console.log(`[Stats] 累加 累计:${lifetimeStats.value.totalCount} / ${currentYear}年:${yearStats.value[currentYear].count}`)
    }

    updateCounts()
    cleanupOldRecords()
    saveRecords()
    saveLifetimeStats()
    saveYearStats()
  }

  /**
   * 删除任务时同步清理该任务的所有 records 和统计
   * 按 taskId 找出所有 focus records，删除并减少 lifetimeStats/yearStats
   */
  function removeRecordsByTaskId(taskId: string) {
    if (!taskId) return

    const taskRecords = records.value.filter(r => r.taskId === taskId && r.type === 'focus')
    if (taskRecords.length === 0) {
      console.log(`[Stats] 任务 ${taskId} 没有关联的 records`)
      return
    }

    const removedCount = taskRecords.length
    const removedSeconds = taskRecords.reduce((s, r) => s + (r.duration || 0), 0)

    // 按年份分组
    const removedByYear: Record<number, { count: number; seconds: number }> = {}
    for (const r of taskRecords) {
      const year = new Date(r.completedAt).getFullYear()
      if (!removedByYear[year]) {
        removedByYear[year] = { count: 0, seconds: 0 }
      }
      removedByYear[year].count += 1
      removedByYear[year].seconds += r.duration || 0
    }

    // 从 records 删除
    records.value = records.value.filter(r => !(r.taskId === taskId && r.type === 'focus'))

    // 减少 lifetimeStats
    lifetimeStats.value.totalCount = Math.max(0, lifetimeStats.value.totalCount - removedCount)
    lifetimeStats.value.totalSeconds = Math.max(0, lifetimeStats.value.totalSeconds - removedSeconds)

    // 减少 yearStats
    for (const [year, stat] of Object.entries(removedByYear)) {
      const y = +year
      if (yearStats.value[y]) {
        yearStats.value[y].count = Math.max(0, yearStats.value[y].count - stat.count)
        yearStats.value[y].seconds = Math.max(0, yearStats.value[y].seconds - stat.seconds)
      }
    }

    saveRecords()
    saveLifetimeStats()
    saveYearStats()
    updateCounts()

    console.log(`[Stats] 删除任务 ${taskId} 清理 ${removedCount} 条 records 累计剩余:${lifetimeStats.value.totalCount}`)
  }

  function cleanupOldRecords() {
    const thirtyDaysAgo = Date.now() - 30 * ONE_DAY
    records.value = records.value.filter(r => r.completedAt >= thirtyDaysAgo)
  }

  function saveRecords() {
    if (window.electronAPI) {
      const data = JSON.parse(JSON.stringify(records.value))
      window.electronAPI.store.set('records', data)
    }
  }

  function saveLifetimeStats() {
    if (window.electronAPI) {
      window.electronAPI.store.set('lifetimeStats', JSON.parse(JSON.stringify(lifetimeStats.value)))
    }
  }

  function saveYearStats() {
    if (window.electronAPI) {
      window.electronAPI.store.set('yearStats', JSON.parse(JSON.stringify(yearStats.value)))
    }
  }

  async function loadRecords() {
    if (window.electronAPI) {
      const [savedRecords, savedLifetime, savedYear] = await Promise.all([
        window.electronAPI.store.get('records') as Promise<PomodoroRecord[] | undefined>,
        window.electronAPI.store.get('lifetimeStats') as Promise<LifetimeStats | undefined>,
        window.electronAPI.store.get('yearStats') as Promise<Record<number, YearStat> | undefined>
      ])

      if (savedRecords && Array.isArray(savedRecords)) {
        records.value = savedRecords
        cleanupOldRecords()
        updateCounts()
      }

      // 始终确保 lifetimeStats 有有效值
      lifetimeStats.value = {
        totalCount: (savedLifetime && savedLifetime.totalCount) || 0,
        totalSeconds: (savedLifetime && savedLifetime.totalSeconds) || 0
      }
      if (savedYear && typeof savedYear === 'object') {
        yearStats.value = savedYear
      } else {
        yearStats.value = {}
      }
    }
  }

  // 临时测试用：注入昨天的 focus 记录（5 分钟/个，5 个）
  async function injectYesterdayData() {
    if (!window.electronAPI) return
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(10, 0, 0, 0)
    const startTime = yesterday.getTime()
    // 3 个关联 ftask1，2 个关联 ftask2；每个 5 分钟（300 秒）
    const fakeRecords = [
      { id: 'fake1', taskId: 'ftask1', type: 'focus' as const, duration: 300, completedAt: startTime },
      { id: 'fake2', taskId: 'ftask1', type: 'focus' as const, duration: 300, completedAt: startTime + 5*60*1000 },
      { id: 'fake3', taskId: 'ftask1', type: 'focus' as const, duration: 300, completedAt: startTime + 10*60*1000 },
      { id: 'fake4', taskId: 'ftask2', type: 'focus' as const, duration: 300, completedAt: startTime + 15*60*1000 },
      { id: 'fake5', taskId: 'ftask2', type: 'focus' as const, duration: 300, completedAt: startTime + 20*60*1000 }
    ]
    const existing = (await window.electronAPI.store.get('records') as PomodoroRecord[] | undefined) || []
    const existingIds = new Set(existing.map(r => r.id))
    const merged = [...fakeRecords.filter(r => !existingIds.has(r.id)), ...existing]
    await window.electronAPI.store.set('records', merged)
    records.value = merged

    // 累加 lifetimeStats/yearStats（按 records.duration）
    for (const r of fakeRecords.filter(r => !existingIds.has(r.id))) {
      if (r.type === 'focus') {
        lifetimeStats.value.totalCount += 1
        lifetimeStats.value.totalSeconds += r.duration
        const year = new Date(r.completedAt).getFullYear()
        if (!yearStats.value[year]) yearStats.value[year] = { count: 0, seconds: 0 }
        yearStats.value[year].count += 1
        yearStats.value[year].seconds += r.duration
      }
    }
    await window.electronAPI.store.set('lifetimeStats', JSON.parse(JSON.stringify(lifetimeStats.value)))
    await window.electronAPI.store.set('yearStats', JSON.parse(JSON.stringify(yearStats.value)))

    updateCounts()
    console.log(`[Test] 已注入 ${fakeRecords.length} 条昨天的 focus 记录（5 分钟/个，共 25 分钟）`)
  }

  // 临时测试用：注入历史任务
  async function injectHistoryTasks() {
    if (!window.electronAPI) return
    const { useTaskStore } = await import('./task')
    const taskStore = useTaskStore()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(10, 0, 0, 0)
    const dayBefore = new Date()
    dayBefore.setDate(dayBefore.getDate() - 2)
    dayBefore.setHours(15, 0, 0, 0)

    const fakeTasks = [
      { id: 'ftask1', name: '青椒炒', completedPomodoros: 3, createdAt: yesterday.getTime(), completedAt: yesterday.getTime() + 3600000, isCompleted: true, archivedAt: 0 },
      { id: 'ftask2', name: '番茄TODO', completedPomodoros: 2, createdAt: yesterday.getTime() + 7200000, completedAt: yesterday.getTime() + 10800000, isCompleted: true, archivedAt: 0 },
      { id: 'ftask3', name: '温江', completedPomodoros: 0, createdAt: yesterday.getTime() + 14400000, completedAt: 0, isCompleted: false, archivedAt: 0 },
      { id: 'ftask4', name: '青椒', completedPomodoros: 0, createdAt: dayBefore.getTime(), completedAt: 0, isCompleted: false, archivedAt: 0 }
    ]
    const existing = (await window.electronAPI.store.get('tasks') as any[] | undefined) || []
    const existingIds = new Set(existing.map(t => t.id))
    const merged = [...fakeTasks.filter(t => !existingIds.has(t.id)), ...existing]
    await window.electronAPI.store.set('tasks', merged)
    taskStore.tasks = merged
    console.log(`[Test] 已注入 ${fakeTasks.length} 条历史任务`)
  }

  return {
    records,
    todayCount,
    weekCount,
    lifetimeStats,
    yearStats,
    addRecord,
    removeRecordsByTaskId,
    saveRecords,
    loadRecords,
    injectYesterdayData,
    injectHistoryTasks
  }
})
