import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Settings } from '@/types'

const defaultSettings: Settings = {
  focusDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  longBreakInterval: 4,
  dailyGoal: 8,
  soundEnabled: true,
  notificationEnabled: true,
  soundPath: '',
  theme: 'dark'
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>({ ...defaultSettings })

  function updateSettings(updates: Partial<Settings>) {
    Object.assign(settings.value, updates)
    saveSettings()
  }

  function resetSettings() {
    settings.value = { ...defaultSettings }
    saveSettings()
  }

  function saveSettings() {
    if (window.electronAPI) {
      // 深拷贝确保只发送可序列化的数据
      const data = JSON.parse(JSON.stringify(settings.value))
      window.electronAPI.store.set('settings', data)
    }
  }

  async function loadSettings() {
    if (window.electronAPI) {
      const saved = await window.electronAPI.store.get('settings') as Settings | undefined
      if (saved) {
        settings.value = { ...defaultSettings, ...saved }
      }
    }
  }

  return {
    settings,
    updateSettings,
    resetSettings,
    saveSettings,
    loadSettings
  }
})
