<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useTimerStore } from '@/stores'

const timerStore = useTimerStore()

const show = ref(false)
const particles = ref<{ id: number; color: string; driftX: number; delay: number }[]>([])
const showBadge = ref(false)
const showGoldenFlash = ref(false)

// 判断是否是今日首次
const isFirstToday = computed(() => timerStore.streakCount === 1)

// 粒子颜色
const emberColors = ['#e74c3c', '#f39c12', '#e67e22', '#ffd700']

function getEmberColor(index: number): string {
  return emberColors[index % emberColors.length]
}

function generateParticles() {
  const count = 14
  particles.value = Array.from({ length: count }, (_, i) => ({
    id: i,
    color: getEmberColor(i),
    driftX: (Math.random() - 0.5) * 140,
    delay: i * 35
  }))
}

function getStreakBadge() {
  const count = timerStore.streakCount
  // 10+ 连胜 显示金牌
  if (count >= 10) return { text: `🌟 ${count} 连胜`, class: 'gold' }
  // 5+ 连胜 显示银牌
  if (count >= 5) return { text: `✨ ${count} 连胜`, class: 'silver' }
  // 3+ 连胜 显示铜牌
  if (count >= 3) return { text: `🔥 ${count} 连胜`, class: 'bronze' }
  return null
}

watch(() => timerStore.justCompleted, (completed) => {
  if (completed) {
    console.log('[Celebration] 触发动画, streak:', timerStore.streakCount)

    // 生成粒子
    generateParticles()

    // 显示动画
    show.value = true

    // 如果是今日首次，显示金色特效
    if (isFirstToday.value) {
      showGoldenFlash.value = true
      setTimeout(() => { showGoldenFlash.value = false }, 600)
    }

    // 显示连胜徽章
    if (timerStore.streakCount >= 3) {
      setTimeout(() => { showBadge.value = true }, 300)
    }

    // 2秒后隐藏
    setTimeout(() => {
      show.value = false
      showBadge.value = false
    }, 2000)
  }
})
</script>

<template>
  <Transition name="celebration">
    <div v-if="show" class="celebration-overlay">
      <!-- 金色首次特效 -->
      <div v-if="showGoldenFlash" class="golden-flash" />

      <!-- 脉冲环 -->
      <div class="pulse-ring" />

      <!-- 余烬粒子 -->
      <div
        v-for="p in particles"
        :key="p.id"
        class="ember"
        :style="{
          background: p.color,
          '--drift-x': `${p.driftX}px`,
          animationDelay: `${p.delay}ms`
        }"
      />

      <!-- 连胜徽章 -->
      <Transition name="badge">
        <div v-if="showBadge && getStreakBadge()" :class="['streak-badge', getStreakBadge()?.class]">
          {{ getStreakBadge()?.text }}
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<style scoped>
.celebration-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 金色首次特效 */
.golden-flash {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center,
    rgba(255, 215, 0, 0.25) 0%,
    transparent 60%);
  animation: flash-fade 0.6s ease-out forwards;
}

@keyframes flash-fade {
  0% { opacity: 1; }
  100% { opacity: 0; }
}

/* 脉冲环 */
.pulse-ring {
  position: absolute;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  border: 3px solid var(--tomato);
  animation: pulse-expand 0.8s ease-out forwards;
  opacity: 0;
}

@keyframes pulse-expand {
  0% {
    opacity: 0.9;
    transform: scale(0.3);
    box-shadow: 0 0 30px rgba(231, 76, 60, 0.6);
  }
  100% {
    opacity: 0;
    transform: scale(2);
    box-shadow: 0 0 60px rgba(231, 76, 60, 0);
  }
}

/* 余烬粒子 */
.ember {
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  pointer-events: none;
  animation: ember-rise 1.4s ease-out forwards;
  box-shadow: 0 0 8px 3px currentColor;
  opacity: 0;
}

@keyframes ember-rise {
  0% {
    opacity: 1;
    transform: translate(0, 0) scale(1.2);
  }
  40% {
    opacity: 0.9;
    transform: translate(var(--drift-x), -60px) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(calc(var(--drift-x) * 1.5), -140px) scale(0.2);
  }
}

/* 连胜徽章 */
.streak-badge {
  position: absolute;
  top: 35%;
  left: 50%;
  transform: translateX(-50%);
  padding: 14px 28px;
  border-radius: 50px;
  font-family: 'DM Sans', sans-serif;
  font-weight: 600;
  font-size: 18px;
  color: #fff;
  white-space: nowrap;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.streak-badge.bronze {
  background: linear-gradient(135deg, #cd7f32, #a0522d);
  box-shadow:
    0 0 25px rgba(205, 127, 50, 0.6),
    0 4px 15px rgba(0, 0, 0, 0.3);
}

.streak-badge.silver {
  background: linear-gradient(135deg, #c0c0c0, #808080);
  box-shadow:
    0 0 25px rgba(192, 192, 192, 0.6),
    0 4px 15px rgba(0, 0, 0, 0.3);
}

.streak-badge.gold {
  background: linear-gradient(135deg, #ffd700, #ffa500);
  box-shadow:
    0 0 30px rgba(255, 215, 0, 0.7),
    0 4px 15px rgba(0, 0, 0, 0.3);
}

/* 动画过渡 */
.celebration-enter-active {
  transition: opacity 0.2s ease;
}

.celebration-leave-active {
  transition: opacity 0.4s ease;
}

.celebration-enter-from,
.celebration-leave-to {
  opacity: 0;
}

.badge-enter-active {
  transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.badge-leave-active {
  transition: all 0.3s ease;
}

.badge-enter-from {
  opacity: 0;
  transform: translateX(-50%) scale(0.5) translateY(20px);
}

.badge-leave-to {
  opacity: 0;
  transform: translateX(-50%) scale(0.8) translateY(-10px);
}
</style>
