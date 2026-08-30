/**
 * patch-app-builder.js
 *
 * electron-builder 24.13.3 在 Windows NSIS 打包时,即便无证书配置,
 * 也会走 doSign 路径。doSign 第 154 行的 "file" in cscInfo 在
 * cscInfo=undefined 时抛 "Cannot use 'in' operator to search for
 * 'file' in undefined"。
 *
 * 官方 issue: https://github.com/electron-userland/electron-builder/issues/8632
 * (在 25.x 修复,本项目 24.13.3 没修)
 *
 * 临时方案:在 doSign 入口加 null check,无证书时 warn + return false 跳过。
 * npm install 会覆盖 node_modules,所以每次 install 后需重新跑这个脚本:
 *   node scripts/patch-app-builder.js
 *
 * 已经把 npm postinstall 钩到这个脚本,自动重打。
 */
const fs = require('fs')
const path = require('path')

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  'app-builder-lib',
  'out',
  'codeSign',
  'windowsCodeSign.js'
)

const marker = 'PATCH: 配置无证书时 cscInfo 是 undefined'
if (!fs.existsSync(target)) {
  console.warn('[patch-app-builder] target not found, skipping:', target)
  process.exit(0)
}

const original = fs.readFileSync(target, 'utf8')
if (original.includes(marker)) {
  console.log('[patch-app-builder] already patched, skipping')
  process.exit(0)
}

const needle = `async function doSign(configuration, packager) {
    // https://github.com/electron-userland/electron-builder/pull/1944
    const timeout = parseInt(process.env.SIGNTOOL_TIMEOUT, 10) || 10 * 60 * 1000;
    // decide runtime argument by cases
    let args;`

const patched = `async function doSign(configuration, packager) {
    // https://github.com/electron-userland/electron-builder/pull/1944
    const timeout = parseInt(process.env.SIGNTOOL_TIMEOUT, 10) || 10 * 60 * 1000;
    // ${marker},跳过整个签名
    if (configuration.cscInfo == null) {
        util_1.log.warn({ path: configuration.path }, "no code signing certificate configured, skipping");
        return false;
    }
    // decide runtime argument by cases
    let args;`

if (!original.includes(needle)) {
  console.error('[patch-app-builder] needle not found, electron-builder version mismatch?')
  process.exit(1)
}

fs.writeFileSync(target, original.replace(needle, patched))
console.log('[patch-app-builder] patched:', target)
