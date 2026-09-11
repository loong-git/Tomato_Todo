// 验证互斥单选 + 折叠持久化
import { connectToTarget } from './cdp-driver.mjs'

const main = await connectToTarget(t => t.title === '番茄TODO时钟' && !t.url.includes('devtools'))
const ev = (body) => main.evalJS(`(async () => { ${body} })()`, { awaitPromise: true, timeoutMs: 12000 })

// ---- 互斥单选 ----
const r1 = await ev(`
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
  const tm = pinia._s.get('timer'); const tk = pinia._s.get('task')
  const ids = tk.tasks.filter(t => !t.isCompleted).slice(0, 2).map(t => t.id)
  if (ids.length < 2) return { err: 'need 2 active tasks, got ' + ids.length }
  tm.toggleCurrentTask(ids[0])
  const s1 = JSON.stringify(tm.currentTaskIds)
  tm.toggleCurrentTask(ids[1])
  const s2 = JSON.stringify(tm.currentTaskIds)
  tm.toggleCurrentTask(ids[1])
  const s3 = JSON.stringify(tm.currentTaskIds)
  return { s1, s2, s3 }
`)
console.log('互斥单选: 点A=' + r1.s1, '→ 点B=' + r1.s2, '→ 再点B=' + r1.s3)
console.log('  单选断言:', r1.s1 === JSON.stringify([r1.s1 ? JSON.parse(r1.s1)[0] : null]) ? 'pass' : 'check',
  '| B替换A:', JSON.parse(r1.s2).length === 1 && r1.s2 !== r1.s1 ? 'pass' : 'FAIL',
  '| 再点B清空:', r1.s3 === '[]' ? 'pass' : 'FAIL')

// ---- 折叠 ----
const r2 = await ev(`
  const head = document.querySelector('.card-head.clickable')
  if (!head) return { err: 'no clickable head (tasks=0?)' }
  head.click()
  await new Promise(r => setTimeout(r, 300))
  const collapsed = !document.querySelector('.task-groups')
  const saved = await window.electronAPI.store.get('uiPrefs')
  return { collapsed, saved: JSON.stringify(saved) }
`)
console.log('折叠: 列表隐藏=' + r2.collapsed, '| 磁盘持久化=' + r2.saved)

// 恢复展开
await ev(`
  document.querySelector('.card-head.clickable')?.click()
  await new Promise(r => setTimeout(r, 200))
  return !document.querySelector('.task-groups') ? 'still-collapsed' : 'expanded-ok'
`).then(t => console.log('恢复展开:', t))

await main.close()
process.exit(0)
