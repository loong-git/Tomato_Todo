<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTaskStore, useTimerStore, useStatsStore, useSettingsStore } from '@/stores'
import { playCelebrationSound } from '@/utils'
import { toast } from '@/utils/toast'

const taskStore = useTaskStore()
const timerStore = useTimerStore()
const statsStore = useStatsStore()
const settingsStore = useSettingsStore()

const emit = defineEmits<{
  (e: 'task-completed'): void
}>()

const newTaskName = ref('')
const showArchived = ref(false)
const showHistory = ref(false)
const strikingTaskId = ref<string | null>(null)
// [改版] 刚完成标记：驱动"叮咚"拍动画（绿圈 pop + 绿光 wash），~1s 后移除避免列表重渲染时重复播放
const justDoneTaskId = ref<string | null>(null)

function getDateKey(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (dateOnly.getTime() === today.getTime()) {
    return '今天'
  } else if (dateOnly.getTime() === yesterday.getTime()) {
    return '昨天'
  } else if (dateOnly.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}/${date.getDate()}`
  } else {
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
  }
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

// [改版 方案2 时间线] 日期组的星期几
function getWeekday(timestamp: number): string {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(timestamp).getDay()]
}

// [改版 方案2 时间线] 任务在"创建当日"的真实专注时长（该日该任务的 records 累加）
function taskDayDuration(taskId: string, createdAt: number): number {
  const d = new Date(createdAt)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const end = start + 86400000
  let seconds = 0
  statsStore.records.forEach(r => {
    if (r.taskId === taskId && r.type === 'focus' && r.completedAt >= start && r.completedAt < end) {
      seconds += r.duration
    }
  })
  return seconds
}

// 秒 → "2h 05m" / "45m"
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

interface TaskGroup {
  dateKey: string
  tasks: typeof taskStore.tasks
}

const activeTaskGroups = computed<TaskGroup[]>(() => {
  const groups: Map<string, typeof taskStore.tasks> = new Map()

  for (const task of taskStore.activeTasks) {
    const key = getDateKey(task.createdAt)
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(task)
  }

  return Array.from(groups.entries()).map(([dateKey, tasks]) => ({ dateKey, tasks }))
})

const historyTaskGroups = computed<TaskGroup[]>(() => {
  const groups: Map<string, typeof taskStore.tasks> = new Map()

  for (const task of taskStore.historyTasks) {
    const key = getDateKey(task.createdAt)
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(task)
  }

  return Array.from(groups.entries()).map(([dateKey, tasks]) => ({ dateKey, tasks }))
})

function addTask() {
  if (newTaskName.value.trim()) {
    const task = taskStore.addTask(newTaskName.value.trim())
    timerStore.toggleCurrentTask(task.id)
    newTaskName.value = ''
  }
}

function selectTask(taskId: string) {
  const task = taskStore.tasks.find(t => t.id === taskId)
  if (task && task.isCompleted) {
    console.log('[TaskList] 已完成任务不可选中:', taskId)
    return
  }
  timerStore.toggleCurrentTask(taskId)
}

function toggleComplete(taskId: string) {
  const task = taskStore.tasks.find(t => t.id === taskId)
  if (task) {
    if (task.isCompleted) {
      return
    } else {
      strikingTaskId.value = taskId
      // 立即调用音效（与动画同步）
      playCelebrationSound()
      if (timerStore.currentTaskIds.includes(taskId)) {
        timerStore.toggleCurrentTask(taskId)
      }
      setTimeout(() => {
        taskStore.completeTask(taskId)
        strikingTaskId.value = null
        // [改版] t=0.5s 划线结束瞬间（"叮"）：绿圈 pop + 绿光 wash（"咚"）
        justDoneTaskId.value = taskId
        setTimeout(() => { justDoneTaskId.value = null }, 900)
        emit('task-completed')
      }, 500)
    }
  }
}

function deleteTask(taskId: string) {
  if (timerStore.currentTaskIds.includes(taskId)) {
    timerStore.toggleCurrentTask(taskId)
  }
  taskStore.deleteTask(taskId)
}

const showClearConfirm = ref(false)

function clearHistory() {
  showClearConfirm.value = true
}

function confirmClearHistory() {
  // 删除所有历史任务（昨天及之前创建的）
  const taskIds = taskStore.historyTasks.map(t => t.id)
  const count = taskIds.length
  taskIds.forEach(id => taskStore.deleteTask(id))
  showClearConfirm.value = false
  showHistory.value = false
  toast.info(`已清除 ${count} 个历史任务`)
}

function unarchiveTask(taskId: string) {
  taskStore.unarchiveTask(taskId)
}

function archiveTask(taskId: string) {
  // 如果任务在选中列表中，先取消选中
  if (timerStore.currentTaskIds.includes(taskId)) {
    timerStore.toggleCurrentTask(taskId)
  }
  taskStore.archiveTask(taskId)
}

function deleteArchivedTask(taskId: string) {
  taskStore.deleteArchivedTask(taskId)
}
</script>

<template>
  <div class="task-list">
    <!-- 番茄 icon 公共渐变（icon.svg 同源形象；同文档 defs 全局引用，避免 v-for 重复 id） -->
    <svg width="0" height="0" style="position:absolute" aria-hidden="true">
      <defs>
        <radialGradient id="tomatoIconGrad" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#ff6b5b"/>
          <stop offset="100%" stop-color="#e74c3c"/>
        </radialGradient>
      </defs>
    </svg>
    <div class="card-head">
      <h3>今日任务</h3>
      <div class="fold-right">
        <span class="goal-badge">
          <svg class="ticon" style="width:11px;height:11px;vertical-align:-2px" viewBox="0 0 64 64"><ellipse cx="32" cy="38" rx="26" ry="24" fill="url(#tomatoIconGrad)"/><ellipse cx="23" cy="31" rx="9" ry="7" fill="rgba(255,255,255,.35)"/><path d="M32 18 C29 11 22 11 20 15 C18 19 23 22 27 21 C29 19 30 19 32 18" fill="#4a7c59"/><path d="M32 18 C35 11 42 11 44 15 C46 19 41 22 37 21 C35 19 34 19 32 18" fill="#5a8c69"/><path d="M32 18 C31 9 36 6 38 9 C40 12 36 17 32 18" fill="#3d6b4a"/><path d="M32 18 C33 9 28 6 26 9 C24 12 28 17 32 18" fill="#4a7c59"/><rect x="30" y="15" width="4" height="5" rx="1.5" fill="#4a7c59"/></svg>
          {{ statsStore.todayCount }}/{{ settingsStore.settings.dailyGoal }}
        </span>
      </div>
    </div>
    <div class="add-task">
      <input
        v-model="newTaskName"
        type="text"
        placeholder="添加新任务...（N）"
        class="task-input"
        @keyup.enter="addTask"
      />
      <button class="add-btn" @click="addTask">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>

    <div class="task-groups">
      <div v-for="group in activeTaskGroups" :key="group.dateKey" class="task-group">
        <div class="date-header">{{ group.dateKey }}</div>
        <div
          v-for="task in group.tasks"
          :key="task.id"
          class="tcard2"
          :class="{ active: timerStore.currentTaskIds.includes(task.id), striking: strikingTaskId === task.id, done: task.isCompleted, 'just-done': justDoneTaskId === task.id }"
          @click="!task.isCompleted && selectTask(task.id)"
        >
          <div class="l1">
            <div v-if="task.isCompleted" class="cb2 did">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div class="task-name-wrapper" :title="task.name">
              <span class="nm2">{{ task.name }}</span>
            </div>
            <span v-if="task.isCompleted" class="tag ok">已完成</span>
            <span v-else-if="timerStore.currentTaskIds.includes(task.id) && timerStore.isRunning" class="tag live-tag">专注中</span>
          </div>
          <div class="l2">
            <span v-if="timerStore.currentTaskIds.includes(task.id) && timerStore.isRunning && !task.isCompleted" class="live"><span class="dot"></span>第 {{ task.completedPomodoros + 1 }} 个番茄进行中</span>
            <span class="meta"><svg class="ticon" viewBox="0 0 64 64"><ellipse cx="32" cy="38" rx="26" ry="24" fill="url(#tomatoIconGrad)"/><ellipse cx="23" cy="31" rx="9" ry="7" fill="rgba(255,255,255,.35)"/><path d="M32 18 C29 11 22 11 20 15 C18 19 23 22 27 21 C29 19 30 19 32 18" fill="#4a7c59"/><path d="M32 18 C35 11 42 11 44 15 C46 19 41 22 37 21 C35 19 34 19 32 18" fill="#5a8c69"/><path d="M32 18 C31 9 36 6 38 9 C40 12 36 17 32 18" fill="#3d6b4a"/><path d="M32 18 C33 9 28 6 26 9 C24 12 28 17 32 18" fill="#4a7c59"/><rect x="30" y="15" width="4" height="5" rx="1.5" fill="#4a7c59"/></svg> ×{{ task.completedPomodoros }}<template v-if="task.isCompleted && taskDayDuration(task.id, task.createdAt) > 0"> · {{ formatDuration(taskDayDuration(task.id, task.createdAt)) }}</template></span>
            <span class="meta">{{ formatTime(task.createdAt) }} 创建</span>
            <div class="acts2" v-if="!task.isCompleted">
              <button
                v-if="strikingTaskId !== task.id"
                class="done-btn"
                @click.stop="toggleComplete(task.id)"
                title="完成"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </button>
              <button class="archive-btn" @click.stop="archiveTask(task.id)" title="归档">📦</button>
              <button class="delete-btn" @click.stop="deleteTask(task.id)">×</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 历史任务按钮 -->
    <button class="history-btn" @click="showHistory = true">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      历史任务<span v-if="taskStore.historyTasks.length > 0"> ({{ taskStore.historyTasks.length }})</span>
    </button>

    <!-- 历史任务弹窗 -->
    <Teleport to="body">
      <div v-if="showHistory" class="history-overlay" @click.self="showHistory = false">
        <div class="history-panel">
          <div class="panel-header">
            <h3>历史任务</h3>
            <div class="header-actions">
              <button class="clear-btn" @click="clearHistory" title="清除历史">清除</button>
              <button class="close-btn" @click="showHistory = false">×</button>
            </div>
          </div>
          <div class="panel-body">
            <!-- 空状态 -->
            <div v-if="historyTaskGroups.length === 0" class="history-empty">
              <div class="empty-icon">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div class="empty-title">暂无历史任务</div>
              <div class="empty-hint">昨天及之前的任务会显示在这里</div>
            </div>
            <!-- [改版 方案2] 时间线：日期圆点 + 竖轴 + 状态卡片 -->
            <div v-else class="timeline">
              <div v-for="group in historyTaskGroups" :key="group.dateKey" class="tl-group">
                <div class="tl-date">
                  <div class="tl-dot" :class="{ mute: !group.tasks.some(t => t.isCompleted) }"></div>
                  <span class="d">{{ group.dateKey }}</span>
                  <span class="w">{{ getWeekday(group.tasks[0].createdAt) }}</span>
                </div>
                <div
                  v-for="task in group.tasks"
                  :key="task.id"
                  class="tcard"
                  :class="{ done: task.isCompleted }"
                >
                  <span class="nm">{{ task.name }}</span>
                  <span class="po2"><svg class="ticon" viewBox="0 0 64 64"><ellipse cx="32" cy="38" rx="26" ry="24" fill="url(#tomatoIconGrad)"/><ellipse cx="23" cy="31" rx="9" ry="7" fill="rgba(255,255,255,.35)"/><path d="M32 18 C29 11 22 11 20 15 C18 19 23 22 27 21 C29 19 30 19 32 18" fill="#4a7c59"/><path d="M32 18 C35 11 42 11 44 15 C46 19 41 22 37 21 C35 19 34 19 32 18" fill="#5a8c69"/><path d="M32 18 C31 9 36 6 38 9 C40 12 36 17 32 18" fill="#3d6b4a"/><path d="M32 18 C33 9 28 6 26 9 C24 12 28 17 32 18" fill="#4a7c59"/><rect x="30" y="15" width="4" height="5" rx="1.5" fill="#4a7c59"/></svg> ×{{ task.completedPomodoros }}<small v-if="taskDayDuration(task.id, task.createdAt) > 0"> · {{ formatDuration(taskDayDuration(task.id, task.createdAt)) }}</small></span>
                  <span class="badge" :class="task.isCompleted ? 'ok' : 'overdue'">{{ task.isCompleted ? '已完成' : '未完成' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 自定义确认弹窗 -->
      <div v-if="showClearConfirm" class="confirm-overlay" @click.self="showClearConfirm = false">
        <div class="confirm-dialog">
          <div class="confirm-icon">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
            </svg>
          </div>
          <div class="confirm-title">清除历史任务</div>
          <div class="confirm-message">确定要清除所有历史任务吗？此操作不可恢复。</div>
          <div class="confirm-actions">
            <button class="confirm-btn cancel" @click="showClearConfirm = false">取消</button>
            <button class="confirm-btn danger" @click="confirmClearHistory">确定清除</button>
          </div>
        </div>
      </div>
    </Teleport>

    <div v-if="taskStore.archivedTasks.length > 0" class="archived-section">
      <div class="section-header" @click="showArchived = !showArchived">
        <span class="header-left">
          <span>📁 已归档 {{ taskStore.archivedTasks.length }}</span>
          <span class="help-icon" @click.stop>?</span>
        </span>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" :class="{ rotated: showArchived }">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div v-if="showArchived" class="archived-list">
        <div
          v-for="task in taskStore.archivedTasks"
          :key="task.id"
          class="task-item archived"
        >
          <span class="task-name">{{ task.name }}</span>
          <span class="pomodoro-badge">{{ task.completedPomodoros }}</span>
          <button class="unarchive-btn" @click.stop="unarchiveTask(task.id)" title="恢复">↩</button>
          <button class="delete-btn" @click.stop="deleteArchivedTask(task.id)">×</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ===== [改版 方案2] 历史任务时间线 ===== */
.timeline {
  position: relative;
  padding-left: 26px;
}

.timeline::before {
  content: "";
  position: absolute;
  left: 8px;
  top: 14px;
  bottom: 14px;
  width: 2px;
  background: var(--border-color);
  border-radius: 1px;
}

.tl-group {
  margin-bottom: 14px;
}

.tl-date {
  position: relative;
  margin: 12px 0 8px;
}

.tl-date:first-child {
  margin-top: 0;
}

.tl-dot {
  position: absolute;
  left: -26px;
  top: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--tomato);
  box-shadow: 0 0 0 3px rgba(231, 76, 60, 0.18);
}

.tl-dot.mute {
  background: var(--text-muted);
  opacity: 0.55;
  box-shadow: 0 0 0 3px var(--bg-secondary);
}

.tl-date .d {
  font-size: 12.5px;
  color: var(--text-primary);
  font-weight: 600;
}

.tl-date .w {
  font-size: 11px;
  color: var(--text-muted);
  margin-left: 6px;
}

.tcard {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 11px 14px;
  margin-bottom: 6px;
  transition: background 0.15s ease;
}

.tcard:hover {
  filter: brightness(1.06);
}

.tcard .nm {
  flex: 1;
  font-size: 13px;
  color: var(--text-secondary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tcard.done .nm {
  color: var(--text-muted);
  text-decoration: line-through;
  text-decoration-color: var(--border-color);
}

.tcard .po2 {
  font-size: 11.5px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.tcard .po2 small {
  color: var(--text-muted);
}

.tcard .badge {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 10px;
  white-space: nowrap;
  flex-shrink: 0;
}

.tcard .badge.ok {
  background: rgba(46, 204, 113, 0.14);
  color: #2ecc71;
}

.tcard .badge.overdue {
  background: rgba(231, 76, 60, 0.14);
  color: var(--tomato-light);
}

/* ===== [改版 方案2] 主任务双行信息卡 ===== */
.tcard2 {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  margin-bottom: 6px;
  cursor: pointer;
  position: relative;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.tcard2:hover {
  border-color: var(--text-muted);
}

.tcard2.active {
  border-color: rgba(231, 76, 60, 0.55);
  background: rgba(231, 76, 60, 0.06);
}

.tcard2.done {
  cursor: default;
  background: var(--task-completed-bg);
  border-color: transparent;
}

/* [改版] 完成动画 A 方案+轻沉降，节拍对齐音效（0s 沙沙起 → 0.5s 叮 → 0.68s 咚）：
   striking（0~0.5s）：卡片轻沉降 + 红光 wash + 红线划过任务名（配沙沙笔触声）
   just-done（0.5s~）：绿圈 pop（配"叮"）+ 绿光 wash（配"咚"） */
.tcard2.striking {
  animation: task-strike 0.5s cubic-bezier(0.65, 0, 0.35, 1);
}

@keyframes task-strike {
  0% {
    background: rgba(231, 76, 60, 0.22);
    box-shadow: 0 0 18px rgba(231, 76, 60, 0.3);
    transform: scale(1);
  }
  30% {
    transform: scale(0.985);
  }
  100% {
    background: var(--bg-card);
    box-shadow: none;
    transform: scale(1);
  }
}

/* 红线划过任务名（沙沙声 0.5s 同步） */
.tcard2.striking .nm2::after {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  height: 3px;
  width: 0;
  background: var(--tomato);
  border-radius: 1.5px;
  transform: translateY(-50%);
  animation: nm-strike 0.5s cubic-bezier(0.65, 0, 0.35, 1) forwards;
}

@keyframes nm-strike {
  to { width: 100%; }
}

/* "叮"（t=0.5s）：绿圈弹跳出现 + 对勾画出 */
.tcard2.just-done .cb2.did {
  animation: cb-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.tcard2.just-done .cb2.did svg polyline {
  stroke-dasharray: 24;
  stroke-dashoffset: 24;
  animation: cb-check 0.25s ease-out 0.1s forwards;
}

@keyframes cb-pop {
  0% { transform: scale(0); }
  70% { transform: scale(1.25); }
  100% { transform: scale(1); }
}
@keyframes cb-check {
  to { stroke-dashoffset: 0; }
}

/* "咚"（t=0.5s 起）：绿光 wash 收尾 */
.tcard2.just-done {
  animation: done-wash 0.55s ease-out;
}

@keyframes done-wash {
  0% {
    background: rgba(74, 124, 89, 0.2);
    box-shadow: 0 0 18px rgba(74, 124, 89, 0.28);
  }
  100% {
    background: var(--task-completed-bg);
    box-shadow: none;
  }
}

.l1 {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.cb2 {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.6px solid var(--text-muted);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: transparent;
}

.cb2.on {
  border-color: var(--tomato);
}

.cb2.did {
  background: #27ae60;
  border-color: #27ae60;
  color: #fff;
}

.l1 .task-name-wrapper {
  flex: 1;
  min-width: 0;
}

.nm2 {
  font-size: 13.5px;
  color: var(--text-primary);
  font-weight: 500;
  position: relative;
}

.tcard2.done .nm2 {
  color: var(--text-muted);
  font-weight: 400;
  text-decoration: line-through;
  text-decoration-color: var(--border-color);
}

.tag {
  font-size: 10.5px;
  padding: 2px 9px;
  border-radius: 9px;
  flex-shrink: 0;
}

.tag.ok {
  background: rgba(46, 204, 113, 0.14);
  color: #2ecc71;
}

.tag.live-tag {
  background: rgba(231, 76, 60, 0.16);
  color: var(--tomato-light);
}

.l2 {
  display: flex;
  align-items: center;
  gap: 3px;
  padding-left: 0;
}

.live {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--tomato-light);
  white-space: nowrap;
}

.live .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tomato);
  animation: live-blink 1.2s infinite;
}

@keyframes live-blink {
  50% { opacity: 0.3; }
}

.meta {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

.acts2 {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.tcard2:hover .acts2 {
  opacity: 1;
}


/* [改版] 卡片容器（网格: tasks 区） */
.task-list {
  grid-area: tasks;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 14px 16px;
  box-shadow: 0 2px 12px var(--shadow);
}

.card-head {
  /* [修复] 标题左 + 徽章右一行排布，徽章不再掉到标题下方挤输入框 */
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.card-head h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.fold-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* [优化] 计数徽章化：比纯文字更聚焦 */
.goal-badge {
  font-size: 11px;
  color: var(--tomato-light);
  background: rgba(231, 76, 60, 0.12);
  border: 1px solid rgba(231, 76, 60, 0.25);
  padding: 2px 9px;
  border-radius: 999px;
  font-weight: 600;
}

/* [改版] 番茄 icon（内联 SVG，icon.svg 同源形象）：15px、基线对齐、贴紧数量 */
.ticon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  display: inline-block;
  vertical-align: -3px;
  margin-right: 0;
}

.add-task {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.task-input {
  flex: 1;
  padding: 9px 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  outline: none;
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}

.task-input::placeholder {
  color: var(--text-muted);
}

.task-input:focus {
  border-color: var(--tomato);
  box-shadow: 0 0 0 3px rgba(231, 76, 60, 0.15);
}

.add-btn {
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 10px;
  background: var(--tomato);
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease, background 0.2s ease;
}

.add-btn:hover {
  background: var(--tomato-light);
}

.add-btn:active {
  transform: scale(0.95);
}

.task-groups {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* [改版] 列表随中行高度伸缩（窗口最大化时中行被 1fr 拉高，列表跟着变高可看更多任务） */
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 6px;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: rgba(231, 76, 60, 0.2) transparent;
  transition: scrollbar-color 0.3s ease;
}

.task-groups:hover,
.task-groups:focus-within,
.task-groups.is-scrolling {
  scrollbar-color: rgba(231, 76, 60, 0.55) transparent;
}

.task-groups::-webkit-scrollbar {
  width: 6px;
}

.task-groups::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.04);
  margin: 4px 0;
  border-radius: 3px;
}

.task-groups::-webkit-scrollbar-thumb {
  background: rgba(231, 76, 60, 0.25);
  border-radius: 3px;
  transition: background 0.3s ease;
}

.task-groups:hover::-webkit-scrollbar-thumb,
.task-groups:focus-within::-webkit-scrollbar-thumb,
.task-groups.is-scrolling::-webkit-scrollbar-thumb {
  background: rgba(231, 76, 60, 0.55);
}

.task-groups::-webkit-scrollbar-thumb:hover {
  background: rgba(231, 76, 60, 0.75) !important;
}

/* 浅色主题：滚动条颜色更深一点 */
[data-theme="light"] .task-groups {
  scrollbar-color: rgba(231, 76, 60, 0.15) transparent;
}

[data-theme="light"] .task-groups:hover,
[data-theme="light"] .task-groups:focus-within,
[data-theme="light"] .task-groups.is-scrolling {
  scrollbar-color: rgba(231, 76, 60, 0.4) transparent;
}

[data-theme="light"] .task-groups::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.04);
}

[data-theme="light"] .task-groups::-webkit-scrollbar-thumb {
  background: rgba(231, 76, 60, 0.2);
}

[data-theme="light"] .task-groups:hover::-webkit-scrollbar-thumb,
[data-theme="light"] .task-groups:focus-within::-webkit-scrollbar-thumb,
[data-theme="light"] .task-groups.is-scrolling::-webkit-scrollbar-thumb {
  background: rgba(231, 76, 60, 0.4);
}

[data-theme="light"] .task-groups::-webkit-scrollbar-thumb:hover {
  background: rgba(231, 76, 60, 0.6) !important;
}

.task-group {
  margin-bottom: 12px;
}

/* [改版] 日期组标题：小字 + 延伸分隔线 */
.date-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: 'DM Sans', sans-serif;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-muted);
  padding: 2px 2px 6px;
  margin-bottom: 2px;
}

.date-header::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--border-color);
}

.date-header.completed {
  color: var(--text-muted);
  opacity: 0.6;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 9px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.task-item:hover {
  background: var(--bg-secondary);
}

.task-item.active {
  background: var(--bg-secondary);
  border-color: var(--tomato);
}

.task-item.completed {
  background: var(--task-completed-bg);
  border-color: transparent;
  cursor: default;
}

.task-item.completed:hover {
  background: var(--task-completed-bg);
}

.task-item.completed .task-name {
  color: var(--text-muted);
}

.task-item.striking {
  position: relative;
  animation: task-flash 0.6s ease-out;
}

@keyframes task-flash {
  0% {
    background: rgba(231, 76, 60, 0.3);
    box-shadow: 0 0 20px rgba(231, 76, 60, 0.4);
  }
  100% {
    background: var(--bg-card);
    box-shadow: none;
  }
}

.task-item.striking {
  position: relative;
  animation: task-flash 0.6s ease-out;
}

/* [改版] 完成按钮 C 方案·重构：静置=暗底灰勾（低调融入），hover=红渐变实底白勾 */
.done-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--bg-secondary);
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s ease;
  flex-shrink: 0;
}

.done-btn:hover {
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  color: #fff;
  transform: scale(1.08);
  box-shadow: 0 1px 8px rgba(231, 76, 60, 0.4);
}

.completing-icon {
  font-size: 18px;
  color: #4ecdc4;
  flex-shrink: 0;
  animation: check-pop 0.4s ease-out;
}

@keyframes check-pop {
  0% { transform: scale(0); opacity: 0; }
  60% { transform: scale(1.3); }
  100% { transform: scale(1); opacity: 1; }
}

.task-name {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.task-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.task-name-wrapper {
  position: relative;
  flex: 1;
  min-width: 0;
}

.task-name-wrapper .tooltip {
  display: none;
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  width: max-content;
  max-width: 100%;
  padding: 10px 16px;
  background: linear-gradient(135deg, var(--tomato) 0%, var(--tomato-dark) 100%);
  border-radius: 12px;
  color: #fff;
  opacity: 1;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  white-space: normal;
  word-break: break-all;
  line-height: 1.4;
  z-index: 9999;
  box-shadow:
    0 4px 20px rgba(231, 76, 60, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.15) inset;
  margin-bottom: 4px;
  pointer-events: none;
}

.task-name-wrapper .tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 8px solid transparent;
  border-top-color: var(--tomato-dark);
}

.task-name-wrapper:hover .tooltip {
  display: block;
}

/* 浅色主题适配 */
[data-theme="light"] .task-name-wrapper .tooltip {
  background: linear-gradient(135deg, #d64541 0%, #c0392b 100%);
  box-shadow:
    0 6px 24px rgba(192, 57, 43, 0.4),
    0 0 0 2px rgba(255, 255, 255, 0.8) inset,
    0 1px 2px rgba(0, 0, 0, 0.1);
}

[data-theme="light"] .task-name-wrapper .tooltip::after {
  border-top-color: #c0392b;
}

.task-time {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.task-item.striking .task-name {
  position: relative;
}

.task-item.striking .task-name::after {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  height: 3px;
  width: 0;
  background: var(--tomato);
  border-radius: 1.5px;
  transform: translateY(-50%);
  animation: name-strike 0.5s cubic-bezier(0.65, 0, 0.35, 1) forwards;
}

.task-item.completed .task-name {
  position: relative;
  color: var(--text-muted);
  opacity: 0.85;
}

.task-item.completed .task-name::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 3px;
  background: var(--tomato);
  border-radius: 1.5px;
  transform: translateY(-50%);
}

@keyframes name-strike {
  0% { width: 0; }
  100% { width: 100%; }
}

.pomodoro-badge {
  background: linear-gradient(135deg, var(--tomato) 0%, var(--tomato-dark) 100%);
  color: #fff;
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  min-width: 26px;
  text-align: center;
}

.delete-btn {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 15px;
  cursor: pointer;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.delete-btn:hover {
  background: #e74c3c;
  color: #fff;
}

.archive-btn {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  opacity: 0;
}

.task-item:hover .archive-btn {
  opacity: 1;
}

.archive-btn:hover {
  background: rgba(155, 89, 182, 0.2);
  color: #9b59b6;
}

.completed-section,
.archived-section {
  margin-top: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 8px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  transition: background 0.2s;
  position: relative;
  z-index: 10;
}

.section-header:hover {
  background: var(--bg-card);
}

.section-header svg {
  transition: transform 0.25s ease;
}

.section-header svg.rotated {
  transform: rotate(180deg);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.help-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(155, 89, 182, 0.2);
  color: #9b59b6;
  font-size: 11px;
  font-weight: 700;
  cursor: help;
  position: relative;
  z-index: 20;
  transition: all 0.2s;
}

.help-icon:hover {
  background: rgba(155, 89, 182, 0.4);
  transform: scale(1.1);
}

.help-icon::after {
  content: '归档 = "暂停"，任务从主列表隐藏但保留记录。点 ↩ 可恢复，× 可彻底删除。';
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: max-content;
  max-width: 220px;
  padding: 8px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
  white-space: normal;
  box-shadow: 0 4px 16px var(--shadow);
  display: none;
  z-index: 1000;
}

.help-icon:hover::after {
  display: block;
}

.data-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.action-btn {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-family: 'DM Sans', sans-serif;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-color: var(--text-muted);
}

.unarchive-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.unarchive-btn:hover {
  background: rgba(78, 205, 196, 0.2);
  color: #4ecdc4;
}

.archived-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.task-item.archived {
  opacity: 1;
}

.task-item.archived .task-name {
  flex: 1;
  min-width: 0;
}

/* 历史任务按钮 */
.history-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 12px;
  margin-top: 8px;
  border: 1px dashed var(--border-color);
  border-radius: 12px;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.history-btn:hover {
  background: var(--bg-card);
  border-color: var(--tomato);
  color: var(--text-primary);
}

/* 历史任务弹窗 */
.history-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.2s ease;
}

.history-panel {
  width: 360px;
  max-height: 70vh;
  background: var(--bg-card);
  border-radius: 20px;
  border: 1px solid var(--border-color);
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  animation: slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  overflow: hidden;
}

.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  animation: fadeIn 0.2s ease;
}

.confirm-dialog {
  width: 320px;
  background: var(--bg-card);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  animation: scaleIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  text-align: center;
}

.confirm-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin: 0 auto 16px;
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
  border-radius: 50%;
}

.confirm-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: 'DM Sans', sans-serif;
  margin-bottom: 8px;
}

.confirm-message {
  font-size: 13px;
  color: var(--text-secondary);
  font-family: 'DM Sans', sans-serif;
  line-height: 1.5;
  margin-bottom: 20px;
}

.confirm-actions {
  display: flex;
  gap: 8px;
}

.confirm-btn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  border-radius: 10px;
  font-size: 13px;
  font-family: 'DM Sans', sans-serif;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.confirm-btn.cancel {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.confirm-btn.cancel:hover {
  background: var(--border-color);
}

.confirm-btn.danger {
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  color: white;
}

.confirm-btn.danger:hover {
  background: linear-gradient(135deg, #c0392b, #a93226);
  transform: translateY(-1px);
}

.history-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px;
  text-align: center;
}

.empty-icon {
  color: var(--text-muted);
  opacity: 0.5;
  margin-bottom: 12px;
}

.empty-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-secondary);
  font-family: 'DM Sans', sans-serif;
  margin-bottom: 6px;
}

.empty-hint {
  font-size: 12px;
  color: var(--text-muted);
  font-family: 'DM Sans', sans-serif;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-color);
}

.panel-header h3 {
  font-family: 'DM Serif Display', serif;
  font-size: 18px;
  font-weight: 400;
  color: var(--text-primary);
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.clear-btn {
  padding: 4px 10px;
  border: none;
  background: rgba(231, 76, 60, 0.15);
  border-radius: 6px;
  color: #e74c3c;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn:hover {
  background: rgba(231, 76, 60, 0.3);
}

.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(231, 76, 60, 0.2);
  color: #e74c3c;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: rgba(231, 76, 60, 0.2) transparent;
  transition: scrollbar-color 0.3s ease;
}

.panel-body:hover,
.panel-body:focus-within,
.panel-body.is-scrolling {
  scrollbar-color: rgba(231, 76, 60, 0.55) transparent;
}

.panel-body::-webkit-scrollbar {
  width: 6px;
}

.panel-body::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.04);
  margin: 4px 0;
  border-radius: 3px;
}

.panel-body::-webkit-scrollbar-thumb {
  background: rgba(231, 76, 60, 0.25);
  border-radius: 3px;
  transition: background 0.3s ease;
}

.panel-body:hover::-webkit-scrollbar-thumb,
.panel-body:focus-within::-webkit-scrollbar-thumb,
.panel-body.is-scrolling::-webkit-scrollbar-thumb {
  background: rgba(231, 76, 60, 0.55);
}

.panel-body::-webkit-scrollbar-thumb:hover {
  background: rgba(231, 76, 60, 0.75) !important;
}

[data-theme="light"] .panel-body {
  scrollbar-color: rgba(231, 76, 60, 0.15) transparent;
}

[data-theme="light"] .panel-body:hover,
[data-theme="light"] .panel-body:focus-within,
[data-theme="light"] .panel-body.is-scrolling {
  scrollbar-color: rgba(231, 76, 60, 0.4) transparent;
}

[data-theme="light"] .panel-body::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.04);
}

[data-theme="light"] .panel-body::-webkit-scrollbar-thumb {
  background: rgba(231, 76, 60, 0.2);
}

[data-theme="light"] .panel-body:hover::-webkit-scrollbar-thumb,
[data-theme="light"] .panel-body:focus-within::-webkit-scrollbar-thumb,
[data-theme="light"] .panel-body.is-scrolling::-webkit-scrollbar-thumb {
  background: rgba(231, 76, 60, 0.4);
}

[data-theme="light"] .panel-body::-webkit-scrollbar-thumb:hover {
  background: rgba(231, 76, 60, 0.6) !important;
}

.expired-badge {
  padding: 3px 8px;
  background: rgba(231, 76, 60, 0.15);
  border-radius: 6px;
  color: #e74c3c;
  font-size: 11px;
  font-weight: 600;
}

.history-section-title {
  font-family: 'DM Sans', sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 16px 0 8px 0;
}

.history-section-title:first-child {
  margin-top: 0;
}

.task-item.expired {
  border-left: 3px solid #e74c3c;
  background: var(--task-expired-bg);
}

.task-item.expired .task-name {
  color: #888;
}

.task-item.expired .task-time {
  color: #666;
}
</style>
