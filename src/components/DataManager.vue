<script setup lang="ts">
import { ref } from 'vue'
import { useTaskStore } from '@/stores'

const taskStore = useTaskStore()
const showPanel = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(message: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = message
  toastType.value = type
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastMessage.value = ''
  }, 2000)
}

async function exportJSON() {
  if (window.electronAPI) {
    try {
      const data = await taskStore.exportAllData()
      const date = new Date().toISOString().slice(0, 10)
      const success = await window.electronAPI.dialog.saveFile(data, `tomato-todo-${date}.json`)
      if (success) {
        showToast('JSON 数据导出成功！', 'success')
      }
    } catch (e) {
      console.error('Export failed:', e)
      showToast('导出失败', 'error')
    }
  }
}

async function exportCSV() {
  if (window.electronAPI) {
    try {
      const data = await taskStore.exportAsCSV()
      const date = new Date().toISOString().slice(0, 10)
      const success = await window.electronAPI.dialog.saveCSV(data, `tomato-stats-${date}.csv`)
      if (success) {
        showToast('CSV 数据导出成功！', 'success')
      }
    } catch (e) {
      console.error('CSV export failed:', e)
      showToast('导出失败', 'error')
    }
  }
}

async function importData() {
  if (window.electronAPI) {
    const jsonStr = await window.electronAPI.dialog.openJsonFile()
    if (jsonStr) {
      const result = await taskStore.importAllData(jsonStr)
      showToast(result.message, result.success ? 'success' : 'error')
    }
  }
}

function toggle() {
  showPanel.value = !showPanel.value
}
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="toastMessage" class="dm-toast" :class="toastType">
        <svg v-if="toastType === 'success'" class="toast-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <svg v-else class="toast-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        <span>{{ toastMessage }}</span>
      </div>
    </Transition>
  </Teleport>

  <div class="data-manager">
    <button class="toggle-btn" @click="toggle">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      数据
    </button>

    <Teleport to="body">
      <div v-if="showPanel" class="panel-overlay" @click.self="toggle">
        <div class="panel">
          <div class="panel-header">
            <h3>数据管理</h3>
            <button class="close-btn" @click="toggle">×</button>
          </div>
          <div class="panel-body">
            <div class="data-section">
              <h4>导出数据</h4>
              <p class="desc">将您的任务和专注记录导出备份</p>
              <div class="btn-group">
                <button class="action-btn" @click="exportJSON">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  导出 JSON
                </button>
                <button class="action-btn" @click="exportCSV">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="8" y1="13" x2="16" y2="13"/>
                    <line x1="8" y1="17" x2="16" y2="17"/>
                  </svg>
                  导出 CSV
                </button>
              </div>
            </div>

            <div class="data-section">
              <h4>导入数据</h4>
              <p class="desc">从备份文件恢复您的数据</p>
              <button class="action-btn import" @click="importData">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                导入 JSON
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.data-manager {
  position: relative;
}

.dm-toast {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-card);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 10px 18px;
  border-radius: 24px;
  font-size: 13px;
  font-family: 'DM Sans', sans-serif;
  font-weight: 500;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  z-index: 10000;
  pointer-events: none;
}

.dm-toast.success {
  border-color: rgba(46, 204, 113, 0.4);
  color: #2ecc71;
}

.dm-toast.success .toast-icon {
  color: #2ecc71;
}

.dm-toast.error {
  border-color: rgba(231, 76, 60, 0.4);
  color: #e74c3c;
}

.dm-toast.error .toast-icon {
  color: #e74c3c;
}

[data-theme="light"] .dm-toast {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

[data-theme="light"] .dm-toast.success {
  background: rgba(46, 204, 113, 0.08);
  border-color: rgba(46, 204, 113, 0.4);
  color: #27ae60;
}

[data-theme="light"] .dm-toast.error {
  background: rgba(231, 76, 60, 0.08);
  border-color: rgba(231, 76, 60, 0.4);
  color: #c0392b;
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

.toggle-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: none;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.panel-overlay {
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

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.panel {
  width: 340px;
  background: var(--bg-card);
  border-radius: 20px;
  border: 1px solid var(--border-color);
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.5);
  animation: slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  overflow: hidden;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
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
  padding: 20px;
}

.data-section {
  margin-bottom: 24px;
}

.data-section:last-child {
  margin-bottom: 0;
}

.data-section h4 {
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px 0;
}

.data-section .desc {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0 0 12px 0;
}

.btn-group {
  display: flex;
  gap: 10px;
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  border-radius: 12px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: var(--bg-hover);
  border-color: var(--tomato);
}

.action-btn.import {
  background: rgba(231, 76, 60, 0.1);
  border-color: rgba(231, 76, 60, 0.3);
  color: #e74c3c;
}

.action-btn.import:hover {
  background: rgba(231, 76, 60, 0.2);
}
</style>
