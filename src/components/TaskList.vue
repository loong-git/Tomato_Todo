<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTaskStore, useTimerStore } from '@/stores'
import { playCelebrationSound } from '@/utils'

const taskStore = useTaskStore()
const timerStore = useTimerStore()

const emit = defineEmits<{
  (e: 'task-completed'): void
}>()

const newTaskName = ref('')
const showArchived = ref(false)
const showHistory = ref(false)
const strikingTaskId = ref<string | null>(null)

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
const toastMessage = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(message: string) {
  toastMessage.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastMessage.value = ''
  }, 2000)
}

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
  showToast(`已清除 ${count} 个历史任务`)
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
    <Teleport to="body">
      <Transition name="toast">
        <div v-if="toastMessage" class="toast">{{ toastMessage }}</div>
      </Transition>
    </Teleport>
    <div class="add-task">
      <input
        v-model="newTaskName"
        type="text"
        placeholder="添加新任务..."
        class="task-input"
        @keyup.enter="addTask"
      />
      <button class="add-btn" @click="addTask">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5">
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
          class="task-item"
          :class="{ active: timerStore.currentTaskIds.includes(task.id), striking: strikingTaskId === task.id, completed: task.isCompleted }"
          @click="!task.isCompleted && selectTask(task.id)"
        >
          <div class="task-main">
            <div class="task-name-wrapper">
              <span class="task-name">{{ task.name }}</span>
              <span class="tooltip">{{ task.name }}</span>
            </div>
            <span class="task-time">{{ formatTime(task.createdAt) }}</span>
          </div>
          <span class="pomodoro-badge" v-if="task.completedPomodoros > 0">
            {{ task.completedPomodoros }}
          </span>
          <template v-if="!task.isCompleted">
            <button
              v-if="strikingTaskId !== task.id"
              class="done-btn"
              @click.stop="toggleComplete(task.id)"
            >完成</button>
            <button class="archive-btn" @click.stop="archiveTask(task.id)" title="归档">📦</button>
            <button class="delete-btn" @click.stop="deleteTask(task.id)">×</button>
          </template>
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
            <!-- 过期任务 -->
            <template v-if="historyTaskGroups.some(g => g.tasks.some(t => !t.isCompleted))">
              <div class="history-section-title">过期</div>
              <div v-for="group in historyTaskGroups" :key="'expired-' + group.dateKey">
                <template v-if="group.tasks.some(t => !t.isCompleted)">
                  <div class="date-header">{{ group.dateKey }}</div>
                  <div v-for="task in group.tasks.filter(t => !t.isCompleted)" :key="task.id" class="task-item expired">
                    <div class="task-main">
                      <div class="task-name-wrapper">
                        <span class="task-name">{{ task.name }}</span>
                        <span class="tooltip">{{ task.name }}</span>
                      </div>
                      <span class="task-time">{{ formatTime(task.createdAt) }}</span>
                    </div>
                    <span class="expired-badge">过期</span>
                  </div>
                </template>
              </div>
            </template>

            <!-- 已完成任务 -->
            <template v-if="historyTaskGroups.some(g => g.tasks.some(t => t.isCompleted))">
              <div class="history-section-title">已完成</div>
              <div v-for="group in historyTaskGroups" :key="'completed-' + group.dateKey">
                <template v-if="group.tasks.some(t => t.isCompleted)">
                  <div class="date-header">{{ group.dateKey }}</div>
                  <div v-for="task in group.tasks.filter(t => t.isCompleted)" :key="task.id" class="task-item completed">
                    <div class="task-main">
                      <div class="task-name-wrapper">
                        <span class="task-name">{{ task.name }}</span>
                        <span class="tooltip">{{ task.name }}</span>
                      </div>
                      <span class="task-time">{{ formatTime(task.createdAt) }}</span>
                    </div>
                    <span class="pomodoro-badge" v-if="task.completedPomodoros > 0">
                      {{ task.completedPomodoros }}
                    </span>
                  </div>
                </template>
              </div>
            </template>
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
.task-list {
  padding: 8px 16px 24px;
}

.add-task {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.task-input {
  flex: 1;
  padding: 14px 18px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
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
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--tomato) 0%, var(--tomato-dark) 100%);
  color: #fff;
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}

.add-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 25px rgba(231, 76, 60, 0.4);
}

.add-btn:active {
  transform: scale(0.95);
}

.task-groups {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
  padding-right: 10px;
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

.date-header {
  font-family: 'DM Sans', sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  padding: 6px 8px;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.date-header.completed {
  color: var(--text-muted);
  opacity: 0.6;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  backdrop-filter: blur(10px);
}

.task-item:hover {
  background: var(--bg-secondary);
  transform: translateX(4px);
}

.task-item.active {
  background: var(--bg-secondary);
  border-color: var(--tomato);
  box-shadow: 0 0 0 3px rgba(231, 76, 60, 0.2);
}

.task-item.completed {
  background: var(--task-completed-bg);
  border-color: transparent;
  cursor: default;
}

.task-item.completed:hover {
  transform: none;
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

.done-btn {
  padding: 6px 14px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #4ecdc4 0%, #3dbdb5 100%);
  color: #fff;
  font-family: 'DM Sans', sans-serif;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.done-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 15px rgba(78, 205, 196, 0.4);
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
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
  border-radius: 6px;
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

.toast {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-card);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 10px 20px;
  border-radius: 24px;
  font-size: 13px;
  font-family: 'DM Sans', sans-serif;
  font-weight: 500;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  z-index: 10000;
  pointer-events: none;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
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
