// 量真实主窗口的三段式高度，用于校准 demo
import { connectToTarget } from './cdp-driver.mjs'

const page = await connectToTarget(t => t.title === '番茄TODO时钟' && !t.url.includes('devtools'))

const PROBE = `(() => {
  const h = el => el ? Math.round(el.getBoundingClientRect().height) : null
  const main = document.querySelector('main')
  const content = document.querySelector('.content')
  const stats = document.querySelector('.stats-block')
  const heat = document.querySelector('.heat-strip') || document.querySelector('[class*="heat"]')
  const heatBox = heat?.getBoundingClientRect()
  const mb = main?.getBoundingClientRect()
  return {
    win: innerWidth + 'x' + innerHeight,
    mainH: main?.clientHeight,
    contentClient: content?.clientHeight,
    contentScroll: content?.scrollHeight,
    timer: h(document.querySelector('.timer-card')),
    tasks: h(document.querySelector('.task-list')),
    taskCard: h(document.querySelector('.task-list')),
    statsH: h(stats),
    statsScroll: stats?.scrollHeight,
    heatH: h(heat),
    heatClass: heat ? heat.className : null,
    mainScroll: main ? main.scrollHeight : null,
    heatVisible: heatBox && mb ? heatBox.bottom <= mb.bottom + 1 : null,
    heatCut: heatBox && mb ? Math.round(heatBox.bottom - mb.bottom) : null,
    rows: content ? getComputedStyle(content).gridTemplateRows : null,
    contentH: content ? getComputedStyle(content).height : null,
  }
})()`

const r = await page.evalJS(PROBE)
console.log(JSON.stringify(r, null, 2))
page.close()
process.exit(0)
