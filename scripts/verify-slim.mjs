/**
 * 瘦身改版的补充验收：
 * 1. 注入 4 条今日任务 → 截图（有任务时的真实观感）
 * 2. 浅色主题下再量一次（主题变量是否影响高度）
 * 3. 核对「累计专注」三个数字与 lifetimeStats 是否一致
 * 结束无条件还原（备份落盘 + try/finally）
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

const LAYOUT = `(() => {
  const main = document.querySelector('main'), content = document.querySelector('.content')
  const heat = document.querySelector('.heatmap-container'), hb = heat.getBoundingClientRect(), mb = main.getBoundingClientRect()
  const h = e => e ? Math.round(e.getBoundingClientRect().height) : null
  return { win: innerWidth + 'x' + innerHeight, theme: document.documentElement.getAttribute('data-theme'),
    main: main.clientHeight, content: content.scrollHeight, over: content.scrollHeight - main.clientHeight,
    timer: h(document.querySelector('.timer-card')), tasks: h(document.querySelector('.task-list')),
    stats: h(document.querySelector('.stats-block')), heat: h(heat),
    heatVisible: hb.bottom <= mb.bottom + 1,
    cards: document.querySelectorAll('.task-groups .tcard2').length,
    listScroll: (() => { const g = document.querySelector('.task-groups'); return g ? g.scrollHeight > g.clientHeight + 1 : null })() }
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
const injected = ['写周报', '整理资料', '阅读 30 页', '复盘昨日'].map((name, i) => ({
  id: `vfy-slim-${i}`, name, completedPomodoros: i % 2, isCompleted: i === 3,
  createdAt: base + (600 - i * 60) * 1000,
  completedAt: i === 3 ? base + (900) * 1000 : null, archivedAt: null
}))

try {
  // ---- 1. 有任务 + 深色 ----
  await main.evalJS(`window.electronAPI.store.set('tasks', ${JSON.stringify(injected)})`)
  await main.evalJS('location.reload()')
  main.close(); await sleep(2600)
  main = await connect(); await main.send('Page.enable'); await sleep(900)

  let r = await main.evalJS(LAYOUT)
  console.log(`[深色] ${r.theme} | 4 张卡渲染 ${r.cards} | 列表滚动 ${r.listScroll} | 溢出 ${r.over}px | 热力条 ${r.heatVisible ? '可见' : '被切'}`)
  const darkTasks = r.tasks, darkHeat = r.heat
  console.log(`  基线: 窗口 ${r.win} | tasks=${r.tasks} stats=${r.stats} heat=${r.heat}`)
  check('深色下渲染 4 张任务卡', r.cards === 4, String(r.cards))
  check('深色下热力条完整可见', r.heatVisible === true, `溢出 ${r.over}px`)
  // 注：这里原本有截图。Electron 窗口被遮挡/最小化时 captureScreenshot 会报 -32000 或直接 hang，
  // 而 cdp-driver 的 send() 没有超时机制，会把整个验收卡死。截图改为人工在应用里看。

  // ---- 2. 浅色主题 ----
  await main.evalJS(`document.querySelector('.theme-toggle')?.click()`)
  await sleep(900)
  r = await main.evalJS(LAYOUT)
  console.log(`[浅色] ${r.theme} | 溢出 ${r.over}px | 热力条 ${r.heatVisible ? '可见' : '被切'}`)
  check('切到浅色主题', r.theme === 'light', String(r.theme))
  check('浅色下热力条仍完整可见', r.heatVisible === true, `溢出 ${r.over}px`)
  // 高度断言不能写死像素（窗口多大中行就多高），只比较深浅色两次是否一致
  check('深浅色布局高度一致', Math.abs(r.tasks - darkTasks) <= 2 && Math.abs(r.heat - darkHeat) <= 2,
    `tasks ${darkTasks}→${r.tasks}, heat ${darkHeat}→${r.heat}`)

  // 切回深色
  await main.evalJS(`document.querySelector('.theme-toggle')?.click()`)
  await sleep(700)

  // ---- 3. 核对累计数字 ----
  const nums = await main.evalJS(`(() => {
    const cards = [...document.querySelectorAll('.lifetime-card')]
    const store = window.__pinia || null
    return cards.map(c => ({
      v: c.querySelector('.stat-value')?.textContent?.trim(),
      l: c.querySelector('.stat-label')?.textContent?.trim()
    }))
  })()`)
  const ls = await main.evalJS(`(async () => {
    const s = await window.electronAPI.store.get('settings')
    const l = await window.electronAPI.store.get('lifetimeStats')
    return l
  })()`)
  console.log('  页面显示:', JSON.stringify(nums))
  console.log('  lifetimeStats:', JSON.stringify(ls))
  const expectCount = String(ls?.totalCount ?? 0)
  const expectHours = String(Math.round((ls?.totalSeconds ?? 0) / 3600))
  const expectAvg = ls?.totalCount > 0 ? String(Math.round(ls.totalSeconds / ls.totalCount / 60)) : '0'
  const shown = nums.map(n => n.v)
  check('累计番茄与 lifetimeStats 一致', shown[0] === expectCount, `页面 ${shown[0]} vs 存储 ${expectCount}`)
  check('累计小时与 lifetimeStats 一致', String(shown[1]).replace('h','') === expectHours, `页面 ${shown[1]} vs 存储 ${expectHours}`)
  check('平均每个番茄分钟数正确', shown[2] === expectAvg, `页面 ${shown[2]} vs 算得 ${expectAvg}`)
  check('三个标签齐全', nums.map(n => n.l).join('/') === '累计番茄/累计小时/平均每个(分)', nums.map(n => n.l).join('/'))
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
    console.log('\n数据已还原')
  } catch (e2) {
    console.error('还原失败，请用', BACKUP_FILE, '手工恢复:', e2.message)
  }
}

console.log(`\n结果: ${PASS.length} 通过 / ${FAIL.length} 失败`)
if (FAIL.length) { console.log('失败项: ' + FAIL.join(' | ')); process.exit(1) }
process.exit(0)
