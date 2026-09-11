// 折叠态截图：node scripts/shot-collapsed.mjs
import { connectToTarget } from './cdp-driver.mjs'
import { writeFileSync } from 'fs'

const main = await connectToTarget(t => t.title === '番茄TODO时钟' && !t.url.includes('devtools'))
await main.send('Page.enable')
// 窗口若被最小化，先恢复到前台（否则 captureScreenshot 报 Unable to capture）
await main.evalJS(`window.electronAPI?.window?.bringToFront?.()`)
await new Promise(r => setTimeout(r, 800))
await main.send('Page.reload')
await new Promise(r => setTimeout(r, 3000))

await main.evalJS(`document.querySelector('.card-head.clickable')?.click()`)
await new Promise(r => setTimeout(r, 500))
const r1 = await main.send('Page.captureScreenshot', { format: 'png' })
writeFileSync('design-demos/shot-collapsed.png', Buffer.from(r1.data, 'base64'))
console.log('collapsed shot saved')

// 展开（还原状态）
await main.evalJS(`document.querySelector('.card-head.clickable')?.click()`)
await new Promise(r => setTimeout(r, 400))
console.log('restored expanded')
await main.close()
process.exit(0)
