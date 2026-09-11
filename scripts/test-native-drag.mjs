// 系统拖动方案验证：① title-blank 是 drag 区 ② 合成双击触发最大化 ③ 宽度稳定
import { connectToTarget, sleep } from './cdp-driver.mjs'

const main = await connectToTarget(
  t => t.url.includes('localhost:5173') && !t.url.includes('#/focus') && !t.url.includes('devtools')
)
console.log('已连主窗口')

// 1. app-region 检查
const style = await main.evalJS(`(() => {
  const cs = getComputedStyle(document.querySelector('.title-blank'))
  const r = document.querySelector('.title-blank').getBoundingClientRect()
  return { appRegion: cs.webkitAppRegion, x: r.x + r.width / 2, y: r.y + r.height / 2 }
})()`)
console.log('title-blank:', JSON.stringify(style))
if (style.appRegion !== 'drag') throw new Error('title-blank 不是 drag 区！')

const before = await main.evalJS(`({ innerW: window.innerWidth, outerW: window.outerWidth, screenX: window.screenX })`)
console.log('操作前:', JSON.stringify(before))

// 2. 合成双击（两次 mousePressed clickCount:1 间隔短，走 pointerdown 计时检测）
await main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: style.x, y: style.y, button: 'left', clickCount: 1 })
await main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: style.x, y: style.y, button: 'left', clickCount: 1 })
await sleep(80)
await main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: style.x, y: style.y, button: 'left', clickCount: 1 })
await main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: style.x, y: style.y, button: 'left', clickCount: 1 })
await sleep(800)

const after = await main.evalJS(`({ innerW: window.innerWidth, outerW: window.outerWidth, screenX: window.screenX })`)
console.log('双击后:', JSON.stringify(after))
console.log('=== 双击结果 ===')
console.log(`宽: ${before.outerW} → ${after.outerW}（最大化应接近 ${'整屏宽'}） screenX: ${before.screenX} → ${after.screenX}`)

// 3. 双击还原
await sleep(200)
await main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: style.x, y: style.y, button: 'left', clickCount: 1 })
await main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: style.x, y: style.y, button: 'left', clickCount: 1 })
await sleep(80)
await main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: style.x, y: style.y, button: 'left', clickCount: 1 })
await main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: style.x, y: style.y, button: 'left', clickCount: 1 })
await sleep(800)
const restored = await main.evalJS(`({ innerW: window.innerWidth, outerW: window.outerWidth, screenX: window.screenX })`)
console.log('还原后:', JSON.stringify(restored))
console.log(`宽: ${before.outerW} → ${restored.outerW}（应≈相等）`)
await main.close()
process.exit(0)
