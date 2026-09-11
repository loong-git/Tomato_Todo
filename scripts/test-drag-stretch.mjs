// 拖动拉伸 bug 复现：CDP 合成鼠标事件拖动标题栏空白区 → 对比拖动前后窗口宽度
import { connectToTarget, sleep } from './cdp-driver.mjs'

const main = await connectToTarget(
  t => t.url.includes('localhost:5173') && !t.url.includes('#/focus') && !t.url.includes('devtools')
)
console.log('已连主窗口')

const rectBefore = await main.evalJS(`(() => {
  const r = document.querySelector('.title-blank')?.getBoundingClientRect()
  return { x: r ? r.x + r.width / 2 : -1, y: r ? r.y + r.height / 2 : -1,
           innerW: window.innerWidth, outerW: window.outerWidth, outerH: window.outerHeight, screenX: window.screenX }
})()`)
console.log('拖动前:', JSON.stringify(rectBefore))
if (rectBefore.x < 0) throw new Error('找不到 .title-blank')

// 按下 → 向左拖 10 步 × 8px = 80px → 松开
await main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rectBefore.x, y: rectBefore.y, button: 'left', clickCount: 1 })
for (let i = 1; i <= 10; i++) {
  await main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rectBefore.x - i * 8, y: rectBefore.y, buttons: 1 })
  await sleep(30)
}
await main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rectBefore.x - 80, y: rectBefore.y, button: 'left', clickCount: 1 })
await sleep(600)

const after = await main.evalJS(`(() => ({
  innerW: window.innerWidth, outerW: window.outerWidth, outerH: window.outerHeight, screenX: window.screenX
}))()`)
console.log('拖动后:', JSON.stringify(after))
console.log('=== 结论 ===')
console.log(`宽度变化: ${rectBefore.innerW} → ${after.innerW} (${after.innerW - rectBefore.innerW >= 0 ? '+' : ''}${after.innerW - rectBefore.innerW})`)
console.log(`位置变化: screenX ${rectBefore.screenX} → ${after.screenX}`)
await main.close()
process.exit(0)
