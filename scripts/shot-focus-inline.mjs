// [方案1] 自查截图（带超时保护）：1) 内嵌全屏专注 2) compact 小窗
import { connectToTarget, pollTarget } from './cdp-driver.mjs'
import { writeFileSync } from 'fs'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const withTimeout = (p, ms, tag) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`${tag} 超时 ${ms}ms`)), ms))
])

const main = await connectToTarget(t => t.url.includes('localhost:5173') && !t.url.includes('devtools'))
await main.send('Page.enable')
await sleep(800)

async function shot(client, name) {
  const { data } = await withTimeout(client.send('Page.captureScreenshot', { format: 'png' }), 8000, `capture ${name}`)
  writeFileSync(`D:/DeskTop/番茄TODO/design-demos/shot-${name}.png`, Buffer.from(data, 'base64'))
  console.log(`已保存 shot-${name}.png`)
}

// 1) 内嵌全屏专注
await main.evalJS(`document.querySelectorAll('.focus-btn')[1]?.click()`)
await sleep(900)
try { await shot(main, 'focus-inline') } catch (e) { console.log('内嵌截图失败:', e.message) }
// 退出
await main.evalJS(`document.querySelector('.focus-inline .fbtn:last-child')?.click()`)
await sleep(600)

// 2) 小窗专注
await main.evalJS(`document.querySelectorAll('.focus-btn')[0]?.click()`)
const widget = await pollTarget(t => t.url.includes('#/focus'), 8000)
if (widget) {
  await widget.send('Page.enable')
  await sleep(1200)
  try { await shot(widget, 'focus-compact') } catch (e) { console.log('小窗截图失败:', e.message) }
  await widget.evalJS(`document.querySelector('.w-close')?.click()`)
  await sleep(600)
} else {
  console.log('小窗 target 未出现')
}
process.exit(0)
