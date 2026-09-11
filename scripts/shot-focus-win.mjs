// 小窗圆角验证：触发 compact 小窗 → 截图 + 检查 body 背景是否透明
// 用法: node scripts/shot-focus-win.mjs  输出 design-demos/shot-focus-win.png
import { connectToTarget, pollTarget, sleep } from './cdp-driver.mjs'
import { writeFileSync } from 'fs'

function withTimeout(p, ms, tag) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${tag} 超时(${ms}ms)`)), ms))
  ])
}

// 1. 连主窗口（url 含 5173 且不含 #/focus，排除 DevTools target）
const main = await connectToTarget(
  t => t.url.includes('localhost:5173') && !t.url.includes('#/focus') && !t.url.includes('devtools')
)
console.log('已连主窗口:', main.target.url)

await main.send('Page.enable')

// 2. 触发小窗专注
const data = { timeLeft: 1495, mode: 'focus', isRunning: true, total: 1500, currentTaskName: '圆角测试任务', currentTaskIds: [] }
await main.evalJS(`window.electronAPI.focus.open(${JSON.stringify(data)}, 'compact')`)
console.log('已触发 focus.open')

// 3. 轮询等小窗 target
const fw = await pollTarget(t => t.url.includes('#/focus'), 15000)
if (!fw) throw new Error('小窗 target 未出现')
console.log('已连小窗:', fw.target.url)

await sleep(800)

// 4. 检查关键样式
const check = await fw.evalJS(`(() => {
  const cs = getComputedStyle(document.body)
  const el = document.querySelector('.focus-window')
  return {
    bodyBg: cs.backgroundColor,
    htmlBg: getComputedStyle(document.documentElement).backgroundColor,
    radius: el ? getComputedStyle(el).borderRadius : 'NO .focus-window',
    inlineBody: document.body.style.background || '(无内联)',
  }
})()`)
console.log('样式检查:', JSON.stringify(check, null, 2))

// 5. 截图（透明角落应显示为透明像素）
await fw.send('Page.enable')
const shot = await withTimeout(
  fw.send('Page.captureScreenshot', { format: 'png' }),
  10000,
  'captureScreenshot'
)
writeFileSync('design-demos/shot-focus-win.png', Buffer.from(shot.data, 'base64'))
console.log('已保存: design-demos/shot-focus-win.png')

// 6. 关小窗恢复主窗口
await fw.evalJS(`window.electronAPI.focus.close()`)
await fw.close(); await main.close()
process.exit(0)
