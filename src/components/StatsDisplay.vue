<script setup lang="ts">
import { ref, computed } from 'vue'
import { useStatsStore, useSettingsStore, useTimerStore } from '@/stores'
import { toast } from '@/utils/toast'
import DataManager from '@/components/DataManager.vue'

const statsStore = useStatsStore()
const settingsStore = useSettingsStore()
const timerStore = useTimerStore()

// 详细数据弹窗
const showDetail = ref(false)

// 月份导航
const viewYear = ref(new Date().getFullYear())
const viewMonth = ref(new Date().getMonth())

// 年份视图开关
const showYearView = ref(false)

function prevMonth() {
  if (viewMonth.value === 0) {
    viewMonth.value = 11
    viewYear.value--
  } else {
    viewMonth.value--
  }
}

function nextMonth() {
  if (viewMonth.value === 11) {
    viewMonth.value = 0
    viewYear.value++
  } else {
    viewMonth.value++
  }
}

function goToToday() {
  const today = new Date()
  viewYear.value = today.getFullYear()
  viewMonth.value = today.getMonth()
}

const showFilter = ref(false)

// [热力图日历筛选] 滚轮选择器：用索引控制当前选中项，每列只显示一个值
const tempYear = ref(new Date().getFullYear())
const tempMonth = ref(new Date().getMonth() + 1)
// 可滚动年份范围（今年往前 10 年）
const pickerYears = computed(() => {
  const cur = new Date().getFullYear()
  const arr: number[] = []
  for (let y = cur; y >= cur - 9; y--) arr.push(y)
  return arr
})
const pickerMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
// 当前选中项的索引
const yearIndex = ref(0)
const monthIndex = ref(0)

function openFilter() {
  // 初始化索引：根据 tempYear/tempMonth 在数组中的位置
  const yIdx = pickerYears.value.indexOf(viewYear.value)
  yearIndex.value = yIdx >= 0 ? yIdx : 0
  const mIdx = pickerMonths.indexOf(viewMonth.value + 1)
  monthIndex.value = mIdx >= 0 ? mIdx : 0
  tempYear.value = viewYear.value
  tempMonth.value = viewMonth.value + 1
  showFilter.value = true
}

function onWheel(event: WheelEvent, type: 'year' | 'month') {
  const delta = event.deltaY > 0 ? 1 : -1
  if (type === 'year') {
    const newIdx = Math.max(0, Math.min(pickerYears.value.length - 1, yearIndex.value + delta))
    if (newIdx !== yearIndex.value) {
      yearIndex.value = newIdx
      tempYear.value = pickerYears.value[newIdx]
    }
  } else {
    const newIdx = Math.max(0, Math.min(pickerMonths.length - 1, monthIndex.value + delta))
    if (newIdx !== monthIndex.value) {
      monthIndex.value = newIdx
      tempMonth.value = pickerMonths[newIdx]
    }
  }
}

// 拖动选择 + 惯性滚动：pointer 事件记录位移与速度，松手后按速度估算惯性格数，逐格减速滚动
const ROW_H = 40 // 行高（与 CSS .picker-wheel-item height 一致）
const drag = {
  active: false,
  startY: 0,
  startIdx: 0,
  type: 'year' as 'year' | 'month',
  lastY: 0,
  lastTime: 0,
  velocity: 0 // 松手瞬间的速度（px/ms），用于估算惯性
}
let inertiaTimer: ReturnType<typeof setInterval> | null = null

function clearInertia() {
  if (inertiaTimer) {
    clearInterval(inertiaTimer)
    inertiaTimer = null
  }
}

function setIndex(type: 'year' | 'month', idx: number) {
  const maxIdx = type === 'year' ? pickerYears.value.length - 1 : pickerMonths.length - 1
  const clamped = Math.max(0, Math.min(maxIdx, idx))
  if (type === 'year') {
    yearIndex.value = clamped
    tempYear.value = pickerYears.value[clamped]
  } else {
    monthIndex.value = clamped
    tempMonth.value = pickerMonths[clamped]
  }
  return clamped
}

function onPointerDown(event: PointerEvent, type: 'year' | 'month') {
  clearInertia() // 打断正在进行的惯性
  drag.active = true
  drag.startY = event.clientY
  drag.lastY = event.clientY
  drag.lastTime = Date.now()
  drag.startIdx = type === 'year' ? yearIndex.value : monthIndex.value
  drag.type = type
  drag.velocity = 0
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}
function onPointerMove(event: PointerEvent, type: 'year' | 'month') {
  if (!drag.active || drag.type !== type) return
  const now = Date.now()
  const dt = Math.max(1, now - drag.lastTime)
  drag.velocity = (event.clientY - drag.lastY) / dt // px/ms
  drag.lastY = event.clientY
  drag.lastTime = now

  const dy = -(event.clientY - drag.startY)
  const half = ROW_H / 2 // 拖动超过半行切换一项（向上拖→下一个/索引+）
  let offset = Math.round(dy / half)
  if (Math.abs(dy) < half) offset = 0
  const newIdx = drag.startIdx + offset
  setIndex(type, newIdx)
}
function onPointerUp(type: 'year' | 'month') {
  drag.active = false
  // 用松手瞬间的速度估算惯性：速度绝对值 px/ms → 惯性格数（1~4 格）
  const speed = Math.abs(drag.velocity)
  let steps = 0
  if (speed > 0.5) {
    // 速度阈值：0.5px/ms 起才有明显惯性；越快惯性越大
    steps = Math.min(4, Math.max(1, Math.round(speed / 1.2)))
  }
  if (steps === 0) return
  const dir = drag.velocity > 0 ? -1 : 1 // 向上拖(velocity<0) → 惯性向下一个(索引+)；向下拖 → 索引-
  let count = 0
  clearInertia()
  inertiaTimer = setInterval(() => {
    if (count >= steps) {
      clearInertia()
      return
    }
    const cur = type === 'year' ? yearIndex.value : monthIndex.value
    const maxIdx = type === 'year' ? pickerYears.value.length - 1 : pickerMonths.length - 1
    const next = cur + dir
    if (next < 0 || next > maxIdx) {
      clearInertia() // 到边界就停，不回弹
      return
    }
    setIndex(type, next)
    count++
  }, 150) // 每 150ms 滚一格，逐渐停下
}

function confirmFilter() {
  viewYear.value = tempYear.value
  viewMonth.value = tempMonth.value - 1
  showFilter.value = false
}

const viewTitle = computed(() => {
  if (showYearView.value) {
    return `${viewYear.value}年`
  }
  return `${viewYear.value}年 ${viewMonth.value + 1}月`
})

const todayCount = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStart = today.getTime()
  return statsStore.records.filter(r =>
    r.completedAt >= todayStart && r.type === 'focus'
  ).length
})

const totalFocusMinutes = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStart = today.getTime()
  return statsStore.records
    .filter(r => r.completedAt >= todayStart && r.type === 'focus')
    .reduce((sum, r) => sum + (r.duration || 0), 0) / 60
})

// 今日专注总秒数（用于精确计算）
const totalFocusSecondsToday = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStart = today.getTime()
  return statsStore.records
    .filter(r => r.completedAt >= todayStart && r.type === 'focus')
    .reduce((sum, r) => sum + (r.duration || 0), 0)
})

// 今日小时数（用于横条目标卡片，保留 1 位小数）
const totalFocusHoursToday = computed(() => {
  return parseFloat((totalFocusSecondsToday.value / 3600).toFixed(1))
})

// 每日目标小时数（设置）
const dailyHourGoal = computed(() => settingsStore.settings.dailyHourGoal ?? 4)

// 目标进度百分比（基于精确秒数计算；[需求] 超过 100% 不封顶，如 1 小时目标完成 2 小时 → 200%）
const hourGoalPercent = computed(() => {
  const goal = dailyHourGoal.value
  if (goal <= 0) return 100
  const goalSeconds = goal * 3600
  const raw = (totalFocusSecondsToday.value / goalSeconds) * 100
  return parseFloat(raw.toFixed(1))
})

// 是否已完成今日目标
const isHourGoalCompleted = computed(() => {
  const goal = dailyHourGoal.value
  if (goal <= 0) return true
  return totalFocusHoursToday.value >= goal
})

// 格式化时长：保留 2 位小数四舍五入
function formatHours(seconds: number): string {
  if (seconds <= 0) return '0.00'
  return (seconds / 3600).toFixed(2)
}

// 昨日累计小时数
const yesterdayHours = computed(() => {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  const yStart = yesterday.getTime()
  const yEnd = yStart + 86400000

  const yRecords = statsStore.records.filter(
    r => r.type === 'focus' && r.completedAt >= yStart && r.completedAt < yEnd
  )

  const totalSeconds = yRecords.reduce((sum, r) => sum + (r.duration || 0), 0)
  return formatHours(totalSeconds)
})

// 累计详细数据 - 从永久统计读取（不受30天清理影响）
const totalFocusCount = computed(() => {
  return statsStore.lifetimeStats?.totalCount ?? 0
})

const totalFocusSeconds = computed(() => {
  return statsStore.lifetimeStats?.totalSeconds ?? 0
})

const totalFocusMinutesAll = computed(() => {
  return Math.round(totalFocusSeconds.value / 60)
})

const totalFocusHours = computed(() => {
  return formatHours(totalFocusSeconds.value)
})

// [需求] 平均每个番茄的时长（分钟）—— 累计专注三卡用
const avgPomodoroMinutes = computed(() => {
  if (totalFocusCount.value <= 0) return 0
  return Math.round(totalFocusSeconds.value / totalFocusCount.value / 60)
})

// [需求] 累计小时取整：小卡里 135.00h 太长，整数够读
const lifetimeHours = computed(() => Math.round(totalFocusSeconds.value / 3600))

// 本年完成番茄 - 从按年统计读取
const yearFocusCount = computed(() => {
  const year = new Date().getFullYear()
  return statsStore.yearStats?.[year]?.count ?? 0
})

// 当前年份（用于"2026年完成"等标签）
const currentYear = computed(() => new Date().getFullYear())

const yearFocusHours = computed(() => {
  const year = new Date().getFullYear()
  const seconds = statsStore.yearStats?.[year]?.seconds ?? 0
  return formatHours(seconds)
})

const yearFocusMinutes = computed(() => {
  const year = new Date().getFullYear()
  const seconds = statsStore.yearStats?.[year]?.seconds ?? 0
  return Math.round(seconds / 60)
})

// 30天统计 - 从 records 读（受30天清理影响，符合"30天"的语义）
const last30DaysCount = computed(() => {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  return statsStore.records.filter(
    r => r.type === 'focus' && r.completedAt >= thirtyDaysAgo
  ).length
})

const last30DaysSeconds = computed(() => {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  return statsStore.records
    .filter(r => r.type === 'focus' && r.completedAt >= thirtyDaysAgo)
    .reduce((sum, r) => sum + (r.duration || 0), 0)
})

const last30DaysMinutes = computed(() => {
  return Math.round(last30DaysSeconds.value / 60)
})

const last30DaysHours = computed(() => {
  return formatHours(last30DaysSeconds.value)
})

// [P0-2 修复] 统一连胜数据源：直接读 timerStore.streakCount（持久化的 streakData，跨月正确）
// 之前的实现从 records 计算，但 records 只保留 30 天（stats.ts cleanupOldRecords），
// 连续使用超过 30 天时连胜会被截断在 30，与庆祝动画/专注窗口显示的连胜不一致。
// streakCount 在 timer.ts 内由 complete() 维护 + loadStreakData() 从 streakData 加载。
const currentStreak = computed(() => timerStore.streakCount)

// 最高连续记录
const maxStreak = computed(() => {
  const records = statsStore.records.filter(r => r.type === 'focus')
  if (records.length === 0) return 0

  const focusDays = new Set<number>()
  records.forEach(r => {
    const d = new Date(r.completedAt)
    d.setHours(0, 0, 0, 0)
    focusDays.add(d.getTime())
  })

  const sortedDays = Array.from(focusDays).sort((a, b) => a - b)
  let maxStreak = 0
  let current = 1
  for (let i = 1; i < sortedDays.length; i++) {
    if (sortedDays[i] - sortedDays[i - 1] === 86400000) {
      current++
      maxStreak = Math.max(maxStreak, current)
    } else {
      current = 1
    }
  }
  return Math.max(maxStreak, current)
})

// 导出 CSV
async function exportDetailCSV() {
  if (!window.electronAPI) {
    console.warn('[StatsDisplay] electronAPI 不可用')
    return
  }

  try {
    const now = new Date()

    const lines: string[] = []
    lines.push('提示: 请双击列头分隔线调整列宽以显示完整内容')
    lines.push('')
    lines.push('=== 详细数据 ===')
    lines.push('项目,数值,单位')
    lines.push(`${currentYear.value}年完成番茄,${yearFocusCount.value},个`)
    lines.push(`${currentYear.value}年累计小时,${yearFocusHours.value},小时`)
    lines.push(`${currentYear.value}年累计分钟,${yearFocusMinutes.value},分钟`)
    lines.push(`30天完成番茄,${last30DaysCount.value},个`)
    lines.push(`30天累计小时,${last30DaysHours.value},小时`)
    lines.push(`30天累计分钟,${last30DaysMinutes.value},分钟`)
    lines.push(`累计完成番茄,${totalFocusCount.value},个`)
    lines.push(`累计小时数,${totalFocusHours.value},小时`)
    lines.push(`累计分钟数,${totalFocusMinutesAll.value},分钟`)
    lines.push(`连续记录,${currentStreak.value},天`)
    lines.push(`最高连续记录,${maxStreak.value},天`)
    lines.push('')
    lines.push(`导出时间,${now.toLocaleString('zh-CN')},`)

    const data = lines.join('\n')
    const date = now.toISOString().slice(0, 10)
    const success = await window.electronAPI.dialog.saveCSV(data, `stats-detail-${date}.csv`)
    if (success) {
      console.log('[StatsDisplay] 详细数据 CSV 导出成功')
      toast.success('CSV 数据导出成功！')
    } else {
      console.log('[StatsDisplay] 用户取消导出')
    }
  } catch (e) {
    console.error('[StatsDisplay] CSV 导出失败:', e)
    toast.error('导出失败')
  }
}

// 热力图数据 - 完整日历
const heatmapData = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayTime = today.getTime()

  const lastDayNum = new Date(viewYear.value, viewMonth.value + 1, 0).getDate()

  // 当月第一天是周几 (0=周日)
  const firstDayOfWeek = new Date(viewYear.value, viewMonth.value, 1).getDay()

  // [P1-4 优化] records 保留期延长到 365 天后数据变大，逐日 filter 全量会 O(天数×条数)。
  // 改为一次遍历建"按天计数"索引（O(n)），渲染时 O(1) 查表。
  const dayCount = new Map<number, number>()
  const monthStart = new Date(viewYear.value, viewMonth.value, 1).getTime()
  const monthEnd = monthStart + lastDayNum * 86400000
  for (const r of statsStore.records) {
    if (r.type !== 'focus' || r.completedAt < monthStart || r.completedAt >= monthEnd) continue
    const day = Math.floor((r.completedAt - monthStart) / 86400000) + 1
    dayCount.set(day, (dayCount.get(day) || 0) + 1)
  }

  const result: { date: number; count: number; isCurrentMonth: boolean; isToday: boolean }[][] = []
  let currentRow: { date: number; count: number; isCurrentMonth: boolean; isToday: boolean }[] = []

  // 前面补空白
  for (let i = 0; i < firstDayOfWeek; i++) {
    currentRow.push({ date: 0, count: 0, isCurrentMonth: false, isToday: false })
  }

  // 当月所有日期
  for (let day = 1; day <= lastDayNum; day++) {
    const date = new Date(viewYear.value, viewMonth.value, day)
    const dayStart = date.getTime()

    currentRow.push({
      date: day,
      count: dayCount.get(day) || 0,
      isCurrentMonth: true,
      isToday: dayStart === todayTime
    })

    if (date.getDay() === 6) {
      result.push(currentRow)
      currentRow = []
    }
  }

  // 补齐最后一行
  if (currentRow.length > 0) {
    while (currentRow.length < 7) {
      currentRow.push({ date: 0, count: 0, isCurrentMonth: false, isToday: false })
    }
    result.push(currentRow)
  }

  return result
})

// [P1-4 体验] 当前视图月份是否有专注记录（用于空态提示，避免用户误以为数据丢失）
const hasRecordsThisMonth = computed(() => {
  const lastDayNum = new Date(viewYear.value, viewMonth.value + 1, 0).getDate()
  const monthStart = new Date(viewYear.value, viewMonth.value, 1).getTime()
  const monthEnd = monthStart + lastDayNum * 86400000
  return statsStore.records.some(
    r => r.type === 'focus' && r.completedAt >= monthStart && r.completedAt < monthEnd
  )
})

// 当前视图月份早于 records 保留窗口（365天）时，说明数据可能已被清理，给出解释
const isBeforeRetention = computed(() => {
  const viewStart = new Date(viewYear.value, viewMonth.value, 1).getTime()
  const retentionCutoff = Date.now() - 365 * 24 * 60 * 60 * 1000
  return viewStart < retentionCutoff
})

// [改版] 底部单行热力条：当月每天一行格子 + 本月汇总 + 完整日历弹窗入口
const showFullCalendar = ref(false)

// 当月每天的格子数据（从月历周数据摊平、只留本月天）
const monthStripDays = computed(() =>
  heatmapData.value.flat().filter(d => d.isCurrentMonth)
)

// 本月汇总（按真实记录时长统计，非 25 分钟估算）
const monthSummary = computed(() => {
  const y = viewYear.value
  const m = viewMonth.value
  let count = 0
  let seconds = 0
  statsStore.records.forEach(r => {
    if (r.type !== 'focus') return
    const d = new Date(r.completedAt)
    if (d.getFullYear() === y && d.getMonth() === m) {
      count++
      seconds += r.duration
    }
  })
  return { count, hours: (seconds / 3600).toFixed(1) }
})

// 热力等级（条与月历共用）：0 无 / 1 = 1个 / 2 = 2-3个 / 3 = 4-5个 / 4 = 6+个
function heatLevelClass(count: number): string {
  if (count <= 0) return 'heat-l0'
  if (count === 1) return 'heat-l1'
  if (count <= 3) return 'heat-l2'
  if (count <= 5) return 'heat-l3'
  return 'heat-l4'
}

// [改版 A+B] 本周柱状图：周一 ~ 今天 每天番茄数（本地时区按天统计）
const weekBars = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dow = today.getDay() === 0 ? 7 : today.getDay()  // 周一=1 ... 周日=7
  const monday = today.getTime() - (dow - 1) * 86400000
  const days = Array.from({ length: 7 }, (_, i) => {
    const dayStart = monday + i * 86400000
    const dayEnd = dayStart + 86400000
    let count = 0
    statsStore.records.forEach(r => {
      if (r.type !== 'focus') return
      if (r.completedAt >= dayStart && r.completedAt < dayEnd) count++
    })
    return { count, isToday: i === dow - 1, label: '一二三四五六日'[i] }
  })
  const total = days.reduce((s, d) => s + d.count, 0)
  const max = Math.max(...days.map(d => d.count), 1)
  return { days, total, max }
})

// 上周总数（用于环比）
const lastWeekTotal = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dow = today.getDay() === 0 ? 7 : today.getDay()
  const thisMonday = today.getTime() - (dow - 1) * 86400000
  const lastMonday = thisMonday - 7 * 86400000
  let count = 0
  statsStore.records.forEach(r => {
    if (r.type !== 'focus') return
    if (r.completedAt >= lastMonday && r.completedAt < thisMonday) count++
  })
  return count
})

// 环比文案
const weekTrend = computed(() => {
  const diff = weekBars.value.total - lastWeekTotal.value
  if (lastWeekTotal.value === 0) return diff > 0 ? `比上周 +${diff}` : '—'
  const pct = Math.round((diff / lastWeekTotal.value) * 100)
  return pct >= 0 ? `比上周 +${pct}%` : `比上周 ${pct}%`
})

// ===== [改版·分页] 「数据」卡拆成两页：第 1 页概览 / 第 2 页趋势 =====
// 原因：柱状图与今日目标、2×2 统计卡、累计专注挤在同一段纵向空间里，柱高上限只有 38px；
// 且 0 个的日子不画柱 → 本周全 0 时图区完全空白。拆页后柱状图独占整卡高度（柱高可达 ~250px）。
const STATS_PAGES = 2
const statsPage = ref(0)
const pagerViewport = ref<HTMLElement | null>(null)
const pagerDx = ref(0)                 // 拖拽中的横向位移（px）
const pagerDragging = ref(false)
let pagerStartX = 0

function statsGo(n: number) {
  statsPage.value = Math.max(0, Math.min(STATS_PAGES - 1, n))
  pagerDx.value = 0
}

function onPagerDown(e: PointerEvent) {
  // 点在按钮上（详细数据 / 数据管理 / 圆点 / 箭头）时不启动拖拽
  if ((e.target as HTMLElement).closest('button')) return
  pagerDragging.value = true
  pagerStartX = e.clientX
  pagerDx.value = 0
  try { pagerViewport.value?.setPointerCapture(e.pointerId) } catch { /* 合成事件没有可捕获的指针 */ }
}

function onPagerMove(e: PointerEvent) {
  if (!pagerDragging.value) return
  let dx = e.clientX - pagerStartX
  // 首尾页继续往外拖 → 阻尼，给出"到头了"的手感
  if ((statsPage.value === 0 && dx > 0) || (statsPage.value === STATS_PAGES - 1 && dx < 0)) dx *= 0.32
  pagerDx.value = dx
}

function onPagerUp() {
  if (!pagerDragging.value) return
  pagerDragging.value = false
  const threshold = (pagerViewport.value?.clientWidth ?? 0) / 6   // 拖过 1/6 卡宽即翻页
  const dx = pagerDx.value
  if (dx <= -threshold) statsGo(statsPage.value + 1)
  else if (dx >= threshold) statsGo(statsPage.value - 1)
  else statsGo(statsPage.value)                                    // 不足阈值 → 回弹
}

const pagerStyle = computed(() => ({
  transform: `translateX(calc(${-statsPage.value * 100}% + ${pagerDx.value}px))`,
  transition: pagerDragging.value ? 'none' : ''
}))

// 柱高：整组「数值 + 柱」占图表区高度的百分比，最高的一天 = 100%
function barPct(count: number): number {
  if (count <= 0) return 0
  return Math.max(9, Math.round((count / weekBars.value.max) * 100))
}

// 第 2 页页脚小结
const weekAvg = computed(() => (weekBars.value.total / 7).toFixed(1))
const weekBest = computed(() => {
  const days = weekBars.value.days
  return days.reduce((a, b) => (b.count > a.count ? b : a), days[0])
})

// 第 1 页统计卡副信息（都是页面上别处看不到的上下文）
const todayMinutesHours = computed(() => (totalFocusMinutes.value / 60).toFixed(1))
const todayDonePct = computed(() => {
  const goal = settingsStore.settings.dailyGoal ?? 0
  return goal > 0 ? Math.round((todayCount.value / goal) * 100) : 0
})
const yesterdayPomodoros = computed(() => Math.round((parseFloat(yesterdayHours.value) || 0) * 60 / 25))
const goalRemainHours = computed(() =>
  Math.max(0, dailyHourGoal.value - totalFocusHoursToday.value).toFixed(1)
)

</script>

<template>
  <!-- [改版] display:contents：.stats-block 落网格 stats 区，.heatmap-block 落 heat 区 -->
  <div class="stats-display">
    <div class="stats-block" data-tour="stats">
    <div class="stats-header">
      <h3 class="block-title">数据</h3>
      <div class="header-actions">
        <DataManager />
        <button class="detail-btn" @click="showDetail = true" title="查看详细数据">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
            <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
          </svg>
          <span>详细数据</span>
        </button>
      </div>
    </div>

    <!-- [改版·分页] 第 1 页「概览」/ 第 2 页「趋势」：柱状图独占整卡高度。
         翻页三种方式都支持：内容区横向拖拽 / 底部 ‹ › 箭头（hover 才显）/ 圆点指示器 -->
    <div
      ref="pagerViewport"
      class="pager-viewport"
      :class="{ grabbing: pagerDragging }"
      @pointerdown="onPagerDown"
      @pointermove="onPagerMove"
      @pointerup="onPagerUp"
      @pointercancel="onPagerUp"
    >
      <div class="pager-track" :style="pagerStyle">

      <!-- ===== 第 1 页：概览 ===== -->
      <div class="pager-page">
      <!-- 今日目标小时数（横条进度）—— 第 1 页的视觉主角 -->
      <div class="hour-goal-bar" :class="{ completed: isHourGoalCompleted }">
        <div class="goal-header">
          <div class="goal-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div class="goal-info">
            <div class="goal-label">今日目标</div>
            <div class="goal-value">
              <span class="current">{{ totalFocusHoursToday.toFixed(1) }}</span>
              <span class="separator">/</span>
              <span class="target">{{ dailyHourGoal }}</span>
              <span class="unit">小时</span>
            </div>
          </div>
          <div class="goal-percent">{{ hourGoalPercent }}<span class="pct-sign">%</span></div>
        </div>
        <div class="goal-progress">
          <!-- [需求] 进度条视觉满格即停（宽度封顶 100%），百分比数字显示真实值（可超 100%） -->
          <div class="goal-progress-fill" :style="{ width: Math.min(100, hourGoalPercent) + '%' }"></div>
        </div>
        <div class="goal-sub">
          <template v-if="isHourGoalCompleted">已达成今日目标 🎉</template>
          <template v-else>还差 <b>{{ goalRemainHours }}</b> 小时达成今日目标</template>
        </div>
      </div>

    <!-- [改版·分页] 本周柱状图已移到第 2 页，独占整卡高度（见下方 pager-page 第二页） -->

    <div class="stats-cards">
    <div class="stat-card">
      <div class="stat-top">
        <span class="stat-icon focus">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <circle cx="12" cy="12" r="10" opacity="0.2"/>
            <circle cx="12" cy="12" r="6"/>
          </svg>
        </span>
        <span class="stat-label">分钟</span>
      </div>
      <div class="stat-value">{{ Math.round(totalFocusMinutes) }}</div>
      <div class="stat-sub">≈ {{ todayMinutesHours }} 小时</div>
    </div>

    <div class="stat-card">
      <div class="stat-top">
        <span class="stat-icon completed">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        </span>
        <span class="stat-label">完成番茄</span>
      </div>
      <div class="stat-value">{{ todayCount }}<span class="stat-unit">/ {{ settingsStore.settings.dailyGoal }}</span></div>
      <div class="stat-sub">完成 {{ todayDonePct }}%</div>
    </div>

    <div class="stat-card">
      <div class="stat-top">
        <span class="stat-icon streak">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/>
          </svg>
        </span>
        <span class="stat-label">连续记录</span>
      </div>
      <div class="stat-value">{{ currentStreak }}<span class="stat-unit">天</span></div>
      <div class="stat-sub">最高 {{ maxStreak }} 天</div>
    </div>

    <div class="stat-card">
      <div class="stat-top">
        <span class="stat-icon yesterday">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5zm2 4h5v5H7z"/>
          </svg>
        </span>
        <span class="stat-label">昨日小时</span>
      </div>
      <div class="stat-value">{{ yesterdayHours }}</div>
      <div class="stat-sub">≈ {{ yesterdayPomodoros }} 个番茄</div>
    </div>
    </div>

    <!-- [改版] 「累计专注」标题已删除：三张卡自己的标签（累计番茄/累计小时）已经说明含义，
         标题纯属重复。省下的 16px + 7px 间距补给上面的今日目标与统计卡。
         累计数据仍可在「详细数据」弹窗和 CSV 导出里看到 -->
    <div class="lifetime-cards">
      <div class="lifetime-card">
        <div class="stat-value">{{ totalFocusCount }}</div>
        <div class="stat-label">累计番茄</div>
      </div>
      <div class="lifetime-card">
        <div class="stat-value">{{ lifetimeHours }}<span class="stat-unit">h</span></div>
        <div class="stat-label">累计小时</div>
      </div>
      <div class="lifetime-card">
        <div class="stat-value">{{ avgPomodoroMinutes }}</div>
        <div class="stat-label">平均每个(分)</div>
      </div>
    </div>
      </div>
      <!-- ===== 第 1 页结束 ===== -->

      <!-- ===== 第 2 页：趋势（柱状图独占整页高度） ===== -->
      <div class="pager-page">
        <div class="week-chart">
          <div class="week-head">
            <span class="wl">本周番茄</span>
            <span class="wr">共 <b>{{ weekBars.total }}</b> 个 · {{ weekTrend }}</span>
          </div>
          <div class="bars">
            <div
              v-for="(d, i) in weekBars.days"
              :key="i"
              class="bcol"
              :class="{ today: d.isToday }"
            >
              <!-- 整组「数值 + 柱」高度 = 占比 → 数值永远紧贴柱顶（原来数值固定在列顶、离柱子很远） -->
              <div class="bcol-area">
                <div
                  class="bcol-group"
                  :class="{ 'is-zero': d.count === 0 }"
                  :style="{ height: barPct(d.count) + '%' }"
                >
                  <span class="bval">{{ d.count }}</span>
                  <div
                    v-if="d.count > 0"
                    class="bar2"
                    :class="{ max: d.count === weekBars.max }"
                  ></div>
                </div>
              </div>
              <span class="bday">{{ d.label }}</span>
            </div>
          </div>
          <!-- [需求] 全 0 时原来图区完全空白，看不出是"没记录"还是"坏了" -->
          <div v-if="weekBars.total === 0" class="chart-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M3 20h18M6 20V11M11 20V6M16 20v-6M21 20v-3"/>
            </svg>
            <span>本周还没有专注记录</span>
          </div>
        </div>

        <div class="chart-foot">
          <div class="foot-item"><b>{{ weekAvg }}</b><span>日均(个)</span></div>
          <div class="foot-item">
            <b>{{ weekBars.total === 0 ? '—' : weekBest.count }}</b>
            <span>最高{{ weekBars.total === 0 ? '' : ' · ' + weekBest.label }}</span>
          </div>
          <div class="foot-item"><b>{{ todayCount }}</b><span>今日</span></div>
        </div>
      </div>
      <!-- ===== 第 2 页结束 ===== -->

      </div>
    </div>

    <!-- [需求] 翻页控件：箭头平时隐藏、hover 卡片才淡入；圆点常显作"这里能翻页"的提示 -->
    <div class="pager-foot">
      <button
        class="pager-arrow"
        :disabled="statsPage === 0"
        title="上一页"
        @click="statsGo(statsPage - 1)"
      >‹</button>
      <div class="pager-dots">
        <button
          v-for="i in STATS_PAGES"
          :key="i"
          class="pager-dot"
          :class="{ on: statsPage === i - 1 }"
          :title="`第 ${i} 页`"
          @click="statsGo(i - 1)"
        ></button>
      </div>
      <button
        class="pager-arrow"
        :disabled="statsPage === STATS_PAGES - 1"
        title="下一页"
        @click="statsGo(statsPage + 1)"
      >›</button>
    </div>

    <!-- 详细数据弹窗 -->
    <div v-if="showDetail" class="detail-modal" @click.self="showDetail = false">
      <div class="detail-modal-content">
        <div class="detail-modal-header">
          <h3>累计详细数据</h3>
          <button class="close-btn" @click="showDetail = false">×</button>
        </div>
        <div class="detail-modal-body">
          <div class="detail-item">
            <div class="detail-icon focus">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <circle cx="12" cy="12" r="10" opacity="0.2"/>
                <circle cx="12" cy="12" r="6"/>
              </svg>
            </div>
            <div class="detail-info">
              <div class="detail-label">累计完成番茄</div>
              <div class="detail-value">{{ totalFocusCount }} <span class="detail-unit">个</span></div>
            </div>
          </div>
          <div class="detail-item">
            <div class="detail-icon hour">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
              </svg>
            </div>
            <div class="detail-info">
              <div class="detail-label">累计小时数</div>
              <div class="detail-value">{{ totalFocusHours }} <span class="detail-unit">小时</span></div>
            </div>
          </div>
          <div class="detail-item">
            <div class="detail-icon minute">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
              </svg>
            </div>
            <div class="detail-info">
              <div class="detail-label">累计分钟数</div>
              <div class="detail-value">{{ totalFocusMinutesAll }} <span class="detail-unit">分钟</span></div>
            </div>
          </div>
          <div class="detail-item">
            <div class="detail-icon calendar">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5zm2 4h5v5H7z"/>
              </svg>
            </div>
            <div class="detail-info">
              <div class="detail-label">连续记录</div>
              <div class="detail-value">{{ currentStreak }} <span class="detail-unit">天</span></div>
            </div>
          </div>
          <div class="detail-item">
            <div class="detail-icon trophy">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/>
              </svg>
            </div>
            <div class="detail-info">
              <div class="detail-label">最高连续记录</div>
              <div class="detail-value">{{ maxStreak }} <span class="detail-unit">天</span></div>
            </div>
          </div>
          <div class="detail-item">
            <div class="detail-icon chart">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
              </svg>
            </div>
            <div class="detail-info">
              <div class="detail-label">{{ currentYear }}年完成</div>
              <div class="detail-value">{{ yearFocusCount }} <span class="detail-unit">个</span></div>
            </div>
          </div>
          <div class="detail-item">
            <div class="detail-icon year-hours">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5zm2 4h5v5H7z"/>
              </svg>
            </div>
            <div class="detail-info">
              <div class="detail-label">{{ currentYear }}年累计小时</div>
              <div class="detail-value">{{ yearFocusHours }} <span class="detail-unit">小时</span></div>
            </div>
          </div>
          <div class="detail-item">
            <div class="detail-icon year-minutes">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
              </svg>
            </div>
            <div class="detail-info">
              <div class="detail-label">{{ currentYear }}年累计分钟</div>
              <div class="detail-value">{{ yearFocusMinutes }} <span class="detail-unit">分钟</span></div>
            </div>
          </div>
          <div class="detail-item">
            <div class="detail-icon month-30">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
              </svg>
            </div>
            <div class="detail-info">
              <div class="detail-label">30天完成</div>
              <div class="detail-value">{{ last30DaysCount }} <span class="detail-unit">个</span></div>
            </div>
          </div>
          <div class="detail-item">
            <div class="detail-icon d30-hours">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
              </svg>
            </div>
            <div class="detail-info">
              <div class="detail-label">30天累计小时</div>
              <div class="detail-value">{{ last30DaysHours }} <span class="detail-unit">小时</span></div>
            </div>
          </div>
          <div class="detail-item">
            <div class="detail-icon d30-minutes">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
              </svg>
            </div>
            <div class="detail-info">
              <div class="detail-label">30天累计分钟</div>
              <div class="detail-value">{{ last30DaysMinutes }} <span class="detail-unit">分钟</span></div>
            </div>
          </div>
        </div>
        <div class="detail-modal-footer">
          <button class="export-csv-btn" @click="exportDetailCSV">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            导出 CSV
          </button>
        </div>
      </div>
    </div>

    </div>

    <!-- 热力图（底部整条）：单行热力条 + 完整日历弹窗 -->
    <div class="heatmap-block" data-tour="heatmap">
    <div class="heatmap-container">
      <!-- 单行热力条：标题左 / 格子中 / 汇总+入口右，一行对齐 -->
      <div class="heat-strip">
        <div class="strip-title">
          <div class="strip-name">专注热力</div>
          <div class="strip-sub">{{ viewMonth + 1 }}月 · 每格一天</div>
        </div>
        <div class="strip-cells">
          <div
            v-for="(d, i) in monthStripDays"
            :key="i"
            class="strip-cell"
            :class="[heatLevelClass(d.count), { today: d.isToday }]"
            :title="`${d.date}日: ${d.count > 0 ? d.count + '个番茄 / ' + (d.count * 25 / 60).toFixed(1) + '小时' : '未专注'}`"
          >
            <span v-if="d.isToday" class="strip-today-mark">今</span>
          </div>
        </div>
        <div class="strip-summary">
          <span class="sum-text">本月 <b>{{ monthSummary.count }}</b> 个番茄 · <b>{{ monthSummary.hours }}</b> 小时</span>
          <button class="fullcal-btn" @click="showFullCalendar = true" title="查看完整月历">完整日历 ›</button>
        </div>
      </div>

      <!-- 完整日历弹窗（原月历整体移入，与详细数据弹窗同款） -->
      <div v-if="showFullCalendar" class="detail-modal" @click.self="showFullCalendar = false">
        <div class="detail-modal-content">
          <div class="detail-modal-header">
            <h3>{{ viewTitle }} · 专注日历</h3>
            <button class="close-btn" @click="showFullCalendar = false">×</button>
          </div>
          <div class="fullcal-body">
      <div class="heatmap-header">
        <button class="nav-btn" @click="prevMonth">&lt;</button>
        <!-- [热力图日历筛选] 点击标题弹出 modal -->
        <span class="heatmap-title" :class="{ clickable: true }" @click="openFilter">{{ viewTitle }}</span>
        <button class="nav-btn" @click="nextMonth">&gt;</button>
        <button class="today-btn" @click="goToToday">今</button>
      </div>
      <!-- [热力图日历筛选] 居中 modal：左年份右月份滚动选择，点确定才生效 -->
      <div v-if="showFilter" class="detail-modal" @click.self="showFilter = false">
        <div class="detail-modal-content filter-modal-content">
          <div class="detail-modal-header">
            <h3>选择年月</h3>
            <button class="close-btn" @click="showFilter = false">×</button>
          </div>
          <div class="filter-modal-body">
            <div class="picker-cols">
              <!-- 年份滚轮：上/中/下三行，拖动 + 滚轮切换 -->
              <div class="picker-col">
                <div
                  class="picker-wheel"
                  @wheel.prevent="onWheel($event, 'year')"
                  @pointerdown="onPointerDown($event, 'year')"
                  @pointermove="onPointerMove($event, 'year')"
                  @pointerup="onPointerUp('year')"
                  @pointerleave="onPointerUp('year')"
                >
                  <div class="picker-wheel-inner" :style="{ transform: `translateY(${(1 - yearIndex) * 40}px)` }">
                    <div v-for="(y, i) in pickerYears" :key="y" class="picker-wheel-item" :class="{ current: i === yearIndex }">
                      {{ y }}年
                    </div>
                  </div>
                </div>
              </div>
              <!-- 月份滚轮 -->
              <div class="picker-col">
                <div
                  class="picker-wheel"
                  @wheel.prevent="onWheel($event, 'month')"
                  @pointerdown="onPointerDown($event, 'month')"
                  @pointermove="onPointerMove($event, 'month')"
                  @pointerup="onPointerUp('month')"
                  @pointerleave="onPointerUp('month')"
                >
                  <div class="picker-wheel-inner" :style="{ transform: `translateY(${(1 - monthIndex) * 40}px)` }">
                    <div v-for="(m, i) in pickerMonths" :key="m" class="picker-wheel-item" :class="{ current: i === monthIndex }">
                      {{ m }}月
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="filter-modal-footer">
            <button class="filter-cancel" @click="showFilter = false">取消</button>
            <button class="filter-confirm" @click="confirmFilter">确定</button>
          </div>
        </div>
      </div>
      <!-- 星期标签 -->
      <div class="weekday-row">
        <span v-for="d in ['日','一','二','三','四','五','六']" :key="d" class="weekday">{{ d }}</span>
      </div>
      <!-- 日历网格 -->
      <div class="calendar-grid">
        <div v-for="(week, wi) in heatmapData" :key="wi" class="calendar-row">
          <div
            v-for="(day, di) in week"
            :key="di"
            class="calendar-cell"
            :class="[heatLevelClass(day.count), { empty: !day.isCurrentMonth, today: day.isToday }]"
            :title="day.isCurrentMonth && day.count > 0 ? `${day.date}日: ${day.count}个番茄 / ${(day.count * 25 / 60).toFixed(1)}小时` : (day.isCurrentMonth ? `${day.date}日: 未专注` : '')"
          >
            <span v-if="day.isCurrentMonth" class="day-num">{{ day.isToday ? '今' : day.date }}</span>
            <span v-if="day.isCurrentMonth && day.count > 0" class="check">✓</span>
          </div>
        </div>
      </div>
      <!-- [P1-4 体验] 空态提示：无数据月份给出说明，避免误以为数据丢失 -->
      <div v-if="!hasRecordsThisMonth" class="heatmap-empty-hint">
        <template v-if="isBeforeRetention">📅 此月份暂未显示记录</template>
        <template v-else>📅 此月份暂无专注记录</template>
      </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>

<style scoped>
/* [改版] 根容器透明化：.stats-block / .heatmap-block 作为 App 网格项 */
.stats-display {
  display: contents;
}

/* 右侧统计卡（网格: stats 区） */
.stats-block {
  grid-area: stats;
  display: flex;
  flex-direction: column;
  /* [需求] 瘦身：9 → 6 → 5 */
  gap: 5px;
  min-height: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  /* [需求] 瘦身：12/14 → 9/12 */
  padding: 9px 12px;
  box-shadow: 0 2px 12px var(--shadow);
  /* [改版·分页] 内容改为两页横向分栏，靠 overflow:hidden 裁掉另一页，
     不再需要 overflow-y:auto（滚动条会跟拖拽翻页打架） */
  overflow: hidden;
}

/* [改版] 「累计专注」三卡（标题已删，直接跟在上面的统计卡后面） */
.lifetime-cards {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 7px;
}

.lifetime-card {
  background: var(--bg-secondary);
  border-radius: 10px;
  padding: 5px 9px;
  text-align: center;
}

.lifetime-card .stat-value {
  font-size: 16px;
}

.lifetime-card .stat-label {
  font-size: 10.5px;
}

/* 底部热力条（网格: heat 区） */
.heatmap-block {
  grid-area: heat;
}

/* [需求] 兜底：整体瘦身已把必要高度压到接近可视区，但窗口再矮一点仍会溢出。
   sticky 让热力条吸附在可视区底部 —— 溢出时它盖在内容上而不是被顶出去，始终可见 */
@media (max-height: 700px) {
  .heatmap-block {
    position: sticky;
    bottom: 0;
    z-index: 6;
  }
}

.block-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.stats-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 11px;
  background: var(--bg-secondary);
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 12px;
  font-family: 'DM Sans', sans-serif;
  cursor: pointer;
  transition: all 0.2s ease;
}

.detail-btn:hover {
  background: rgba(231, 76, 60, 0.12);
  color: var(--tomato);
}

/* ===== [改版·分页] 「数据」卡翻页：视口 / 轨道 / 页 / 底部控件 ===== */
.pager-viewport {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
  /* pan-y：纵向仍可滚，横向交给拖拽翻页 */
  touch-action: pan-y;
  cursor: grab;
}
.pager-viewport.grabbing { cursor: grabbing; }

.pager-track {
  display: flex;
  height: 100%;
  transition: transform 0.34s cubic-bezier(0.22, 0.61, 0.36, 1);
  will-change: transform;
}

.pager-page {
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  /* [修复] 7px：主页面高度锁定 610px，统计卡内可用高度只有 ~339px，
     三处间距从 8 收到 7 挤出 3px 给 2×2 统计卡当安全余量 */
  gap: 7px;
  min-height: 0;
  /* 拖拽时不选中文字 */
  user-select: none;
}

.pager-foot {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 22px;
}

/* [需求] 箭头平时隐藏，鼠标移到卡片附近才淡入；隐藏时不可点，避免点到看不见的按钮 */
.pager-arrow {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: var(--bg-secondary);
  color: var(--text-muted);
  border: 1px solid var(--border-color);
  font-family: inherit;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease, background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}
.stats-block:hover .pager-arrow:not(:disabled) { opacity: 1; pointer-events: auto; }
.pager-arrow:hover:not(:disabled) {
  background: var(--tomato);
  border-color: var(--tomato);
  color: #fff;
}
.pager-arrow:disabled { opacity: 0; cursor: default; }

.pager-dots { display: flex; gap: 6px; }

.pager-dot {
  width: 7px;
  height: 7px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--border-color);
  cursor: pointer;
  transition: all 0.22s ease;
}
.pager-dot:hover { background: var(--text-muted); }
.pager-dot.on { background: var(--tomato); width: 18px; border-radius: 4px; }

.stats-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  /* [修复] 必须写 minmax(0,1fr)：1fr 的 min-height 默认 auto，
     卡片内容（图标行+大数字+副信息）会撑破容器导致整页溢出 */
  grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  /* [需求] 瘦身：8 → 6 */
  gap: 6px;
  /* [改版] 拉伸占满统计卡剩余高度（最大化时四宫格随之变高） */
  flex: 1.15;
  min-height: 0;
}

/* [改版 A+B] 本周柱状图 */
.week-chart {
  background: var(--bg-secondary);
  border-radius: 10px;
  /* [需求] 瘦身：9/12 → 6/10 */
  padding: 6px 10px;
  /* [改版] 拉伸占剩余高度，柱子贴底对齐 */
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  /* [改版·分页] 空态提示要盖在图区上，需要定位上下文 */
  position: relative;
}

.week-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 6px;
}

.week-head .wl {
  font-size: 12px;
  color: var(--text-muted);
}

.week-head .wr {
  font-size: 11.5px;
  color: var(--text-muted);
}

.week-head .wr b {
  color: var(--text-primary);
  font-size: 13px;
}

.bars {
  display: flex;
  /* [改版·分页] 整页只有这一张图，柱间距放大到 14px */
  gap: 14px;
  align-items: flex-end;
  flex: 1;
  min-height: 0;
  /* [改版] 底部留 10px：给 today 的小圆点（.bday::after 在标签下方 8px、直径 4px）留出空间 */
  padding: 10px 4px 10px;
  border-bottom: 1px solid var(--border-color);
}

.bcol {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 柱子的可用高度区（= 整列高度 − 日期标签），today 的底色只铺在这里 */
.bcol-area {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
/* [改版] 原来这里给 today 列铺了一层 rgba(231,76,60,.06) 的整列底色，
   在空数据时看起来就是一块暗红色"阴影"（用户反馈），已删除。
   "今天"改由下面的日期标签 + 短下划线标记（见 .bcol.today .bday::after） */

/* 数值 + 柱子成组，整组高度 = 占比 → 数值永远紧贴柱顶 */
.bcol-group {
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
}
.bcol-group.is-zero { height: auto !important; }

.bval {
  flex-shrink: 0;
  margin-bottom: 4px;
  font-family: 'DM Serif Display', serif;
  font-size: 16px;
  line-height: 1.15;
  color: var(--text-secondary);
}
.bcol.today .bval { color: var(--tomato); }
.bcol-group.is-zero .bval { color: var(--text-muted); opacity: 0.7; margin-bottom: 0; }

.bar2 {
  width: 100%;
  max-width: 28px;
  flex: 1 1 auto;
  min-height: 2px;
  border-radius: 7px 7px 3px 3px;
  background: var(--heatmap-2);
  transition: height 0.3s ease;
}

.bar2.max {
  background: var(--tomato);
}

.bday {
  flex-shrink: 0;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1;
}

/* [改版] "今天"标记：日期标签变番茄色 + 下方一个小圆点。
   ⚠️ 原来用 16×2px 的短横线，和「日」字连起来看着像「旦」字（用户反馈）→ 改成圆点。
   圆点用 ::after 绝对定位，不占布局高度 —— 否则今天那列的柱区会比别的列矮，柱子对不齐 */
.bcol.today .bday {
  color: var(--tomato);
  font-weight: 600;
  position: relative;
}
.bcol.today .bday::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -8px;
  transform: translateX(-50%);
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--tomato);
}

/* [改版·分页] 全 0 空态：原来图区完全空白，分不清"没记录"还是"坏了" */
.chart-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 12.5px;
  pointer-events: none;
}
.chart-empty svg { width: 26px; height: 26px; opacity: 0.5; }

/* [改版·分页] 第 2 页页脚小结：日均 / 最高 / 今日 */
.chart-foot {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.foot-item {
  background: var(--bg-secondary);
  border-radius: 9px;
  padding: 5px 9px;
  text-align: center;
}
.foot-item b {
  display: block;
  font-family: 'DM Serif Display', serif;
  font-size: 16px;
  font-weight: 400;
  line-height: 1.2;
}
.foot-item span { font-size: 11px; color: var(--text-muted); }

/* 今日目标小时数 - 卡内区块（第 1 页的视觉主角：大号数字 + 粗进度条 + 副信息）
   [改版] 「累计专注」标题删除后，省下的 23px 大部分补给这块与下面的统计卡 */
.hour-goal-bar {
  flex-shrink: 0;
  padding: 11px 14px;
  border-radius: 12px;
  background: var(--bg-secondary);
  transition: all 0.3s ease;
}

.hour-goal-bar.completed {
  background: rgba(46, 204, 113, 0.1);
}

.goal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 0;
}

.goal-icon {
  width: 34px;
  height: 34px;
  border-radius: 11px;
  background: linear-gradient(135deg, rgba(231, 76, 60, 0.2) 0%, rgba(192, 57, 43, 0.15) 100%);
  color: var(--tomato);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.hour-goal-bar.completed .goal-icon {
  background: linear-gradient(135deg, rgba(46, 204, 113, 0.2) 0%, rgba(39, 174, 96, 0.15) 100%);
  color: #2ecc71;
}

.goal-info {
  flex: 1;
  min-width: 0;
}

.goal-label {
  font-family: 'DM Sans', sans-serif;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 1px;
}

.goal-value {
  font-family: 'DM Serif Display', serif;
  font-size: 26px;
  display: flex;
  align-items: baseline;
  gap: 2px;
  line-height: 1.05;
}

.goal-value .current {
  color: var(--tomato);
  font-weight: 600;
}

.hour-goal-bar.completed .goal-value .current {
  color: #2ecc71;
}

.goal-value .separator {
  color: var(--text-muted);
  font-size: 16px;
  margin: 0 2px;
}

.goal-value .target {
  color: var(--text-primary);
  font-size: 16px;
}

.goal-value .unit {
  font-family: 'DM Sans', sans-serif;
  font-size: 12.5px;
  color: var(--text-muted);
  margin-left: 4px;
}

.goal-percent {
  font-family: 'DM Serif Display', serif;
  font-size: 19px;
  color: var(--tomato);
  background: rgba(231, 76, 60, 0.12);
  padding: 5px 12px;
  border-radius: 10px;
  flex-shrink: 0;
}

.goal-percent .pct-sign {
  font-size: 12px;
  margin-left: 1px;
}

.hour-goal-bar.completed .goal-percent {
  color: #2ecc71;
  background: rgba(46, 204, 113, 0.12);
}

.goal-progress {
  height: 9px;
  margin-top: 9px;
  background: var(--border-color);
  border-radius: 5px;
  overflow: hidden;
  position: relative;
}

/* [改版·分页] 今日目标副信息：还差 X 小时 / 已达成 */
.goal-sub {
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--text-muted);
}
.goal-sub b {
  color: var(--text-secondary);
  font-weight: 600;
}

.goal-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--tomato) 0%, var(--tomato-light) 100%);
  border-radius: 3px;
  transition: width 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  box-shadow: 0 0 8px rgba(231, 76, 60, 0.4);
  position: relative;
}

.hour-goal-bar.completed .goal-progress-fill {
  background: linear-gradient(90deg, #2ecc71 0%, #27ae60 100%);
  box-shadow: 0 0 10px rgba(46, 204, 113, 0.4);
}

.goal-progress-fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.2) 50%, transparent 100%);
  animation: goal-shine 2s ease-in-out infinite;
}

@keyframes goal-shine {
  0%, 100% { transform: translateX(-100%); }
  50% { transform: translateX(100%); }
}

.detail-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

.detail-modal-content {
  background: var(--bg-card);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  padding: 24px;
  width: 90%;
  max-width: 380px;
  max-height: 80vh;
  overflow-y: auto;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: rgba(231, 76, 60, 0.25) transparent;
  transition: scrollbar-color 0.3s ease;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  animation: scaleIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.detail-modal-content:hover,
.detail-modal-content:focus-within,
.detail-modal-content.is-scrolling {
  scrollbar-color: rgba(231, 76, 60, 0.55) transparent;
}

.detail-modal-content::-webkit-scrollbar {
  width: 6px;
}

.detail-modal-content::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.04);
  margin: 4px 0;
  border-radius: 3px;
}

.detail-modal-content::-webkit-scrollbar-thumb {
  background: rgba(231, 76, 60, 0.25);
  border-radius: 3px;
  transition: background 0.3s ease;
}

.detail-modal-content:hover::-webkit-scrollbar-thumb,
.detail-modal-content:focus-within::-webkit-scrollbar-thumb,
.detail-modal-content.is-scrolling::-webkit-scrollbar-thumb {
  background: rgba(231, 76, 60, 0.55);
}

.detail-modal-content::-webkit-scrollbar-thumb:hover {
  background: rgba(231, 76, 60, 0.75) !important;
}

/* 浅色主题 */
[data-theme="light"] .detail-modal-content {
  scrollbar-color: rgba(231, 76, 60, 0.2) transparent;
}

[data-theme="light"] .detail-modal-content:hover,
[data-theme="light"] .detail-modal-content:focus-within,
[data-theme="light"] .detail-modal-content.is-scrolling {
  scrollbar-color: rgba(231, 76, 60, 0.4) transparent;
}

[data-theme="light"] .detail-modal-content::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.04);
}

[data-theme="light"] .detail-modal-content::-webkit-scrollbar-thumb {
  background: rgba(231, 76, 60, 0.2);
}

[data-theme="light"] .detail-modal-content:hover::-webkit-scrollbar-thumb,
[data-theme="light"] .detail-modal-content:focus-within::-webkit-scrollbar-thumb,
[data-theme="light"] .detail-modal-content.is-scrolling::-webkit-scrollbar-thumb {
  background: rgba(231, 76, 60, 0.4);
}

[data-theme="light"] .detail-modal-content::-webkit-scrollbar-thumb:hover {
  background: rgba(231, 76, 60, 0.6) !important;
}

.detail-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.detail-modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: 'DM Sans', sans-serif;
}

.detail-modal-header .close-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.detail-modal-header .close-btn:hover {
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
}

.detail-modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  background: var(--bg-secondary);
  border-radius: 12px;
  transition: all 0.2s ease;
}

.detail-item:hover {
  transform: translateX(2px);
}

.detail-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.detail-icon.focus {
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
}

.detail-icon.hour {
  background: rgba(52, 152, 219, 0.15);
  color: #3498db;
}

.detail-icon.minute {
  background: rgba(155, 89, 182, 0.15);
  color: #9b59b6;
}

.detail-icon.calendar {
  background: rgba(26, 188, 156, 0.15);
  color: #1abc9c;
}

.detail-icon.trophy {
  background: rgba(241, 196, 15, 0.15);
  color: #f1c40f;
}

.detail-icon.chart {
  background: rgba(241, 196, 15, 0.15);
  color: #f1c40f;
}

.detail-icon.year-hours {
  background: rgba(231, 76, 60, 0.12);
  color: #e74c3c;
}

.detail-icon.year-minutes {
  background: rgba(231, 76, 60, 0.18);
  color: #e74c3c;
}

.detail-icon.month-30 {
  background: rgba(52, 152, 219, 0.15);
  color: #3498db;
}

.detail-icon.d30-hours {
  background: rgba(52, 152, 219, 0.12);
  color: #3498db;
}

.detail-icon.d30-minutes {
  background: rgba(52, 152, 219, 0.18);
  color: #3498db;
}

.detail-modal-footer {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: center;
}

.export-csv-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: rgba(231, 76, 60, 0.12);
  border: 1px solid rgba(231, 76, 60, 0.3);
  border-radius: 12px;
  color: #e74c3c;
  font-size: 13px;
  font-weight: 500;
  font-family: 'DM Sans', sans-serif;
  cursor: pointer;
  transition: all 0.2s ease;
}

.export-csv-btn:hover {
  background: rgba(231, 76, 60, 0.22);
  border-color: rgba(231, 76, 60, 0.5);
  transform: translateY(-1px);
}

.detail-info {
  flex: 1;
}

.detail-label {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 2px;
  font-family: 'DM Sans', sans-serif;
}

.detail-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: 'DM Serif Display', serif;
}

.detail-unit {
  font-size: 13px;
  color: var(--text-muted);
  font-weight: 400;
  font-family: 'DM Sans', sans-serif;
  margin-left: 2px;
}

.stat-card {
  background: var(--bg-secondary);
  border-radius: 10px;
  /* [改版·分页] 紧凑结构：图标+标签一行 / 大数字 / 副信息 */
  padding: 6px 10px;
  text-align: left;
  transition: background 0.2s ease;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  /* [修复] 允许被压缩，否则内容超一点就撑破 grid 行、整页溢出 */
  min-height: 0;
  overflow: hidden;
}

.stat-card:hover {
  background: var(--border-color);
}

/* [改版·分页] 图标与标签并成一行，把纵向空间让给大数字与副信息 */
.stat-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-icon {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon svg {
  width: 12px;
  height: 12px;
}

.stat-icon.focus     { background: rgba(231, 76, 60, 0.14);  color: var(--tomato); }
.stat-icon.completed { background: rgba(46, 204, 113, 0.14); color: #2ecc71; }
.stat-icon.streak    { background: rgba(255, 152, 0, 0.14);  color: #ff9800; }
.stat-icon.yesterday { background: rgba(52, 152, 219, 0.14); color: #3498db; }

.stat-value {
  font-family: 'DM Serif Display', serif;
  font-size: 23px;
  font-weight: 400;
  color: var(--text-primary);
  line-height: 1.05;
}

.stat-unit {
  font-family: 'DM Sans', sans-serif;
  font-size: 12.5px;
  font-weight: 400;
  color: var(--text-muted);
  margin-left: 2px;
}

.stat-label {
  font-family: 'DM Sans', sans-serif;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 0;
}

/* [改版·分页] 统计卡副信息：≈小时 / 完成率 / 最高纪录 / ≈番茄数（都是页面上别处看不到的上下文） */
.stat-sub {
  font-size: 10.5px;
  color: var(--text-muted);
  opacity: 0.75;
}

/* 热力图 - 底部整条（卡片壳在 .heatmap-block 上） */
.heatmap-container {
  width: 100%;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  /* [需求] 瘦身：8/10 → 5/7 */
  padding: 5px 16px 7px;
  box-shadow: 0 2px 12px var(--shadow);
  position: relative;
}

/* ===== [改版] 底部单行热力条 ===== */
.heat-strip {
  display: flex;
  align-items: center;
  gap: 16px;
}

.strip-title {
  flex-shrink: 0;
}

.strip-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.strip-sub {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.strip-cells {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 3px;
  align-items: stretch;
}

.strip-cell {
  flex: 1;
  min-width: 0;
  /* [改版] 去掉 22px 限宽：格子均分整行，宽窗口下热力条铺满中段 */
  /* [需求] 瘦身：28 → 20 */
  height: 20px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  transition: transform 0.12s ease;
}

.strip-cell:hover {
  transform: scale(1.15);
}

.strip-today-mark {
  font-size: 9px;
  font-weight: 700;
  color: var(--tomato);
}

.strip-cell.today {
  box-shadow: inset 0 0 0 1.5px var(--tomato);
}

.strip-summary {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.sum-text {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

.sum-text b {
  color: var(--text-primary);
  font-size: 13.5px;
}

.fullcal-btn {
  display: flex;
  align-items: center;
  padding: 6px 11px;
  background: var(--bg-secondary);
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 12px;
  font-family: 'DM Sans', sans-serif;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.fullcal-btn:hover {
  background: rgba(231, 76, 60, 0.12);
  color: var(--tomato);
}

/* 完整日历弹窗 body */
.fullcal-body {
  padding: 2px 4px 4px;
}

.heatmap-header {
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.heatmap-title {
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  min-width: 80px;
  text-align: center;
}

.nav-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-btn:hover {
  background: rgba(231, 76, 60, 0.2);
  color: #e74c3c;
}

.today-btn {
  padding: 2px 8px;
  border: none;
  background: rgba(231, 76, 60, 0.15);
  border-radius: 6px;
  color: #e74c3c;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.today-btn:hover {
  background: rgba(231, 76, 60, 0.3);
}

/* [热力图日历筛选] 标题可点击 */
.heatmap-title.clickable {
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
  padding: 2px 6px;
}
.heatmap-title.clickable:hover {
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
}

/* [热力图日历筛选] 居中 modal 内筛选选项 */
.filter-modal-body {
  padding: 4px 0 8px;
}
.filter-modal-content {
  max-width: 340px;
}
/* 滚轮选择器：左右两列，每列 3 行滚轮（上/中/下） */
.picker-cols {
  display: flex;
  gap: 40px;
  justify-content: center;
  align-items: stretch;
}
.picker-col {
  display: flex;
  flex-direction: column;
  align-items: center;
}
/* 滚轮容器：单行高 40，共显示 3 行（120px），overflow 裁剪 */
.picker-wheel {
  width: 100px;
  height: 120px;
  overflow: hidden;
  position: relative;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}
.picker-wheel:active {
  cursor: grabbing;
}
/* 内部轨道：所有值纵向排布，translateY 平移让当前值居中 */
.picker-wheel-inner {
  display: flex;
  flex-direction: column;
  transition: transform 0.18s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  will-change: transform;
}
.picker-wheel-item {
  flex-shrink: 0;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: var(--text-muted);
  opacity: 0.5;
  font-family: 'DM Serif Display', serif;
  transition: all 0.18s;
}
/* 当前选中行：居中加粗放大 */
.picker-wheel-item.current {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  opacity: 1;
}

/* 底部按钮 */
.filter-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}
.filter-modal-footer .filter-cancel,
.filter-modal-footer .filter-confirm {
  padding: 7px 20px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid var(--border-color);
}
.filter-modal-footer .filter-cancel {
  background: transparent;
  color: var(--text-secondary);
}
.filter-modal-footer .filter-cancel:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}
.filter-modal-footer .filter-confirm {
  background: var(--tomato);
  border-color: var(--tomato);
  color: #fff;
  font-weight: 600;
}
.filter-modal-footer .filter-confirm:hover {
  background: var(--tomato-dark);
}

.weekday-row {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
  justify-content: center;
}

.weekday {
  width: 26px;
  text-align: center;
  font-family: 'DM Sans', sans-serif;
  font-size: 10.5px;
  color: var(--text-muted);
}

.calendar-grid {
  display: flex;
  flex-direction: column;
  gap: 3px;
  align-items: center;
}

.calendar-row {
  display: flex;
  gap: 3px;
}

.calendar-cell {
  width: 26px;
  height: 24px;
  border-radius: 5px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease;
  position: relative;
}

.calendar-cell:hover {
  transform: scale(1.1);
}

.calendar-cell.empty {
  background: transparent !important;
}

/* [改版] 热力等级（单行条 + 月历共用）：0 无 / 1 / 2-3 / 4-5 / 6+ */
.heat-l0 { background: var(--heatmap-empty); }
.heat-l1 { background: var(--heatmap-1); }
.heat-l2 { background: var(--heatmap-2); }
.heat-l3 { background: var(--heatmap-3); }
.heat-l4 { background: var(--heatmap-4); }

.calendar-cell.today {
  box-shadow: inset 0 0 0 1.5px var(--tomato);
}

.calendar-cell.today .day-num {
  color: #e74c3c;
  font-weight: 600;
}

/* [P1-4 体验] 空月份提示 */
.heatmap-empty-hint {
  margin-top: 8px;
  padding: 6px 12px;
  border-radius: 6px;
  background: var(--bg-secondary, rgba(0,0,0,0.04));
  color: var(--text-muted, #999);
  font-size: 12px;
  text-align: center;
}

.day-num {
  font-family: 'DM Sans', sans-serif;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  line-height: 1;
}

.check {
  font-size: 12px;
  color: var(--completed-color, #27ae60);
  font-weight: 600;
  line-height: 1;
}
</style>
