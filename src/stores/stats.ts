import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PomodoroRecord } from '@/types'
import { generateId } from '@/utils'

const ONE_DAY = 24 * 60 * 60 * 1000

export const useStatsStore = defineStore('stats', () => {
  const records = ref<PomodoroRecord[]>([])
  const todayCount = ref(0)
  const weekCount = ref(0)

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
    updateCounts()
    cleanupOldRecords()
    saveRecords()
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

  async function loadRecords() {
    if (window.electronAPI) {
      const saved = await window.electronAPI.store.get('records') as PomodoroRecord[] | undefined
      if (saved && Array.isArray(saved)) {
        records.value = saved
        cleanupOldRecords()
        updateCounts()
      }
    }
  }

  return {
    records,
    todayCount,
    weekCount,
    addRecord,
    saveRecords,
    loadRecords
  }
})
