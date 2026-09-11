// 验证 780 高度下热力条完整显示 + 截图
import { connectToTarget } from './cdp-driver.mjs'
import { writeFileSync } from 'fs'

const main = await connectToTarget(t => t.title === '番茄TODO时钟' && !t.url.includes('devtools'))
await main.send('Page.enable')
await main.evalJS(`window.electronAPI?.window?.bringToFront?.()`)
await new Promise(r => setTimeout(r, 800))
await main.send('Page.reload')
await new Promise(r => setTimeout(r, 3000))

const check = await main.evalJS(`(async () => {
  const heat = document.querySelector('.heatmap-container')
  const h = heat ? heat.getBoundingClientRect() : null
  return { vh: innerHeight, heatBottom: h ? Math.round(h.bottom) : -1, fits: h ? h.bottom <= innerHeight + 1 : false }
})()`, { awaitPromise: true, timeoutMs: 8000 })
console.log('视口高:', check.vh, '| 热力条底边:', check.heatBottom, '|', check.fits ? 'PASS 完整显示' : 'FAIL 仍被裁')

const r = await main.send('Page.captureScreenshot', { format: 'png' })
writeFileSync('design-demos/shot-780.png', Buffer.from(r.data, 'base64'))
console.log('saved')
await main.close()
process.exit(0)
