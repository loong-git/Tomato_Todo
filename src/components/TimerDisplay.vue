<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useTimerStore, useSettingsStore } from '@/stores'

const timerStore = useTimerStore()
const settingsStore = useSettingsStore()

const showComplete = ref(false)
const isLastMinute = ref(false)

watch(() => timerStore.justCompleted, (completed) => {
  if (completed) {
    showComplete.value = true
    setTimeout(() => {
      showComplete.value = false
      timerStore.clearJustCompleted()
    }, 2000)
  }
})

// 监听剩余时间，判断是否最后1分钟
watch(() => timerStore.timeLeft, (timeLeft) => {
  isLastMinute.value = timeLeft <= 60 && timeLeft > 0
})

const modeColors = {
  focus: '#e74c3c',
  shortBreak: '#3498db',
  longBreak: '#9b59b6'
}

// 进度环颜色：最后1分钟根据主题变色
const progressColor = computed(() => {
  if (isLastMinute.value) {
    // 深色主题用橙色，浅色主题用粉红色
    return settingsStore.settings.theme === 'dark' ? '#f39c12' : '#ff69b4'
  }
  return modeColors[timerStore.mode]
})

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
    <svg class="progress-ring" :class="{ 'last-minute': isLastMinute, 'complete': showComplete }" viewBox="0 0 280 280">
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
      <div class="time" :class="{ 'last-minute': isLastMinute, 'complete': showComplete }">{{ timerStore.formattedTime }}</div>
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

/* 完成时弹性缩放动画 */
.progress-ring.complete {
  animation: complete-bounce 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes complete-bounce {
  0% {
    transform: scale(1);
  }
  30% {
    transform: scale(1.08);
  }
  60% {
    transform: scale(0.96);
  }
  80% {
    transform: scale(1.03);
  }
  100% {
    transform: scale(1);
  }
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
