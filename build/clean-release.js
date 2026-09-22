/**
 * 清理 electron-builder 在 release/ 留下的中间产物
 * - win-unpacked/  (解包后的中间目录)
 * - builder-debug.yml  (effective config 调试日志)
 * - latest.yml  (NSIS 用,zip/portable 不需要)
 * - *.blockmap  (NSIS 增量更新元数据,zip/portable 不需要)
 */
const fs = require('fs')
const path = require('path')

const releaseDir = path.join(__dirname, '..', 'release')

const toRemove = [
  'win-unpacked',
  'builder-debug.yml',
  'latest.yml',
]

for (const name of toRemove) {
  const full = path.join(releaseDir, name)
  if (!fs.existsSync(full)) continue
  const stat = fs.statSync(full)
  if (stat.isDirectory()) {
    fs.rmSync(full, { recursive: true, force: true })
    console.log('[clean-release] removed dir:', name)
  } else {
    fs.unlinkSync(full)
    console.log('[clean-release] removed file:', name)
  }
}

// 清理 *.blockmap
for (const f of fs.readdirSync(releaseDir)) {
  if (f.endsWith('.blockmap')) {
    fs.unlinkSync(path.join(releaseDir, f))
    console.log('[clean-release] removed:', f)
  }
}

// 清理用户之前解压出来的同名目录(避免混淆,看起来还是旧的图标)
// 只匹配 "{productName}-{version}-{arch}" 这种 zip 解压出来的目录名
for (const f of fs.readdirSync(releaseDir)) {
  const full = path.join(releaseDir, f)
  if (!fs.statSync(full).isDirectory()) continue
  // 不动 win-unpacked(上面已经处理了)和 release 自身
  if (f === 'win-unpacked' || f === 'release') continue
  // 启发式:含连字符 + 数字版本号 + -x64 结尾的目录,可能是 zip 解压产物
  // 例:番茄TODO时钟-1.0.0-x64
  if (/^.+-\d+\.\d+\.\d+-x64$/.test(f)) {
    console.log('[clean-release] removing stale extracted dir:', f)
    fs.rmSync(full, { recursive: true, force: true })
  }
}
