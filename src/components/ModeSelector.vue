<script setup lang="ts">
import { useTimerStore } from '@/stores'
import type { TimerMode } from '@/types'

const timerStore = useTimerStore()

const modes: { key: TimerMode; label: string; color: string }[] = [
  { key: 'focus', label: '专注', color: '#e74c3c' },
  { key: 'shortBreak', label: '短休息', color: '#3498db' },
  { key: 'longBreak', label: '长休息', color: '#9b59b6' }
]

function selectMode(mode: TimerMode) {
  timerStore.setMode(mode)
}
</script>

<template>
  <div class="mode-selector">
    <div class="mode-tabs">
      <button
        v-for="m in modes"
        :key="m.key"
        class="mode-tab"
        :class="{ active: timerStore.mode === m.key }"
        :style="{ '--active-color': m.color }"
        @click="selectMode(m.key)"
      >
        {{ m.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.mode-selector {
  display: flex;
  justify-content: center;
  padding: 8px 16px 12px;
}

.mode-tabs {
  display: flex;
  background: var(--bg-card);
  backdrop-filter: blur(20px);
  border-radius: 18px;
  padding: 6px;
  gap: 4px;
  border: 1px solid var(--border-color);
  box-shadow: 0 4px 16px var(--shadow);
}

.mode-tab {
  padding: 10px 20px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  font-weight: 500;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.mode-tab:hover {
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.05);
}

.mode-tab.active {
  background: var(--active-color);
  color: #fff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}
</style>
