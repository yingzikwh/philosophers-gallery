// 哲思殿堂 · Electron 主进程
// 仅负责「开窗 + 加载前端」；前端托管与后端代理见 server/desktop.js
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { startDesktopServer } from '../server/desktop.js';

// [诊断] 写到确定可写的项目路径，便于在打包后排查 main.js 是否执行
const LOG = 'C:/Users/Administrator/WorkBuddy/2026-07-13-00-07-55/_zs_exe.log';
function log(...a) {
  try {
    fs.appendFileSync(
      LOG,
      a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n'
    );
  } catch {}
}
try { fs.writeFileSync(LOG, ''); } catch {}
log('=== main.js 开始执行 @', new Date().toISOString(), 'electron=', process.versions.electron);

// Electron 主模块是 CJS；本环境下用 ESM 的 import 互操作异常，
// 故通过 createRequire + require 加载，最稳妥。
let app;
let BrowserWindow;
try {
  const require = createRequire(import.meta.url);
  const electron = require('electron');
  app = electron.app;
  BrowserWindow = electron.BrowserWindow;
  log('require(electron) OK; typeof app=', typeof app, 'typeof BrowserWindow=', typeof BrowserWindow);
} catch (e) {
  log('require(electron) 失败:', e && e.message ? e.message : String(e));
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, '..', 'dist');

function createWindow(staticPort) {
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
  win.on('closed', () => {});
}

if (app) {
  app.whenReady()
    .then(async () => {
      try {
        const { staticPort } = await startDesktopServer();
        log('桌面服务已启动 staticPort=', staticPort);
        createWindow(staticPort);
        log('窗口已创建');
      } catch (err) {
        log('启动失败：', err && err.message ? err.message : String(err));
      }
    })
    .catch((e) => log('whenReady 拒绝:', e && e.message ? e.message : String(e)));
} else {
  log('app 不可用，无法启动 Electron 事件循环');
}
