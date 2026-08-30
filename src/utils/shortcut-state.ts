/**
 * 全局模块级状态:SettingsPanel 正在录制快捷键
 * 期间 App.vue / FocusWindow.vue 的全局 keydown 监听应让路(避免触发"切窗口"等动作)
 * 用模块级 boolean 即可(不需要 reactivity,因为两边的 listener 都是同步读的)
 */
let _isRecording = false

export function isShortcutRecording(): boolean {
  return _isRecording
}

export function setShortcutRecording(v: boolean): void {
  _isRecording = v
}
