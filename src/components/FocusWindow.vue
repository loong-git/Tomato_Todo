<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { matchShortcut } from '@/utils'
import { isShortcutRecording } from '@/utils/shortcut-state'
import type { ShortcutConfig } from '@/types'

// 用户自定义的"切窗口"快捷键(onMounted 时从主进程 store 拉一次)
// 默认 Alt+F / Alt+M —— 用户在主窗口改快捷键后,这里也跟着改
const shortcuts = ref<ShortcutConfig>({
  toggleFullscreen: 'Alt+F',
  toggleCompact: 'Alt+M'
})

const timeLeft = ref(25 * 60)
// [需求] 本模式总时长，由主窗口经 IPC 同步（sendState / getInitData 都带 total）。
// 用来判断"这一轮还没开始过"——小窗是独立进程，拿不到主窗口的 timer store
const total = ref(25 * 60)
const mode = ref('focus')
const showComplete = ref(false)
const isRunning = ref(false)
const isDark = ref(true)
const isLastMinute = ref(false) // 最后1分钟数字变琥珀色
const isLoaded = ref(false)
const currentTaskName = ref('') // 从主进程 IPC 同步过来

// 模式中文 + 强调色（数字/圆点用）
const modeLabel = computed(() => mode.value === 'focus' ? '专注' : mode.value === 'shortBreak' ? '短休息' : '长休息')
const modeColors: Record<string, string> = {
  focus: '#e74c3c',
  shortBreak: '#3498db',
  longBreak: '#9b59b6'
}
const accentColor = computed(() => modeColors[mode.value] || modeColors.focus)

const formattedTime = computed(() => {
  const mins = Math.floor(timeLeft.value / 60)
  const secs = timeLeft.value % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
})

// [需求] 按钮提示文案，判据与主窗口 store.primaryLabel 保持一致：
// 运行中 → 暂停 / 剩余 === 总时长（还没开始）→ 开始 / 其余（中途停下）→ 继续
const primaryLabel = computed(() => {
  if (isRunning.value) return '暂停'
  return timeLeft.value === total.value ? '开始' : '继续'
})

async function closeFocus() {
  if (window.electronAPI) {
    await window.electronAPI.focus.close()
  }
}

// [方案1] 小窗控制按钮：经主进程转发给主窗口的 timer store 执行
function toggleRun() {
  window.electronAPI?.focus.control(isRunning.value ? 'pause' : 'start')
}

// [需求] 小窗锁定：锁定后窗口禁止拖动移动（movable:false），样式同步换挂锁图标
const isLocked = ref(false)
function toggleLock() {
  isLocked.value = !isLocked.value
  window.electronAPI?.focus.toggleLock(isLocked.value)
  console.log(`[FocusWindow] ${isLocked.value ? '锁定' : '解锁'}窗口位置`)
}

// 在 FocusWindow 中：用户设的"切窗口"快捷键任一触发 → 返回主窗口
// (进来用啥键出去用啥键,最自然)
function handleKeydown(e: KeyboardEvent) {
  if (isShortcutRecording()) return
  if (
    matchShortcut(e, shortcuts.value.toggleFullscreen) ||
    matchShortcut(e, shortcuts.value.toggleCompact)
  ) {
    e.preventDefault()
    console.log('[FocusWindow] 切窗口快捷键 - 返回主窗口')
    closeFocus()
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
  // 小窗圆角关键：App.vue 全局样式给 body 铺了不透明主题色，会填满窗口矩形
  // 把 .focus-window 的 CSS 圆角外四角盖住（视觉上是直角）。这里把 html/body
  // 背景置透明，让窗口 transparent 区域真正露出来，圆角才能生效
  document.documentElement.style.background = 'transparent'
  document.body.style.background = 'transparent'

  // 加载主题设置 + 用户自定义快捷键(同一份 store 一次 IPC 拿完)
  if (window.electronAPI) {
    const settingsData = await window.electronAPI.store.get('settings') as any
    if (settingsData?.theme) {
      isDark.value = settingsData.theme === 'dark'
      document.documentElement.setAttribute('data-theme', settingsData.theme)
    }
    if (settingsData?.shortcuts) {
      shortcuts.value = settingsData.shortcuts
      console.log('[FocusWindow] 同步 shortcuts:', shortcuts.value)
    }
  }

  // 专注窗口不运行自己的timer，完全依赖主窗口通过IPC发送的状态
  if (window.electronAPI) {
    // 先设置监听器
    window.electronAPI.focus.onStateUpdate((data) => {
      console.log(`[FocusWindow] onStateUpdate → timeLeft=${data.timeLeft} isRunning=${data.isRunning} mode=${data.mode}`)
      timeLeft.value = data.timeLeft
      mode.value = data.mode
      isRunning.value = data.isRunning
      if (data.total) total.value = data.total
      isLastMinute.value = data.timeLeft <= 60 && data.timeLeft > 0
      if (data.currentTaskName !== undefined) {
        currentTaskName.value = data.currentTaskName
      }

      // 处理完成状态
      if (data.justCompleted) {
        showComplete.value = true
      }
    })

    // 同步获取初始状态（主进程在 did-finish-load 之后才提交 focusState,所以这里拿到的一定是最新值）
    const initData = await window.electronAPI.focus.getInitData() as any
    console.log(`[FocusWindow] onMounted → getInitData 返回: timeLeft=${initData.timeLeft} isRunning=${initData.isRunning} mode=${initData.mode}`)
    timeLeft.value = initData.timeLeft
    mode.value = initData.mode
    isRunning.value = initData.isRunning
    if (initData.total) total.value = initData.total
    isLastMinute.value = initData.timeLeft <= 60 && initData.timeLeft > 0
    if (initData.currentTaskName !== undefined) {
      currentTaskName.value = initData.currentTaskName
    }
    isLoaded.value = true
  }

  // Alt+F 快捷键
  window.addEventListener('keydown', handleKeydown)
})

// 组件卸载时清理
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="focus-window" :class="{ 'light-theme': !isDark, 'is-locked': isLocked }">
    <template v-if="isLoaded">
      <button class="w-close" @click.stop="closeFocus" title="收起小窗（计时继续）">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>
        </svg>
      </button>

      <button
        class="w-lock"
        :class="{ locked: isLocked }"
        @click.stop="toggleLock"
        :title="isLocked ? '解锁位置（可拖动）' : '锁定位置（禁止拖动）'"
      >
        <svg v-if="isLocked" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="11" width="16" height="9" rx="2"/>
          <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="11" width="16" height="9" rx="2"/>
          <path d="M8 11V7a4 4 0 0 1 7.9-.9"/>
        </svg>
      </button>

      <div class="w-task" :title="currentTaskName">{{ currentTaskName || '未选择任务' }}</div>
      <div class="w-time" :class="{ 'last-minute': isLastMinute, 'complete': showComplete }">{{ formattedTime }}</div>
      <div class="w-mode">
        <span class="w-dot" :style="{ background: accentColor }"></span>{{ modeLabel }}
      </div>

      <div class="w-btns">
        <button class="wbtn primary" :title="primaryLabel" @click="toggleRun">
          <svg v-if="isRunning" viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
            <path d="M8 5.5v13a.7.7 0 0 0 1.07.6l10-6.5a.7.7 0 0 0 0-1.2l-10-6.5A.7.7 0 0 0 8 5.5z"/>
          </svg>
        </button>
      </div>

      <div v-if="showComplete" class="w-complete">✓ 本番茄完成</div>
    </template>
  </div>
</template>

<style scoped>
/* [方案1] compact 小窗：对齐 demo 的卡片式挂件（无圆环，任务名+大数字+按钮），深浅主题适配 */
.focus-window {
  --w-bg: #161210;
  --w-fg: #faf5f0;
  --w-muted: #9a8f85;
  --w-btn-bg: #2a231e;
  --w-btn-border: #3a322b;
  --w-btn-fg: #c9beb4;

  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  /* [修复] 原 12px。小窗固定 224x222 物理，在 152.5% 缩放屏上只有 ≈147x146 DIP，
     而内容按设计稿 240x240 的尺寸做 → 内容高约 151 DIP 超出窗口约 6 DIP，
     justify-content:center 把超出部分均分到上下两端 → 任务名贴顶边、播放按钮底部被切平。
     内容整体缩到 ≈130 DIP，上下各留 8 DIP */
  gap: 8px;
  background: var(--w-bg);
  border-radius: 16px;
  position: relative;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
  -webkit-app-region: drag;
}

/* [需求] 锁定后禁止拖动移动窗口位置 */
.focus-window.is-locked {
  -webkit-app-region: no-drag;
}

/* 浅色主题 */
.focus-window.light-theme {
  --w-bg: #faf8f5;
  --w-fg: #2d2420;
  --w-muted: #8a7f75;
  --w-btn-bg: #f0ece7;
  --w-btn-border: #e0d9d2;
  --w-btn-fg: #6b6058;
}

.w-close {
  position: absolute;
  top: 8px;
  right: 10px;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--w-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: opacity 0.18s ease, color 0.2s ease, background 0.2s ease;
}
.w-close:hover {
  color: #e74c3c;
  background: rgba(231, 76, 60, 0.1);
}
/* [需求] 锁定后隐藏 ✕：锁定的语义是"别来动这个窗口"，关闭按钮一并收起。
   用 opacity + pointer-events 而不是 display:none，这样能有个淡出过渡 */
.focus-window.is-locked .w-close {
  opacity: 0;
  pointer-events: none;
}

/* [需求] 锁定按钮：左上角，与右上角 ✕ 对称 */
.w-lock {
  position: absolute;
  top: 8px;
  left: 10px;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--w-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: color 0.2s ease, background 0.2s ease;
}
.w-lock:hover {
  color: var(--w-fg);
  background: rgba(255, 255, 255, 0.08);
}
.w-lock.locked {
  color: #4a7c59;
}
.w-lock.locked:hover {
  background: rgba(74, 124, 89, 0.12);
}

.w-task {
  font-size: 11.5px;
  line-height: 1.3;
  color: var(--w-muted);
  /* [修复] 原 max-width:200px，但窗口只有 147 DIP 宽 → 等于不限制，
     长任务名会压到左右两侧的挂锁/✕ 图标上。收到 76px（两图标之间的可用宽度） */
  max-width: 76px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.w-time {
  /* [修复] 56 → 48：56 是照 240x240 的设计稿定的，在 146 DIP 高的窗口里装不下 */
  font-size: 48px;
  font-weight: 800;
  color: var(--w-fg);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.w-time.last-minute {
  color: #f39c12;
}
.w-time.complete {
  color: #4a7c59;
}

.w-mode {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  line-height: 1.3;
  color: var(--w-muted);
  /* [修复] -6 → -7：与上一行大数字的视觉间距再收一点，给底部按钮腾高度 */
  margin-top: -7px;
}
.w-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.w-btns {
  display: flex;
  gap: 10px;
}
.wbtn {
  /* [修复] 40 → 36：同上，40 是照设计稿定的，在这个窗口高度里会把内容顶出边界 */
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--w-btn-border);
  background: var(--w-btn-bg);
  color: var(--w-btn-fg);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: background 0.2s ease, transform 0.12s ease;
}
.wbtn:hover {
  background: var(--w-btn-border);
}
.wbtn:active {
  transform: scale(0.94);
}
.wbtn.primary {
  background: #e74c3c;
  border-color: #e74c3c;
  color: #fff;
}
.wbtn.primary:hover {
  filter: brightness(1.08);
}

.w-complete {
  position: absolute;
  bottom: 12px;
  font-size: 11px;
  color: #4a7c59;
  animation: w-fade 0.3s ease;
}
@keyframes w-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
