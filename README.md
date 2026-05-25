# 番茄TODO

基于 Electron + Vue 3 的番茄工作法桌面应用，支持深色/浅色主题切换、数据导入导出。

## 功能特性

- 🍅 番茄计时器 - 专注、短休息、长休息三种模式
- 📋 任务管理 - 支持多任务并行、任务历史追踪
- 📊 数据统计 - 打卡表、专注时长统计
- 🔔 音效提醒 - 预设音效（铃铛、鸟鸣、叮咚、滴答）
- 🌙 主题切换 - 深色/浅色模式
- 💾 数据备份 - JSON/CSV 格式导出

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建打包
npm run build
```

## 项目结构

```
番茄TODO/
├── electron/              # Electron 主进程
│   ├── main.ts         # 主进程入口
│   └── preload.ts      # 预加载脚本
├── src/                 # Vue 渲染进程
│   ├── components/     # Vue 组件
│   │   ├── TimerDisplay.vue     # 计时器显示
│   │   ├── TimerControls.vue    # 计时器控制
│   │   ├── ModeSelector.vue     # 模式选择
│   │   ├── TaskList.vue        # 任务列表
│   │   ├── StatsDisplay.vue     # 统计展示
│   │   ├── SettingsPanel.vue   # 设置面板
│   │   ├── FocusWindow.vue     # 专注窗口
│   │   ├── CelebrationOverlay.vue # 完成动画
│   │   └── DataManager.vue      # 数据管理
│   ├── stores/         # Pinia 状态管理
│   │   ├── timer.ts     # 计时器状态
│   │   ├── task.ts      # 任务状态
│   │   ├── settings.ts  # 设置状态
│   │   └── stats.ts     # 统计状态
│   ├── types/          # TypeScript 类型
│   │   └── index.ts    # 类型定义
│   └── utils/          # 工具函数
│       └── index.ts    # 音效播放
├── App.vue             # 根组件
└── main.ts            # 应用入口
```

## 数据结构

### Task (任务)
```typescript
interface Task {
  id: string              // 唯一标识
  name: string            // 任务名称
  completedPomodoros: number  // 完成的番茄数
  isCompleted: boolean   // 是否完成
  createdAt: number       // 创建时间戳
  completedAt: number | null  // 完成时间
  archivedAt: number | null  // 归档时间
}
```

### PomodoroRecord (番茄记录)
```typescript
interface PomodoroRecord {
  id: string
  taskId: string         // 关联任务ID
  type: 'focus' | 'shortBreak' | 'longBreak'  // 番茄类型
  duration: number       // 时长（秒）
  completedAt: number    // 完成时间戳
}
```

### Settings (设置)
```typescript
interface Settings {
  focusDuration: number      // 专注时长（分钟）
  shortBreakDuration: number  // 短休息时长
  longBreakDuration: number  // 长休息时长
  longBreakInterval: number  // 长休息间隔
  dailyGoal: number         // 每日目标
  soundEnabled: boolean     // 声音提醒
  notificationEnabled: boolean  // 系统通知
  soundType: SoundType     // 音效类型
  soundPath: string         // 自定义音频路径
  theme: 'dark' | 'light' // 主题
}
```

## IPC 通信 API

通过 `window.electronAPI` 暴露以下接口：

### store (数据存储)
```typescript
store.get(key: string): Promise<unknown>      // 读取数据
store.set(key: string, value: unknown): void  // 保存数据
store.delete(key: string): void               // 删除数据
```

### dialog (文件对话框)
```typescript
dialog.openFile(): Promise<string>                           // 打开音频文件
dialog.saveFile(data: string, name: string): Promise<boolean>  // 保存JSON
dialog.saveCSV(data: string, name: string): Promise<boolean>   // 保存CSV
dialog.openJsonFile(): Promise<string | null>                  // 打开JSON
```

### notification (系统通知)
```typescript
notification.show({ title: string, body: string }): void
```

### audio (音频播放)
```typescript
audio.play(filePath: string): Promise<boolean>
audio.stop(): Promise<boolean>
```

### window (窗口控制)
```typescript
window.minimize(): void
window.close(): void
window.bringToFront(): void
```

## 番茄钟流程

```
专注(25min) → 短休息(5min) → 专注 → 短休息 → 专注 → 短休息 → 专注 → 长休息(15min)
                          每4个番茄后触发长休息
```

## 状态管理 (Pinia Stores)

### timerStore
```typescript
// 状态
timeLeft: number           // 剩余秒数
isRunning: boolean         // 是否运行中
mode: TimerMode           // 当前模式
pomodoroCount: number     // 番茄计数
currentTaskIds: string[]  // 当前选中任务

// 方法
start(): void
pause(): void
reset(): void
complete(): void
skip(): void
setMode(mode: TimerMode): void
toggleCurrentTask(taskId: string): void
```

### taskStore
```typescript
// 状态
tasks: Task[]                    // 所有任务
activeTasks: Task[]              // 今日任务
historyTasks: Task[]             // 历史任务
completedTasks: Task[]             // 已完成任务
archivedTasks: Task[]             // 已归档任务

// 方法
addTask(name: string): Task
updateTask(id: string, updates: Partial<Task>): void
deleteTask(id: string): void
completeTask(id: string): void
archiveTask(id: string): void
unarchiveTask(id: string): void
exportAllData(): Promise<string>    // 导出JSON
exportAsCSV(): Promise<string>      // 导出CSV
importAllData(json: string): Promise<{ success, message }>
```

### settingsStore
```typescript
// 状态
settings: Settings

// 方法
updateSettings(updates: Partial<Settings>): void
resetSettings(): void
loadSettings(): Promise<void>
saveSettings(): void
```

### statsStore
```typescript
// 状态
records: PomodoroRecord[]
todayCount: number
weekCount: number

// 方法
addRecord(record: Omit<PomodoroRecord, 'id'>): void
loadRecords(): Promise<void>
saveRecords(): void
```

## 音效系统

内置四种预设音效：

| 类型 | 描述 | 场景 |
|------|------|------|
| bell | 铃铛连环撞击声 | 专注结束 |
| forest | 鸟鸣啾啾声 | 休息开始 |
| ding | 叮咚上行旋律 | 提示音 |
| tick | 时钟滴答声 | 倒计时 |

使用 Web Audio API 合成，无需外部音频文件。

## 主题系统

应用使用 CSS 变量实现主题切换：

```css
[data-theme="dark"] {
  --bg-primary: #1a1614;
  --text-primary: #faf5f0;
  --tomato: #e74c3c;
}

[data-theme="light"] {
  --bg-primary: #f5f2ef;
  --text-primary: #1a1512;
  --tomato: #e74c3c;
}
```

## 数据持久化

使用 `electron-store` 存储在 `data/` 目录：
- `tasks` - 任务列表
- `records` - 番茄记录
- `settings` - 用户设置
- `streakData` - 连胜数据
