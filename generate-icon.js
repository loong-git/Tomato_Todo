// 运行此脚本生成 icon.png / icon.ico / build/icon.ico
// 依赖 sharp 与 png-to-ico，**已在 package.json 的 devDependencies 里**，npm install 后可直接跑：
//   npm run icon
//
// 源文件是仓库里的 icon.svg（文本），生成的 .png/.ico 是二进制、不入库（见 .gitignore）。
// ⚠️ electron-builder 实际用的是 build/icon.ico（package.json 的 build.icon 指向它），
// 所以这里一并输出到 build/，避免像以前那样手工拷一份。

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { default: pngToIco } = require('png-to-ico');

const svgPath = path.join(__dirname, 'icon.svg');
const pngPath = path.join(__dirname, 'icon.png');
const icoPath = path.join(__dirname, 'icon.ico');
/** electron-builder 真正读取的位置（build.directories.buildResources = build） */
const buildIcoPath = path.join(__dirname, 'build', 'icon.ico');

async function generateIcons() {
  // 读取 SVG 并转换为 PNG
  const svgBuffer = fs.readFileSync(svgPath);

  await sharp(svgBuffer, { density: 300 })
    .resize(256, 256)
    .png()
    .toFile(pngPath);

  console.log('✓ icon.png 生成成功 (256x256)');

  // 转换为 ICO
  const pngBuffer = fs.readFileSync(pngPath);
  const icoBuffer = await pngToIco(pngBuffer);
  fs.writeFileSync(icoPath, icoBuffer);
  console.log('✓ icon.ico 生成成功');

  fs.writeFileSync(buildIcoPath, icoBuffer);
  console.log('✓ build/icon.ico 生成成功（electron-builder 实际用这个）');
}

generateIcons().catch(console.error);
