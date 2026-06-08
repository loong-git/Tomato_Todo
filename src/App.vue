<script setup lang="ts">
import { ref, onMounted, watch, computed, onUnmounted } from 'vue'
import { useTimerStore, useTaskStore, useSettingsStore, useStatsStore } from '@/stores'
import TimerDisplay from '@/components/TimerDisplay.vue'
import TimerControls from '@/components/TimerControls.vue'
import ModeSelector from '@/components/ModeSelector.vue'
import TaskList from '@/components/TaskList.vue'
import StatsDisplay from '@/components/StatsDisplay.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import FocusWindow from '@/components/FocusWindow.vue'
import CelebrationOverlay from '@/components/CelebrationOverlay.vue'
import DataManager from '@/components/DataManager.vue'

const timerStore = useTimerStore()
const taskStore = useTaskStore()
const settingsStore = useSettingsStore()
const statsStore = useStatsStore()

const settingsRef = ref<InstanceType<typeof SettingsPanel>>()

const isFocusMode = computed(() => window.location.hash === '#/focus')

// 主题切换
const isDark = computed({
  get: () => settingsStore.settings.theme === 'dark',
  set: (val) => {
    settingsStore.updateSettings({ theme: val ? 'dark' : 'light' })
  }
})

// 键盘快捷键处理
function handleKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName
  const isInputField = tag === 'INPUT' || tag === 'TEXTAREA'

  console.log('[键盘事件] key:', e.key, 'target:', tag)

  // 输入框中只响应 Escape
  if (isInputField) {
    if (e.key === 'Escape') {
      console.log('[键盘事件] 输入框中按 Escape')
      ;(e.target as HTMLInputElement).blur()
    }
    return
  }

  switch (e.key) {
    case ' ':
      e.preventDefault()
      console.log('[键盘事件] Space - 切换计时器')
      timerStore.isRunning ? timerStore.pause() : timerStore.start()
      break
    case 'r':
    case 'R':
      console.log('[键盘事件] R - 重置计时器')
      timerStore.reset()
      break
    case 's':
    case 'S':
      console.log('[键盘事件] S - 打开设置')
      settingsRef.value?.open()
      break
    case 'n':
    case 'N':
      console.log('[键盘事件] N - 聚焦任务输入框')
      document.querySelector<HTMLInputElement>('.task-input')?.focus()
      break
    case '1':
      console.log('[键盘事件] 1 - 专注模式')
      timerStore.setMode('focus')
      break
    case '2':
      console.log('[键盘事件] 2 - 短休息')
      timerStore.setMode('shortBreak')
      break
    case '3':
      console.log('[键盘事件] 3 - 长休息')
      timerStore.setMode('longBreak')
      break
    case 'Escape':
      console.log('[键盘事件] Escape - 关闭弹窗')
      settingsRef.value?.close?.()
      break
  }
}

async function injectTestData() {
  await statsStore.injectYesterdayData()
  await statsStore.injectHistoryTasks()
  console.log('[Test] 测试数据已注入')
}

async function clearAllData() {
  if (!confirm('确定要清空所有任务、记录和统计数据吗？此操作不可恢复！')) return

  // 清空内存
  taskStore.tasks = []
  statsStore.records = []
  statsStore.lifetimeStats = { totalCount: 0, totalSeconds: 0 }
  statsStore.yearStats = {}

  // 立即持久化
  if (window.electronAPI) {
    await window.electronAPI.store.set('tasks', [])
    await window.electronAPI.store.set('records', [])
    await window.electronAPI.store.set('lifetimeStats', { totalCount: 0, totalSeconds: 0 })
    await window.electronAPI.store.set('yearStats', {})
  }

  console.log('[Test] 全部数据已清零')
  alert('已清空所有数据，请重新测试')
}

onMounted(async () => {
  // 预热 AudioContext - 避免首次播放音效延迟
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext
    if (AudioContext) {
      const ctx = new AudioContext()
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }
      console.log('[Audio] AudioContext 已预热:', ctx.state)
    }
  } catch (e) {
    console.warn('[Audio] 预热失败:', e)
  }

  // 立即应用主题（同步），不等待数据加载
  document.documentElement.setAttribute('data-theme', settingsStore.settings.theme)

  // 然后并行加载数据
  await Promise.all([
    settingsStore.loadSettings(),
    taskStore.loadTasks(),
    statsStore.loadRecords()
  ])

  // 加载连胜数据
  timerStore.loadStreakData()

  // 确保主题是最新的（可能默认值与保存的值不同）
  document.documentElement.setAttribute('data-theme', settingsStore.settings.theme)

  // 监听主进程通知进入/退出专注模式
  if (window.electronAPI) {
    window.electronAPI.focus.onFocusModeChange((active: boolean) => {
      timerStore.setFocusModeActive(active)
    })
  }

  // 注册键盘快捷键
  window.addEventListener('keydown', handleKeydown)
  console.log('[App] 键盘快捷键已注册')

  // 初始化托盘状态
  if (window.electronAPI) {
    window.electronAPI.tray.updateState({
      timeLeft: timerStore.timeLeft,
      isRunning: timerStore.isRunning
    })
    console.log('[App] 托盘状态已初始化')
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  console.log('[App] 键盘快捷键已移除')
})

// 监听主题变化
watch(() => settingsStore.settings.theme, (newTheme) => {
  document.documentElement.setAttribute('data-theme', newTheme)
})

watch(() => timerStore.pomodoroCount, (newCount, oldCount) => {
  if (newCount > oldCount) {
    if (timerStore.currentTaskIds.length > 0) {
      timerStore.currentTaskIds.forEach(taskId => {
        taskStore.incrementPomodoro(taskId)
      })
    }
    // 记录关联到第一个选中的任务（这样删除任务时能找到 records）
    const taskId = timerStore.currentTaskIds[0] || ''
    statsStore.addRecord({
      taskId,
      type: 'focus',
      duration: settingsStore.settings.focusDuration * 60,
      completedAt: Date.now()
    })
  }
})

// 发送计时器状态更新到主进程
watch([() => timerStore.timeLeft, () => timerStore.mode, () => timerStore.justCompleted, () => timerStore.currentDuration], () => {
  if (window.electronAPI) {
    const now = Date.now()
    console.log(`[主→专注] timeLeft:${timerStore.timeLeft} isRunning:${timerStore.isRunning} [${now}]`)
    window.electronAPI.focus.sendState({
      timeLeft: timerStore.timeLeft,
      mode: timerStore.mode,
      isRunning: timerStore.isRunning,
      justCompleted: timerStore.justCompleted,
      total: timerStore.currentDuration
    })
    // 更新托盘倒计时
    window.electronAPI.tray.updateState({
      timeLeft: timerStore.timeLeft,
      isRunning: timerStore.isRunning
    })
  }
})

// 单独监听 isRunning 变化
watch(() => timerStore.isRunning, (newVal) => {
  if (window.electronAPI) {
    window.electronAPI.focus.sendState({
      timeLeft: timerStore.timeLeft,
      mode: timerStore.mode,
      isRunning: newVal,
      justCompleted: timerStore.justCompleted,
      total: timerStore.currentDuration
    })
    // 更新托盘状态
    window.electronAPI.tray.updateState({
      timeLeft: timerStore.timeLeft,
      isRunning: newVal
    })
  }
})

// 监听托盘切换计时器
if (window.electronAPI) {
  window.electronAPI.tray.onToggleTimer(() => {
    console.log('[App] 收到托盘切换计时器')
    timerStore.isRunning ? timerStore.pause() : timerStore.start()
  })
}

// 滚动时显示滚动条，停止后渐隐
let scrollTimer: ReturnType<typeof setTimeout> | null = null
const isScrolling = ref(false)

function onMainScroll(e: Event) {
  isScrolling.value = true
  const el = e.currentTarget as HTMLElement
  el.classList.add('scrolling')
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    isScrolling.value = false
    el.classList.remove('scrolling')
  }, 800)
}

// 窗口控制
function minimizeWindow() {
  if (window.electronAPI) {
    window.electronAPI.window.minimize()
  }
}

function closeWindow() {
  console.log('[Renderer] 关闭按钮点击')
  if (window.electronAPI) {
    window.electronAPI.window.close()
  }
}
</script>

<template>
  <FocusWindow v-if="isFocusMode" />
  <div v-else class="app" :class="{ 'light-theme': !isDark }">
    <!-- 自定义标题栏 -->
    <header class="title-bar">
      <div class="drag-region">
        <div class="logo">
          <svg viewBox="0 0 32 32" class="tomato-icon">
            <ellipse cx="16" cy="18" rx="12" ry="11" fill="currentColor" opacity="0.9"/>
            <path d="M16 7 C14 4 12 4 11 5 C10 6 10 8 12 9 L16 7 L20 9 C22 8 22 6 21 5 C20 4 18 4 16 7Z" fill="#4a7c59"/>
            <ellipse cx="12" cy="15" rx="3" ry="2" fill="rgba(255,255,255,0.2)"/>
          </svg>
          <span class="title">番茄TODO</span>
        </div>
      </div>
      <div class="window-controls">
        <button class="theme-toggle" @click="isDark = !isDark" :title="isDark ? '切换浅色模式' : '切换深色模式'">
          <svg v-if="isDark" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </button>
        <SettingsPanel ref="settingsRef" />
        <button class="window-btn minimize" @click="minimizeWindow" title="最小化">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button class="window-btn close" @click="closeWindow" title="关闭">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </header>

    <main
      @scroll.passive="onMainScroll"
    >
      <div class="main-content">
        <TimerDisplay />
        <ModeSelector />
        <TimerControls />
        <StatsDisplay />
        <TaskList />
        <DataManager />
      </div>
    </main>
  </div>
  <CelebrationOverlay />

  <!-- 临时测试面板 -->
  <div class="dev-test-panel">
    <button class="dev-btn" @click="injectTestData" title="注入测试数据">📊</button>
    <button class="dev-btn reset-btn" @click="clearAllData" title="清空所有数据" style="background:linear-gradient(135deg,#7f8c8d,#34495e);margin-top:8px;">🗑️</button>
  </div>
</template>

<style scoped>
.dev-test-panel {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9999;
}

.dev-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  color: white;
  border: none;
  font-size: 20px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s ease;
}

.dev-btn:hover {
  transform: scale(1.1);
}
</style>

<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Serif+Display&display=swap');

:root {
  --tomato: #e74c3c;
  --tomato-dark: #c0392b;
  --tomato-light: #ff6b5b;
  --break-color: #3498db;
  --break-long: #9b59b6;

  /* Dark theme (default) */
  --bg-primary: #1a1614;
  --bg-secondary: #2d2522;
  --bg-card: rgba(45, 37, 34, 0.85);
  --text-primary: #faf5f0;
  --text-secondary: #c4bdb5;
  --text-muted: #8a827a;
  --border-color: rgba(168, 159, 151, 0.18);
  --shadow: rgba(0, 0, 0, 0.4);

  /* Blobs */
  --blob1-color: rgba(231, 76, 60, 0.15);
  --blob2-color: rgba(52, 152, 219, 0.08);

  /* Heatmap colors */
  --heatmap-empty: rgba(45, 37, 34, 0.3);
  --heatmap-1: rgba(231, 76, 60, 0.25);
  --heatmap-2: rgba(231, 76, 60, 0.45);
  --heatmap-3: rgba(231, 76, 60, 0.65);
  --heatmap-4: rgba(231, 76, 60, 0.85);
  --heatmap-5: #e74c3c;

  /* Check-in colors */
  --completed-bg: rgba(39, 174, 96, 0.2);
  --completed-color: #2ecc71;

  /* Task list states (dark theme) */
  --task-completed-bg: rgba(45, 37, 34, 0.45);
  --task-expired-bg: rgba(45, 37, 34, 0.5);
}

[data-theme="light"] {
  --bg-primary: #f5f2ef;
  --bg-secondary: #ffffff;
  --bg-card: rgba(255, 255, 255, 0.98);
  --text-primary: #1a1512;
  --text-secondary: #5c524a;
  --text-muted: #9a9088;
  --border-color: rgba(45, 36, 32, 0.1);
  --shadow: rgba(45, 36, 32, 0.1);
  --blob1-color: rgba(231, 76, 60, 0.08);
  --blob2-color: rgba(52, 152, 219, 0.05);

  /* Heatmap colors - lighter for light theme */
  --heatmap-empty: rgba(45, 36, 32, 0.1);
  --heatmap-1: rgba(231, 76, 60, 0.2);
  --heatmap-2: rgba(231, 76, 60, 0.35);
  --heatmap-3: rgba(231, 76, 60, 0.5);
  --heatmap-4: rgba(231, 76, 60, 0.7);
  --heatmap-5: #e74c3c;

  /* Check-in colors - light theme */
  --completed-bg: #f0f9f4;
  --completed-color: #27ae60;

  /* Task list states (light theme) */
  --task-completed-bg: rgba(45, 36, 32, 0.05);
  --task-expired-bg: rgba(231, 76, 60, 0.06);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  transition: background 0.4s ease, color 0.3s ease;
  min-height: 100vh;
  overflow-x: hidden;
}

.app {
  height: 100vh;
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  background: var(--bg-primary);
  user-select: none;
  -webkit-user-select: none;
  display: flex;
  flex-direction: column;
}

/* 自定义标题栏 */
.title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 48px;
  padding: 0 8px 0 16px;
  background: var(--bg-card);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border-color);
  -webkit-app-region: drag;
}

.drag-region {
  flex: 1;
  display: flex;
  align-items: center;
  -webkit-app-region: drag;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  -webkit-app-region: no-drag;
}

.tomato-icon {
  width: 28px;
  height: 28px;
  color: var(--tomato);
  filter: drop-shadow(0 2px 6px rgba(231, 76, 60, 0.3));
}

.title {
  font-family: 'DM Serif Display', serif;
  font-size: 16px;
  color: var(--text-primary);
}

.window-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.theme-toggle,
.window-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.theme-toggle:hover,
.window-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.window-btn.close:hover {
  background: rgba(231, 76, 60, 0.8);
  color: white;
}

/* 装饰性背景 blobs */
.bg-blob {
  position: fixed;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
  z-index: 0;
}

.blob-1 {
  width: 500px;
  height: 500px;
  background: var(--blob1-color);
  top: -150px;
  right: -100px;
  animation: float 20s ease-in-out infinite;
}

.blob-2 {
  width: 400px;
  height: 400px;
  background: var(--blob2-color);
  bottom: -100px;
  left: -150px;
  animation: float 25s ease-in-out infinite reverse;
}

@keyframes float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(20px, -30px) scale(1.05); }
  50% { transform: translate(-10px, 20px) scale(0.95); }
  75% { transform: translate(30px, 10px) scale(1.02); }
}

main {
  width: 100%;
  margin: 0;
  padding: 0;
  position: relative;
  z-index: 10;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  transition: scrollbar-color 0.3s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.main-content {
  width: 100%;
  max-width: 420px;
  padding: 0 24px 40px;
  display: flex;
  flex-direction: column;
}

main:hover,
main:focus-within,
main.scrolling {
  scrollbar-color: rgba(231, 76, 60, 0.4) transparent;
}

main::-webkit-scrollbar {
  width: 6px;
}

main::-webkit-scrollbar-track {
  background: transparent;
  margin: 8px 0;
}

main::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 3px;
  transition: background 0.3s ease;
}

main:hover::-webkit-scrollbar-thumb,
main:focus-within::-webkit-scrollbar-thumb,
main.scrolling::-webkit-scrollbar-thumb {
  background: rgba(231, 76, 60, 0.4);
}

main::-webkit-scrollbar-thumb:hover {
  background: rgba(231, 76, 60, 0.6) !important;
}

main::-webkit-scrollbar-thumb:active {
  background: rgba(231, 76, 60, 0.8) !important;
}

main::-webkit-scrollbar-corner {
  background: transparent;
}

/* Settings modal styles are in SettingsPanel.vue */

.el-button {
  border-radius: 10px !important;
}

.el-input-number {
  --el-input-bg-color: var(--bg-primary);
  --el-input-border-color: var(--border-color);
  --el-input-text-color: var(--text-primary);
}

/* Light theme specific overrides */
.light-theme .title-bar {
  background: rgba(255, 255, 255, 0.9);
}

.light-theme .tomato-icon {
  filter: drop-shadow(0 2px 12px rgba(231, 76, 60, 0.25));
}

.light-theme .theme-toggle:hover,
.light-theme .window-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #2d2420;
}

.light-theme .window-btn.close:hover {
  background: #e74c3c;
  color: white;
}
</style>
