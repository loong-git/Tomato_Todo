<script setup lang="ts">
import { ref, computed } from 'vue'
import { useStatsStore, useSettingsStore } from '@/stores'

const statsStore = useStatsStore()
const settingsStore = useSettingsStore()

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

const currentStreak = computed(() => {
  const records = statsStore.records.filter(r => r.type === 'focus')
  if (records.length === 0) return 0

  const focusDays = new Set<string>()
  records.forEach(r => {
    const d = new Date(r.completedAt)
    d.setHours(0, 0, 0, 0)
    focusDays.add(d.getTime().toString())
  })
  const sortedDays = Array.from(focusDays).map(Number).sort((a, b) => b - a)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayTs = today.getTime()

  let checkDate = sortedDays[0] === todayTs ? todayTs : todayTs - 86400000
  if (!focusDays.has(checkDate.toString())) return 0

  let streak = 0
  while (focusDays.has(checkDate.toString())) {
    streak++
    checkDate -= 86400000
  }
  return streak
})

// 热力图数据 - 完整日历
const heatmapData = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayTime = today.getTime()

  const lastDayNum = new Date(viewYear.value, viewMonth.value + 1, 0).getDate()

  // 当月第一天是周几 (0=周日)
  const firstDayOfWeek = new Date(viewYear.value, viewMonth.value, 1).getDay()

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
    const dayEnd = dayStart + 86400000

    const dayRecords = statsStore.records.filter(r =>
      r.completedAt >= dayStart && r.completedAt < dayEnd && r.type === 'focus'
    )

    currentRow.push({
      date: day,
      count: dayRecords.length,
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


</script>

<template>
  <div class="stats-display">
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

    <!-- 热力图 -->
    <div class="heatmap-container">
      <div class="heatmap-header">
        <button class="nav-btn" @click="prevMonth">&lt;</button>
        <span class="heatmap-title">{{ viewTitle }}</span>
        <button class="nav-btn" @click="nextMonth">&gt;</button>
        <button class="today-btn" @click="goToToday">今</button>
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
            :title="day.isCurrentMonth ? `${day.date}日: ${day.count}个番茄` : ''"
          >
            <span v-if="day.isCurrentMonth" class="day-num">{{ day.isToday ? '今' : day.date }}</span>
            <span v-if="day.isCurrentMonth && day.count > 0" class="check">✓</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-display {
  display: flex;
  gap: 12px;
  padding: 8px 16px 16px;
  justify-content: center;
  flex-wrap: wrap;
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
