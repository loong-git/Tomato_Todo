/**
 * 全局模块级状态：新手引导（聚光灯分步引导）是否可见
 *
 * 为什么用模块级而不是 Pinia store：
 *   - 只有"开 / 关"一个布尔量，而控制它的两个地方（App.vue 首次自动弹、
 *     SettingsPanel 手动重看）层级不相邻，走 store 有点重
 *   - 沿用项目里 src/utils/shortcut-state.ts 的模块级共享写法
 * ⚠️ 与 shortcut-state.ts 的区别：那边是同步读的普通变量，这里**必须是 ref**，
 *    因为 App.vue 的模板用 v-if 绑它，需要响应式
 */
import { ref } from 'vue'

/** 引导是否可见（App.vue 用它控制 <OnboardingTour v-if>） */
export const tourVisible = ref(false)

export function openTour(): void {
  tourVisible.value = true
}

export function closeTour(): void {
  tourVisible.value = false
}
