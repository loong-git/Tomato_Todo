// [睡眠补偿统一] 睡眠/挂起/时钟跳变的补偿判定，全项目唯一入口。
// startTicking 的 tick 循环与 power:resumed 唤醒回调共用同一份 lastTickMs 账本调用本函数：
// 先到者拿到完整 gap 并补偿，后到者 gap 只剩几十 ms 自然返回 0 —— 一次睡眠只补偿一次。
// （v2.0.0 两处各自补偿 → 唤醒后剩余时间虚增 1×睡眠时长：双重补偿共平移 2×gap-1s，
// 正确的单次补偿是 gap-1s，净差恰为 gap；2026-09-28 实测睡 95 分钟后首次唤醒显示 110:22，
// 用户报的 209:xx 是同一 session 两次睡眠叠加的结果。）
export const SLEEP_JUMP_THRESHOLD_MS = 90_000 // 90s：Chromium 后台 intensive throttling 单次最长约 60s，阈值不能低于它
export const SLEEP_GRACE_MS = 1_000 // 跳变期只计 1 秒正常流逝

export function sleepShiftMs(lastTickMs: number, now: number): number {
  const gap = now - lastTickMs
  return gap > SLEEP_JUMP_THRESHOLD_MS ? gap - SLEEP_GRACE_MS : 0
}
