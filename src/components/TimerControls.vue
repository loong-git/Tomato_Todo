<script setup lang="ts">
import { ref } from 'vue'
import { useTimerStore } from '@/stores'

const timerStore = useTimerStore()
const isPlaying = ref(false)

async function stopAudio() {
  if (window.electronAPI) {
    await window.electronAPI.audio.stop()
    isPlaying.value = false
  }
}
</script>

<template>
  <div class="timer-controls">
    <div class="control-buttons">
      <button class="control-btn secondary" @click="timerStore.reset" title="重置">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3 3v5h5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <button
        class="control-btn primary"
        :class="{ running: timerStore.isRunning }"
        @click="timerStore.isRunning ? timerStore.pause() : timerStore.start()"
      >
        <svg v-if="!timerStore.isRunning" viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
        </svg>
      </button>

      <button class="control-btn secondary" @click="timerStore.skip" title="跳过">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 4 15 12 5 20 5 4" fill="currentColor"/>
          <line x1="19" y1="5" x2="19" y2="19" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.timer-controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 16px 0 24px;
}

.control-buttons {
  display: flex;
  align-items: center;
  gap: 20px;
}

.control-btn {
  border: none;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.control-btn.primary {
  width: 72px;
  height: 72px;
  background: linear-gradient(135deg, var(--tomato) 0%, var(--tomato-dark) 100%);
  color: #fff;
  box-shadow: 0 8px 30px rgba(231, 76, 60, 0.4), inset 0 1px 0 rgba(255,255,255,0.2);
}

.control-btn.primary:hover {
  transform: scale(1.08);
  box-shadow: 0 12px 40px rgba(231, 76, 60, 0.5), inset 0 1px 0 rgba(255,255,255,0.2);
}

.control-btn.primary:active {
  transform: scale(0.95);
}

.control-btn.primary.running {
  background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
  box-shadow: 0 8px 30px rgba(243, 156, 18, 0.4), inset 0 1px 0 rgba(255,255,255,0.2);
}

.control-btn.secondary {
  width: 52px;
  height: 52px;
  background: var(--bg-card);
  backdrop-filter: blur(10px);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.control-btn.secondary:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
  transform: scale(1.08);
}

.control-btn.secondary:active {
  transform: scale(0.95);
}
</style>
