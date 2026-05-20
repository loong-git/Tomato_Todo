<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useTimerStore } from '@/stores'

const timerStore = useTimerStore()

const showComplete = ref(false)

watch(() => timerStore.justCompleted, (completed) => {
  if (completed) {
    showComplete.value = true
    setTimeout(() => {
      showComplete.value = false
      timerStore.clearJustCompleted()
    }, 2000)
  }
})

async function openFocusMode() {
  if (window.electronAPI) {
    await window.electronAPI.focus.open({
      timeLeft: timerStore.timeLeft,
      mode: timerStore.mode,
      isRunning: timerStore.isRunning,
      total: timerStore.currentDuration
    })
  }
}

const modeColors = {
  focus: '#e74c3c',
  shortBreak: '#3498db',
  longBreak: '#9b59b6'
}

const progressColor = computed(() => modeColors[timerStore.mode])

const progress = computed(() => {
  const total = timerStore.currentDuration
  const current = timerStore.timeLeft
  return ((total - current) / total) * 100
})

const circumference = 2 * Math.PI * 120

const strokeDashoffset = computed(() => {
  return circumference * (1 - progress.value / 100)
})
</script>

<template>
  <div class="timer-display">
    <button class="focus-btn" @click="openFocusMode" title="专注模式">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <svg class="progress-ring" viewBox="0 0 280 280">
      <defs>
        <filter id="timerGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <!-- 背景环 -->
      <circle
        class="ring-bg"
        cx="140"
        cy="140"
        r="120"
        fill="none"
        stroke-width="10"
      />

      <!-- 进度环 -->
      <circle
        class="ring-progress"
        cx="140"
        cy="140"
        r="120"
        fill="none"
        stroke-width="10"
        :stroke="progressColor"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="strokeDashoffset"
        stroke-linecap="round"
        transform="rotate(-90 140 140)"
        filter="url(#timerGlow)"
      />

      <!-- 内圈装饰 -->
      <circle
        class="ring-inner"
        cx="140"
        cy="140"
        r="100"
        fill="none"
        stroke="rgba(255,255,255,0.03)"
        stroke-width="1"
      />
    </svg>

    <div class="timer-content">
      <div class="time">{{ timerStore.formattedTime }}</div>
      <div class="mode-tag" :style="{ color: progressColor }">
        {{ timerStore.mode === 'focus' ? '专注' : timerStore.mode === 'shortBreak' ? '短休息' : '长休息' }}
      </div>
      <div v-if="showComplete" class="complete-msg">倒计时完成</div>
    </div>
  </div>
</template>

<style scoped>
.timer-display {
  position: relative;
  width: 280px;
  height: 280px;
  margin: 16px auto 8px;
  background: var(--bg-card);
  border-radius: 32px;
  padding: 20px;
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-color);
  box-shadow: 0 8px 32px var(--shadow);
}

.focus-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 44px;
  height: 44px;
  border: none;
  background: var(--bg-card);
  backdrop-filter: blur(10px);
  border-radius: 14px;
  cursor: pointer;
  padding: 10px;
  z-index: 10;
  color: var(--text-secondary);
  transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  border: 1px solid var(--border-color);
}

.focus-btn:hover {
  background: var(--tomato);
  color: white;
  transform: scale(1.08);
  box-shadow: 0 6px 24px rgba(231, 76, 60, 0.4);
  border-color: transparent;
}

.focus-btn:active {
  transform: scale(0.95);
}

.progress-ring {
  width: 100%;
  height: 100%;
}

.ring-bg {
  stroke: var(--border-color);
}

.ring-progress {
  transition: stroke-dashoffset 0.5s ease, stroke 0.3s ease;
}

.timer-content {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.time {
  font-family: 'DM Serif Display', serif;
  font-size: 52px;
  font-weight: 400;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: -1px;
  line-height: 1;
}

.mode-tag {
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  font-weight: 500;
  margin-top: 10px;
  text-transform: uppercase;
  letter-spacing: 2px;
  opacity: 0.9;
}

.complete-msg {
  margin-top: 12px;
  font-size: 14px;
  color: #4ecdc4;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
