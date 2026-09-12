<script setup lang="ts">
import { ref, onMounted, watch, computed, onUnmounted } from 'vue'
import { useTimerStore, useTaskStore, useSettingsStore, useStatsStore } from '@/stores'
import { matchShortcut } from '@/utils'
import { isShortcutRecording } from '@/utils/shortcut-state'
import TimerDisplay from '@/components/TimerDisplay.vue'
import TimerControls from '@/components/TimerControls.vue'
import ModeSelector from '@/components/ModeSelector.vue'
import TaskList from '@/components/TaskList.vue'
import StatsDisplay from '@/components/StatsDisplay.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import FocusWindow from '@/components/FocusWindow.vue'
import CelebrationOverlay from '@/components/CelebrationOverlay.vue'
import AppToast from '@/components/AppToast.vue'

const timerStore = useTimerStore()
const taskStore = useTaskStore()
const settingsStore = useSettingsStore()
const statsStore = useStatsStore()

const settingsRef = ref<InstanceType<typeof SettingsPanel>>()

const isFocusMode = computed(() => window.location.hash === '#/focus')

// 主题切换
const isDark = computed({
  get: () => settingsStore.settings.theme === 'dark',
  set: (val) => {
    settingsStore.updateSettings({ theme: val ? 'dark' : 'light' })
  }
})

// 键盘快捷键处理
function handleKeydown(e: KeyboardEvent) {
  // SettingsPanel 正在录制快捷键 → 全局快捷键让路
  if (isShortcutRecording()) return

  const tag = (e.target as HTMLElement).tagName
  const isInputField = tag === 'INPUT' || tag === 'TEXTAREA'

  // [方案1] 沉浸模式下 Esc 退出（计时继续）
  if (inlineFocus.value && e.key === 'Escape') {
    e.preventDefault()
    inlineFocus.value = false
    console.log('[键盘事件] Esc - 退出沉浸模式')
    return
  }

  // 用户自定义的切窗口快捷键(默认 Alt+F = 切沉浸模式, Alt+M = 切小窗)
  if (matchShortcut(e, settingsStore.settings.shortcuts.toggleFullscreen)) {
    e.preventDefault()
    console.log('[键盘事件] toggleFullscreen - 打开沉浸模式')
    inlineFocus.value = true
    return
  }
  if (matchShortcut(e, settingsStore.settings.shortcuts.toggleCompact)) {
    e.preventDefault()
    console.log('[键盘事件] toggleCompact - 打开小窗专注')
    openFocusMode('compact')
    return
  }

  // [P3-14 修复] 日志仅 dev 环境打印，避免用户打字时每键一刷 console；
  // import.meta.env.DEV 在打包时被 vite 静态剔除，生产/打包后 0 开销。
  if (import.meta.env.DEV) {
    console.log('[键盘事件] key:', e.key, 'target:', tag)
  }

  // 输入框中只响应 Escape
  if (isInputField) {
    if (e.key === 'Escape') {
      console.log('[键盘事件] 输入框中按 Escape')
      ;(e.target as HTMLInputElement).blur()
    }
    return
  }

  switch (e.key) {
    case ' ':
      e.preventDefault()
      console.log('[键盘事件] Space - 切换计时器')
      timerStore.isRunning ? timerStore.pause() : timerStore.start()
      break
    case 'r':
    case 'R':
      console.log('[键盘事件] R - 重置计时器')
      timerStore.reset()
      break
    case 's':
    case 'S':
      console.log('[键盘事件] S - 打开设置')
      settingsRef.value?.open()
      break
    case 'n':
    case 'N':
      console.log('[键盘事件] N - 聚焦任务输入框')
      document.querySelector<HTMLInputElement>('.task-input')?.focus()
      break
    case '1':
      console.log('[键盘事件] 1 - 专注模式')
      timerStore.setMode('focus')
      break
    case '2':
      console.log('[键盘事件] 2 - 短休息')
      timerStore.setMode('shortBreak')
      break
    case '3':
      console.log('[键盘事件] 3 - 长休息')
      timerStore.setMode('longBreak')
      break
    case 'Escape':
      console.log('[键盘事件] Escape - 关闭弹窗')
      settingsRef.value?.close?.()
      break
  }
}

onMounted(async () => {
  // 预热 AudioContext - 避免首次播放音效延迟
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext
    if (AudioContext) {
      const ctx = new AudioContext()
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }
      console.log('[Audio] AudioContext 已预热:', ctx.state)
    }
  } catch (e) {
    console.warn('[Audio] 预热失败:', e)
  }

  // 立即应用主题（同步），不等待数据加载
  document.documentElement.setAttribute('data-theme', settingsStore.settings.theme)

  // 然后并行加载数据
  await Promise.all([
    settingsStore.loadSettings(),
    taskStore.loadTasks(),
    statsStore.loadRecords()
  ])

  // 加载连胜数据
  timerStore.loadStreakData()

  // 确保主题是最新的（可能默认值与保存的值不同）
  document.documentElement.setAttribute('data-theme', settingsStore.settings.theme)

  // 监听主进程通知进入/退出专注模式
  if (window.electronAPI) {
    window.electronAPI.focus.onFocusModeChange((active: boolean) => {
      timerStore.setFocusModeActive(active)
    })
    // [方案1] 小窗专注控制按钮 → 执行计时操作
    window.electronAPI.focus.onControl((action) => {
      if (action === 'pause') timerStore.pause()
      else if (action === 'start') timerStore.start()
      else if (action === 'skip') timerStore.skip()
    })
    // [需求] 最大化状态回传：驱动 ▢ 按钮 最大化/向下还原 图标切换
    window.electronAPI.window.onMaxState((v) => {
      isCustomMax.value = v
    })
  }

  // 注册键盘快捷键
  window.addEventListener('keydown', handleKeydown)
  console.log('[App] 键盘快捷键已注册')

  // 初始化托盘状态
  if (window.electronAPI) {
    window.electronAPI.tray.updateState({
      timeLeft: timerStore.timeLeft,
      isRunning: timerStore.isRunning
    })
    console.log('[App] 托盘状态已初始化')
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  console.log('[App] 键盘快捷键已移除')
})

// 监听主题变化
watch(() => settingsStore.settings.theme, (newTheme) => {
  document.documentElement.setAttribute('data-theme', newTheme)
})

watch(() => timerStore.pomodoroCount, (newCount, oldCount) => {
  if (newCount > oldCount) {
    if (timerStore.currentTaskIds.length > 0) {
      timerStore.currentTaskIds.forEach(taskId => {
        taskStore.incrementPomodoro(taskId)
      })
    }
    // 记录关联到第一个选中的任务（这样删除任务时能找到 records）
    const taskId = timerStore.currentTaskIds[0] || ''
    statsStore.addRecord({
      taskId,
      type: 'focus',
      duration: settingsStore.settings.focusDuration * 60,
      completedAt: Date.now()
    })
  }
})

// 注意: 之前这里有个 watch 自动同步 timeLeft/mode/isRunning 等到主进程
// 但这个 watcher 误触发了 timeLeft 跳回 currentDuration 的 bug
// 改由 timer store 内 start/pause/reset/setMode/skip/complete/setInterval 显式调 emitStateChange() 同步
// 见 src/stores/timer.ts: emitStateChange() 函数

// 监听托盘切换计时器
if (window.electronAPI) {
  window.electronAPI.tray.onToggleTimer(() => {
    console.log('[App] 收到托盘切换计时器')
    timerStore.isRunning ? timerStore.pause() : timerStore.start()
  })
}

// 滚动时显示滚动条，停止后渐隐
let scrollTimer: ReturnType<typeof setTimeout> | null = null
const isScrolling = ref(false)

function onMainScroll(e: Event) {
  isScrolling.value = true
  const el = e.currentTarget as HTMLElement
  el.classList.add('scrolling')
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    isScrolling.value = false
    el.classList.remove('scrolling')
  }, 800)
}

// [方案1] 内嵌沉浸模式：主窗口原地覆盖层，替代原独立全屏窗口（计时直接读 store，免跨窗口同步）
const inlineFocus = ref(false)
const fmtFocusTime = computed(() => {
  const m = Math.floor(timerStore.timeLeft / 60)
  const s = timerStore.timeLeft % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

// [改版] 计时卡内显示当前专注的任务名
const currentTaskName = computed(() => {
  const ids = timerStore.currentTaskIds
  if (ids.length === 0) return ''
  return taskStore.tasks.find(t => t.id === ids[0])?.name || ''
})

// [优化] 今日目标进度（计时卡中部）：todayCount / dailyGoal，封顶 100%
const goalPct = computed(() => {
  const goal = settingsStore.settings.dailyGoal || 1
  return Math.min(100, Math.round((statsStore.todayCount / goal) * 100))
})

// 窗口控制
function minimizeWindow() {
  if (window.electronAPI) {
    window.electronAPI.window.minimize()
  }
}

// [改版] 最大化/还原（双击标题栏 / ▢ 按钮触发）
// isCustomMax 跟随主进程真实状态：驱动 ▢ 按钮切换 最大化/向下还原 图标与 hover 提示
const isCustomMax = ref(false)
function toggleMaximize() {
  window.electronAPI?.window.toggleMaximize()
}

/* [修复] 标题栏空白区：系统原生拖动（-webkit-app-region: drag）。
   旧版自实现 IPC 拖动在 Windows DPI≠100% 下连发 setBounds 会拉宽窗口，已废弃。
   drag 区可能吞 dblclick，双击最大化用 pointerdown 计时检测（<400ms 两次按下） */
let lastTitleDownAt = 0
function onTitleBlankPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  const now = Date.now()
  if (now - lastTitleDownAt < 400) {
    lastTitleDownAt = 0
    toggleMaximize()
  } else {
    lastTitleDownAt = now
  }
}

/* [改版] 仅右缘调宽把手：拖动把目标宽度发给主进程（主进程夹紧后 setBounds） */
const resizing = ref(false)
let resizeStartX = 0
let resizeStartW = 0
let resizePendingW = 0
let resizeRaf = 0

function onResizeDown(e: PointerEvent) {
  resizeStartX = e.clientX
  resizeStartW = window.innerWidth
  resizing.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onResizeMove(e: PointerEvent) {
  if (!resizing.value) return
  resizePendingW = Math.round(resizeStartW + (e.clientX - resizeStartX))
  if (!resizeRaf) {
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0
      window.electronAPI?.window.resizeTo(resizePendingW)
    })
  }
}

function onResizeUp() {
  resizing.value = false
}

function closeWindow() {
  console.log('[Renderer] 关闭按钮点击')
  if (window.electronAPI) {
    window.electronAPI.window.close()
  }
}

// [方案1] 打开小窗专注（compact 独立窗口）。沉浸模式已改为内嵌覆盖层（inlineFocus），不再走此通道
async function openFocusMode(mode: 'compact') {
  console.log(`[App] openFocusMode 入口: mode=${mode} timerStore.timeLeft=${timerStore.timeLeft} isRunning=${timerStore.isRunning}`)
  if (!window.electronAPI) return

  // 内联 getCurrentTaskName 逻辑(原函数已搬至 timer store)
  const ids = timerStore.currentTaskIds
  const taskName = ids.length
    ? (taskStore.tasks.find(t => t.id === ids[0])?.name || '')
    : ''
  console.log('[App] 准备打开专注，currentTaskIds:', JSON.stringify(timerStore.currentTaskIds), 'taskName:', taskName, 'tasks.length:', taskStore.tasks.length)

  const data = {
    timeLeft: timerStore.timeLeft,
    mode: timerStore.mode,
    isRunning: timerStore.isRunning,
    justCompleted: false,
    total: timerStore.currentDuration,
    currentTaskName: taskName,
    currentTaskIds: [...timerStore.currentTaskIds]
  }
  console.log(`[App] 调 await focus.open → data.timeLeft=${data.timeLeft} data.isRunning=${data.isRunning}`)
  try {
    await window.electronAPI.focus.open(data, mode)
  } catch (e) {
    // 主进程已回滚(mainWindow.show + focus:modeChange(false))
    console.error('[App] 打开专注窗口失败,主进程已回滚:', e)
  }
  console.log(`[App] await focus.open 返回 → timerStore.timeLeft=${timerStore.timeLeft} isRunning=${timerStore.isRunning}`)
}
// 注意: getCurrentTaskName() 已搬至 src/stores/timer.ts 内(emitStateChange 内部使用)
</script>

<template>
  <FocusWindow v-if="isFocusMode" />
  <div v-else class="app" :class="{ 'light-theme': !isDark }">
    <!-- 自定义标题栏 -->
    <header class="title-bar">
      <div class="drag-region">
        <div class="logo">
          <svg viewBox="0 0 32 32" class="tomato-icon">
            <ellipse cx="16" cy="18" rx="12" ry="11" fill="currentColor" opacity="0.9"/>
            <path d="M16 7 C14 4 12 4 11 5 C10 6 10 8 12 9 L16 7 L20 9 C22 8 22 6 21 5 C20 4 18 4 16 7Z" fill="#4a7c59"/>
            <ellipse cx="12" cy="15" rx="3" ry="2" fill="rgba(255,255,255,0.2)"/>
          </svg>
          <span class="title">番茄TODO</span>
        </div>
        <!-- [修复] 标题栏空白区：系统原生拖动 + pointerdown 计时检测双击最大化 -->
        <div class="title-blank" title="双击最大化 / 按住拖动窗口" @pointerdown="onTitleBlankPointerDown"></div>
      </div>
      <div class="window-controls">
        <button class="theme-toggle" @click="isDark = !isDark" :title="isDark ? '切换浅色模式' : '切换深色模式'">
          <svg v-if="isDark" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </button>
        <button class="focus-btn" @click="openFocusMode('compact')" title="小窗专注 (Alt+F)">
          <!-- 画中画图标：外框+右下角小窗，与最大化方框区分 -->
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3.5" y="4.5" width="17" height="15" rx="2"/>
            <rect x="12" y="12" width="6" height="4.5" rx="1" fill="currentColor" stroke="none"/>
          </svg>
        </button>
        <button class="focus-btn" @click="inlineFocus = true" title="沉浸模式">
          <!-- 聚焦圆环图标：圆环+中心点，表意"沉浸专注"，与方框系区分 -->
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="8.5"/>
            <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/>
          </svg>
        </button>
        <SettingsPanel ref="settingsRef" />
        <div class="title-divider"></div>
        <button class="window-btn minimize" @click="minimizeWindow" title="最小化">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button class="window-btn maximize" @click="toggleMaximize" :title="isCustomMax ? '向下还原' : '最大化'">
          <!-- 最大化：单方框；向下还原：双框（Windows 标准样式） -->
          <svg v-if="!isCustomMax" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="5" y="5" width="14" height="14" rx="1.5"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <rect x="4.5" y="8.5" width="11" height="11" rx="1.5"/>
            <path d="M8.5 4.5H18a1.5 1.5 0 0 1 1.5 1.5v9.5"/>
          </svg>
        </button>
        <button class="window-btn close" @click="closeWindow" title="关闭">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- [改版 920x640] 三段式：顶部计时卡 / 中部双卡（任务|统计）/ 底部热力条 -->
    <main @scroll.passive="onMainScroll">
      <div class="content">
        <section class="timer-area">
          <div class="timer-card">
            <TimerDisplay />
            <div class="timer-meta">
              <ModeSelector />
              <div class="goal-slot">
                <div class="goal-line">
                  <b>{{ statsStore.todayCount }}</b>/{{ settingsStore.settings.dailyGoal }} 个番茄
                  <span v-if="timerStore.isRunning && currentTaskName" class="goal-task">正在专注 · {{ currentTaskName }}</span>
                  <span class="goal-pct">{{ goalPct }}%</span>
                </div>
                <div class="goal-bar"><i :style="{ width: goalPct + '%' }"></i></div>
              </div>
            </div>
            <div class="timer-ctl">
              <TimerControls />
            </div>
          </div>
        </section>
        <TaskList />
        <StatsDisplay />
      </div>
    </main>

    <!-- [改版] 仅右缘调宽：拖拽把手（高度锁死，宽度最小 1056） -->
    <div
      class="resize-handle"
      title="拖动调整宽度"
      @pointerdown="onResizeDown"
      @pointermove="onResizeMove"
      @pointerup="onResizeUp"
      @pointercancel="onResizeUp"
    ></div>

    <!-- [方案1] 内嵌沉浸模式：覆盖层盖住整个主窗口，计时直接读 store，Esc 退出（计时继续） -->
    <div v-if="inlineFocus" class="focus-inline">
      <div class="fi-task">正在专注<template v-if="currentTaskName"> · {{ currentTaskName }}</template></div>
      <div class="fi-time">{{ fmtFocusTime }}</div>
      <div class="fi-btns">
        <button
          class="fbtn primary"
          :title="timerStore.isRunning ? '暂停 (Space)' : '继续 (Space)'"
          @click="timerStore.isRunning ? timerStore.pause() : timerStore.start()"
        >
          <svg v-if="timerStore.isRunning" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M8 5.5v13a.7.7 0 0 0 1.07.6l10-6.5a.7.7 0 0 0 0-1.2l-10-6.5A.7.7 0 0 0 8 5.5z"/>
          </svg>
          {{ timerStore.isRunning ? '暂停' : '继续' }}
        </button>
        <button class="fbtn" title="退出沉浸模式 (Esc)" @click="inlineFocus = false">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>
          </svg>
          退出
        </button>
      </div>
      <div class="fi-esc">按 Esc 退出 · 计时继续</div>
    </div>
  </div>
  <CelebrationOverlay />
  <AppToast />
</template>

<style scoped>
/* ===== [改版 920x640] 三段式仪表盘：顶部计时卡 / 中部双卡（任务|统计）/ 底部热力条 ===== */
main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr) auto;
  grid-template-areas:
    "timer timer"
    "tasks stats"
    "heat heat";
  /* [需求] 瘦身：默认窗口（867×592 CSS px）下三段式固有必要高度是 603px、可视区只有 544px，
     热力条会被顶出可视区。这里连同各卡片内边距一起收窄 ~59px，让三行完整显示、不出现滚动条 */
  gap: 7px;
  align-items: stretch;
  min-height: 100%;
  padding: 6px 12px;
}

/* 顶部计时卡 */
.timer-area {
  grid-area: timer;
  min-width: 0;
}

.timer-card {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  /* [需求] 瘦身：上下内边距 12/14 → 8/9，配合缩小的倒计时字号让计时卡从 78px 降到 ~52px */
  padding: 8px 18px 9px;
  box-shadow: 0 2px 12px var(--shadow);
}

.timer-meta {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  /* [需求] 模式 tab 靠左（贴着倒计时数字），进度条占中部剩余空间 */
  min-height: 19px;
}

/* [优化] 今日目标进度（接 statsStore.todayCount / dailyGoal） */
.goal-slot {
  flex: 1;
  min-width: 0;
  padding: 0 6px;
}

.goal-line {
  display: flex;
  align-items: baseline;
  gap: 5px;
  font-size: 12.5px;
  color: var(--text-muted);
  margin-bottom: 6px;
  white-space: nowrap;
}

.goal-line b {
  color: var(--text-primary);
  font-size: 13px;
}

.goal-task {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex-shrink: 1;
}

.goal-pct {
  margin-left: auto;
  font-size: 11px;
  flex-shrink: 0;
}

.goal-bar {
  height: 4px;
  border-radius: 2px;
  background: var(--border-color);
  overflow: hidden;
}

.goal-bar i {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--tomato-light), var(--tomato));
  transition: width 0.3s ease;
}

.timer-ctl {
  display: flex;
  justify-content: center;
  flex-shrink: 0;
}

/* ===== 标题栏 ===== */
/* [修复] 标题栏空白区：系统原生拖动（drag），双击最大化走 pointerdown 计时检测 */
.title-blank {
  flex: 1;
  align-self: stretch;
  -webkit-app-region: drag;
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
}

/* [需求] 竖线：分隔功能按钮区（左）与窗口控制区（右） */
.title-divider {
  width: 1px;
  height: 16px;
  background: var(--border-color);
  margin: 0 4px;
  align-self: center;
  flex-shrink: 0;
}

/* 与 SettingsPanel settings-btn 统一的紧凑尺寸 */
.theme-toggle,
.focus-btn,
.window-btn {
  width: 30px;
  height: 28px;
  border-radius: 6px;
}

.theme-toggle:hover,
.focus-btn:hover,
.window-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.light-theme .theme-toggle:hover,
.light-theme .focus-btn:hover,
.light-theme .window-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #2d2420;
}

.light-theme .window-btn.close:hover {
  background: #e74c3c;
  color: white;
}

/* [改版] 仅右缘调宽把手：全高 6px，悬停可见提示条 */
.resize-handle {
  position: fixed;
  right: 0;
  top: 0;
  width: 6px;
  height: 100vh;
  cursor: ew-resize;
  z-index: 999;
  -webkit-app-region: no-drag;
  touch-action: none;
}

/* ===== [方案1] 内嵌沉浸模式覆盖层（对齐 demo-focus-inline，主题变量适配） ===== */
.focus-inline {
  position: absolute;
  inset: 0;
  z-index: 99;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 26px;
  animation: fi-fade 0.25s ease;
  user-select: none;
  -webkit-user-select: none;
}

@keyframes fi-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.fi-task {
  color: var(--text-muted);
  font-size: 15px;
  letter-spacing: 1px;
}

.fi-time {
  font-size: 150px;
  font-weight: 800;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.fi-btns {
  display: flex;
  gap: 16px;
}

.fbtn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 10px 28px;
  font-size: 14px;
  cursor: pointer;
  transition: filter 0.15s ease, transform 0.12s ease;
}

.fbtn:hover {
  filter: brightness(1.15);
}

.fbtn:active {
  transform: scale(0.96);
}

.fbtn.primary {
  background: var(--tomato);
  border-color: var(--tomato);
  color: #fff;
  font-weight: 700;
}

.fi-esc {
  color: var(--text-muted);
  font-size: 12px;
}
</style>

<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Serif+Display&display=swap');

:root {
  --tomato: #e74c3c;
  --tomato-dark: #c0392b;
  --tomato-light: #ff6b5b;
  --break-color: #3498db;
  --break-long: #9b59b6;

  /* Dark theme (default) */
  --bg-primary: #1a1614;
  --bg-secondary: #2d2522;
  --bg-card: rgba(45, 37, 34, 0.85);
  --text-primary: #faf5f0;
  --text-secondary: #c4bdb5;
  --text-muted: #8a827a;
  --border-color: rgba(168, 159, 151, 0.18);
  --shadow: rgba(0, 0, 0, 0.4);

  /* Blobs */
  --blob1-color: rgba(231, 76, 60, 0.15);
  --blob2-color: rgba(52, 152, 219, 0.08);

  /* Heatmap colors */
  --heatmap-empty: rgba(45, 37, 34, 0.3);
  --heatmap-1: rgba(231, 76, 60, 0.25);
  --heatmap-2: rgba(231, 76, 60, 0.45);
  --heatmap-3: rgba(231, 76, 60, 0.65);
  --heatmap-4: rgba(231, 76, 60, 0.85);
  --heatmap-5: #e74c3c;

  /* Check-in colors */
  --completed-bg: rgba(39, 174, 96, 0.2);
  --completed-color: #2ecc71;

  /* Task list states (dark theme) */
  --task-completed-bg: rgba(45, 37, 34, 0.45);
  --task-expired-bg: rgba(45, 37, 34, 0.5);
}

[data-theme="light"] {
  --bg-primary: #f5f2ef;
  --bg-secondary: #ffffff;
  --bg-card: rgba(255, 255, 255, 0.98);
  --text-primary: #1a1512;
  --text-secondary: #5c524a;
  --text-muted: #9a9088;
  --border-color: rgba(45, 36, 32, 0.1);
  --shadow: rgba(45, 36, 32, 0.1);
  --blob1-color: rgba(231, 76, 60, 0.08);
  --blob2-color: rgba(52, 152, 219, 0.05);

  /* Heatmap colors - lighter for light theme */
  --heatmap-empty: rgba(45, 36, 32, 0.1);
  --heatmap-1: rgba(231, 76, 60, 0.2);
  --heatmap-2: rgba(231, 76, 60, 0.35);
  --heatmap-3: rgba(231, 76, 60, 0.5);
  --heatmap-4: rgba(231, 76, 60, 0.7);
  --heatmap-5: #e74c3c;

  /* Check-in colors - light theme */
  --completed-bg: #f0f9f4;
  --completed-color: #27ae60;

  /* Task list states (light theme) */
  --task-completed-bg: rgba(45, 36, 32, 0.05);
  --task-expired-bg: rgba(231, 76, 60, 0.06);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  transition: background 0.4s ease, color 0.3s ease;
  min-height: 100vh;
  overflow-x: hidden;
}

.app {
  height: 100vh;
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  background: var(--bg-primary);
  user-select: none;
  -webkit-user-select: none;
  display: flex;
  flex-direction: column;
}

/* 自定义标题栏 */
.title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 48px;
  padding: 0 8px 0 16px;
  background: var(--bg-card);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border-color);
  -webkit-app-region: drag;
}

.drag-region {
  flex: 1;
  display: flex;
  align-items: center;
  -webkit-app-region: drag;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  /* [标题栏拖动优化] no-drag → drag：logo 无点击事件，整段参与拖动，扩大可拖面积 */
  -webkit-app-region: drag;
}

.tomato-icon {
  width: 28px;
  height: 28px;
  color: var(--tomato);
  filter: drop-shadow(0 2px 6px rgba(231, 76, 60, 0.3));
}

.title {
  font-family: 'DM Serif Display', serif;
  font-size: 16px;
  color: var(--text-primary);
}

.window-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.theme-toggle,
.focus-btn,
.window-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.theme-toggle:hover,
.focus-btn:hover,
.window-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.window-btn.close:hover {
  background: rgba(231, 76, 60, 0.8);
  color: white;
}

/* 装饰性背景 blobs */
.bg-blob {
  position: fixed;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
  z-index: 0;
}

.blob-1 {
  width: 500px;
  height: 500px;
  background: var(--blob1-color);
  top: -150px;
  right: -100px;
  animation: float 20s ease-in-out infinite;
}

.blob-2 {
  width: 400px;
  height: 400px;
  background: var(--blob2-color);
  bottom: -100px;
  left: -150px;
  animation: float 25s ease-in-out infinite reverse;
}

@keyframes float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(20px, -30px) scale(1.05); }
  50% { transform: translate(-10px, 20px) scale(0.95); }
  75% { transform: translate(30px, 10px) scale(1.02); }
}

main {
  width: 100%;
  margin: 0;
  padding: 0;
  position: relative;
  z-index: 10;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  transition: scrollbar-color 0.3s ease;
  /* [改版] 旧 .main-content 布局的 flex column + align-items:center 已删：
     会让三段式 .content 网格收缩居中，两侧留大空白 */
}

main:hover,
main:focus-within,
main.scrolling {
  scrollbar-color: rgba(231, 76, 60, 0.4) transparent;
}

main::-webkit-scrollbar {
  width: 6px;
}

main::-webkit-scrollbar-track {
  background: transparent;
  margin: 8px 0;
}

main::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 3px;
  transition: background 0.3s ease;
}

main:hover::-webkit-scrollbar-thumb,
main:focus-within::-webkit-scrollbar-thumb,
main.scrolling::-webkit-scrollbar-thumb {
  background: rgba(231, 76, 60, 0.4);
}

main::-webkit-scrollbar-thumb:hover {
  background: rgba(231, 76, 60, 0.6) !important;
}

main::-webkit-scrollbar-thumb:active {
  background: rgba(231, 76, 60, 0.8) !important;
}

main::-webkit-scrollbar-corner {
  background: transparent;
}

/* Settings modal styles are in SettingsPanel.vue */

.el-button {
  border-radius: 10px !important;
}

.el-input-number {
  --el-input-bg-color: var(--bg-primary);
  --el-input-border-color: var(--border-color);
  --el-input-text-color: var(--text-primary);
}

/* Light theme specific overrides */
.light-theme .title-bar {
  background: rgba(255, 255, 255, 0.9);
}

.light-theme .tomato-icon {
  filter: drop-shadow(0 2px 12px rgba(231, 76, 60, 0.25));
}

.light-theme .theme-toggle:hover,
.light-theme .focus-btn:hover,
.light-theme .window-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #2d2420;
}

.light-theme .window-btn.close:hover {
  background: #e74c3c;
  color: white;
}
</style>
