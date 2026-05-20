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

const completedTaskGroups = computed<TaskGroup[]>(() => {
  const groups: Map<string, typeof taskStore.tasks> = new Map()

  for (const task of taskStore.completedTasks) {
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

function unarchiveTask(taskId: string) {
  taskStore.unarchiveTask(taskId)
}

function deleteArchivedTask(taskId: string) {
  taskStore.deleteArchivedTask(taskId)
}

async function exportAllData() {
  if (window.electronAPI) {
    try {
      const data = await taskStore.exportAllData()
      const date = new Date().toISOString().slice(0, 10)
      const success = await window.electronAPI.dialog.saveFile(data, `tomato-todo-${date}.json`)
      if (success) {
        alert('数据导出成功！')
      }
    } catch (e) {
      console.error('Export failed:', e)
      alert('导出失败')
    }
  }
}

async function importData() {
  if (window.electronAPI) {
    const jsonStr = await window.electronAPI.dialog.openJsonFile()
    if (jsonStr) {
      const result = await taskStore.importAllData(jsonStr)
      alert(result.message)
    }
  }
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

    <div class="data-actions">
      <button class="action-btn" @click="exportAllData">导出</button>
      <button class="action-btn" @click="importData">导入</button>
    </div>

    <div class="task-groups">
      <div v-for="group in activeTaskGroups" :key="group.dateKey" class="task-group">
        <div class="date-header">{{ group.dateKey }}</div>
        <div
          v-for="task in group.tasks"
          :key="task.id"
          class="task-item"
          :class="{ active: timerStore.currentTaskIds.includes(task.id), striking: strikingTaskId === task.id }"
          @click="selectTask(task.id)"
        >
          <span class="task-name">{{ task.name }}</span>
          <span class="pomodoro-badge" v-if="task.completedPomodoros > 0">
            {{ task.completedPomodoros }}
          </span>
          <button
            v-if="strikingTaskId !== task.id"
            class="done-btn"
            @click.stop="toggleComplete(task.id)"
          >完成</button>
          <span v-else class="completing-icon">✓</span>
          <button class="delete-btn" @click.stop="deleteTask(task.id)">×</button>
        </div>
      </div>
    </div>

    <div v-if="completedTaskGroups.length > 0" class="completed-section">
      <div class="section-header" @click="showArchived = !showArchived">
        <span>已完成</span>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" :class="{ rotated: showArchived }">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div v-if="showArchived" class="task-groups">
        <div v-for="group in completedTaskGroups" :key="group.dateKey" class="task-group">
          <div class="date-header completed">{{ group.dateKey }}</div>
          <div
            v-for="task in group.tasks"
            :key="task.id"
            class="task-item completed"
          >
            <span class="task-name">{{ task.name }}</span>
            <span class="pomodoro-badge">{{ task.completedPomodoros }}</span>
          </div>
        </div>
      </div>
    </div>

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
  height: 2px;
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
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
  font-size: 14px;
}

.task-item.completed .task-name {
  text-decoration: line-through;
  text-decoration-color: var(--text-muted);
  text-decoration-thickness: 2px;
  color: var(--text-muted);
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
</style>
