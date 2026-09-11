// 窗口行为终验：归位 → 锁高检查 → 右缘加宽 → 夹紧
import { connectToTarget } from './cdp-driver.mjs'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const main = await connectToTarget(t => t.title === '番茄TODO时钟' && !t.url.includes('devtools'))
await main.send('Page.enable')
await main.evalJS(`window.electronAPI?.window?.bringToFront?.()`)
await sleep(1000)

const size = () => main.evalJS(`JSON.stringify({w: innerWidth, h: innerHeight, x: Math.round(window.screenX), y: Math.round(window.screenY)})`).then(JSON.parse)

// 1) 归位到最小宽（等 1.2s 让动画/事件停稳）
await main.evalJS(`window.electronAPI.window.resizeTo(866)`)
await sleep(1200)
const s0 = await size()
console.log('归位基准:', JSON.stringify(s0))

// 2) 右缘加宽到 1200
await main.evalJS(`window.electronAPI.window.resizeTo(1200)`)
await sleep(1200)
const s1 = await size()
const widenOk = s1.w > s0.w + 200 && s1.h === s0.h && s1.x === s0.x && s1.y === s0.y
console.log('加宽到1200:', JSON.stringify(s1), widenOk ? 'PASS(只变宽)' : 'CHECK')

// 3) 收缩夹紧
await main.evalJS(`window.electronAPI.window.resizeTo(800)`)
await sleep(1200)
const s2 = await size()
const clampOk = Math.abs(s2.w - s0.w) <= 3 && s2.h === s0.h
console.log('缩到800夹紧:', JSON.stringify(s2), clampOk ? 'PASS' : 'FAIL')

console.log(clampOk && widenOk ? '\n=== 全部 PASS：高度锁死 + 仅宽可调 ===' : '\n=== 存在异常，看上面数据 ===')
await main.close()
process.exit(0)
