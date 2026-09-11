// 分离实验：纯 dragBy IPC（无合成鼠标），定位宽度变化的触发条件
import { connectToTarget, sleep } from './cdp-driver.mjs'

const main = await connectToTarget(
  t => t.url.includes('localhost:5173') && !t.url.includes('#/focus') && !t.url.includes('devtools')
)

const w = () => main.evalJS(`({ innerW: window.innerWidth, screenX: window.screenX })`)

console.log('--- 实验1: 单次大步 dragBy(-80, 0) ---')
let before = await w()
await main.evalJS(`window.electronAPI.window.dragBy(-80, 0)`)
await sleep(500)
let after = await w()
console.log(`宽: ${before.innerW} → ${after.innerW} (${after.innerW - before.innerW})  x: ${before.screenX} → ${after.screenX}`)

// 拖回去
await main.evalJS(`window.electronAPI.window.dragBy(80, 0)`)
await sleep(300)

console.log('--- 实验2: 连续 10 次小步 dragBy(-8, 0) ---')
before = await w()
await main.evalJS(`(async () => {
  for (let i = 0; i < 10; i++) {
    window.electronAPI.window.dragBy(-8, 0)
    await new Promise(r => setTimeout(r, 40))
  }
})()`)
await sleep(500)
after = await w()
console.log(`宽: ${before.innerW} → ${after.innerW} (${after.innerW - before.innerW})  x: ${before.screenX} → ${after.screenX}`)

await main.close()
process.exit(0)
