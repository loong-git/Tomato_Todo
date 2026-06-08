export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2)
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

import type { SoundType } from '@/types'

export function playPresetSound(type: SoundType): void {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContext) return

    const ctx = new AudioContext()

    switch (type) {
      case 'bell': {
        // 铃铛 - 连环撞击声
        const now = ctx.currentTime
        // 铃铛连续撞击5次，逐渐减弱
        const strikes = [
          { delay: 0, amp: 0.7, decay: 0.5 },
          { delay: 0.12, amp: 0.55, decay: 0.45 },
          { delay: 0.27, amp: 0.4, decay: 0.4 },
          { delay: 0.45, amp: 0.28, decay: 0.35 },
          { delay: 0.66, amp: 0.18, decay: 0.3 }
        ]

        strikes.forEach(({ delay, amp, decay }) => {
          const t = now + delay

          // 撞击瞬态（金属敲击杂音）
          const strikeLen = Math.floor(ctx.sampleRate * 0.03)
          const strikeBuffer = ctx.createBuffer(1, strikeLen, ctx.sampleRate)
          const strikeData = strikeBuffer.getChannelData(0)
          for (let i = 0; i < strikeLen; i++) {
            const ts = i / ctx.sampleRate
            strikeData[i] = (Math.random() * 2 - 1) * Math.exp(-ts * 100)
          }
          const strike = ctx.createBufferSource()
          strike.buffer = strikeBuffer
          const strikeGain = ctx.createGain()
          strikeGain.gain.value = amp * 0.5
          const highpass = ctx.createBiquadFilter()
          highpass.type = 'highpass'
          highpass.frequency.value = 3000
          strike.connect(highpass)
          highpass.connect(strikeGain)
          strikeGain.connect(ctx.destination)
          strike.start(t)

          // 铃铛共鸣音
          const ringFreqs = [2637, 3136, 3951, 5274]
          ringFreqs.forEach((freq, i) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.type = 'sine'
            osc.frequency.value = freq * (1 + Math.random() * 0.01) // 轻微音高抖动
            gain.gain.setValueAtTime(amp * (0.3 - i * 0.06), t)
            gain.gain.exponentialRampToValueAtTime(0.001, t + decay - i * 0.05)
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.start(t)
            osc.stop(t + decay + 0.1)
          })
        })
        break
      }
      case 'forest': {
        // 森林 - 鸟鸣啾啾声
        const playChirp = (startTime: number, freq: number, dur: number) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          // 啾啾声：频率先升后降
          osc.frequency.setValueAtTime(freq, startTime)
          osc.frequency.linearRampToValueAtTime(freq * 1.5, startTime + dur * 0.3)
          osc.frequency.linearRampToValueAtTime(freq * 0.8, startTime + dur)
          gain.gain.setValueAtTime(0, startTime)
          gain.gain.linearRampToValueAtTime(0.25, startTime + dur * 0.1)
          gain.gain.linearRampToValueAtTime(0.15, startTime + dur * 0.5)
          gain.gain.linearRampToValueAtTime(0, startTime + dur)
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start(startTime)
          osc.stop(startTime + dur)
        }

        // 鸟叫声序列
        const birdSounds = [
          { t: 0.1, f: 1800, d: 0.12 },
          { t: 0.35, f: 2200, d: 0.1 },
          { t: 0.55, f: 2000, d: 0.15 },
          { t: 1.1, f: 2400, d: 0.08 },
          { t: 1.4, f: 1900, d: 0.12 },
          { t: 1.7, f: 2100, d: 0.1 },
          { t: 2.2, f: 2300, d: 0.09 },
          { t: 2.5, f: 1850, d: 0.14 }
        ]

        birdSounds.forEach(s => {
          playChirp(ctx.currentTime + s.t, s.f, s.d)
        })
        break
      }
      case 'ding': {
        // 叮咚音 - 简单的上下行旋律
        const notes = [523, 659, 784, 1047] // C5, E5, G5, C6
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.value = freq
          const t = ctx.currentTime + i * 0.15
          gain.gain.setValueAtTime(0.3, t)
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start(t)
          osc.stop(t + 0.45)
        })
        break
      }
      case 'tick': {
        // 滴答音 - 时钟双音
        const now = ctx.currentTime
        // 第一声（低）
        const osc1 = ctx.createOscillator()
        const gain1 = ctx.createGain()
        osc1.type = 'sine'
        osc1.frequency.value = 880
        gain1.gain.setValueAtTime(0.35, now)
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
        osc1.connect(gain1)
        gain1.connect(ctx.destination)
        osc1.start(now)
        osc1.stop(now + 0.2)

        // 第二声（高）
        const osc2 = ctx.createOscillator()
        const gain2 = ctx.createGain()
        osc2.type = 'sine'
        osc2.frequency.value = 1319
        gain2.gain.setValueAtTime(0.35, now + 0.2)
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
        osc2.connect(gain2)
        gain2.connect(ctx.destination)
        osc2.start(now + 0.2)
        osc2.stop(now + 0.45)
        break
      }
    }

    setTimeout(() => ctx.close(), 5000)
  } catch (e) {
    console.warn('Sound not supported:', e)
  }
}

// 复用 AudioContext 避免每次创建延迟
let sharedCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContext) return null
    if (!sharedCtx) {
      sharedCtx = new AudioContext()
      // 立即尝试 resume，异步
      if (sharedCtx.state === 'suspended') {
        sharedCtx.resume().catch(() => {})
      }
    }
    return sharedCtx
  } catch (e) {
    return null
  }
}

export function playCelebrationSound(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const now = ctx.currentTime

  // 1. 笔触沙沙声 - 笔尖划过纸面（持续 0.5s 匹配划线动画）
  const duration = 0.5
  const sampleRate = ctx.sampleRate
  const bufferSize = Math.floor(sampleRate * duration)
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.5
  }
  const noiseSource = ctx.createBufferSource()
  noiseSource.buffer = buffer
  const highpass = ctx.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = 2000
  highpass.Q.value = 1
  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0, now)
  noiseGain.gain.linearRampToValueAtTime(0.25, now + 0.02)
  noiseGain.gain.linearRampToValueAtTime(0.25, now + duration - 0.1)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration)
  noiseSource.connect(highpass)
  highpass.connect(noiseGain)
  noiseGain.connect(ctx.destination)
  noiseSource.start(now)
  noiseSource.stop(now + duration + 0.05)

  // 2. 完成"叮咚" - 划线结束后的清脆提示（钢琴/风铃质感）
  const playNote = (startOffset: number, baseFreq: number) => {
    const startTime = now + startOffset
    // 真实钢琴/风铃的谐波结构：基频 + 整数倍泛音
    const partials = [
      { ratio: 1, amp: 0.30, decay: 0.6 },   // 基频
      { ratio: 2, amp: 0.18, decay: 0.35 },  // 2 倍频
      { ratio: 3, amp: 0.12, decay: 0.20 },  // 3 倍频
      { ratio: 4, amp: 0.08, decay: 0.12 },  // 4 倍频 - 决定"光泽"
      { ratio: 5, amp: 0.05, decay: 0.08 }   // 5 倍频 - 决定"清脆"
    ]

    partials.forEach(p => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(baseFreq * p.ratio, startTime)

      // 起音 3ms 内到峰值（钢琴击键感）
      gain.gain.setValueAtTime(0, startTime)
      gain.gain.linearRampToValueAtTime(p.amp, startTime + 0.003)
      // 指数衰减到 0
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + p.decay)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(startTime)
      osc.stop(startTime + p.decay + 0.05)
    })
  }

  // 第一个音：C6 (1047Hz) "叮" - 划线结束瞬间
  playNote(duration + 0.05, 1047)

  // 第二个音：G6 (1568Hz) "咚" - 完结提示
  playNote(duration + 0.18, 1568)
}
