<!-- [P2-10 修复] 公共 Toast 组件（全局单例，由 App.vue 挂载）
     消费 src/utils/toast.ts 的模块级 state，三处调用点共用一套实现：
     - success/error 带图标（原 StatsDisplay/DataManager 样式）
     - info 无图标（原 TaskList 简化版样式） -->
<script setup lang="ts">
import { toast } from '@/utils/toast'

const state = toast.state
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="state.message" class="app-toast" :class="state.type">
        <svg v-if="state.type === 'success'" class="toast-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <svg v-else-if="state.type === 'error'" class="toast-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        <span>{{ state.message }}</span>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.app-toast {
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
  padding: 10px 20px;
  border-radius: 24px;
  font-size: 13px;
  font-family: 'DM Sans', sans-serif;
  font-weight: 500;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  z-index: 10000;
  pointer-events: none;
}

.app-toast.success {
  border-color: rgba(46, 204, 113, 0.4);
  color: #2ecc71;
}

.app-toast.success .toast-icon {
  color: #2ecc71;
}

.app-toast.error {
  border-color: rgba(231, 76, 60, 0.4);
  color: #e74c3c;
}

.app-toast.error .toast-icon {
  color: #e74c3c;
}

[data-theme="light"] .app-toast {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

[data-theme="light"] .app-toast.success {
  background: rgba(46, 204, 113, 0.08);
  border-color: rgba(46, 204, 113, 0.4);
  color: #27ae60;
}

[data-theme="light"] .app-toast.error {
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
</style>
