import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Task } from '@/types'
import { generateId } from '@/utils'

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<Task[]>([])

  const activeTasks = computed(() => tasks.value.filter(t => !t.isCompleted && !t.archivedAt))
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
    const index = tasks.value.findIndex(t => t.id === id)
    if (index !== -1) {
      tasks.value.splice(index, 1)
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
      tasks.value.splice(tasks.value.indexOf(task), 1)
      debouncedSave()
    }
  }

  async function exportAllData(): Promise<string> {
    const { useSettingsStore } = await import('./settings')
    const { useStatsStore } = await import('./stats')

    const settingsStore = useSettingsStore()
    const statsStore = useStatsStore()

    const data = {
      version: 1,
      exportedAt: Date.now(),
      tasks: JSON.parse(JSON.stringify(tasks.value)),
      records: JSON.parse(JSON.stringify(statsStore.records)),
      settings: JSON.parse(JSON.stringify(settingsStore.settings))
    }
    return JSON.stringify(data, null, 2)
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
    importAllData,
    loadTasks
  }
})
