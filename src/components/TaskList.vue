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
  timerStore.toggleCurrentTask(taskId)
}

function toggleComplete(taskId: string) {
  const task = taskStore.tasks.find(t => t.id === taskId)
  if (task) {
    if (task.isCompleted) {
      return
    } else {
      strikingTaskId.value = taskId
      playCelebrationSound()
      if (timerStore.currentTaskIds.includes(taskId)) {
        timerStore.toggleCurrentTask(taskId)
      }
      setTimeout(() => {
        taskStore.completeTask(taskId)
        strikingTaskId.value = null
        emit('task-completed')
      }, 650)
    }
  }
}

function deleteTask(taskId: string) {
  if (timerStore.currentTaskIds.includes(taskId)) {
    timerStore.toggleCurrentTask(taskId)
  }
  taskStore.deleteTask(taskId)
}

function clearHistory() {
  if (confirm('确定要清除所有历史任务吗？此操作不可恢复。')) {
    // 删除所有历史任务（昨天及之前创建的）
    const taskIds = taskStore.historyTasks.map(t => t.id)
    taskIds.forEach(id => taskStore.deleteTask(id))
    showHistory.value = false
  }
}

function unarchiveTask(taskId: string) {
  taskStore.unarchiveTask(taskId)
}

function deleteArchivedTask(taskId: string) {
  taskStore.deleteArchivedTask(taskId)
}
</script>

<template>
  <div class="task-list">
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
          @click="selectTask(task.id)"
        >
          <div class="task-main">
            <div class="task-name-wrapper">
              <span class="task-name">{{ task.name }}</span>
              <span class="tooltip">任务名称: {{ task.name }}</span>
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
            <button class="delete-btn" @click.stop="deleteTask(task.id)">×</button>
          </template>
        </div>
      </div>
    </div>

    <!-- 历史任务按钮 -->
    <button v-if="historyTaskGroups.length > 0" class="history-btn" @click="showHistory = true">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      历史任务 ({{ taskStore.historyTasks.length }})
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
                        <span class="tooltip">任务名称: {{ task.name }}</span>
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
                        <span class="tooltip">任务名称: {{ task.name }}</span>
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
    </Teleport>

    <div v-if="taskStore.archivedTasks.length > 0" class="archived-section">
      <div class="section-header" @click="showArchived = !showArchived">
        <span>📁 已归档 {{ taskStore.archivedTasks.length }}</span>
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
  opacity: 0.5;
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

.task-item.striking::after {
  content: '';
  position: absolute;
  left: 16px;
  right: 16px;
  top: 50%;
  height: 3px;
  background: var(--tomato);
  border-radius: 1px;
  transform: translateY(-50%);
  z-index: 10;
  box-shadow: 0 0 10px rgba(231, 76, 60, 0.8);
  animation: strike-through 0.55s cubic-bezier(0.15, 0.0, 0.35, 1.0) forwards;
  pointer-events: none;
}

@keyframes strike-through {
  0% { width: 0; opacity: 0; }
  10% { opacity: 1; }
  75% { opacity: 1; }
  100% { width: calc(100% - 32px); opacity: 0.5; }
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
  left: 50%;
  transform: translateX(-50%) scale(0.9);
  padding: 10px 16px;
  background: linear-gradient(135deg, var(--tomato) 0%, var(--tomato-dark) 100%);
  border-radius: 12px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  z-index: 100;
  box-shadow:
    0 4px 20px rgba(231, 76, 60, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.15) inset;
  margin-bottom: 4px;
  opacity: 0;
  transition: opacity 0.2s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
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
  opacity: 1;
  transform: translateX(-50%) scale(1);
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

.task-item.completed .task-name {
  text-decoration: line-through;
  text-decoration-color: var(--text-secondary);
  text-decoration-thickness: 4px;
  color: var(--text-muted);
  opacity: 0.85;
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
}

.unarchive-btn:hover {
  background: var(--bg-secondary);
  color: #4ecdc4;
}

.archived-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.task-item.archived {
  opacity: 0.5;
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
  opacity: 0.6;
}

.task-item.expired .task-name {
  color: #888;
}

.task-item.expired .task-time {
  color: #666;
}
</style>
