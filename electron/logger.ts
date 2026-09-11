// 统一日志工具
// - 日志写入 userData/log.txt（与 config.json 同位置，卸载/覆盖不会丢）
// - 完整日期时间戳（排查跨天问题关键）
// - 对象自动 JSON 序列化（避免 [object Object]）
// - 5MB 轮转：超限自动 rename 为 log.old.txt，保留一份
// - DEBUG 级别按 app.isPackaged 门控（dev 输出 TimerDebug 等，production 隐藏）

import { appendFileSync, renameSync, existsSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const LOG_PATH = () => join(app.getPath('userData'), 'log.txt')
const LOG_OLD_PATH = () => join(app.getPath('userData'), 'log.old.txt')
const MAX_SIZE = 5 * 1024 * 1024  // 5MB

function safeStringify(v: unknown): string {
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v, (_k, val) => {
      if (typeof val === 'bigint') return val.toString() + 'n'
      if (val instanceof Error) return `${val.name}: ${val.message}\n${val.stack}`
      return val
    })
  } catch {
    return String(v)
  }
}

function formatLine(msg: unknown): string {
  const d = new Date()
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
  return `[${ts}] ${safeStringify(msg)}\n`
}

function rotateIfNeeded() {
  try {
    if (!existsSync(LOG_PATH())) return
    if (statSync(LOG_PATH()).size < MAX_SIZE) return
    if (existsSync(LOG_OLD_PATH())) {
      try { unlinkSync(LOG_OLD_PATH()) } catch { /* 忽略 */ }
    }
    renameSync(LOG_PATH(), LOG_OLD_PATH())
  } catch {
    // 轮转失败不影响主流程
  }
}

export function fileLog(msg: unknown) {
  const line = formatLine(msg)
  try {
    rotateIfNeeded()
    appendFileSync(LOG_PATH(), line)
  } catch (e) {
    console.error('日志写入失败:', e)
  }
  console.log(line.trimEnd())
}

export function debugLog(msg: unknown) {
  if (app.isPackaged) return
  fileLog(`[DEBUG] ${msg}`)
}
