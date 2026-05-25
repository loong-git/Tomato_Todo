import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { TimerMode } from '@/types'
import { useSettingsStore } from './settings'
import { formatDuration } from '@/utils'

export const useTimerStore = defineStore('timer', () => {
  const settingsStore = useSettingsStore()

  const timeLeft = ref(settingsStore.settings.focusDuration * 60)
  const isRunning = ref(false)
  const mode = ref<TimerMode>('focus')
  const pomodoroCount = ref(0)
  const currentTaskIds = ref<string[]>([])
  const justCompleted = ref(false)
  const focusModeActive = ref(false)
  const streakCount = ref(0)
  const lastCompletionDate = ref('')

  let timerInterval: ReturnType<typeof setInterval> | null = null

  // 加载连胜数据
  async function loadStreakData() {
    console.log('[Timer] 开始加载连胜数据')
    if (window.electronAPI) {
      try {
        const data = await window.electronAPI.store.get('streakData') as { streakCount: number; lastCompletionDate: string } | undefined
        console.log('[Timer] 原始数据:', data)
        if (data) {
          const today = new Date().toDateString()
          // 如果是同一天，继续累加
          if (data.lastCompletionDate === today) {
            streakCount.value = data.streakCount || 0
            lastCompletionDate.value = data.lastCompletionDate || ''
            console.log('[Timer] 今日连胜继续:', streakCount.value)
          } else {
            // 新的一天，重置为 0（之后 complete 会 +1）
            streakCount.value = 0
            lastCompletionDate.value = today
            console.log('[Timer] 新的一天，连胜重置')
          }
        } else {
          console.log('[Timer] 没有保存的连胜数据')
        }
      } catch (e) {
        console.error('[Timer] 加载连胜数据失败:', e)
      }
    }
  }

  // 保存连胜数据
  function saveStreakData() {
    console.log('[Timer] 保存连胜数据:', streakCount.value, lastCompletionDate.value)
    if (window.electronAPI) {
      window.electronAPI.store.set('streakData', {
        streakCount: streakCount.value,
        lastCompletionDate: lastCompletionDate.value
      }).then(() => {
        console.log('[Timer] 保存成功')
      })
    }
  }

  // 监听专注模式变化
  watch(focusModeActive, () => {
    // 不再自动停止计时器，让主窗口和小窗口同时运行
  })

  // 监听设置变化，当设置修改时更新剩余时间
  watch(
    () => settingsStore.settings,
    () => {
      if (!isRunning.value) {
        timeLeft.value = currentDuration.value
      }
    },
    { deep: true }
  )

  const formattedTime = computed(() => formatDuration(timeLeft.value))

  const currentDuration = computed(() => {
    switch (mode.value) {
      case 'focus':
        return settingsStore.settings.focusDuration * 60
      case 'shortBreak':
        return settingsStore.settings.shortBreakDuration * 60
      case 'longBreak':
        return settingsStore.settings.longBreakDuration * 60
    }
  })

  async function playSound() {
    if (!settingsStore.settings.soundEnabled) return

    const { soundType, soundPath } = settingsStore.settings

    // 如果有内置音效类型，优先使用
    if (soundType && soundType !== 'custom') {
      const { playPresetSound } = await import('@/utils')
      playPresetSound(soundType)
      return
    }

    // 自定义音频文件
    if (soundPath && window.electronAPI) {
      try {
        const success = await window.electronAPI.audio.play(soundPath)
        if (!success) {
          playDefaultBeep()
        }
      } catch (e) {
        console.warn('Failed to play audio:', e)
        playDefaultBeep()
      }
    } else {
      playDefaultBeep()
    }
  }

  function playDefaultBeep() {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.value = 800
      oscillator.type = 'sine'
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.5)
    } catch (e) {
      console.warn('Audio not supported:', e)
    }
  }

  function showNotification() {
    if (settingsStore.settings.notificationEnabled) {
      if (window.electronAPI) {
        const title = mode.value === 'focus' ? '专注完成!' : '休息结束!'
        const body = mode.value === 'focus' ? '该休息一下了' : '开始下一个番茄吧'
        window.electronAPI.notification.show({ title, body })
      }
    }
  }

  function getNextMode(): TimerMode {
    if (mode.value === 'focus') {
      return pomodoroCount.value % settingsStore.settings.longBreakInterval === 0
        ? 'longBreak'
        : 'shortBreak'
    }
    return 'focus'
  }

  function start() {
    if (isRunning.value) return
    isRunning.value = true
    timerInterval = setInterval(() => {
      if (timeLeft.value > 0) {
        timeLeft.value--
      } else {
        complete()
      }
    }, 1000)
  }

  function pause() {
    isRunning.value = false
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
  }

  function reset() {
    pause()
    timeLeft.value = currentDuration.value
  }

  function complete() {
    console.log('complete() called, timeLeft:', timeLeft.value, 'mode:', mode.value)
    pause()
    justCompleted.value = true
    if (mode.value === 'focus') {
      pomodoroCount.value++

      // 更新连胜计数
      const today = new Date().toDateString()
      console.log('[Timer] 日期比较:', lastCompletionDate.value, '===', today, '结果:', lastCompletionDate.value === today)
      if (lastCompletionDate.value === today) {
        streakCount.value++
        console.log('[Timer] 连胜+1:', streakCount.value)
      } else {
        streakCount.value = 1
        lastCompletionDate.value = today
        console.log('[Timer] 新的一天，连胜重置为 1')
      }
      saveStreakData()
    }
    playSound()
    showNotification()

    // 切换到前台显示动画
    if (window.electronAPI) {
      window.electronAPI.window.bringToFront()
    }

    switchToNextMode()
    console.log('after complete, mode:', mode.value, 'timeLeft:', timeLeft.value)
  }

  function skip() {
    pause()
    switchToNextMode()
  }

  function switchToNextMode() {
    const nextMode = getNextMode()
    mode.value = nextMode
    timeLeft.value = currentDuration.value
  }

  function setMode(newMode: TimerMode) {
    pause()
    mode.value = newMode
    timeLeft.value = currentDuration.value
  }

  function toggleCurrentTask(taskId: string) {
    const index = currentTaskIds.value.indexOf(taskId)
    if (index !== -1) {
      currentTaskIds.value.splice(index, 1)
    } else {
      currentTaskIds.value.push(taskId)
    }
  }

  function resetPomodoroCount() {
    pomodoroCount.value = 0
  }

  return {
    timeLeft,
    isRunning,
    mode,
    pomodoroCount,
    currentTaskIds,
    justCompleted,
    focusModeActive,
    streakCount,
    lastCompletionDate,
    formattedTime,
    currentDuration,
    loadStreakData,
    start,
    pause,
    reset,
    complete,
    skip,
    setMode,
    toggleCurrentTask,
    resetPomodoroCount,
    clearJustCompleted: () => { justCompleted.value = false },
    setFocusModeActive: (val: boolean) => {
      focusModeActive.value = val
      // 退出专注模式时，如果之前正在运行，恢复本地计时器
      if (!val && isRunning.value && !timerInterval) {
        timerInterval = setInterval(() => {
          if (timeLeft.value > 0) {
            timeLeft.value--
          } else {
            complete()
          }
        }, 1000)
      }
    }
  }
})
