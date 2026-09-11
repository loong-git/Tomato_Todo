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

// accent 竖条颜色：最后1分钟根据主题变色
const progressColor = computed(() => {
  if (isLastMinute.value) {
    // 深色主题用橙色，浅色主题用粉红色
    return settingsStore.settings.theme === 'dark' ? '#f39c12' : '#ff69b4'
  }
  return modeColors[timerStore.mode]
})
</script>

<template>
  <!-- [改版] 圆环 → 大数字 + accent 竖条（C 布局计时卡左侧） -->
  <div class="timer-display" :class="{ 'last-minute': isLastMinute, 'complete': showComplete }">
    <div class="accent-bar" :style="{ background: progressColor }"></div>
    <div class="time-block">
      <div class="big-time">{{ timerStore.formattedTime }}</div>
      <div v-if="showComplete" class="complete-msg">倒计时完成</div>
    </div>
  </div>
</template>

<style scoped>
.timer-display {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}

.accent-bar {
  width: 5px;
  height: 50px;
  border-radius: 3px;
  transition: background 0.3s ease;
}

.time-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.big-time {
  font-size: 48px;
  font-weight: 650;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
  line-height: 1;
  transition: color 0.3s ease;
}

/* 完成时弹性缩放动画 */
.timer-display.complete .big-time {
  animation: complete-bounce 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  color: #4ecdc4;
}

@keyframes complete-bounce {
  0% { transform: scale(1); }
  30% { transform: scale(1.08); }
  60% { transform: scale(0.96); }
  80% { transform: scale(1.03); }
  100% { transform: scale(1); }
}

.complete-msg {
  font-size: 12px;
  color: #4ecdc4;
  animation: fadeIn 0.3s ease;
  white-space: nowrap;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
