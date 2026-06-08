# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

番茄TODO时钟 - 基于 Electron + Vue 3 的番茄工作法桌面应用，支持深色/浅色主题切换。

## 技术栈

- **桌面框架**: Electron ^28.0.0
- **前端框架**: Vue 3 + TypeScript + Composition API
- **构建工具**: Vite + electron-builder
- **状态管理**: Pinia
- **数据存储**: electron-store

### 重要
每次修改完代码 自己重启 不要告诉我让我重启

## 常用命令

```bash
# 安装依赖
npm install

# 开发模式（同时启动 Electron 和 Vite）
npm run dev

# 构建打包
npm run build

# 仅打包 Electron（构建后执行）
npm run pack
```

## 开发流程

新功能开发遵循以下步骤：

1. **落地方案** - 先写具体实现方案和逻辑，确认后再实施
2. **添加日志** - 实现时添加适当的 console.log 日志，便于调试
3. **测试验证** - 使用 `npm run dev` 启动应用，手动测试功能
4. **汇报结果** - 完成测试后汇报进度和结果

示例流程：
```bash
npm run dev  # 启动开发服务器
# 测试功能...
# 汇报结果
```

## 架构说明

### 主进程与渲染进程

- `electron/main.ts` - Electron 主进程入口，处理窗口管理、系统通知
- `electron/preload.ts` - 预加载脚本，通过 contextBridge 暴露安全 API
- `src/` - Vue 渲染进程源码

### IPC 通信

通过 `window.electronAPI` 暴露以下 API：
- `store` - 数据持久化 (get/set/delete)
- `notification` - 系统通知
- `dialog` - 文件对话框
- `audio` - 音频播放
- `focus` - 专注模式窗口管理
- `window` - 窗口控制 (minimize/close)

### 窗口架构

**主窗口** (frame: false, 自定义标题栏)
- 自定义标题栏包含：Logo、主题切换、设置按钮、最小化/关闭按钮
- 可拖动区域通过 `-webkit-app-region: drag` 实现

**专注窗口** (FocusWindow)
- 独立的小窗口，显示在屏幕右上角
- 完全独立计时，与主窗口同步运行
- 支持浅色/深色主题切换
- 关闭时重置计时器

### 状态管理 (Pinia Stores)

- `stores/timer.ts` - 计时器状态、专注模式控制
- `stores/task.ts` - 任务列表、多选任务
- `stores/settings.ts` - 用户设置（含 theme: 'dark' | 'light'）
- `stores/stats.ts` - 统计数据

### 番茄钟流程

```
专注(25min) → 短休息(5min) → 专注 → 短休息 → 专注 → 短休息 → 专注 → 长休息(15min)
                          每4个番茄后触发长休息
```

### 主题系统

使用 CSS 变量实现：
```css
--bg-primary, --bg-secondary, --bg-card
--text-primary, --text-secondary, --text-muted
--border-color, --shadow
--tomato (主色调 #e74c3c)
```

组件通过 `data-theme="light|dark"` 属性切换主题。

### 数据持久化

使用 electron-store 存储在 `data/` 目录：
- `tasks` - 任务列表
- `records` - 番茄完成记录
- `settings` - 用户设置
- `stats` - 统计数据
