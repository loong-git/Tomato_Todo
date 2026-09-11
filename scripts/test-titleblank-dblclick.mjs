// 定位"双击标题栏空白不生效"：模拟双击 title-blank，检查事件是否到达 renderer
import { connectToTarget } from './cdp-driver.mjs'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const main = await connectToTarget(t => t.url.includes('localhost:5173') && !t.url.includes('devtools'))
await main.send('Page.enable')

// 1) title-blank 是否存在、位置、以及命中测试（elementFromPoint 看被谁盖住）
const info = await main.evalJS(`(() => {
  const el = document.querySelector('.title-blank')
  if (!el) return { exists: false }
  const r = el.getBoundingClientRect()
  const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2)
  const hit = document.elementFromPoint(cx, cy)
  return {
    exists: true,
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    center: { cx, cy },
    hitTag: hit?.className || hit?.tagName,
    hitIsBlank: hit === el,
    appRegion: getComputedStyle(el).webkitAppRegion
  }
})()`)
console.log('title-blank:', JSON.stringify(info, null, 1))
if (!info.exists) process.exit(1)

// 2) 监听 renderer 侧事件
await main.evalJS(`(() => {
  window.__evt = []
  const el = document.querySelector('.title-blank')
  ;['mousedown','mouseup','click','dblclick'].forEach(t =>
    el.addEventListener(t, e => window.__evt.push(t + ':' + e.button)))
  return true
})()`)

// 3) CDP 模拟双击（clickCount=2）
const { cx, cy } = info.center
for (const [type, cc] of [['mousePressed',1],['mouseReleased',1],['mousePressed',2],['mouseReleased',2]]) {
  await main.send('Input.dispatchMouseEvent', { type, x: cx, y: cy, button: 'left', clickCount: cc })
  await sleep(60)
}
await sleep(400)

const evt = await main.evalJS(`JSON.stringify(window.__evt)`)
console.log('renderer 收到的事件:', evt)

// 4) 窗口是否最大化
const size = await main.evalJS(`JSON.stringify({ w: innerWidth, h: innerHeight })`)
console.log('双击后窗口:', size)
await main.close()
process.exit(0)
