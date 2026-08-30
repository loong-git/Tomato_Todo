/**
 * electron-builder afterPack 钩子 —— 在 win-unpacked 写好后、压成 zip 之前
 * 用 rcedit 覆盖烧入图标。
 *
 * 调 rcedit 必须在 electron-builder 压 zip 之前,否则 zip 里的 exe 是
 * electron 自带图标(rcedit 默认追加不覆盖)。
 *
 * rcedit@5 是 ESM-only 包,CommonJS 里用动态 import()
 *
 * 注册方式:在 package.json 的 build.afterPack 字段填这个文件路径
 */
const path = require('path')

module.exports = async function (context) {
  // context.appOutDir = release\win-unpacked
  const exeName = context.packager.appInfo.productFilename + '.exe'
  const exePath = path.join(context.appOutDir, exeName)
  const icoPath = path.join(__dirname, '..', 'build', 'icon.ico')

  console.log('[after-pack] setting icon:')
  console.log('  ico:', icoPath)
  console.log('  exe:', exePath)

  const { rcedit } = await import('rcedit')
  await rcedit(exePath, {
    operation: 'setIcon',
    icon: icoPath,
  })

  console.log('[after-pack] done')
}
