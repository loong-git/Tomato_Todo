// 标题栏截图：验证竖线 + 图标化设置按钮
import { connectToTarget } from './cdp-driver.mjs'
import { writeFileSync } from 'fs'

const main = await connectToTarget(
  t => t.url.includes('localhost:5173') && !t.url.includes('#/focus') && !t.url.includes('devtools')
)
await main.send('Page.enable')

// 检查元素
const check = await main.evalJS(`(() => {
  const div = document.querySelector('.title-divider')
  const btn = document.querySelector('.settings-btn')
  return {
    divider: div ? getComputedStyle(div).width + ' x ' + getComputedStyle(div).height : 'MISSING',
    settingsText: btn ? btn.textContent.trim() : 'MISSING',
    settingsHasSvg: btn ? !!btn.querySelector('svg') : false,
  }
})()`)
console.log('检查:', JSON.stringify(check))

// 截标题栏区域（顶部 40px，宽 500 含右侧控制区）
const shot = await Promise.race([
  main.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: Math.max(0, 867 - 500), y: 0, width: 500, height: 40, scale: 2 }
  }),
  new Promise((_, rej) => setTimeout(() => rej(new Error('截图超时')), 8000))
])
writeFileSync('design-demos/shot-titlebar.png', Buffer.from(shot.data, 'base64'))
console.log('已保存: design-demos/shot-titlebar.png')
await main.close()
process.exit(0)
