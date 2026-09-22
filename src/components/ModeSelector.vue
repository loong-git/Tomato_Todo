<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTimerStore } from '@/stores'
import type { TimerMode } from '@/types'

const timerStore = useTimerStore()

const modes: { key: TimerMode; label: string; color: string }[] = [
  { key: 'focus', label: '专注', color: '#e74c3c' },
  { key: 'shortBreak', label: '短休息', color: '#3498db' },
  { key: 'longBreak', label: '长休息', color: '#9b59b6' }
]

// [需求] 误触保护：store.setMode() 会 pause() + 把 timeLeft 复位成新模式的时长，
// 等于当前这一轮的进度直接清空。手滑点到「短休息」就白跑了一个番茄，
// 所以只要这一轮已经跑过（正在跑、或已消耗时间）就先弹确认。
// 这一轮压根没开始过时切换不丢任何东西 → 直接切，不打扰。
const pendingMode = ref<TimerMode | null>(null)

const pendingLabel = computed(
  () => modes.find(m => m.key === pendingMode.value)?.label ?? ''
)

/** 当前这一轮已经进行的时间（秒） */
const elapsedSec = computed(() =>
  Math.max(0, timerStore.currentDuration - timerStore.timeLeft)
)

const elapsedText = computed(() => {
  const s = elapsedSec.value
  if (s < 60) return `${s} 秒`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r ? `${m} 分 ${r} 秒` : `${m} 分钟`
})

function selectMode(mode: TimerMode) {
  // 点当前已选中的模式：setMode 同样会走 pause + 复位，语义上应该是空操作
  if (mode === timerStore.mode) return

  const started = timerStore.isRunning || elapsedSec.value > 0
  if (!started) {
    timerStore.setMode(mode)
    return
  }
  pendingMode.value = mode
}

function confirmSwitch() {
  if (pendingMode.value) timerStore.setMode(pendingMode.value)
  pendingMode.value = null
}
</script>

<template>
  <div class="mode-selector">
    <div class="mode-tabs" data-tour="mode">
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

    <!-- [需求] 误触保护确认框。Teleport 到 body，避免被计时卡的层级/定位影响 -->
    <Teleport to="body">
      <div v-if="pendingMode" class="mc-overlay" @click.self="pendingMode = null">
        <div class="mc-dialog">
          <div class="mc-title">切换到「{{ pendingLabel }}」？</div>
          <div class="mc-message">
            当前这一轮已进行 <b>{{ elapsedText }}</b>，切换会结束它，
            这段时间<b>不会</b>计入统计。
          </div>
          <div class="mc-actions">
            <button class="mc-btn cancel" @click="pendingMode = null">取消</button>
            <button class="mc-btn warn" @click="confirmSwitch">确定切换</button>
          </div>
        </div>
      </div>
    </Teleport>
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

/* ===== 切换模式确认框（沿用 TaskList「清除历史任务」那套观感，尺寸略小）===== */
.mc-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  animation: mc-fade 0.18s ease;
}

.mc-dialog {
  width: 300px;
  background: var(--bg-card);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  animation: mc-scale 0.22s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.mc-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: 'DM Sans', sans-serif;
  margin-bottom: 8px;
}

.mc-message {
  font-size: 12.5px;
  color: var(--text-secondary);
  font-family: 'DM Sans', sans-serif;
  line-height: 1.55;
  margin-bottom: 18px;
}
.mc-message b {
  color: var(--text-primary);
  font-weight: 600;
}

.mc-actions {
  display: flex;
  gap: 8px;
}

.mc-btn {
  flex: 1;
  padding: 9px 14px;
  border: none;
  border-radius: 9px;
  font-size: 12.5px;
  font-family: 'DM Sans', sans-serif;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mc-btn.cancel {
  background: var(--bg-secondary);
  color: var(--text-secondary);
}
.mc-btn.cancel:hover {
  background: var(--border-color);
  color: var(--text-primary);
}

.mc-btn.warn {
  background: var(--tomato);
  color: #fff;
}
.mc-btn.warn:hover {
  filter: brightness(1.08);
}

@keyframes mc-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes mc-scale {
  from { transform: scale(0.92); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
</style>
