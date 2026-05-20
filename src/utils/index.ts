export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2)
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function playCelebrationSound(): void {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContext) return

    const ctx = new AudioContext()

    // 笔划过纸面音效：带通滤波噪音 + 摩擦感
    const duration = 0.5
    const sampleRate = ctx.sampleRate
    const bufferSize = Math.floor(sampleRate * duration)
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate)
    const data = buffer.getChannelData(0)

    // 生成带节奏感的噪音（模拟笔在纸上划过的不规则摩擦）
    for (let i = 0; i < bufferSize; i++) {
      const t = i / sampleRate
      // 基础白噪音
      let sample = (Math.random() * 2 - 1) * 0.6
      // 添加低频脉冲模拟笔尖摩擦节奏
      const pulse = Math.sin(t * 180 + Math.sin(t * 40) * 0.5) * 0.3
      sample += pulse * (Math.random() * 0.7 + 0.3)
      // 幅度包络：渐变 + 快速衰减
      const attack = Math.min(t / 0.04, 1)
      const release = Math.max(0, 1 - (t - 0.3) / 0.2)
      const envelope = attack * release
      data[i] = sample * envelope
    }

    // 噪音源
    const noiseSource = ctx.createBufferSource()
    noiseSource.buffer = buffer

    // 带通滤波器（模拟纸张摩擦的频率范围）
    const bandpass = ctx.createBiquadFilter()
    bandpass.type = 'bandpass'
    bandpass.frequency.value = 2200
    bandpass.Q.value = 1.2

    // 高频增强滤波器（增加"沙沙"质感）
    const highShelf = ctx.createBiquadFilter()
    highShelf.type = 'highshelf'
    highShelf.frequency.value = 4000
    highShelf.gain.value = 6

    // 主音量
    const gainNode = ctx.createGain()
    gainNode.gain.value = 0.25

    noiseSource.connect(bandpass)
    bandpass.connect(highShelf)
    highShelf.connect(gainNode)
    gainNode.connect(ctx.destination)

    noiseSource.start(ctx.currentTime)
    noiseSource.stop(ctx.currentTime + duration + 0.05)

    // 关闭 AudioContext
    setTimeout(() => {
      ctx.close()
    }, 1000)
  } catch (e) {
    console.warn('Celebration sound not supported:', e)
  }
}
