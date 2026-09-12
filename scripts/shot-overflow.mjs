// 截图：今日任务区固定高度 + 内部滚动（临时注入 6 条，截完无论成败都还原）
import { connectToTarget, sleep } from './cdp-driver.mjs'
import { writeFileSync, existsSync, unlinkSync } from 'fs'

const BACKUP_FILE = 'scripts/.task-backup.json'

async function connect() {
  return connectToTarget(t => t.title === '番茄TODO时钟' && !t.url.includes('devtools'))
}

let main = await connect()
await main.send('Page.enable')

const backup = await main.evalJS(`(async () => {
  const cur = await window.electronAPI.store.get('tasks')
  return cur ? JSON.parse(JSON.stringify(cur)) : []
})()`)
writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2))
console.log(`原始 tasks: ${backup.length} 条（已备份）`)

const todayStart = new Date()
todayStart.setHours(0, 0, 0, 0)
const base = todayStart.getTime()
const names = ['写周报', '整理资料', '阅读 30 页', '复盘昨日', '测试新功能', '买菜']
const injected = names.map((name, i) => ({
  id: `shot-ovf-${i}`,
  name,
  completedPomodoros: i < 2 ? 1 : 0,
  isCompleted: i >= 4,
  createdAt: base + (600 - i * 60) * 1000,
  completedAt: i >= 4 ? base + (900 + i * 60) * 1000 : null,
  archivedAt: null
}))

async function shot(file) {
  const r = await main.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(file, Buffer.from(r.data, 'base64'))
  console.log('saved:', file)
}

try {
  await main.evalJS(`window.electronAPI.store.set('tasks', ${JSON.stringify(injected)})`)
  await main.evalJS('location.reload()')
  main.close()
  await sleep(2500)
  main = await connect()
  await main.send('Page.enable')
  await sleep(900)

  await shot('design-demos/shot-overflow-collapsed.png')
} catch (e) {
  console.error('截图失败:', e.message)
} finally {
  try {
    if (main.ws?.readyState !== 1) main = await connect()
    await main.send('Page.enable')
    if (existsSync(BACKUP_FILE)) {
      const raw = JSON.parse((await import('fs')).readFileSync(BACKUP_FILE, 'utf8'))
      await main.evalJS(`window.electronAPI.store.set('tasks', ${JSON.stringify(raw)})`)
      unlinkSync(BACKUP_FILE)
    }
    await main.evalJS('location.reload()')
    await sleep(2200)
    await shot('design-demos/shot-overflow-restored.png')
    main.close()
    console.log('数据已还原')
  } catch (e2) {
    console.error('还原失败，请用', BACKUP_FILE, '手工恢复:', e2.message)
  }
}
process.exit(0)
