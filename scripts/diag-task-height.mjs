// 诊断：任务条数变化时，列表区/任务卡容器高度是否恒定（排查"加到第 3 条被托高"）
import { connectToTarget, sleep } from './cdp-driver.mjs'
import { writeFileSync, existsSync, unlinkSync, readFileSync } from 'fs'

const BACKUP_FILE = 'scripts/.task-backup.json'

async function connect() {
  return connectToTarget(t => t.title === '番茄TODO时钟' && !t.url.includes('devtools'))
}

const PROBE = `(() => {
  const box = document.querySelector('.task-groups')
  const card = document.querySelector('.task-list')
  const hist = document.querySelector('.history-btn')
  const rows = box.querySelectorAll('.tcard2')
  const lb = card.getBoundingClientRect(), hb = hist.getBoundingClientRect()
  return {
    n: rows.length,
    groupH: box.clientHeight,
    groupScroll: box.scrollHeight,
    scrollable: box.scrollHeight > box.clientHeight + 1,
    cardH: rows[0] ? Math.round(rows[0].getBoundingClientRect().height) : 0,
    listH: Math.round(lb.height),
    histBottomGap: Math.round(lb.bottom - hb.bottom),
  }
})()`

let main = await connect()
await main.send('Page.enable')

const backup = await main.evalJS(`(async () => {
  const cur = await window.electronAPI.store.get('tasks')
  return cur ? JSON.parse(JSON.stringify(cur)) : []
})()`)
writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2))
console.log(`原始 tasks: ${backup.length} 条（已备份）\n`)

const todayStart = new Date()
todayStart.setHours(0, 0, 0, 0)
const base = todayStart.getTime()

try {
  for (const n of [1, 2, 3, 4, 6]) {
    const tasks = Array.from({ length: n }, (_, i) => ({
      id: `diag-h-${i}`,
      name: `任务${i + 1}`,
      completedPomodoros: 0,
      isCompleted: false,
      createdAt: base + (600 - i * 60) * 1000,
      completedAt: null,
      archivedAt: null
    }))
    await main.evalJS(`window.electronAPI.store.set('tasks', ${JSON.stringify(tasks)})`)
    await main.evalJS('location.reload()')
    main.close()
    await sleep(2400)
    main = await connect()
    await main.send('Page.enable')
    await sleep(800)
    const s = await main.evalJS(PROBE)
    console.log(
      `${String(n).padStart(2)} 条 | 列表区 ${String(s.groupH).padStart(3)}px (内容 ${String(s.groupScroll).padStart(3)}px)` +
      ` | 滚动 ${s.scrollable ? '有' : '无'} | 单卡 ${s.cardH}px | 任务卡容器 ${s.listH}px | 底部余量 ${s.histBottomGap}px`
    )
  }
} catch (e) {
  console.error('诊断异常:', e.message)
} finally {
  try {
    if (main.ws?.readyState !== 1) main = await connect()
    await main.send('Page.enable')
    if (existsSync(BACKUP_FILE)) {
      const raw = JSON.parse(readFileSync(BACKUP_FILE, 'utf8'))
      await main.evalJS(`window.electronAPI.store.set('tasks', ${JSON.stringify(raw)})`)
      unlinkSync(BACKUP_FILE)
    }
    await main.evalJS('location.reload()')
    await sleep(2000)
    main.close()
    console.log('\n数据已还原')
  } catch (e2) {
    console.error('还原失败，请用', BACKUP_FILE, '手工恢复:', e2.message)
  }
}
process.exit(0)
