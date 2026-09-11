// 双击最大化根因修复终验：最大化→还原→右缘加宽 三链路
import { connectToTarget } from './cdp-driver.mjs'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const main = await connectToTarget(t => t.title === '番茄TODO时钟' && !t.url.includes('devtools'))
await main.send('Page.enable')
await main.evalJS(`window.electronAPI?.window?.bringToFront?.()`)
await sleep(1000)
await main.send('Page.reload')
await sleep(3000)

const size = () => main.evalJS(`JSON.stringify({w: innerWidth, h: innerHeight, x: Math.round(screenX), y: Math.round(screenY)})`).then(JSON.parse)

const s0 = await size()
console.log('基准:', JSON.stringify(s0))

// 1) 最大化
await main.evalJS(`window.electronAPI.window.toggleMaximize()`)
await sleep(1000)
const s1 = await size()
const maxOk = s1.w > 1400 && s1.x === 0 && s1.y === 0
console.log('最大化:', JSON.stringify(s1), maxOk ? 'PASS' : 'FAIL')

// 2) 还原
await main.evalJS(`window.electronAPI.window.toggleMaximize()`)
await sleep(1000)
const s2 = await size()
const resOk = Math.abs(s2.w - s0.w) <= 6 && Math.abs(s2.h - s0.h) <= 6 && Math.abs(s2.x - s0.x) <= 6
console.log('还原:', JSON.stringify(s2), resOk ? 'PASS' : 'FAIL')

// 3) 右缘加宽到 1200
await main.evalJS(`window.electronAPI.window.resizeTo(1200)`)
await sleep(1000)
const s3 = await size()
const widenOk = s3.w > 1100 && s3.h === s2.h && s3.x === s2.x && s3.y === s2.y
console.log('右缘加宽:', JSON.stringify(s3), widenOk ? 'PASS(只变宽)' : 'CHECK')

// 4) 收缩夹紧
await main.evalJS(`window.electronAPI.window.resizeTo(800)`)
await sleep(1000)
const s4 = await size()
const clampOk = Math.abs(s4.w - 866) <= 6 && s4.h === s2.h
console.log('收缩夹紧:', JSON.stringify(s4), clampOk ? 'PASS' : 'FAIL')

console.log('\n结论:', maxOk && resOk && widenOk && clampOk ? '=== 全链路 PASS ===' : '=== 有失败项，看上 ===')
await main.close()
process.exit(0)
