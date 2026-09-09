// 打包「哲思殿堂」为可双击的桌面软件（便携版，免安装）
// 产物：release/哲思殿堂/
//   ├─ 哲思殿堂.exe      （Electron 运行时，由 electron.exe 重命名）
//   ├─ resources/app.asar（前端 dist + 本地后端 + .env，打成一个 asar）
//   ├─ 哲思殿堂.vbs      （静默启动器：双击即用，无控制台闪现）
//   └─ 使用说明.txt
//
// 说明：裸 electron.exe 在本环境（重命名后）不会自动发现 resources/app.asar，
// 必须经显式路径启动：哲思殿堂.exe resources/app.asar。故用 .vbs 启动器传递该路径，
// 实现「双击打开」。.vbs 本身静默运行，体验等同双击一个 .exe。
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const electronDist = path.join(root, 'node_modules', 'electron', 'dist');
const out = path.join(root, 'release', '哲思殿堂');
const appDir = path.join(out, 'resources', 'app');
const asarBin = path.join(root, 'node_modules', 'asar', 'bin', 'asar.js');

function sh(cmd) {
  console.log('$', cmd);
  execSync(cmd, { stdio: 'inherit', cwd: root });
}

if (!fs.existsSync(electronDist)) {
  console.error('未找到 Electron 二进制，请先执行：npm install -D electron@30.5.1');
  process.exit(1);
}

console.log('清理旧产物...');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

console.log('复制 Electron 运行时（cp -r，规避 fs.cpSync 段错误）...');
// 复制 electron/dist 下所有内容（含隐藏/资源）到 out
sh(`cp -r "${electronDist}/." "${out}/"`);

// 移除 electron 自带的 default_app.asar，避免任何回退歧义
const defApp = path.join(out, 'resources', 'default_app.asar');
if (fs.existsSync(defApp)) fs.rmSync(defApp, { force: true });

// 重命名可执行文件为「哲思殿堂.exe」
const exeSrc = path.join(out, 'electron.exe');
const exeDst = path.join(out, '哲思殿堂.exe');
if (fs.existsSync(exeSrc)) fs.renameSync(exeSrc, exeDst);

console.log('组装应用目录 resources/app ...');
fs.mkdirSync(appDir, { recursive: true });

// 应用入口 package.json（ESM）
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({
  name: 'philosophers-gallery',
  version: '1.0.0',
  main: 'electron/main.js',
  type: 'module',
}, null, 2), 'utf8');

sh(`cp -r "${path.join(root, 'electron')}" "${path.join(appDir, 'electron')}"`);
sh(`cp -r "${path.join(root, 'dist')}" "${path.join(appDir, 'dist')}"`);
sh(`cp -r "${path.join(root, 'server')}" "${path.join(appDir, 'server')}"`);

// .env（含 API Key，让 AI 对话开箱即用）；缺失则退回 .env.example
const envSrc = fs.existsSync(path.join(root, '.env'))
  ? path.join(root, '.env')
  : path.join(root, '.env.example');
fs.copyFileSync(envSrc, path.join(appDir, '.env'));

console.log('打包为 resources/app.asar ...');
sh(`node "${asarBin}" pack "${appDir}" "${path.join(out, 'resources', 'app.asar')}"`);

// 校验 asar 非异常空包（正常应远大于 1KB）
const asarPath = path.join(out, 'resources', 'app.asar');
const asarSize = fs.existsSync(asarPath) ? fs.statSync(asarPath).size : 0;
if (asarSize < 1000) {
  console.error(`[!] app.asar 异常小（${asarSize} 字节），打包可能失败，请检查 asar 工具。`);
  process.exit(1);
}
console.log('app.asar 大小：', (asarSize / 1024 / 1024).toFixed(2), 'MB');

console.log('清理临时 app 目录（仅保留 app.asar）...');
fs.rmSync(appDir, { recursive: true, force: true });

console.log('生成静默启动器 哲思殿堂.vbs ...');
// 启动器基于自身所在目录定位 exe 与 asar，故整个文件夹可放到桌面任意位置。
const vbs = [
  'Set WshShell = CreateObject("WScript.Shell")',
  'Dim fso',
  'Set fso = CreateObject("FileSystemObject")',
  'Dim base',
  'base = fso.GetAbsolutePathName(fso.GetParentFolderName(WScript.ScriptFullName))',
  'WshShell.Run """" & base & "\\哲思殿堂.exe"" """" & base & "\\resources\\app.asar""", 0, False',
].join('\r\n');
fs.writeFileSync(path.join(out, '哲思殿堂.vbs'), vbs + '\r\n', 'utf8');

console.log('写入使用说明.txt ...');
fs.writeFileSync(path.join(out, '使用说明.txt'), [
  '哲思殿堂 · 桌面版（便携，免安装）',
  '========================================',
  '',
  '使用方法：',
  '  直接双击「哲思殿堂.vbs」即可打开应用（首次可能稍慢，请耐心等待窗口出现）。',
  '  若系统禁止运行 .vbs，可右键「哲思殿堂.vbs」→ 打开；或双击「哲思殿堂.exe」',
  '  （直接双击 exe 无参数时不会加载应用，必须用 .vbs 启动器）。',
  '',
  '功能说明：',
  '  - 首页：浏览 59 位东西方哲学家卡片，支持搜索与筛选。',
  '  - 思想脉络图 / 时间轴：可视化思想传承与历史脉络。',
  '  - AI 模拟对话：与哲学家对话（需联网 + 有效的 API Key）。',
  '  - 思辨闯关：PVE 知识对战，进度自动保存在本机用户目录。',
  '',
  '关于 AI 对话的 API Key：',
  '  - 应用已内置 .env（resources/app.asar 内）的 Key，联网即可使用。',
  '  - 若要更换 Key：用记事本打开 resources/app.asar 之外的 .env 不便，',
  '    建议直接修改项目根目录 .env 后重新打包（运行 npm run pack:desktop）。',
  '',
  '联网说明：',
  '  - 新闻/原著抓取、AI 对话需要联网；离线时自动回退到本地快照。',
  '',
  '退出：直接关闭窗口即可，后端会随应用一同退出。',
  '',
  '目录说明：',
  '  哲思殿堂.exe        Electron 运行时',
  '  resources/app.asar  应用本体（前端 + 后端 + 配置）',
  '  哲思殿堂.vbs        双击启动器',
  '  使用说明.txt        本说明',
].join('\n'), 'utf8');

console.log('完成！可双击运行：', path.join(out, '哲思殿堂.vbs'));
console.log('产物体积约', (fs.statSync(exeDst).size / 1024 / 1024).toFixed(0), 'MB（含 Electron 运行时）');
