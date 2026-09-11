/**
 * 验证新便携版 config.json 数据完整性
 * 重点：7/29、7/30 新增记录是否引入混乱
 */
import { readFileSync } from 'node:fs'

const P = 'D:/DeskTop/番茄TODO时钟-1.0.0-x64 new/resources/data/config.json'
const d = JSON.parse(readFileSync(P, 'utf8'))

let ok = true
function check(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`)
  if (!cond) ok = false
}

console.log('===== 1. 结构完整性 =====')
check('顶层 keys', ['tasks','records','settings','lifetimeStats','yearStats','streakData'].every(k => k in d), JSON.stringify(Object.keys(d)))

console.log('\n===== 2. records 基本检查 =====')
const recs = d.records
check('记录总数 311', recs.length === 311, `actual=${recs.length}`)
const ids = recs.map(r => r.id)
check('id 无重复', new Set(ids).size === ids.length)
const badFields = recs.filter(r => !['id','taskId','type','duration','completedAt'].every(k => k in r))
check('无缺字段记录', badFields.length === 0)
const badType = recs.filter(r => !['focus','shortBreak','longBreak'].includes(r.type))
check('type 合法', badType.length === 0)
const badDur = recs.filter(r => typeof r.duration !== 'number' || r.duration <= 0)
check('duration 合法', badDur.length === 0)

console.log('\n===== 3. 统计一致性 =====')
const focus = recs.filter(r => r.type === 'focus')
const calcLifetime = { totalCount: focus.length, totalSeconds: focus.reduce((s,r) => s + (r.duration||0), 0) }
check('lifetimeStats 一致', JSON.stringify(calcLifetime) === JSON.stringify(d.lifetimeStats), `calc=${JSON.stringify(calcLifetime)} file=${JSON.stringify(d.lifetimeStats)}`)
const ys = {}
for (const r of focus) {
  const y = new Date(r.completedAt).getFullYear()
  ys[y] = ys[y] || { count: 0, seconds: 0 }
  ys[y].count++
  ys[y].seconds += r.duration || 0
}
check('yearStats 一致', JSON.stringify(ys) === JSON.stringify(d.yearStats), `calc=${JSON.stringify(ys)} file=${JSON.stringify(d.yearStats)}`)

console.log('\n===== 4. 连胜计算 =====')
const days = new Set()
for (const r of focus) {
  const dt = new Date(r.completedAt)
  days.add(`${dt.getFullYear()}-${dt.getMonth()+1}-${dt.getDate()}`)
}
let streak = 0
let cur = new Date(2026, 7, 31) // 8/31
while (days.has(`${cur.getFullYear()}-${cur.getMonth()+1}-${cur.getDate()}`)) {
  streak++
  cur.setDate(cur.getDate() - 1)
}
check('连胜 34 天', streak === 34, `actual=${streak}`)
check('streakData 一致', d.streakData.streakCount === 34, `actual=${JSON.stringify(d.streakData)}`)

console.log('\n===== 5. 7/29 7/30 按天分布 =====')
const byDay = {}
for (const r of focus) {
  const dt = new Date(r.completedAt)
  const key = `${dt.getMonth()+1}/${dt.getDate()}`
  byDay[key] = byDay[key] || []
  byDay[key].push(r)
}
const d29 = byDay['7/29'] || []
const d30 = byDay['7/30'] || []
check('7/29 有 7 条', d29.length === 7, `actual=${d29.length}`)
check('7/29 总时长 175min', d29.reduce((s,r)=>s+r.duration,0)/60 === 175, `actual=${d29.reduce((s,r)=>s+r.duration,0)/60}`)
check('7/30 有 10 条', d30.length === 10, `actual=${d30.length}`)
check('7/30 总时长 190min', d30.reduce((s,r)=>s+r.duration,0)/60 === 190, `actual=${d30.reduce((s,r)=>s+r.duration,0)/60}`)
const d29TaskIds = new Set(d29.map(r => r.taskId))
check('7/29 taskId 全空', d29TaskIds.size === 1 && d29TaskIds.has(''))

console.log('\n===== 6. 其他字段未被破坏 =====')
check('tasks 30 个', d.tasks.length === 30, `actual=${d.tasks.length}`)
check('theme dark', d.settings.theme === 'dark', `actual=${d.settings.theme}`)
check('dailyGoal', d.settings.dailyGoal === 8, `actual=${d.settings.dailyGoal}`)

console.log('\n===== 结果 =====')
console.log(ok ? 'ALL PASS' : 'HAS FAILURES')
process.exit(ok ? 0 : 1)
