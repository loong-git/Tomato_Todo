<script setup lang="ts">
import { ref } from 'vue'
import { useSettingsStore } from '@/stores'
import type { SoundType } from '@/types'

const settingsStore = useSettingsStore()
const visible = ref(false)

const localSettings = ref({ ...settingsStore.settings })

const soundPresets = [
  { value: 'bell' as SoundType, label: '铃铛', icon: '🔔' },
  { value: 'forest' as SoundType, label: '鸟鸣', icon: '🐦' },
  { value: 'ding' as SoundType, label: '叮咚', icon: '🎵' },
  { value: 'tick' as SoundType, label: '滴答', icon: '⏰' },
  { value: 'custom' as SoundType, label: '自定义', icon: '📁' }
]

function open() {
  localSettings.value = { ...settingsStore.settings }
  visible.value = true
}

async function save() {
  await settingsStore.updateSettings(localSettings.value)
  visible.value = false
}

function reset() {
  settingsStore.resetSettings()
  localSettings.value = { ...settingsStore.settings }
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
