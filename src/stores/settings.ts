import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Settings } from '@/types'

const defaultSettings: Settings = {
  focusDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  longBreakInterval: 4,
  dailyGoal: 8,
  dailyHourGoal: 4,
  soundEnabled: true,
  notificationEnabled: true,
  soundType: 'bell',
  soundPath: '',
  theme: 'dark',
  closeBehavior: 'tray'
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>({ ...defaultSettings })

  async function updateSettings(updates: Partial<Settings>) {
    Object.assign(settings.value, updates)
    await saveSettings()
  }

  async function resetSettings() {
    settings.value = { ...defaultSettings }
    await saveSettings()
  }

  async function saveSettings() {
    if (window.electronAPI) {
      // 深拷贝确保只发送可序列化的数据
      const data = JSON.parse(JSON.stringify(settings.value))
      await window.electronAPI.store.set('settings', data)
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
