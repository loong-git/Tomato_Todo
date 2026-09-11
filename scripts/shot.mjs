// 截图小工具：node scripts/shot.mjs dark|light 输出 design-demos/shot-<theme>.png
import { connectToTarget } from './cdp-driver.mjs'
import { writeFileSync } from 'fs'

const theme = process.argv[2] || 'dark'
const out = `design-demos/shot-${theme}.png`

const main = await connectToTarget(t => t.title === '番茄TODO时钟' && !t.url.includes('devtools'))
await main.send('Page.enable')

// 读当前主题，若不是目标主题就点标题栏的主题切换按钮
const cur = await main.evalJS(`document.documentElement.getAttribute('data-theme')`)
if (cur !== theme) {
  await main.evalJS(`document.querySelector('.theme-toggle')?.click()`)
  await new Promise(r => setTimeout(r, 800))
}
const now = await main.evalJS(`document.documentElement.getAttribute('data-theme')`)
console.log('theme:', cur, '->', now)

const r = await main.send('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(r.data, 'base64'))
console.log('saved:', out)
await main.close()
process.exit(0)
