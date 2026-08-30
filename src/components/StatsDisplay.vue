<script setup lang="ts">
import { ref, computed } from 'vue'
import { useStatsStore, useSettingsStore, useTimerStore } from '@/stores'
import { toast } from '@/utils/toast'

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


</script>

<template>
  <div class="stats-display">
    <div class="stats-header">
      <button class="detail-btn" @click="showDetail = true" title="查看详细数据">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
        </svg>
        <span>详细数据</span>
      </button>
    </div>

    <!-- 今日目标小时数（横条进度） -->
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
        <div class="goal-percent">{{ hourGoalPercent }}%</div>
      </div>
      <div class="goal-progress">
        <!-- [需求] 进度条视觉满格即停（宽度封顶 100%），百分比数字显示真实值（可超 100%） -->
        <div class="goal-progress-fill" :style="{ width: Math.min(100, hourGoalPercent) + '%' }"></div>
      </div>
    </div>

    <div class="stats-cards">
    <div class="stat-card">
      <div class="stat-icon focus">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <circle cx="12" cy="12" r="10" opacity="0.2"/>
          <circle cx="12" cy="12" r="6"/>
        </svg>
      </div>
      <div class="stat-value">{{ Math.round(totalFocusMinutes) }}</div>
      <div class="stat-label">分钟</div>
    </div>

    <div class="stat-card">
      <div class="stat-icon completed">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      </div>
      <div class="stat-value">{{ todayCount }}<span class="stat-unit">/ {{ settingsStore.settings.dailyGoal }}</span></div>
      <div class="stat-label">完成番茄</div>
    </div>

    <div class="stat-card">
      <div class="stat-icon streak">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/>
        </svg>
      </div>
      <div class="stat-value">{{ currentStreak }}<span class="stat-unit">天</span></div>
      <div class="stat-label">连续记录</div>
    </div>

    <div class="stat-card">
      <div class="stat-icon yesterday">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5zm2 4h5v5H7z"/>
        </svg>
      </div>
      <div class="stat-value">{{ yesterdayHours }}</div>
      <div class="stat-label">昨日小时</div>
    </div>
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

    <!-- 热力图 -->
    <div class="heatmap-container">
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
            :class="{ empty: !day.isCurrentMonth, completed: day.count > 0, today: day.isToday }"
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
</template>

<style scoped>
.stats-display {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 16px 16px;
}

.stats-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 0 4px;
}

.detail-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-card);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  color: var(--text-secondary);
  font-size: 12px;
  font-family: 'DM Sans', sans-serif;
  cursor: pointer;
  transition: all 0.2s ease;
}

.detail-btn:hover {
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
  border-color: rgba(231, 76, 60, 0.3);
}

.stats-cards {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

/* 今日目标小时数 - 横条进度卡片 */
.hour-goal-bar {
  background: var(--bg-card);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 14px 16px;
  box-shadow: 0 4px 16px var(--shadow);
  transition: all 0.3s ease;
}

.hour-goal-bar:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 22px var(--shadow);
}

.hour-goal-bar.completed {
  border-color: rgba(46, 204, 113, 0.4);
  background: linear-gradient(135deg, var(--bg-card) 0%, rgba(46, 204, 113, 0.05) 100%);
}

.goal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.goal-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
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
  margin-bottom: 2px;
}

.goal-value {
  font-family: 'DM Serif Display', serif;
  font-size: 18px;
  display: flex;
  align-items: baseline;
  gap: 2px;
  line-height: 1.1;
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
  font-size: 14px;
  margin: 0 2px;
}

.goal-value .target {
  color: var(--text-primary);
}

.goal-value .unit {
  font-family: 'DM Sans', sans-serif;
  font-size: 12px;
  color: var(--text-muted);
  margin-left: 4px;
}

.goal-percent {
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: var(--tomato);
  background: rgba(231, 76, 60, 0.12);
  padding: 4px 10px;
  border-radius: 8px;
  flex-shrink: 0;
}

.hour-goal-bar.completed .goal-percent {
  color: #2ecc71;
  background: rgba(46, 204, 113, 0.12);
}

.goal-progress {
  height: 6px;
  background: var(--bg-secondary);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
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
  flex: 1;
  max-width: 130px;
  background: var(--bg-card);
  backdrop-filter: blur(20px);
  border-radius: 20px;
  padding: 18px 14px;
  text-align: center;
  border: 1px solid var(--border-color);
  box-shadow: 0 4px 16px var(--shadow);
  transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.25s ease;
}

.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 28px var(--shadow);
}

.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px;
}

.stat-icon.focus {
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
}

.stat-icon.completed {
  background: rgba(52, 152, 219, 0.15);
  color: #3498db;
}

.stat-icon.streak {
  background: rgba(155, 89, 182, 0.15);
  color: #9b59b6;
}

.stat-icon.yesterday {
  background: rgba(26, 188, 156, 0.15);
  color: #1abc9c;
}

.stat-value {
  font-family: 'DM Serif Display', serif;
  font-size: 26px;
  font-weight: 400;
  color: var(--text-primary);
  line-height: 1;
}

.stat-unit {
  font-family: 'DM Sans', sans-serif;
  font-size: 12px;
  font-weight: 400;
  color: var(--text-muted);
  margin-left: 2px;
}

.stat-label {
  font-family: 'DM Sans', sans-serif;
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 6px;
}

/* 热力图 - 治愈简约日历风格 */
.heatmap-container {
  width: 100%;
  background: var(--bg-card);
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 2px 12px var(--shadow);
  position: relative;
}

.heatmap-header {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.heatmap-title {
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
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
  width: 32px;
  text-align: center;
  font-family: 'DM Sans', sans-serif;
  font-size: 11px;
  color: var(--text-muted);
}

.calendar-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
}

.calendar-row {
  display: flex;
  gap: 4px;
}

.calendar-cell {
  width: 32px;
  height: 32px;
  border-radius: 6px;
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

.calendar-cell.completed {
  background: var(--completed-bg, #f0f9f4);
}

.calendar-cell.today {
  background: rgba(231, 76, 60, 0.15);
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
