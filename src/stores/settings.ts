import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Settings, SoundType } from '@/types'

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
  closeBehavior: 'tray',
  shortcuts: {
    toggleFullscreen: 'Alt+F',
    toggleCompact: 'Alt+M'
  }
}

const SOUND_TYPES: SoundType[] = ['bell', 'forest', 'ding', 'tick', 'custom']

// [P1-6 修复] settings 加载/合并时的逐字段类型校验与兜底
// 防止用户手改 data/settings.json 或旧版本遗留脏数据（如 focusDuration: "abc"、theme: "blue"）
// 导致计时器 NaN 崩溃。任何字段非法时回退到默认值，而非整体丢弃。
function sanitizeSettings(saved: Partial<Settings>): Settings {
  return {
    focusDuration: typeof saved.focusDuration === 'number' && saved.focusDuration > 0 ? saved.focusDuration : defaultSettings.focusDuration,
    shortBreakDuration: typeof saved.shortBreakDuration === 'number' && saved.shortBreakDuration > 0 ? saved.shortBreakDuration : defaultSettings.shortBreakDuration,
    longBreakDuration: typeof saved.longBreakDuration === 'number' && saved.longBreakDuration > 0 ? saved.longBreakDuration : defaultSettings.longBreakDuration,
    longBreakInterval: typeof saved.longBreakInterval === 'number' && saved.longBreakInterval > 0 ? saved.longBreakInterval : defaultSettings.longBreakInterval,
    dailyGoal: typeof saved.dailyGoal === 'number' && saved.dailyGoal >= 0 ? saved.dailyGoal : defaultSettings.dailyGoal,
    dailyHourGoal: typeof saved.dailyHourGoal === 'number' && saved.dailyHourGoal >= 0 ? saved.dailyHourGoal : defaultSettings.dailyHourGoal,
    soundEnabled: typeof saved.soundEnabled === 'boolean' ? saved.soundEnabled : defaultSettings.soundEnabled,
    notificationEnabled: typeof saved.notificationEnabled === 'boolean' ? saved.notificationEnabled : defaultSettings.notificationEnabled,
    soundType: SOUND_TYPES.includes(saved.soundType as SoundType) ? saved.soundType! : defaultSettings.soundType,
    soundPath: typeof saved.soundPath === 'string' ? saved.soundPath : defaultSettings.soundPath,
    theme: saved.theme === 'dark' || saved.theme === 'light' ? saved.theme : defaultSettings.theme,
    closeBehavior: saved.closeBehavior === 'tray' || saved.closeBehavior === 'quit' ? saved.closeBehavior : defaultSettings.closeBehavior,
    shortcuts: saved.shortcuts && typeof saved.shortcuts === 'object' && typeof saved.shortcuts.toggleFullscreen === 'string' && typeof saved.shortcuts.toggleCompact === 'string'
      ? { toggleFullscreen: saved.shortcuts.toggleFullscreen, toggleCompact: saved.shortcuts.toggleCompact }
      : defaultSettings.shortcuts
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>({ ...defaultSettings })

  async function updateSettings(updates: Partial<Settings>) {
    Object.assign(settings.value, updates)
    await saveSettings()
  }

  async function resetSettings() {
    // 深拷贝 defaultSettings: 防止 defaultSettings 是单例被外部 mutate 后污染
    // (SettingsPanel 之前浅拷贝 open 导致 shortcuts 字段被用户改过,reset 复制回去还是脏的)
    settings.value = structuredClone(defaultSettings)
    await saveSettings()
  }

  async function saveSettings() {
    if (window.electronAPI) {
      // 深拷贝确保只发送可序列化的数据
      const data = JSON.parse(JSON.stringify(settings.value))
      await window.electronAPI.store.set('settings', data).catch((e: unknown) => {
        // [P0-3 修复] 设置持久化失败必须可见（调用方 try/catch 才知道没保存成功）
        console.error('[Settings] 保存设置失败:', e)
        throw e
      })
    }
  }

  async function loadSettings() {
    if (window.electronAPI) {
      const saved = await window.electronAPI.store.get('settings') as Settings | undefined
      if (saved && typeof saved === 'object') {
        settings.value = sanitizeSettings(saved)
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
