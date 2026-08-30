<script setup lang="ts">
import { ref, onUnmounted, toRaw } from 'vue'
import { useSettingsStore } from '@/stores'
import type { SoundType, ShortcutConfig } from '@/types'
import { eventToShortcut, parseShortcut } from '@/utils'
import { setShortcutRecording } from '@/utils/shortcut-state'
import { toast } from '@/utils/toast'

const settingsStore = useSettingsStore()
const visible = ref(false)

const localSettings = ref({ ...settingsStore.settings })

// 快捷键按录:哪个字段正在录制(空字符串 = 没在录)
const recordingKey = ref<keyof ShortcutConfig | ''>('')
// 录制中检测到的冲突提示(空字符串 = 无冲突)
const recordingConflict = ref<string>('')

// 硬编码的快捷键(用户在 App.vue 里直接 keydown 匹配的,不能和用户自定义的切窗口快捷键冲突)
const hardcodedShortcuts = [
  { key: ' ', name: '启动/暂停计时器(Space)' },
  { key: 'r', name: '重置计时器(R)' },
  { key: 's', name: '打开设置(S)' },
  { key: 'n', name: '聚焦任务输入框(N)' },
  { key: '1', name: '专注模式(1)' },
  { key: '2', name: '短休息(2)' },
  { key: '3', name: '长休息(3)' },
  { key: 'escape', name: '关闭弹窗(Esc)' }
]

/**
 * 检查快捷键是否冲突
 * @param shortcut 候选快捷键字符串(如 'Alt+K')
 * @param excludeField 当前正在录制的字段(自己的值不参与冲突)
 * @returns 冲突描述,null 表示无冲突
 */
function checkConflict(shortcut: string, excludeField: keyof ShortcutConfig): string | null {
  // 1. 检查另一个用户可改的 toggle 字段
  for (const k of Object.keys(localSettings.value.shortcuts) as Array<keyof ShortcutConfig>) {
    if (k === excludeField) continue
    if (localSettings.value.shortcuts[k] === shortcut) {
      const label = k === 'toggleFullscreen' ? '切全屏专注' : '切小窗专注'
      return `与"${label}"快捷键冲突`
    }
  }
  // 2. 检查 hardcoded(主键 + 至少一个修饰键 → 算冲突;无修饰键 → 不冲突,因为 hardcoded 全是裸键)
  const parsed = parseShortcut(shortcut)
  if (!parsed) return null
  const hasModifier = parsed.alt || parsed.ctrl || parsed.shift || parsed.meta
  if (!hasModifier) {
    // 候选快捷键没修饰键 → 可能和裸键冲突
    for (const h of hardcodedShortcuts) {
      if (parsed.key === h.key) return `与"${h.name}"冲突`
    }
  }
  return null
}

function startRecording(key: keyof ShortcutConfig) {
  recordingKey.value = key
  recordingConflict.value = ''
  setShortcutRecording(true)
  // capture phase 拦截,防止 App.vue / FocusWindow.vue 的 keydown 监听先触发
  window.addEventListener('keydown', onKeydownCapture, true)
}

function stopRecording() {
  recordingKey.value = ''
  recordingConflict.value = ''
  setShortcutRecording(false)
  window.removeEventListener('keydown', onKeydownCapture, true)
}

function onKeydownCapture(e: KeyboardEvent) {
  // 单独的 Esc 取消录制
  if (e.key === 'Escape' && !e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
    e.preventDefault()
    e.stopPropagation()
    stopRecording()
    return
  }
  const shortcut = eventToShortcut(e)
  if (shortcut) {
    // 有效的组合键 → 检查冲突
    e.preventDefault()
    e.stopPropagation()
    if (recordingKey.value) {
      const conflict = checkConflict(shortcut, recordingKey.value)
      if (conflict) {
        // 冲突:不写入,显示提示,继续等待
        recordingConflict.value = conflict
        return
      }
      // 无冲突:接受
      localSettings.value.shortcuts[recordingKey.value] = shortcut
    }
    stopRecording()
    return
  }
  // 无效按键(单字符 / 单独修饰键) → 忽略,继续等待
  // 候选快捷键必须至少有一个修饰键(eventToShortcut 拒绝裸键)
}

onUnmounted(() => {
  // 关闭弹窗时清理录制状态(防止 memory leak)
  if (recordingKey.value) stopRecording()
})

const soundPresets = [
  { value: 'bell' as SoundType, label: '铃铛', icon: '🔔' },
  { value: 'forest' as SoundType, label: '鸟鸣', icon: '🐦' },
  { value: 'ding' as SoundType, label: '叮咚', icon: '🎵' },
  { value: 'tick' as SoundType, label: '滴答', icon: '⏰' },
  { value: 'custom' as SoundType, label: '自定义', icon: '📁' }
]

function open() {
  // 深拷贝:切断 localSettings 与 settingsStore 的引用关系
  // 必须先用 toRaw() 解包 Pinia 的 reactive Proxy,structuredClone 不能直接克隆 Proxy
  localSettings.value = structuredClone(toRaw(settingsStore.settings))
  visible.value = true
}

async function save() {
  try {
    await settingsStore.updateSettings(localSettings.value)
    visible.value = false
    toast.success('设置已保存')
  } catch (e) {
    // [P3-16 修复] settingsStore.updateSettings 在 store.set 失败时会 reject
    // （saveSettings 内部 .catch 里 throw），之前裸 await 导致 Unhandled rejection、
    // 且内存已 mutate 但磁盘未存（reload 后改设置丢失）。失败时不关弹窗让用户重试。
    console.error('[Settings] 保存失败:', e)
    toast.error('设置保存失败')
  }
}

function reset() {
  settingsStore.resetSettings()
  // 同样:toRaw 解包 + structuredClone 深拷贝
  localSettings.value = structuredClone(toRaw(settingsStore.settings))
}

function close() {
  visible.value = false
}

function selectPreset(preset: SoundType) {
  localSettings.value.soundType = preset
  // 播放预览音效
  if (preset !== 'custom') {
    import('@/utils').then(({ playPresetSound }) => {
      playPresetSound(preset)
    })
  }
}

async function selectSoundFile() {
  if (window.electronAPI) {
    const filePath = await window.electronAPI.dialog.openFile()
    if (filePath) {
      localSettings.value.soundPath = filePath
      localSettings.value.soundType = 'custom'
    }
  }
}

function clearSoundFile() {
  localSettings.value.soundPath = ''
  localSettings.value.soundType = 'bell'
}

defineExpose({ open, close })
</script>

<template>
  <button class="settings-btn" @click="open">⚙ 设置</button>

  <!-- 自定义设置弹窗 -->
  <Teleport to="body">
    <div v-if="visible" class="settings-overlay" @click.self="close">
      <div class="settings-modal">
        <div class="modal-header">
          <h2>设置</h2>
          <button class="close-btn" @click="close">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <div class="modal-body">
          <div class="setting-item">
            <div class="setting-label">
              <span class="label-text">专注时长</span>
              <span class="label-hint">分钟</span>
            </div>
            <div class="setting-control">
              <button class="num-btn" @click="localSettings.focusDuration = Math.max(1, localSettings.focusDuration - 1)">-</button>
              <input type="number" class="num-input" v-model.number="localSettings.focusDuration" min="1" max="60" />
              <button class="num-btn" @click="localSettings.focusDuration = Math.min(60, localSettings.focusDuration + 1)">+</button>
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span class="label-text">短休息时长</span>
              <span class="label-hint">分钟</span>
            </div>
            <div class="setting-control">
              <button class="num-btn" @click="localSettings.shortBreakDuration = Math.max(1, localSettings.shortBreakDuration - 1)">-</button>
              <input type="number" class="num-input" v-model.number="localSettings.shortBreakDuration" min="1" max="30" />
              <button class="num-btn" @click="localSettings.shortBreakDuration = Math.min(30, localSettings.shortBreakDuration + 1)">+</button>
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span class="label-text">长休息时长</span>
              <span class="label-hint">分钟</span>
            </div>
            <div class="setting-control">
              <button class="num-btn" @click="localSettings.longBreakDuration = Math.max(1, localSettings.longBreakDuration - 1)">-</button>
              <input type="number" class="num-input" v-model.number="localSettings.longBreakDuration" min="1" max="60" />
              <button class="num-btn" @click="localSettings.longBreakDuration = Math.min(60, localSettings.longBreakDuration + 1)">+</button>
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span class="label-text">长休息间隔</span>
              <span class="label-hint">个番茄</span>
            </div>
            <div class="setting-control">
              <button class="num-btn" @click="localSettings.longBreakInterval = Math.max(2, localSettings.longBreakInterval - 1)">-</button>
              <input type="number" class="num-input" v-model.number="localSettings.longBreakInterval" min="2" max="10" />
              <button class="num-btn" @click="localSettings.longBreakInterval = Math.min(10, localSettings.longBreakInterval + 1)">+</button>
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span class="label-text">每日目标</span>
              <span class="label-hint">个番茄</span>
            </div>
            <div class="setting-control">
              <button class="num-btn" @click="localSettings.dailyGoal = Math.max(1, localSettings.dailyGoal - 1)">-</button>
              <input type="number" class="num-input" v-model.number="localSettings.dailyGoal" min="1" max="20" />
              <button class="num-btn" @click="localSettings.dailyGoal = Math.min(20, localSettings.dailyGoal + 1)">+</button>
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span class="label-text">每日目标小时数</span>
              <span class="label-hint">小时</span>
            </div>
            <div class="setting-control">
              <button class="num-btn" @click="localSettings.dailyHourGoal = Math.max(0, +(localSettings.dailyHourGoal - 0.5).toFixed(1))">-</button>
              <input type="number" class="num-input" v-model.number="localSettings.dailyHourGoal" min="0" max="12" step="0.5" />
              <button class="num-btn" @click="localSettings.dailyHourGoal = Math.min(12, +(localSettings.dailyHourGoal + 0.5).toFixed(1))">+</button>
            </div>
          </div>

          <div class="setting-item toggle-item">
            <div class="setting-label">
              <span class="label-text">声音提醒</span>
            </div>
            <button
              class="toggle-btn"
              :class="{ active: localSettings.soundEnabled }"
              @click="localSettings.soundEnabled = !localSettings.soundEnabled"
            >
              <span class="toggle-track">
                <span class="toggle-thumb"></span>
              </span>
            </button>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span class="label-text">提示音效</span>
            </div>
            <div class="sound-presets">
              <button
                v-for="preset in soundPresets"
                :key="preset.value"
                class="preset-btn"
                :class="{ active: localSettings.soundType === preset.value }"
                @click="selectPreset(preset.value)"
                :title="preset.label"
              >
                {{ preset.icon }}
              </button>
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span class="label-text">自定义音频</span>
            </div>
            <div class="sound-control">
              <input
                type="text"
                class="sound-input"
                v-model="localSettings.soundPath"
                placeholder="选择音频文件..."
                readonly
              />
              <button class="sound-btn" @click="selectSoundFile">选择</button>
              <button class="sound-btn clear" v-if="localSettings.soundPath" @click="clearSoundFile">×</button>
            </div>
          </div>

          <div class="setting-item toggle-item">
            <div class="setting-label">
              <span class="label-text">系统通知</span>
            </div>
            <button
              class="toggle-btn"
              :class="{ active: localSettings.notificationEnabled }"
              @click="localSettings.notificationEnabled = !localSettings.notificationEnabled"
            >
              <span class="toggle-track">
                <span class="toggle-thumb"></span>
              </span>
            </button>
          </div>

          <details class="shortcut-help">
            <summary>系统已占用的快捷键</summary>
            <div class="shortcut-help-list">
              <div class="shortcut-help-item"><kbd>Space</kbd><span>启动/暂停计时器</span></div>
              <div class="shortcut-help-item"><kbd>R</kbd><span>重置计时器</span></div>
              <div class="shortcut-help-item"><kbd>S</kbd><span>打开设置</span></div>
              <div class="shortcut-help-item"><kbd>N</kbd><span>聚焦任务输入框</span></div>
              <div class="shortcut-help-item"><kbd>1</kbd><span>专注模式</span></div>
              <div class="shortcut-help-item"><kbd>2</kbd><span>短休息</span></div>
              <div class="shortcut-help-item"><kbd>3</kbd><span>长休息</span></div>
              <div class="shortcut-help-item"><kbd>Esc</kbd><span>关闭弹窗</span></div>
            </div>
          </details>

          <div class="setting-item shortcut-item">
            <div class="setting-label">
              <span class="label-text">切全屏专注</span>
              <span class="label-hint">主窗口 → 全屏专注(在专注窗口内 = 返回主窗口)</span>
            </div>
            <div class="shortcut-control">
              <span
                class="shortcut-value"
                :class="{
                  recording: recordingKey === 'toggleFullscreen' && !recordingConflict,
                  conflict: recordingKey === 'toggleFullscreen' && !!recordingConflict
                }"
              >
                {{
                  recordingKey === 'toggleFullscreen'
                    ? (recordingConflict || '按任意组合键…')
                    : localSettings.shortcuts.toggleFullscreen
                }}
              </span>
              <button
                class="shortcut-btn"
                :class="{ recording: recordingKey === 'toggleFullscreen' }"
                @click="recordingKey === 'toggleFullscreen' ? stopRecording() : startRecording('toggleFullscreen')"
              >
                {{ recordingKey === 'toggleFullscreen' ? '取消' : '重录' }}
              </button>
            </div>
          </div>

          <div class="setting-item shortcut-item">
            <div class="setting-label">
              <span class="label-text">切小窗专注</span>
              <span class="label-hint">主窗口 → 小窗专注(在专注窗口内 = 返回主窗口)</span>
            </div>
            <div class="shortcut-control">
              <span
                class="shortcut-value"
                :class="{
                  recording: recordingKey === 'toggleCompact' && !recordingConflict,
                  conflict: recordingKey === 'toggleCompact' && !!recordingConflict
                }"
              >
                {{
                  recordingKey === 'toggleCompact'
                    ? (recordingConflict || '按任意组合键…')
                    : localSettings.shortcuts.toggleCompact
                }}
              </span>
              <button
                class="shortcut-btn"
                :class="{ recording: recordingKey === 'toggleCompact' }"
                @click="recordingKey === 'toggleCompact' ? stopRecording() : startRecording('toggleCompact')"
              >
                {{ recordingKey === 'toggleCompact' ? '取消' : '重录' }}
              </button>
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span class="label-text">关闭窗口时</span>
            </div>
            <div class="behavior-select">
              <button
                class="behavior-btn"
                :class="{ active: localSettings.closeBehavior === 'tray' }"
                @click="localSettings.closeBehavior = 'tray'"
              >
                最小化到托盘
              </button>
              <button
                class="behavior-btn"
                :class="{ active: localSettings.closeBehavior === 'quit' }"
                @click="localSettings.closeBehavior = 'quit'"
              >
                退出程序
              </button>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="action-btn secondary" @click="reset">重置默认</button>
          <div class="footer-right">
            <button class="action-btn" @click="close">取消</button>
            <button class="action-btn primary" @click="save">保存</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.settings-btn {
  border: none;
  background: transparent;
  color: #a89f97;
  font-size: 14px;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 8px;
  transition: all 0.2s;
}

.settings-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #f5f0e8;
}

.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
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

.settings-modal {
  width: 380px;
  max-height: 85vh;
  background: #2d2522;
  border-radius: 20px;
  border: 1px solid rgba(168, 159, 151, 0.2);
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  animation: slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  overflow: hidden;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(168, 159, 151, 0.15);
}

.modal-header h2 {
  font-family: 'DM Serif Display', serif;
  font-size: 20px;
  font-weight: 400;
  color: #f5f0e8;
  margin: 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #a89f97;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(231, 76, 60, 0.2);
  color: #e74c3c;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: rgba(231, 76, 60, 0.25) transparent;
  transition: scrollbar-color 0.3s ease;
}

.modal-body:hover,
.modal-body:focus-within,
.modal-body.is-scrolling {
  scrollbar-color: rgba(231, 76, 60, 0.55) transparent;
}

.modal-body::-webkit-scrollbar {
  width: 6px;
}

.modal-body::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.04);
  margin: 4px 0;
  border-radius: 3px;
}

.modal-body::-webkit-scrollbar-thumb {
  background: rgba(231, 76, 60, 0.25);
  border-radius: 3px;
  transition: background 0.3s ease;
}

.modal-body:hover::-webkit-scrollbar-thumb,
.modal-body:focus-within::-webkit-scrollbar-thumb,
.modal-body.is-scrolling::-webkit-scrollbar-thumb {
  background: rgba(231, 76, 60, 0.55);
}

.modal-body::-webkit-scrollbar-thumb:hover {
  background: rgba(231, 76, 60, 0.75) !important;
}

/* 浅色主题 */
[data-theme="light"] .modal-body {
  scrollbar-color: rgba(231, 76, 60, 0.2) transparent;
}

[data-theme="light"] .modal-body:hover,
[data-theme="light"] .modal-body:focus-within,
[data-theme="light"] .modal-body.is-scrolling {
  scrollbar-color: rgba(231, 76, 60, 0.4) transparent;
}

[data-theme="light"] .modal-body::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.04);
}

[data-theme="light"] .modal-body::-webkit-scrollbar-thumb {
  background: rgba(231, 76, 60, 0.2);
}

[data-theme="light"] .modal-body:hover::-webkit-scrollbar-thumb,
[data-theme="light"] .modal-body:focus-within::-webkit-scrollbar-thumb,
[data-theme="light"] .modal-body.is-scrolling::-webkit-scrollbar-thumb {
  background: rgba(231, 76, 60, 0.4);
}

[data-theme="light"] .modal-body::-webkit-scrollbar-thumb:hover {
  background: rgba(231, 76, 60, 0.6) !important;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 0;
  border-bottom: 1px solid rgba(168, 159, 151, 0.08);
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.label-text {
  font-size: 15px;
  color: #f5f0e8;
}

.label-hint {
  font-size: 12px;
  color: #6d6560;
}

.setting-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.num-btn {
  width: 32px;
  height: 32px;
  border: 1px solid rgba(168, 159, 151, 0.2);
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  color: #f5f0e8;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s;
}

.num-btn:hover {
  background: rgba(231, 76, 60, 0.2);
  border-color: rgba(231, 76, 60, 0.4);
  color: #e74c3c;
}

.num-btn:active {
  transform: scale(0.95);
}

.num-value {
  font-size: 18px;
  font-weight: 500;
  color: #f5f0e8;
  min-width: 32px;
  text-align: center;
}

.num-input {
  font-size: 18px;
  font-weight: 500;
  color: #f5f0e8;
  min-width: 40px;
  text-align: center;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 4px 6px;
  outline: none;
  -moz-appearance: textfield;
  user-select: text;
  -webkit-user-select: text;
}

.num-input::-webkit-outer-spin-button,
.num-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.num-input:focus {
  border-color: #e74c3c;
  background: rgba(255, 255, 255, 0.12);
}

.toggle-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
}

.toggle-track {
  display: block;
  width: 48px;
  height: 28px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  position: relative;
  transition: background 0.3s ease;
}

.toggle-btn.active .toggle-track {
  background: #e74c3c;
}

.toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  background: #f5f0e8;
  border-radius: 50%;
  transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.toggle-btn.active .toggle-thumb {
  transform: translateX(20px);
}

.sound-control {
  display: flex;
  gap: 8px;
  flex: 1;
  max-width: 200px;
}

.sound-input {
  flex: 1;
  padding: 8px 12px;
  background: #1a1614;
  border: 1px solid rgba(168, 159, 151, 0.2);
  border-radius: 8px;
  color: #a89f97;
  font-size: 12px;
  outline: none;
  min-width: 0;
}

.sound-btn {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(168, 159, 151, 0.2);
  border-radius: 8px;
  color: #f5f0e8;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.sound-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.sound-btn.clear {
  background: rgba(231, 76, 60, 0.2);
  border-color: rgba(231, 76, 60, 0.3);
  color: #e74c3c;
}

.sound-btn.clear:hover {
  background: rgba(231, 76, 60, 0.3);
}

.sound-presets {
  display: flex;
  gap: 8px;
}

.preset-btn {
  width: 36px;
  height: 36px;
  border: 1px solid rgba(168, 159, 151, 0.2);
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.preset-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: scale(1.1);
}

.preset-btn.active {
  background: rgba(231, 76, 60, 0.2);
  border-color: rgba(231, 76, 60, 0.5);
}

.behavior-select {
  display: flex;
  gap: 8px;
}

.behavior-btn {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(168, 159, 151, 0.2);
  border-radius: 8px;
  color: #a89f97;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.behavior-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f5f0e8;
}

.behavior-btn.active {
  background: rgba(231, 76, 60, 0.2);
  border-color: rgba(231, 76, 60, 0.5);
  color: #e74c3c;
}

/* 系统快捷键说明(折叠区) */
.shortcut-help {
  margin: 8px 0 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(168, 159, 151, 0.15);
  border-radius: 8px;
  overflow: hidden;
}

.shortcut-help > summary {
  padding: 10px 14px;
  font-size: 13px;
  color: #a89f97;
  cursor: pointer;
  list-style: none;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.shortcut-help > summary::-webkit-details-marker {
  display: none;
}

.shortcut-help > summary::before {
  content: '▸';
  font-size: 11px;
  color: #a89f97;
  transition: transform 0.2s;
  display: inline-block;
}

.shortcut-help[open] > summary::before {
  transform: rotate(90deg);
}

.shortcut-help > summary:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #f5f0e8;
}

.shortcut-help-list {
  padding: 4px 14px 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 14px;
  border-top: 1px solid rgba(168, 159, 151, 0.1);
}

.shortcut-help-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #a89f97;
}

.shortcut-help-item kbd {
  display: inline-block;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  font-size: 11px;
  font-weight: 500;
  color: #f5f0e8;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(168, 159, 151, 0.25);
  border-bottom-width: 2px;
  border-radius: 4px;
  padding: 2px 7px;
  min-width: 30px;
  text-align: center;
  line-height: 1.3;
}

/* 浅色主题 */
[data-theme="light"] .shortcut-help {
  background: rgba(45, 36, 32, 0.04);
  border-color: rgba(45, 36, 32, 0.12);
}
[data-theme="light"] .shortcut-help > summary {
  color: #6d5f57;
}
[data-theme="light"] .shortcut-help > summary::before {
  color: #6d5f57;
}
[data-theme="light"] .shortcut-help > summary:hover {
  background: rgba(45, 36, 32, 0.06);
  color: #2d2420;
}
[data-theme="light"] .shortcut-help-list {
  border-top-color: rgba(45, 36, 32, 0.1);
}
[data-theme="light"] .shortcut-help-item {
  color: #6d5f57;
}
[data-theme="light"] .shortcut-help-item kbd {
  color: #2d2420;
  background: #ffffff;
  border-color: rgba(45, 36, 32, 0.2);
}

/* 快捷键设置项 */
.shortcut-item .setting-label {
  flex: 1;
  min-width: 0;
  padding-right: 16px;
}

.shortcut-control {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.shortcut-value {
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  font-weight: 500;
  color: #f5f0e8;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(168, 159, 151, 0.2);
  border-radius: 6px;
  padding: 6px 12px;
  min-width: 110px;
  text-align: center;
  transition: all 0.2s;
  user-select: none;
  letter-spacing: 0.5px;
}

.shortcut-value.recording {
  color: #e74c3c;
  border-color: #e74c3c;
  background: rgba(231, 76, 60, 0.1);
  animation: shortcut-pulse 1.2s ease-in-out infinite;
}

.shortcut-value.conflict {
  color: #e74c3c;
  border-color: #e74c3c;
  background: rgba(231, 76, 60, 0.15);
  font-size: 11px;          /* 冲突提示文字较长,缩小字号 */
  letter-spacing: 0.2px;
  padding: 6px 8px;
  min-width: 200px;         /* 给冲突文字留够宽度 */
  animation: shortcut-shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
}

@keyframes shortcut-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

@keyframes shortcut-shake {
  10%, 90% { transform: translateX(-2px); }
  20%, 80% { transform: translateX(3px); }
  30%, 50%, 70% { transform: translateX(-5px); }
  40%, 60% { transform: translateX(5px); }
}

.shortcut-btn {
  padding: 6px 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(168, 159, 151, 0.2);
  border-radius: 6px;
  color: #a89f97;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.shortcut-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #f5f0e8;
}

.shortcut-btn.recording {
  background: rgba(231, 76, 60, 0.2);
  border-color: #e74c3c;
  color: #e74c3c;
}

.shortcut-btn.recording:hover {
  background: rgba(231, 76, 60, 0.3);
}

/* 浅色主题 */
[data-theme="light"] .shortcut-value {
  background: rgba(45, 36, 32, 0.06);
  border-color: rgba(45, 36, 32, 0.15);
  color: #2d2420;
}
[data-theme="light"] .shortcut-value.recording {
  color: #c0392b;
  background: rgba(231, 76, 60, 0.08);
}
[data-theme="light"] .shortcut-value.conflict {
  color: #c0392b;
  background: rgba(231, 76, 60, 0.12);
}
[data-theme="light"] .shortcut-btn {
  background: #faf8f5;
  border-color: rgba(45, 36, 32, 0.15);
  color: #6d5f57;
}
[data-theme="light"] .shortcut-btn:hover {
  background: rgba(45, 36, 32, 0.1);
  color: #2d2420;
}

/* 深色主题下图标变亮 */
[data-theme="dark"] .preset-btn {
  filter: brightness(0) saturate(1) invert(0.8) sepia(1) saturate(5) hue-rotate(50deg);
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-top: 1px solid rgba(168, 159, 151, 0.15);
}

.footer-right {
  display: flex;
  gap: 12px;
}

.action-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn.secondary {
  background: rgba(255, 255, 255, 0.05);
  color: #a89f97;
  border: 1px solid rgba(168, 159, 151, 0.2);
}

.action-btn.secondary:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #f5f0e8;
}

.action-btn {
  background: rgba(255, 255, 255, 0.08);
  color: #f5f0e8;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.action-btn.primary {
  background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
  color: white;
  box-shadow: 0 4px 15px rgba(231, 76, 60, 0.3);
}

.action-btn.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(231, 76, 60, 0.4);
}

.action-btn:active {
  transform: translateY(0);
}

/* Light theme */
[data-theme="light"] .settings-modal {
  background: #ffffff;
  border-color: rgba(45, 36, 32, 0.1);
}

[data-theme="light"] .modal-header {
  border-bottom-color: rgba(45, 36, 32, 0.1);
}

[data-theme="light"] .modal-header h2,
[data-theme="light"] .label-text,
[data-theme="light"] .num-value,
[data-theme="light"] .action-btn:not(.secondary) {
  color: #2d2420;
}

[data-theme="light"] .num-input {
  color: #2d2420;
  background: rgba(45, 36, 32, 0.06);
  border-color: rgba(45, 36, 32, 0.2);
}

[data-theme="light"] .num-input:focus {
  border-color: #e74c3c;
  background: rgba(45, 36, 32, 0.1);
}

[data-theme="light"] .label-hint,
[data-theme="light"] .close-btn,
[data-theme="light"] .num-btn {
  color: #6d5f57;
}

[data-theme="light"] .setting-item {
  border-bottom-color: rgba(45, 36, 32, 0.06);
}

[data-theme="light"] .num-btn,
[data-theme="light"] .sound-input {
  background: #faf8f5;
  border-color: rgba(45, 36, 32, 0.1);
  color: #2d2420;
}

[data-theme="light"] .toggle-thumb {
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

[data-theme="light"] .toggle-track {
  background: rgba(45, 36, 32, 0.15);
}

[data-theme="light"] .modal-footer {
  border-top-color: rgba(45, 36, 32, 0.1);
}

[data-theme="light"] .action-btn.secondary {
  background: #f0ebe5;
  border-color: rgba(45, 36, 32, 0.1);
  color: #6d5f57;
}

[data-theme="light"] .action-btn {
  background: #f0ebe5;
  color: #2d2420;
}
</style>
