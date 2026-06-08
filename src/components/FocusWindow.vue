<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'

const timeLeft = ref(25 * 60)
const mode = ref('focus')
const total = ref(25 * 60)
const showComplete = ref(false)
const isRunning = ref(false)
const isDark = ref(true)
const isLastMinute = ref(false)
const isLoaded = ref(false) // 骨架屏状态

const modeColors: Record<string, string> = {
  focus: '#e74c3c',
  shortBreak: '#3498db',
  longBreak: '#9b59b6'
}

// 进度环颜色：最后1分钟根据主题变色
const progressColor = computed(() => {
  if (isLastMinute.value) {
    return isDark.value ? '#f39c12' : '#ff69b4'
  }
  return modeColors[mode.value] || modeColors.focus
})

const progress = computed(() => {
  if (total.value === 0) return 0
  return ((total.value - timeLeft.value) / total.value) * 100
})

// 使用 vmin 作为基准实现等比例缩放
const ringRadius = 42 // vmin
const circumference = 2 * Math.PI * ringRadius
const strokeDashoffset = computed(() => circumference * (1 - progress.value / 100))

const formattedTime = computed(() => {
  const mins = Math.floor(timeLeft.value / 60)
  const secs = timeLeft.value % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
})

async function closeFocus() {
  if (window.electronAPI) {
    await window.electronAPI.focus.close()
  }
}

watch(showComplete, (val) => {
  if (val) {
    setTimeout(() => {
      showComplete.value = false
    }, 2000)
  }
})

onMounted(async () => {
  // 加载主题设置
  if (window.electronAPI) {
    const theme = await window.electronAPI.store.get('settings') as any
    if (theme?.theme) {
      isDark.value = theme.theme === 'dark'
      document.documentElement.setAttribute('data-theme', theme.theme)
    }
  }

  // 监听主题变化
  window.addEventListener('storage', (e) => {
    if (e.key === 'settings') {
      const settings = JSON.parse(e.newValue || '{}')
      if (settings.theme) {
        isDark.value = settings.theme === 'dark'
        document.documentElement.setAttribute('data-theme', settings.theme)
      }
    }
  })

  // 专注窗口不运行自己的timer，完全依赖主窗口通过IPC发送的状态
  if (window.electronAPI) {
    // 先设置监听器
    window.electronAPI.focus.onStateUpdate((data) => {
      timeLeft.value = data.timeLeft
      mode.value = data.mode
      total.value = data.total
      isRunning.value = data.isRunning
      isLastMinute.value = data.timeLeft <= 60 && data.timeLeft > 0

      // 处理完成状态
      if (data.justCompleted) {
        showComplete.value = true
      }
    })

    // 等监听器设置完成后再获取初始状态
    await new Promise(resolve => setTimeout(resolve, 50))

    // 获取初始状态
    const initData = await window.electronAPI.focus.getInitData()
    timeLeft.value = initData.timeLeft
    mode.value = initData.mode
    total.value = initData.total
    isRunning.value = initData.isRunning
    isLastMinute.value = initData.timeLeft <= 60 && initData.timeLeft > 0
    isLoaded.value = true
  }
})
</script>

<template>
  <div class="focus-window" :class="{ 'light-theme': !isDark }">
    <!-- 骨架屏 -->
    <div v-if="!isLoaded" class="skeleton-screen">
      <div class="skeleton-ring"></div>
      <div class="skeleton-time"></div>
      <div class="skeleton-mode"></div>
    </div>

    <!-- 装饰光晕 -->
    <div v-if="isLoaded" class="glow glow-1"></div>
    <div v-if="isLoaded" class="glow glow-2"></div>

    <template v-if="isLoaded">
      <button class="close-btn" @click.stop="closeFocus" title="返回主窗口">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <div class="timer-container">
      <svg class="progress-ring" :class="{ 'last-minute': isLastMinute, 'complete': showComplete }" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <!-- 外圈光晕 -->
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <!-- 背景圆环 -->
        <circle
          class="ring-bg"
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke-width="4"
        />

        <!-- 进度圆环 -->
        <circle
          class="ring-progress"
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke-width="4"
          :stroke="progressColor"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="strokeDashoffset"
          stroke-linecap="round"
          transform="rotate(-90 50 50)"
          filter="url(#glow)"
        />
      </svg>

      <div class="time-display">
        <span class="time" :class="{ 'last-minute': isLastMinute, 'complete': showComplete }">{{ formattedTime }}</span>
        <span class="mode-label">{{ mode === 'focus' ? '专注' : mode === 'shortBreak' ? '短休息' : '长休息' }}</span>
      </div>

      <div v-if="showComplete" class="complete-overlay">
        <div class="complete-content">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke-linecap="round"/>
            <polyline points="22 4 12 14.01 9 11.01" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>倒计时完成</span>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Serif+Display&display=swap');

/* CSS 变量 - 深色主题 */
.focus-window {
  --fg-primary: #f5f0e8;
  --fg-secondary: rgba(255, 255, 255, 0.7);
  --bg-gradient: radial-gradient(ellipse at center, rgba(26, 22, 20, 0.95) 0%, rgba(26, 22, 20, 0.98) 100%);
  --glow1-opacity: 0.15;
  --glow2-opacity: 0.08;
  --ring-bg: rgba(255, 255, 255, 0.08);
  --btn-bg: rgba(255, 255, 255, 0.1);
}

/* 浅色主题覆盖 */
.focus-window.light-theme {
  --fg-primary: #2d2420;
  --fg-secondary: rgba(45, 36, 32, 0.7);
  --bg-gradient: radial-gradient(ellipse at center, rgba(250, 248, 245, 0.98) 0%, rgba(250, 248, 245, 1) 100%);
  --glow1-opacity: 0.12;
  --glow2-opacity: 0.05;
  --ring-bg: rgba(45, 36, 32, 0.1);
  --btn-bg: rgba(45, 36, 32, 0.1);
}

.focus-window {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-gradient);
  position: relative;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
  -webkit-app-region: drag;
}

/* 骨架屏 */
.skeleton-screen {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3vmin;
  z-index: 5;
}

.skeleton-ring {
  width: 80vmin;
  height: 80vmin;
  min-width: 120px;
  min-height: 120px;
  border-radius: 50%;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.03) 0%,
    rgba(255, 255, 255, 0.08) 50%,
    rgba(255, 255, 255, 0.03) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 2s ease-in-out infinite;
  will-change: background-position;
}

.skeleton-time {
  width: 40vmin;
  height: 12vmin;
  min-width: 80px;
  min-height: 30px;
  border-radius: 8px;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.05) 0%,
    rgba(255, 255, 255, 0.1) 50%,
    rgba(255, 255, 255, 0.05) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 2s ease-in-out infinite 0.2s;
  will-change: background-position;
}

.skeleton-mode {
  width: 20vmin;
  height: 4vmin;
  min-width: 50px;
  min-height: 15px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.03) 0%,
    rgba(255, 255, 255, 0.06) 50%,
    rgba(255, 255, 255, 0.03) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 2s ease-in-out infinite 0.4s;
  will-change: background-position;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* 装饰光晕 - 使用 vmin 实现等比例缩放 */
.glow {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  will-change: transform;
}

.glow-1 {
  width: 100vmin;
  height: 100vmin;
  background: radial-gradient(circle, rgba(231, 76, 60, var(--glow1-opacity)) 0%, transparent 60%);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(1);
  animation: pulse 8s ease-in-out infinite;
}

.glow-2 {
  width: 60vmin;
  height: 60vmin;
  background: radial-gradient(circle, rgba(52, 152, 219, var(--glow2-opacity)) 0%, transparent 60%);
  bottom: 5%;
  right: 5%;
  animation: pulse2 8s ease-in-out infinite 2s;
}

@keyframes pulse2 {
  0%, 100% { transform: scale(1); opacity: 0.7; }
  50% { transform: scale(1.03); opacity: 1; }
}

@keyframes pulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.7; }
  50% { transform: translate(-50%, -50%) scale(1.03); opacity: 1; }
}

.close-btn {
  position: absolute;
  top: 3vmin;
  left: 3vmin;
  width: 10vmin;
  height: 10vmin;
  min-width: 28px;
  min-height: 28px;
  max-width: 44px;
  max-height: 44px;
  border: none;
  background: var(--btn-bg);
  backdrop-filter: blur(10px);
  border-radius: 25%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fg-secondary);
  transition: all 0.25s ease;
  z-index: 10;
  -webkit-app-region: no-drag;
}

.close-btn:hover {
  background: rgba(231, 76, 60, 0.8);
  color: white;
}

.close-btn:active {
  transform: scale(0.9);
}

.close-btn svg {
  width: 50%;
  height: 50%;
}

.timer-container {
  position: relative;
  width: 80vmin;
  height: 80vmin;
  min-width: 120px;
  min-height: 120px;
}

.progress-ring {
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 0 15px rgba(231, 76, 60, 0.25));
}

.ring-bg {
  stroke: var(--ring-bg);
}

.ring-progress {
  transition: stroke-dashoffset 0.3s ease-out, stroke 0.3s ease;
}

/* 完成时弹性缩放动画 */
.progress-ring.complete {
  animation: complete-bounce 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes complete-bounce {
  0% { transform: scale(1); }
  30% { transform: scale(1.08); }
  60% { transform: scale(0.96); }
  80% { transform: scale(1.03); }
  100% { transform: scale(1); }
}

.time-display {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1vmin;
}

.time {
  font-family: 'DM Serif Display', serif;
  font-size: 16vmin;
  font-weight: 400;
  color: var(--fg-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.5vmin;
  text-shadow: 0 2px 15px rgba(0, 0, 0, 0.3);
  line-height: 1;
  transition: color 0.3s ease;
}

/* 最后1分钟时间颜色变橙/珊瑚红 */
.time.last-minute {
  color: #f39c12;
}

.light-theme .time.last-minute {
  color: #ff69b4;
}

.time.complete {
  color: #4ecdc4;
}

.mode-label {
  font-family: 'DM Sans', sans-serif;
  font-size: 3vmin;
  font-weight: 500;
  color: var(--fg-secondary);
  text-transform: uppercase;
  letter-spacing: 1vmin;
}

.complete-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(26, 22, 20, 0.92);
  backdrop-filter: blur(8px);
  animation: fadeIn 0.3s ease;
}

.light-theme .complete-overlay {
  background: rgba(250, 248, 245, 0.92);
}

.complete-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3vmin;
  color: #4ecdc4;
  animation: scaleIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.complete-content svg {
  width: 15vmin;
  height: 15vmin;
  filter: drop-shadow(0 0 15px currentColor);
}

.complete-content span {
  font-family: 'DM Sans', sans-serif;
  font-size: 4vmin;
  font-weight: 500;
  letter-spacing: 1vmin;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1); }
}
</style>
