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

onMounted(async () => {
  await Promise.all([
    settingsStore.loadSettings(),
    taskStore.loadTasks(),
    statsStore.loadRecords()
  ])

  // 应用主题
  document.documentElement.setAttribute('data-theme', settingsStore.settings.theme)

  // 监听主进程通知进入/退出专注模式
  if (window.electronAPI) {
    window.electronAPI.focus.onFocusModeChange((active: boolean) => {
      timerStore.setFocusModeActive(active)
    })
  }
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
    statsStore.addRecord({
      taskId: '',
      type: 'focus',
      duration: settingsStore.settings.focusDuration * 60,
      completedAt: Date.now()
    })
  }
})

// 发送计时器状态更新到主进程
watch([() => timerStore.timeLeft, () => timerStore.mode, () => timerStore.justCompleted, () => timerStore.currentDuration], () => {
  if (window.electronAPI) {
    window.electronAPI.focus.sendState({
      timeLeft: timerStore.timeLeft,
      mode: timerStore.mode,
      isRunning: timerStore.isRunning,
      justCompleted: timerStore.justCompleted,
      total: timerStore.currentDuration
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
  }
})

// 窗口控制
function minimizeWindow() {
  if (window.electronAPI) {
    window.electronAPI.window.minimize()
  }
}

function closeWindow() {
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
        <SettingsPanel />
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

    <main>
      <TimerDisplay />
      <ModeSelector />
      <TimerControls />
      <StatsDisplay />
      <TaskList />
    </main>
  </div>
</template>

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
  --bg-card: rgba(45, 37, 34, 0.8);
  --text-primary: #f5f0e8;
  --text-secondary: #a89f97;
  --text-muted: #6d6560;
  --border-color: rgba(168, 159, 151, 0.15);
  --shadow: rgba(0, 0, 0, 0.4);

  /* Blobs */
  --blob1-color: rgba(231, 76, 60, 0.15);
  --blob2-color: rgba(52, 152, 219, 0.08);
}

[data-theme="light"] {
  --bg-primary: #faf8f5;
  --bg-secondary: #ffffff;
  --bg-card: rgba(255, 255, 255, 0.95);
  --text-primary: #2d2420;
  --text-secondary: #6d5f57;
  --text-muted: #a89f97;
  --border-color: rgba(45, 36, 32, 0.12);
  --shadow: rgba(45, 36, 32, 0.15);
  --blob1-color: rgba(231, 76, 60, 0.12);
  --blob2-color: rgba(52, 152, 219, 0.08);
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
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  background: var(--bg-primary);
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
  max-width: 420px;
  margin: 0 auto;
  padding: 0 24px 40px;
  position: relative;
  z-index: 10;
}

/* 自定义滚动条 - 纤细现代风格 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
  margin: 8px 0;
}

::-webkit-scrollbar-thumb {
  background: rgba(231, 76, 60, 0.3);
  border-radius: 3px;
  transition: all 0.2s ease;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(231, 76, 60, 0.5);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:active {
  background: rgba(231, 76, 60, 0.7);
  border-radius: 3px;
}

::-webkit-scrollbar-corner {
  background: transparent;
}

/* Firefox 滚动条 */
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(231, 76, 60, 0.3) transparent;
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
