import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { TimerMode } from '@/types'
import { useSettingsStore } from './settings'
import { useTaskStore } from './task'
import { useStatsStore } from './stats'
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
  // [P2-11 修复] 自定义音频是否正在播放（驱动停止音频按钮显隐）
  const isAudioPlaying = ref(false)

  let timerInterval: ReturnType<typeof setInterval> | null = null
  // [P1-5 修复] 计时基准时间戳：Date.now() - (duration - timeLeft) * 1000
  // 计时改为基于时间戳差值计算剩余秒数，避免 1000ms setInterval + IPC 耗时累计漂移
  let timerStartBaseMs = 0

  // [P2-11 修复] 音频自然播放结束（自定义文件）→ 停止音频按钮自动隐藏
  if (window.electronAPI?.audio?.onEnd) {
    window.electronAPI.audio.onEnd(() => {
      isAudioPlaying.value = false
      console.log('[Timer] 音频播放结束，隐藏停止音频按钮')
    })
  }

  // [P0-2 修复] 从 records 回溯计算"连续有专注记录的天数（含今天）"
  // 仅用于老数据迁移：streakData 为空但 records 有历史时，一次性初始化连胜。
  // 之后连胜一律以 streakData 为准（永久存储，跨月正确，不受 records 30 天清理影响）。
  function computeStreakFromRecords(): { streak: number; hasToday: boolean } {
    const statsStore = useStatsStore()
    const records = statsStore.records.filter(r => r.type === 'focus')
    if (records.length === 0) return { streak: 0, hasToday: false }
    const days = new Set<number>()
    records.forEach(r => {
      const d = new Date(r.completedAt)
      d.setHours(0, 0, 0, 0)
      days.add(d.getTime())
    })
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayTs = today.getTime()
    const hasToday = days.has(todayTs)
    let check = hasToday ? todayTs : todayTs - 86400000
    let streak = 0
    while (days.has(check)) {
      streak++
      check -= 86400000
    }
    return { streak, hasToday }
  }

  // 加载连胜数据
  async function loadStreakData() {
    console.log('[Timer] 开始加载连胜数据')
    if (window.electronAPI) {
      try {
        const data = await window.electronAPI.store.get('streakData') as { streakCount: number; lastCompletionDate: string } | undefined
        console.log('[Timer] 原始数据:', data)
        const today = new Date().toDateString()
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayStr = yesterday.toDateString()
        if (data && data.lastCompletionDate) {
          // [P0-2 修复] 连胜按"天"计，跨天延续：
          // 今天已做过 / 昨天做过（今天待续）→ 保持连胜；更早 → 已断更清零
          if (data.lastCompletionDate === today || data.lastCompletionDate === yesterdayStr) {
            streakCount.value = data.streakCount || 0
            lastCompletionDate.value = data.lastCompletionDate
            console.log('[Timer] 连胜延续:', streakCount.value)
          } else {
            streakCount.value = 0
            lastCompletionDate.value = ''
            console.log('[Timer] 已断更，连胜清零')
          }
        } else {
          // [P0-2 修复] 老数据迁移：streakData 为空但 records 有历史 → 一次性初始化
          // 之后以 streakData 为准，records 仅用于这次迁移
          const { streak, hasToday } = computeStreakFromRecords()
          if (streak > 0) {
            streakCount.value = streak
            lastCompletionDate.value = hasToday ? today : yesterdayStr
            console.log('[Timer] 从 records 初始化连胜:', streakCount.value)
            saveStreakData()
          } else {
            console.log('[Timer] 没有保存的连胜数据')
          }
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
      }).catch((e: unknown) => {
        // [P0-3 修复] 连胜是用户激励核心数据，写入失败必须可见
        console.error('[Timer] 保存连胜数据失败:', e)
      })
    }
  }

  // [P1-8 修复] 删除任务（连带 focus records）后用剩余 records 重算连胜并写回 streakData
  // 调用方：stats store 的 removeRecordsByTaskId（动态 import 避免循环依赖）
  // 语义与 loadStreakData 一致：今天有记录 → lastCompletionDate=today；否则昨天有 → 昨天
  function recomputeStreakFromRecords(): void {
    const { streak, hasToday } = computeStreakFromRecords()
    const today = new Date().toDateString()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toDateString()
    if (streak > 0) {
      streakCount.value = streak
      lastCompletionDate.value = hasToday ? today : yesterdayStr
      console.log('[Timer] 从 records 重算连胜:', streakCount.value)
    } else {
      streakCount.value = 0
      lastCompletionDate.value = ''
      console.log('[Timer] 重算连胜: records 无 focus 记录，连胜清零')
    }
    saveStreakData()
  }

  // 监听专注模式变化
  watch(focusModeActive, () => {
    // 不再自动停止计时器，让主窗口和小窗口同时运行
  })

  // 监听专注时长变化,只在 duration 字段变化时重置 timeLeft
  // 之前用 deep watch 整个 settings 对象会导致任何字段(包括 theme / loadSettings 整体替换引用)误触
  // 必须用 multi-source array (不是单 getter 返回 array) — 后者 Vue 3 永远 Object.is 不等,每次都触发
  watch(
    [
      () => settingsStore.settings.focusDuration,
      () => settingsStore.settings.shortBreakDuration,
      () => settingsStore.settings.longBreakDuration
    ],
    () => {
      console.log(`[DEBUG_SETTINGS] duration changed, isRunning=${isRunning.value} currentDuration=${currentDuration.value}`)
      if (!isRunning.value) {
        console.log(`[DEBUG_SETTINGS] RESET timeLeft ${timeLeft.value} → ${currentDuration.value}`)
        timeLeft.value = currentDuration.value
      }
      // 改专注时长后主动通知主进程
      emitStateChange()
    }
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
      // [P2-11 修复] 先置 true 再 await：audio.play 内部先 taskkill 清理残留再 spawn，
      // Promise 可能延迟 resolve（几百 ms）。若等 await 回来才置 true，按钮出现有延迟、
      // 且可能被先到达的 audio:ended 竞态覆盖。提前置 true = 播放意图即显示，失败/播完再复位。
      isAudioPlaying.value = true
      try {
        const success = await window.electronAPI.audio.play(soundPath)
        if (!success) {
          isAudioPlaying.value = false
          playDefaultBeep()
        }
      } catch (e) {
        console.warn('Failed to play audio:', e)
        isAudioPlaying.value = false
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

  // [P2-11 修复] 停止自定义音频（TimerControls 停止按钮调用）
  async function stopAudio() {
    if (window.electronAPI) {
      await window.electronAPI.audio.stop()
    }
    isAudioPlaying.value = false
    console.log('[Timer] 用户停止音频，隐藏停止音频按钮')
  }

  function getNextMode(): TimerMode {
    if (mode.value === 'focus') {
      return pomodoroCount.value % settingsStore.settings.longBreakInterval === 0
        ? 'longBreak'
        : 'shortBreak'
    }
    return 'focus'
  }

  // 判断是否运行在 FocusWindow 渲染进程
  // FocusWindow 加载的是同一个 index.html → App.vue 的 script setup 也会跑
  // → useTimerStore() 在 FocusWindow 进程里也被实例化 → 这里的 watch / emitStateChange
  // 会和主窗口"对冲",把 sharedTimerState 反向覆盖回 currentDuration,造成 timeLeft 跳回。
  // 修复:FocusWindow 进程里 timer store 是只读的被动状态,不发 IPC、不重置 timeLeft。
  const isFocusWindowProcess = typeof window !== 'undefined' && window.location.hash === '#/focus'

  // 手动同步状态到主进程（替代 App.vue:203 的自动 watcher,根除误触）
  function emitStateChange() {
    if (!window.electronAPI) return
    if (isFocusWindowProcess) return  // FocusWindow 不是权威源,不发 sendState/tray 更新
    const taskName = getCurrentTaskName()
    window.electronAPI.focus.sendState({
      timeLeft: timeLeft.value,
      mode: mode.value,
      isRunning: isRunning.value,
      justCompleted: justCompleted.value,
      total: currentDuration.value,
      currentTaskName: taskName,
      currentTaskIds: [...currentTaskIds.value]
    })
    window.electronAPI.tray.updateState({
      timeLeft: timeLeft.value,
      isRunning: isRunning.value
    })
  }

  // 从 App.vue 搬过来,timer store 直接发 IPC 不再依赖 App.vue
  function getCurrentTaskName(): string {
    const ids = currentTaskIds.value
    if (!ids.length) return ''
    const taskStore = useTaskStore()
    const task = taskStore.tasks.find(t => t.id === ids[0])
    return task?.name || ''
  }

  // [P1-5 修复] 统一计时轮询：基于 Date.now() 差值算剩余秒数，200ms 轮询，误差 ≤200ms
  // 取代原 1000ms setInterval + timeLeft--（每次回调间隔 = 1000ms + 执行耗时，误差随 tick 线性累计）
  // pause/resume 自然正确：每次启动都基于当前 timeLeft 重算基准时间戳
  function startTicking() {
    if (timerInterval) return  // 安全防止重复启动
    const duration = currentDuration.value
    timerStartBaseMs = Date.now() - (duration - timeLeft.value) * 1000
    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - timerStartBaseMs) / 1000)
      const remain = Math.max(0, duration - elapsed)
      if (timeLeft.value !== remain) {
        timeLeft.value = remain
        emitStateChange()
      }
      if (remain <= 0 && timeLeft.value === 0) {
        complete()
      }
    }, 200)
    emitStateChange()
  }

  function start() {
    if (isRunning.value) return
    isRunning.value = true
    startTicking()
  }

  function pause() {
    isRunning.value = false
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
    emitStateChange()
  }

  function reset() {
    pause()
    timeLeft.value = currentDuration.value
    emitStateChange()
  }

  function complete() {
    console.log('complete() called, timeLeft:', timeLeft.value, 'mode:', mode.value)
    pause()
    justCompleted.value = true
    // [P0-1 修复] justCompleted=true 后立即补发一次状态
    // 主窗口的 Celebration/TimerDisplay 走 Vue 响应式 watch，能看到同步 tick 内的 true；
    // 但专注窗口依赖 IPC (focus:stateUpdate)，只能收到 emitStateChange() 的最终值。
    // 若等到 switchToNextMode() 之后才发，发出去的是 false，专注窗口完成动画永不触发。
    emitStateChange()
    if (mode.value === 'focus') {
      pomodoroCount.value++

      // [P0-2 修复] 更新连胜计数（按"天"计）：
      // - 同一自然日多次完成 → 连胜天数不变（只算 1 天）
      // - 昨天完成过（今天续上）→ 连胜 +1
      // - 更早或首次 → 连胜从 1 重新开始
      const today = new Date().toDateString()
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = yesterday.toDateString()
      console.log('[Timer] 日期比较: lastCompletionDate=', lastCompletionDate.value, 'today=', today, 'yesterday=', yesterdayStr)
      if (lastCompletionDate.value === today) {
        console.log('[Timer] 今天已完成过，连胜保持:', streakCount.value)
      } else if (lastCompletionDate.value === yesterdayStr) {
        streakCount.value++
        lastCompletionDate.value = today
        console.log('[Timer] 昨天延续，连胜+1:', streakCount.value)
      } else {
        streakCount.value = 1
        lastCompletionDate.value = today
        console.log('[Timer] 新连胜开始:', streakCount.value)
      }
      saveStreakData()
    } else if (mode.value === 'longBreak') {
      // 长休息完成后重置番茄计数
      pomodoroCount.value = 0
    }
    playSound()
    showNotification()

    // 切换到前台显示动画
    // [P0-1 修复] 专注模式激活（专注窗口打开中）时不强制切回主窗口：
    // 否则计时完成瞬间 bringToFront() 会关闭专注窗口（main.ts window:bringToFront handler 会 focusWindow.close()），
    // 专注窗口的完成动画永远来不及显示。
    // 改为让专注窗口保持打开展示完成动画，用户用快捷键/左上关闭按钮自行返回。
    if (!focusModeActive.value && window.electronAPI) {
      window.electronAPI.window.bringToFront()
    }

    switchToNextMode()
    justCompleted.value = false
    emitStateChange()
    console.log('after complete, mode:', mode.value, 'timeLeft:', timeLeft.value)
  }

  function skip() {
    pause()
    switchToNextMode()
    emitStateChange()
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
    emitStateChange()
  }

  function toggleCurrentTask(taskId: string) {
    const index = currentTaskIds.value.indexOf(taskId)
    if (index !== -1) {
      currentTaskIds.value.splice(index, 1)
      console.log('[Timer] 任务移出选中:', taskId)
    } else {
      currentTaskIds.value.push(taskId)
      console.log('[Timer] 任务加入选中:', taskId)
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
    isAudioPlaying,
    stopAudio,
    playSound,
    formattedTime,
    currentDuration,
    loadStreakData,
    recomputeStreakFromRecords,
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
      console.log(`[Timer] setFocusModeActive(${val}), 之前 isRunning=${isRunning.value}, timerInterval=${timerInterval ? 'set' : 'null'}`)
      focusModeActive.value = val
      // 退出专注模式时，如果之前正在运行，恢复本地计时器
      if (!val && isRunning.value && !timerInterval) {
        console.log(`[Timer] setFocusModeActive(false) 重新启动计时`)
        startTicking()
      }
    }
  }
})
