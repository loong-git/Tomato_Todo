<script setup lang="ts">
import { useTimerStore } from '@/stores'

const timerStore = useTimerStore()

// [P2-11 修复] 停止音频按钮显隐由 timer store 的 isAudioPlaying 驱动：
// 仅在自定义音频实际播放时显示（playSound 成功置 true，播完/用户停止置 false）
function stopAudio() {
  timerStore.stopAudio()
}

function toggleTimer() {
  timerStore.isRunning ? timerStore.pause() : timerStore.start()
}
</script>

<template>
  <!-- [改版] 行内按钮组（计时卡右侧）：重置 / 开始暂停（主按钮）/ 跳过 -->
  <div class="timer-controls">
    <div class="control-buttons">
      <button class="control-btn ghost" @click="timerStore.reset" title="重置 (R)">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3 3v5h5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <button
        class="control-btn primary"
        :class="{ running: timerStore.isRunning }"
        @click="toggleTimer"
        :title="timerStore.isRunning ? '暂停 (Space)' : '开始 (Space)'"
      >
        <svg v-if="!timerStore.isRunning" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
        </svg>
        <span>{{ timerStore.isRunning ? '暂停' : '开始' }}</span>
      </button>

      <button class="control-btn ghost" @click="timerStore.skip" title="跳过">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 4 15 12 5 20 5 4" fill="currentColor"/>
          <line x1="19" y1="5" x2="19" y2="19" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <!-- 停止音频按钮 - 仅在自定义音频实际播放时显示 -->
    <Transition name="fade">
      <button
        v-if="timerStore.isAudioPlaying"
        class="stop-audio-btn"
        @click="stopAudio"
        title="停止音频"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"/>
          <line x1="23" y1="9" x2="17" y2="15"/>
          <line x1="17" y1="9" x2="23" y2="15"/>
        </svg>
      </button>
    </Transition>
  </div>
</template>

<style scoped>
.timer-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.control-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-btn {
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.18s ease;
}

/* 主按钮：胶囊（开始/暂停） */
.control-btn.primary {
  height: 40px;
  padding: 0 22px;
  border-radius: 20px;
  background: var(--tomato);
  color: #fff;
  font-size: 13.5px;
  font-weight: 600;
  box-shadow: 0 4px 14px rgba(231, 76, 60, 0.35);
}

.control-btn.primary:hover {
  background: var(--tomato-light);
  box-shadow: 0 6px 18px rgba(231, 76, 60, 0.45);
}

.control-btn.primary:active {
  transform: scale(0.96);
}

/* [改版] 运行中：红描边（不再抢主色数字的戏，hover 微填充） */
.control-btn.primary.running {
  background: transparent;
  color: var(--tomato);
  border: 1.5px solid var(--tomato);
  box-shadow: none;
  padding: 0 20px;
}

.control-btn.primary.running:hover {
  background: rgba(231, 76, 60, 0.08);
  box-shadow: none;
}

/* 次按钮：ghost 方块 */
.control-btn.ghost {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--bg-secondary);
  color: var(--text-muted);
}

.control-btn.ghost:hover {
  color: var(--text-primary);
  background: var(--border-color);
}

.control-btn.ghost:active {
  transform: scale(0.95);
}

/* 停止音频按钮 */
.stop-audio-btn {
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: var(--bg-card);
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.stop-audio-btn:hover {
  background: rgba(231, 76, 60, 0.15);
  border-color: var(--tomato);
  color: var(--tomato);
  transform: scale(1.05);
}

.stop-audio-btn:active {
  transform: scale(0.95);
}

/* 淡入淡出动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
