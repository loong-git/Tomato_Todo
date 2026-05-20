<script setup lang="ts">
import { computed } from 'vue'
import { useStatsStore, useSettingsStore } from '@/stores'

const statsStore = useStatsStore()
const settingsStore = useSettingsStore()

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
  </div>
</template>

<style scoped>
.stats-display {
  display: flex;
  gap: 12px;
  padding: 8px 16px 16px;
  justify-content: center;
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
</style>
