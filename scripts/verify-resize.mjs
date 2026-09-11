// 验证：高度锁死 + resizeTo 夹紧（min = 截图基准按缩放换算）
import { connectToTarget } from './cdp-driver.mjs'

const main = await connectToTarget(t => t.title === '番茄TODO时钟' && !t.url.includes('devtools'))
await main.send('Page.enable')
await main.evalJS(`window.electronAPI?.window?.bringToFront?.()`)
await new Promise(r => setTimeout(r, 800))
await main.send('Page.reload')
await new Promise(r => setTimeout(r, 3000))

const size0 = JSON.parse(await main.evalJS(`JSON.stringify({ w: innerWidth, h: innerHeight })`))
console.log('初始(基准):', JSON.stringify(size0))

// 拉宽到 1250
await main.evalJS(`window.electronAPI.window.resizeTo(1250)`)
await new Promise(r => setTimeout(r, 400))
const w1 = JSON.parse(await main.evalJS(`JSON.stringify({ w: innerWidth, h: innerHeight })`))
console.log('resizeTo(1250):', JSON.stringify(w1), w1.w > size0.w + 100 ? 'PASS 加宽生效' : 'FAIL')

// 试图缩到 800（应夹紧回基准）
await main.evalJS(`window.electronAPI.window.resizeTo(800)`)
await new Promise(r => setTimeout(r, 400))
const w2 = JSON.parse(await main.evalJS(`JSON.stringify({ w: innerWidth, h: innerHeight })`))
console.log('resizeTo(800):', JSON.stringify(w2), Math.abs(w2.w - size0.w) <= 4 ? 'PASS 夹紧回最小' : 'FAIL')

// 高度始终锁死
console.log('高度锁死:', w1.h === size0.h && w2.h === size0.h ? 'PASS' : `FAIL ${size0.h}/${w1.h}/${w2.h}`)

await main.close()
process.exit(0)
