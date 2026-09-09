// 哲思殿堂 · Electron 主进程（CommonJS 入口，最稳妥的 Electron 加载方式）
// 仅负责「开窗 + 加载前端」；前端托管与后端代理见 server/desktop.js
//
// 设计要点：
// 1. 主进程一律 CommonJS。Electron 对 ESM 主入口支持不稳定（尤其 asar 内），
//    后端服务（ESM）通过动态 import() 加载，规避该问题。
// 2. Electron 内建模块用普通 require('electron') 获取。electron-builder 打包后，
//    应用目录（resources/app）不在任何 node_modules 之上，require 会回退到
//    Electron 内建模块（含 app/BrowserWindow）。切勿用 process.getBuiltinModule
//    —— electron 不是 Node 内建模块，会返回 undefined。
// 3. 窗口创建加容错：无图形显示环境（如 CI/沙盒）下创建失败不应拖垮本地服务，
//    真实用户机器上正常显示即可。

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// 诊断日志：仅在 ZS_DEBUG=1 时写入系统临时目录，普通用户环境零污染。
const DEBUG = process.env.ZS_DEBUG === '1';
const LOG = path.join(os.tmpdir(), 'zs_debug.log');
function log(...a) {
  if (!DEBUG) return;
  try {
    fs.appendFileSync(
      LOG,
      a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n'
    );
  } catch {}
}
if (DEBUG) {
  try {
    fs.writeFileSync(LOG, '=== 启动 @' + new Date().toISOString() + ' ===\n');
  } catch {}
}

// 1) 取 Electron 内建模块（打包后自动回退）。先写日志再 require，
//    以便即使 require 失败也能从日志确认「main.cjs 是否被执行」。
let app, BrowserWindow;
try {
  ({ app, BrowserWindow } = require('electron'));
  log('require(electron) OK app=' + typeof app + ' BrowserWindow=' + typeof BrowserWindow);
} catch (e) {
  log('require(electron) FAIL: ' + e.message);
  process.exit(1);
}

const DIST_DIR = path.join(__dirname, '..', 'dist');

function createWindow(staticPort) {
  try {
    const iconPath = path.join(DIST_DIR, 'favicon.ico');
    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      backgroundColor: '#0e0c08',
      title: '哲思殿堂',
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
      ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    });
    win.loadURL(`http://127.0.0.1:${staticPort}`);
    win.once('ready-to-show', () => win.show());
    log('窗口已创建');
    return win;
  } catch (e) {
    // 无显示环境下 BrowserWindow 可能创建失败，仅记录，不影响本地服务。
    log('窗口创建失败（无显示环境？）: ' + e.message);
    return null;
  }
}

app.whenReady()
  .then(async () => {
    try {
      const { startDesktopServer } = await import('../server/desktop.js');
      const { staticPort } = await startDesktopServer();
      log('桌面服务已启动 staticPort=' + staticPort);
      createWindow(staticPort);
      log('初始化完成');
    } catch (err) {
      log('启动失败：', err && err.stack ? err.stack : String(err));
    }
  })
  .catch((e) => log('whenReady 拒绝:', e && e.stack ? e.stack : String(e)));
