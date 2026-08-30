import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PomodoroRecord } from '@/types'
import { generateId } from '@/utils'

const ONE_DAY = 24 * 60 * 60 * 1000

// [P1-4 修复] records 明细保留期：30 天 → 365 天
// 用户在意数据完整性：明细保留满一年，与热力图月份导航匹配，历史月份不空。
// 取舍：electron-store JSON 变大、saveRecords 全量写入更慢 —— 用户确认接受此代价。
const RECORD_RETENTION_DAYS = 365

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
    // [P3-15 修复] 删除 addRecord 内的 cleanupOldRecords()：
    // 之前每次完成一个番茄都全量 filter records（O(n)），连续多番茄时重复过滤。
    // 移到 loadRecords() 一次性清理（启动时清理一次足矣），语义正确——完成番茄时不应清理数据。
    saveRecords()
    saveLifetimeStats()
    saveYearStats()
  }

  /**
   * 删除任务时同步清理该任务的所有 records 和统计
   * 按 taskId 找出所有 focus records，删除并减少 lifetimeStats/yearStats
   */
  async function removeRecordsByTaskId(taskId: string) {
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

    // [P1-8 修复] 删除任务删了 focus records，连胜可能偏大，用剩余 records 重算写回 streakData
    // 动态 import 避免 stats ↔ timer 静态循环依赖（timer.ts 顶层已 import stats）
    // 调用方 deleteTask 是同步函数不 await 这里，内部必须吞掉异常避免未处理 rejection
    try {
      const { useTimerStore } = await import('./timer')
      useTimerStore().recomputeStreakFromRecords()
    } catch (e) {
      console.error('[Stats] 重算连胜失败:', e)
    }
  }

  function cleanupOldRecords() {
    const cutoff = Date.now() - RECORD_RETENTION_DAYS * ONE_DAY
    const removed = records.value.length - records.value.filter(r => r.completedAt >= cutoff).length
    records.value = records.value.filter(r => r.completedAt >= cutoff)
    if (removed > 0) {
      console.log(`[Stats] 清理 ${removed} 条超过 ${RECORD_RETENTION_DAYS} 天的 records（保留期已从 30 天延长）`)
    }
  }

  function saveRecords() {
    if (window.electronAPI) {
      const data = JSON.parse(JSON.stringify(records.value))
      window.electronAPI.store.set('records', data).catch((e: unknown) => {
        // [P0-3 修复] 记录持久化失败必须可见
        console.error('[Stats] 保存 records 失败:', e)
      })
    }
  }

  function saveLifetimeStats() {
    if (window.electronAPI) {
      window.electronAPI.store.set('lifetimeStats', JSON.parse(JSON.stringify(lifetimeStats.value))).catch((e: unknown) => {
        // [P0-3 修复] 累计统计持久化失败必须可见
        console.error('[Stats] 保存 lifetimeStats 失败:', e)
      })
    }
  }

  function saveYearStats() {
    if (window.electronAPI) {
      window.electronAPI.store.set('yearStats', JSON.parse(JSON.stringify(yearStats.value))).catch((e: unknown) => {
        // [P0-3 修复] 年度统计持久化失败必须可见
        console.error('[Stats] 保存 yearStats 失败:', e)
      })
    }
  }

  // [P4-导出导入 修复] 导入端写回累计统计并落盘（避免 lifetimeStats 只在内存改、磁盘残留旧值）
  function setLifetimeStats(stats: LifetimeStats) {
    lifetimeStats.value = { ...stats }
    saveLifetimeStats()
  }

  // [P4-导出导入 修复] 导入端写回年度统计并落盘
  function setYearStats(stats: Record<number, YearStat>) {
    yearStats.value = JSON.parse(JSON.stringify(stats))
    saveYearStats()
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
        const beforeLen = records.value.length
        cleanupOldRecords()
        updateCounts()
        // [P1-4 修复] 清理超期 records 后必须落盘，否则 electron-store 残留已清理数据，
        // 下次启动又会读回（验收时发现的内存/磁盘不一致）。
        if (records.value.length !== beforeLen) {
          saveRecords()
        }
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
    setLifetimeStats,
    setYearStats,
    injectYesterdayData,
    injectHistoryTasks
  }
})
