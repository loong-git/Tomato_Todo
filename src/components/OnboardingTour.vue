<script setup lang="ts">
/**
 * 新手引导（聚光灯分步引导）
 *
 * 实现要点：
 *  1. 聚光灯 = 一个跟目标元素等大的透明 div，靠**巨大的 box-shadow**
 *     （`0 0 0 9999px rgba(0,0,0,.62)`）把四周压暗。这样"高亮区"天然是透明的，
 *     底下的真实界面直接透出来，不需要截图或复制 DOM。
 *  2. 目标用 `[data-tour="xxx"]` 选择器定位（不是 class）—— 重构 class 不会把引导搞断。
 *  3. 气泡优先放目标**下方**，下方放不下（比如底部热力图）自动翻到**上方**。
 *  4. ⚠️ 引导期间必须拦键盘：App.vue 的全局快捷键里**空格是开始/暂停计时**，
 *     用户在引导里按空格会莫名其妙启动计时。用捕获阶段监听 + stopPropagation 截住。
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useSettingsStore } from '@/stores'
import { closeTour } from '@/utils/onboarding-state'

const settingsStore = useSettingsStore()

interface Step {
  target: string
  title: string
  desc: string
}

const steps: Step[] = [
  {
    target: '[data-tour="timer"]',
    title: '计时区',
    desc: '25:00 是剩余时间。右边三个按钮：重置、开始 / 暂停、跳过。按空格键也能开始或暂停。'
  },
  {
    target: '[data-tour="mode"]',
    title: '三种模式',
    desc: '专注 / 短休息 / 长休息，点一下切换。注意：切换会结束当前这一轮，所以会先弹一个确认。'
  },
  {
    target: '[data-tour="tasks"]',
    title: '今日任务',
    desc: '在输入框里回车添加任务。点一下任务把它设为「当前专注」，这一轮番茄结束后会自动记在它头上。'
  },
  {
    target: '[data-tour="stats"]',
    title: '数据',
    desc: '今日目标进度、四项统计、累计数据。左右拖动卡片可以翻到第 2 页看本周趋势图（也能点底部箭头或按 ← →）。'
  },
  {
    target: '[data-tour="heatmap"]',
    title: '热力图',
    desc: '每个格子是一天，颜色越红番茄越多。点标题或格子能打开完整日历，查看某一天的记录。'
  }
]

const BUBBLE_W = 300
const GAP = 12
/** 高亮框比目标元素向外扩一点，看起来更透气 */
const SPOT_PAD = 6

const index = ref(0)
const rect = ref<{ left: number; top: number; width: number; height: number } | null>(null)
const placement = ref<'below' | 'above'>('below')
const bubbleH = ref(150)
const bubbleRef = ref<HTMLElement | null>(null)
/** 挂载后补测布局用的定时器，卸载时要清掉 */
const remeasureTimers: number[] = []

const step = computed(() => steps[index.value])
const isLast = computed(() => index.value === steps.length - 1)

async function measure() {
  const el = document.querySelector(steps[index.value].target) as HTMLElement | null
  if (!el) {
    rect.value = null
    return
  }
  const r = el.getBoundingClientRect()
  rect.value = {
    left: r.left - SPOT_PAD,
    top: r.top - SPOT_PAD,
    width: r.width + SPOT_PAD * 2,
    height: r.height + SPOT_PAD * 2
  }
  // 先让气泡按最终宽度渲染出来，才能量到它的真实高度（高度随文案行数变）
  await nextTick()
  bubbleH.value = bubbleRef.value?.offsetHeight ?? 150
  // 优先放下方；下方装不下就翻到上方
  const roomBelow = window.innerHeight - 8
  placement.value =
    rect.value.top + rect.value.height + GAP + bubbleH.value <= roomBelow ? 'below' : 'above'
}

const spotlightStyle = computed(() => ({
  left: rect.value!.left + 'px',
  top: rect.value!.top + 'px',
  width: rect.value!.width + 'px',
  height: rect.value!.height + 'px'
}))

const bubbleStyle = computed(() => {
  if (!rect.value) return {}
  // 水平居中于目标，再夹在窗口内，避免贴边溢出
  let left = rect.value.left + rect.value.width / 2 - BUBBLE_W / 2
  left = Math.max(12, Math.min(left, window.innerWidth - BUBBLE_W - 12))
  const top =
    placement.value === 'below'
      ? rect.value.top + rect.value.height + GAP
      : rect.value.top - GAP - bubbleH.value
  return {
    left: left + 'px',
    top: Math.max(8, top) + 'px',
    width: BUBBLE_W + 'px'
  }
})

function go(i: number) {
  if (i < 0 || i >= steps.length) return
  index.value = i
  measure()
}

function next() {
  if (isLast.value) finish()
  else go(index.value + 1)
}

function prev() {
  go(index.value - 1)
}

function finish() {
  closeTour()
  // 只有第一次真正看过才落标记；从设置里"重看"不会重复写
  if (!settingsStore.settings.hasSeenOnboarding) {
    settingsStore.updateSettings({ hasSeenOnboarding: true })
  }
}

/** 这些键要被拦住，否则会穿透到 App.vue 的全局快捷键（空格=开始/暂停） */
const BLOCKED_KEYS = [' ', 'Spacebar', 'ArrowLeft', 'ArrowRight', 'Escape', 'Enter']

function onKeydown(e: KeyboardEvent) {
  if (BLOCKED_KEYS.includes(e.key)) {
    e.preventDefault()
    e.stopPropagation()
  }
  if (e.key === 'Escape') finish()
  else if (e.key === 'ArrowRight') next()
  else if (e.key === 'ArrowLeft') prev()
}

function onResize() {
  measure()
}

onMounted(() => {
  // 捕获阶段 + stopPropagation：抢在 App.vue 的 window 冒泡监听之前把事件截住
  window.addEventListener('keydown', onKeydown, true)
  window.addEventListener('resize', onResize)
  measure()
  // [稳健性] 首次打开时数据可能还在往 DOM 里灌（统计卡/任务列表一变高，下面几行就整体位移），
  // 单次测量会量到旧位置。这里补两次重测，覆盖掉"挂载后布局才稳定"的情况。
  // 用户已经翻到别的步骤时重测也无害——量的是当前步骤的目标。
  remeasureTimers.push(window.setTimeout(measure, 350), window.setTimeout(measure, 900))
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('resize', onResize)
  remeasureTimers.forEach(t => clearTimeout(t))
})
</script>

<template>
  <div class="tour-root">
    <!-- 挡住所有点击：引导期间不允许操作界面，避免误触（比如误点「跳过」旁边的东西） -->
    <div class="tour-blocker"></div>

    <!-- 聚光灯：自身透明，靠巨大 box-shadow 把四周压暗；外面再套一圈番茄色细边 -->
    <div v-if="rect" class="tour-spotlight" :style="spotlightStyle"></div>

    <div v-if="rect" ref="bubbleRef" class="tour-bubble" :style="bubbleStyle">
      <div class="tb-head">
        <span class="tb-step">{{ index + 1 }} / {{ steps.length }}</span>
        <button class="tb-skip" @click="finish">跳过</button>
      </div>

      <div class="tb-title">{{ step.title }}</div>
      <div class="tb-desc">{{ step.desc }}</div>

      <div class="tb-foot">
        <div class="tb-dots">
          <i v-for="(s, i) in steps" :key="s.target" :class="{ on: i === index }"></i>
        </div>
        <div class="tb-actions">
          <button v-if="index > 0" class="tb-btn ghost" @click="prev">上一步</button>
          <button class="tb-btn primary" @click="next">{{ isLast ? '开始使用' : '下一步' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tour-blocker {
  position: fixed;
  inset: 0;
  /* ⚠️ 必须高于 main.ts 的启动 splash（#app-loader 是 9999），否则首次启动时
     引导会被 splash 盖住。也比各处的 confirm 弹窗（10000）高——引导期间它就该在最上层 */
  z-index: 10010;
}

.tour-spotlight {
  position: fixed;
  z-index: 10011;
  border-radius: 14px;
  /* 第一层是番茄色细边，第二层是铺满屏幕的暗色遮罩（高亮区内部保持透明） */
  box-shadow: 0 0 0 2px var(--tomato), 0 0 0 9999px rgba(0, 0, 0, 0.62);
  pointer-events: none;
  transition: left 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    top 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    width 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    height 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}

.tour-bubble {
  position: fixed;
  z-index: 10012;
  background: var(--bg-card);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 15px 17px 13px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
  font-family: 'DM Sans', sans-serif;
  transition: left 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    top 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}

.tb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.tb-step {
  font-size: 11px;
  font-weight: 600;
  color: var(--tomato);
  letter-spacing: 0.4px;
}

.tb-skip {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-family: 'DM Sans', sans-serif;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 6px;
  transition: color 0.2s ease, background 0.2s ease;
}
.tb-skip:hover {
  color: var(--text-primary);
  background: var(--bg-secondary);
}

.tb-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.tb-desc {
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin-bottom: 14px;
}

.tb-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.tb-dots {
  display: flex;
  gap: 5px;
}
.tb-dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--border-color);
  transition: all 0.2s ease;
}
.tb-dots i.on {
  background: var(--tomato);
  width: 14px;
  border-radius: 3px;
}

.tb-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.tb-btn {
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-family: 'DM Sans', sans-serif;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tb-btn.ghost {
  background: var(--bg-secondary);
  color: var(--text-secondary);
}
.tb-btn.ghost:hover {
  background: var(--border-color);
  color: var(--text-primary);
}

.tb-btn.primary {
  background: var(--tomato);
  color: #fff;
}
.tb-btn.primary:hover {
  filter: brightness(1.08);
}
</style>
