/**
 * 补测：计时进行中（任务卡多出「专注中」+「第 N 个番茄进行中」标签）时，
 * 270px 的固定列表区还能不能完整放下 3 张卡。
 * 结束无条件还原数据 + 重置计时器。
 */
import { connectToTarget, sleep } from './cdp-driver.mjs'
import { writeFileSync, existsSync, unlinkSync, readFileSync } from 'fs'

const BACKUP_FILE = 'scripts/.task-backup.json'
const PASS = [], FAIL = []
const check = (n, ok, extra = '') => {
  ;(ok ? PASS : FAIL).push(n)
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${extra ? ' — ' + extra : ''}`)
}

async function connect() {
  return connectToTarget(t => t.title === '番茄TODO时钟' && !t.url.includes('devtools'))
}

const PROBE = `(() => {
  const box = document.querySelector('.task-groups')
  const rows = [...box.querySelectorAll('.tcard2')]
  const bb = box.getBoundingClientRect()
  const third = rows[2]?.getBoundingClientRect()
  const running = document.querySelectorAll('.task-groups .live-tag, .task-groups .live').length
  return {
    cards: rows.length,
    heights: rows.slice(0, 4).map(r => Math.round(r.getBoundingClientRect().height)),
    clientH: box.clientHeight, scrollH: box.scrollHeight,
    scrollable: box.scrollHeight > box.clientHeight + 1,
    thirdFull: third ? third.bottom <= bb.bottom + 1 : null,
    runningMarks: running,
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

const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
const base = todayStart.getTime()
const injected = ['任务甲', '任务乙', '任务丙', '任务丁'].map((name, i) => ({
  id: `vfy-run-${i}`, name, completedPomodoros: 0, isCompleted: false,
  createdAt: base + (600 - i * 60) * 1000, completedAt: null, archivedAt: null
}))

try {
  await main.evalJS(`window.electronAPI.store.set('tasks', ${JSON.stringify(injected)})`)
  await main.evalJS('location.reload()')
  main.close(); await sleep(2600)
  main = await connect(); await main.send('Page.enable'); await sleep(900)

  const idle = await main.evalJS(PROBE)
  console.log(`[空闲] ${idle.cards} 张卡 高度=${idle.heights.join('/')} 列表 ${idle.clientH}px 滚动=${idle.scrollable}`)

  // 选中第 1 张卡 + 点开始，制造「专注中」状态
  await main.evalJS(`document.querySelectorAll('.task-groups .tcard2')[0].click()`)
  await sleep(400)
  await main.evalJS(`document.querySelector('.control-btn.primary')?.click()`)
  await sleep(1500)

  const running = await main.evalJS(PROBE)
  console.log(`[计时中] ${running.cards} 张卡 高度=${running.heights.join('/')} 列表 ${running.clientH}px 滚动=${running.scrollable} 专注中标记=${running.runningMarks}`)

  check('计时中仍渲染 4 张卡', running.cards === 4, String(running.cards))
  check('计时中卡片未变高（标签不换行）', running.heights.every(h => h <= idle.heights[0] + 2),
    `空闲首卡 ${idle.heights[0]}px vs 计时中 ${running.heights.join('/')}px`)
  check('第三张卡在计时中仍完整可见', running.thirdFull === true,
    `thirdFull=${running.thirdFull}`)
  check('列表区高度仍是 270px', running.clientH === 270, `${running.clientH}px`)

  // 复位
  await main.evalJS(`document.querySelector('.control-btn.ghost')?.click()`)
  await sleep(600)
} catch (e) {
  console.error('\n异常:', e.message)
  FAIL.push('异常: ' + e.message)
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
    await sleep(2200)
    main.close()
    console.log('\n数据已还原、计时器已复位')
  } catch (e2) {
    console.error('还原失败，请用', BACKUP_FILE, '手工恢复:', e2.message)
  }
}

console.log(`\n结果: ${PASS.length} 通过 / ${FAIL.length} 失败`)
if (FAIL.length) { console.log('失败项: ' + FAIL.join(' | ')); process.exit(1) }
process.exit(0)
