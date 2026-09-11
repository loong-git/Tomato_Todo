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
/* [需求] 缩小弱化：小号 tab 靠左摆放，不抢主视觉 */
.mode-selector {
  display: flex;
  padding: 0;
}

.mode-tabs {
  display: flex;
  background: var(--bg-secondary);
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
  border: 1px solid var(--border-color);
}

.mode-tab {
  padding: 3px 10px;
  border: none;
  background: transparent;
  /* [优化] 未激活提一档（muted→secondary）：保持小而可发现 */
  color: var(--text-secondary);
  font-family: 'DM Sans', sans-serif;
  font-size: 11px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-tab:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.06);
}

.light-theme .mode-tab:hover {
  background: rgba(0, 0, 0, 0.05);
}

.mode-tab.active {
  background: var(--active-color);
  color: #fff;
}
</style>
