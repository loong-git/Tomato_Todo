# 番茄TODO

基于 Electron + Vue 3 的番茄工作法桌面应用，支持深色/浅色主题切换、数据导入导出。

## 功能特性

- 🍅 番茄计时器 - 专注、短休息、长休息三种模式，每 4 个番茄触发长休息
- 📋 任务管理 - 支持多任务并行、任务历史追踪
- 📊 数据统计 - 打卡表（热力图）、专注时长统计、年度/累计统计
- 🎯 今日目标 - 横条进度，完成超目标显示实际百分比（如 200%）
- 🗓️ 热力图日历筛选 - 点击标题弹出滚轮选择器，拖动/滚动切换年份月份
- 🔔 音效提醒 - 预设音效（铃铛、鸟鸣、叮咚、滴答）+ 自定义音频
- 🌙 主题切换 - 深色/浅色模式
- 💾 数据备份 - JSON/CSV 格式导出，导入后可 100% 还原（含统计与连胜）
- 🖱️ 专注窗口 - 小窗/全屏两种专注模式，独立计时

## 技术栈

| 技术 | 版本 |
|------|------|
| Electron | ^28.0.0 |
| Vue 3 | ^3.4.21 |
| TypeScript | ^5.4.2 |
| Vite | ^5.1.6 |
| Pinia | ^2.1.7 |
| electron-store | ^8.1.0 |

## 快速开始

```bash
# 安装依赖（postinstall 会自动打 electron-builder 无证书补丁）
npm install

# 开发模式（自动启动 Electron + Vite）
npm run dev

# 打包便携版（zip 解压即用）
npm run build:zip

# 打包便携版（单 exe 自解压）
npm run build:portable

# 打包全部（zip + portable + NSIS 安装版）
npm run build:all
```

## 快捷键

| 按键 | 功能 |
|------|------|
| `Space` | 开始 / 暂停计时器 |
| `R` | 重置计时器 |
| `S` | 打开设置 |
| `N` | 聚焦任务输入框 |
| `1` / `2` / `3` | 切到专注 / 短休息 / 长休息 |
| `Escape` | 关闭弹窗 / 取消录制快捷键 |
| `Alt+F` | 切全屏专注（可在设置自定义） |
| `Alt+M` | 切小窗专注（可在设置自定义） |

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
│   │   ├── DataManager.vue      # 数据管理
│   │   └── AppToast.vue        # 全局 toast 提示
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

使用 `electron-store` 存储，数据文件在 `data/config.json`（dev 模式位于项目根 `data/`，打包版位于程序目录 `resources/data/`）：

| key | 内容 |
|-----|------|
| `tasks` | 任务列表 |
| `records` | 番茄记录（保留 365 天）|
| `settings` | 用户设置 |
| `streakData` | 连胜数据 |
| `lifetimeStats` | 永久累计统计 |
| `yearStats` | 按年统计 |

> 数据目录不提交到 git，属用户本地数据。

## 开源协议

本项目基于 **MIT License** 开源，详见 [LICENSE](./LICENSE)。

MIT 允许自由使用、修改、分发（含商用），但必须保留版权声明，且作者不承担任何责任。
