// [P2-10 修复] 全局 toast 服务
// 原 StatsDisplay / DataManager / TaskList 各自实现了一套几乎相同的 toast
// （fixed 定位 + fade 动画 + 2s 消失 + success/error 图标），重复 3 份维护成本高。
// 抽为单例服务：模块级 state ref 由 App.vue 挂载的 <AppToast /> 消费，
// 调用点只需 `toast.success(...)` / `toast.error(...)` / `toast.info(...)`。
import { ref } from 'vue'

export type ToastType = 'success' | 'error' | 'info'

const state = ref<{ message: string; type: ToastType }>({ message: '', type: 'info' })

let timer: ReturnType<typeof setTimeout> | null = null

const AUTO_DISMISS_MS = 2000

function showToast(message: string, type: ToastType = 'info') {
  state.value = { message, type }
  // 连续触发时重置计时器，避免前一个还没消失就被覆盖/提前消失
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    state.value = { message: '', type: 'info' }
  }, AUTO_DISMISS_MS)
}

export const toast = {
  show: (message: string, type: ToastType = 'info') => showToast(message, type),
  success: (message: string) => showToast(message, 'success'),
  error: (message: string) => showToast(message, 'error'),
  info: (message: string) => showToast(message, 'info'),
  state
}
