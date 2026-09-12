// 自检：量 demo 的三种方案下 main/内容/热力条的真实高度，确认 demo 复刻准确
import { connectToTarget, sleep } from './cdp-driver.mjs'

const page = await connectToTarget(t => (t.url || '').includes('demo-heat-visible'), { timeoutMs: 10000 })

const PROBE = `(() => {
  const main = document.getElementById('main')
  const content = document.getElementById('content')
  const heat = document.querySelector('.heat-strip').getBoundingClientRect()
  const mb = main.getBoundingClientRect()
  const stats = document.getElementById('stats')
  const h = el => Math.round(el.getBoundingClientRect().height)
  return {
    view: main.clientHeight,
    contentScroll: content.scrollHeight,
    contentClient: content.clientHeight,
    over: content.scrollHeight - main.clientHeight,
    timerH: h(document.querySelector('.timer-card')),
    heatH: h(document.querySelector('.heat-strip')),
    statsH: h(stats),
    statsScroll: stats.scrollHeight,
    tasksH: h(document.querySelector('.task-list-card')),
    heatVisible: heat.bottom <= mb.bottom + 1,
    heatCut: Math.round(heat.bottom - mb.bottom),
  }
})()`

for (const m of ['current', 'a', 'b']) {
  await page.evalJS(`document.querySelector('[data-mode="${m}"]').click()`)
  await sleep(500)
  const r = await page.evalJS(PROBE)
  console.log(
    m.padEnd(8) + ' main=' + r.view + ' content=' + r.contentClient + '/' + r.contentScroll +
    ' | timer=' + r.timerH + ' tasks=' + r.tasksH + ' stats=' + r.statsH + '(内容 ' + r.statsScroll + ')' + ' heat=' + r.heatH +
    ' | 热力条 ' + (r.heatVisible ? '完整' : '被切 ' + r.heatCut + 'px')
  )
}
page.close()
process.exit(0)
