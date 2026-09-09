// 哲思殿堂 · 桌面模式 HTTP 服务（纯 Node，不依赖 Electron）
// 职责：
//  1. 在当前进程内启动本地后端（./index.js，监听 apiPort）
//  2. 启动静态服务器（staticPort）托管 dist/
//  3. 将 /sb-api 与 /api 请求代理到本地后端（apiPort）
// 抽成独立模块，便于在无界面的环境单独做 HTTP 冒烟测试。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

function proxyToApi(req, res, targetPath, apiPort) {
  const options = {
    host: '127.0.0.1',
    port: apiPort,
    path: targetPath,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${apiPort}` },
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '后端服务不可用，请确认应用已正常启动' }));
    } else {
      res.end();
    }
  });
  req.pipe(proxyReq);
}

function serveStatic(req, res, distDir) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(distDir, urlPath));
  if (!filePath.startsWith(distDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      const fallback = path.join(distDir, 'index.html');
      fs.readFile(fallback, (e, data) => {
        if (e) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not found');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(data);
        }
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

/**
 * 启动桌面模式服务。
 * @returns Promise<{ staticPort, apiPort }>
 */
export async function startDesktopServer({ apiPort = 3016, staticPort = 4173, distDir } = {}) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const DIST_DIR = distDir || path.join(__dirname, '..', 'dist');

  // 桌面/打包模式（Electron）：asar 为只读，进度、原著缓存等可写数据必须
  // 重定向到用户数据目录（app.getPath('userData')/data），否则写入只读 asar 会失败。
  // 该目录在 app 就绪后一定可写；需在启动后端之前设置，后端会读取此变量。
  if (process.versions.electron) {
    try {
      const require = createRequire(import.meta.url);
      const electron = require('electron');
      const userData = electron.app.getPath('userData');
      process.env.ZS_DATA_DIR = path.join(userData, 'data');
      fs.mkdirSync(process.env.ZS_DATA_DIR, { recursive: true });
      console.log(`[桌面模式] 可写数据目录：${process.env.ZS_DATA_DIR}`);
    } catch (e) {
      console.warn('[桌面模式] 无法确定可写数据目录，进度可能无法持久保存：', e?.message);
    }
  }

  // 后端监听端口由 ./index.js 读取 process.env.PORT 决定，提前设置
  process.env.PORT = String(apiPort);

  // 启动本地后端（同一进程）
  await import('./index.js');

  const staticServer = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0];
    if (urlPath.startsWith('/sb-api')) {
      proxyToApi(req, res, urlPath.slice('/sb-api'.length) || '/', apiPort);
    } else if (urlPath.startsWith('/api')) {
      proxyToApi(req, res, urlPath, apiPort);
    } else {
      serveStatic(req, res, DIST_DIR);
    }
  });

  return new Promise((resolve) => {
    staticServer.listen(staticPort, () => {
      resolve({ staticPort, apiPort });
    });
  });
}

// 直接以 `node server/desktop.js` 运行时的自启动（便于无界面冒烟测试）
if (import.meta.url === `file://${process.argv[1]}`) {
  startDesktopServer().then(({ staticPort, apiPort }) => {
    console.log(`[桌面模式] 前端 http://127.0.0.1:${staticPort}  后端 :${apiPort}`);
  });
}
