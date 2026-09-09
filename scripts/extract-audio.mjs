/**
 * 从视频中抽取音轨 -> public/voices/{id}.mp3
 * ------------------------------------------------------------
 * 用途：把「你自己拥有合法授权」的视频素材转成对话页可用的音频。
 *
 * ⚠️ 合规提醒（请务必遵守）：
 *   - 只处理你拥有权利或明确可自由使用的素材（自有录像、公有领域档案、CC 授权等）。
 *   - 请勿用本工具处理受版权保护的新闻/纪录片/影视片段，尤其不要用于
 *     提取国家领导人的原声再配合 AI 生成对话 —— 那可能构成声音仿冒与合规风险。
 *   - 古代哲学家的本人口吻在物理上不存在（录音技术发明前已去世），
 *     他们应使用 scripts/fetch-voices.mjs 抓取的「原著有声书」，而非本工具。
 *
 * 前置：需安装 ffmpeg 并加入 PATH（https://ffmpeg.org/download.html）
 *
 * 用法：
 *   1) 把视频放进 media/ 目录下，文件名=哲学家 id，如 media/plato.mp4
 *   2) node scripts/extract-audio.mjs
 *   # 指定目录 / 只转单个 / 截取片段
 *   node scripts/extract-audio.mjs --dir media --only mao
 *   node scripts/extract-audio.mjs --start 00:00:10 --duration 20   # 从第10秒起取20秒
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = join(ROOT, 'public/voices');

const VIDEO_EXT = ['.mp4', '.mkv', '.webm', '.mov', '.avi', '.flv', '.m4v', '.wmv'];

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (k, d) => {
    const i = a.indexOf(k);
    return i >= 0 && a[i + 1] ? a[i + 1] : d;
  };
  return {
    dir: get('--dir', join(ROOT, 'media')),
    only: get('--only', null),
    start: get('--start', null),
    duration: get('--duration', null),
  };
}

function hasFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  return r.status === 0;
}

function main() {
  const { dir, only, start, duration } = parseArgs();

  if (!hasFfmpeg()) {
    console.error('❌ 未检测到 ffmpeg。请先安装并加入 PATH：https://ffmpeg.org/download.html');
    process.exit(1);
  }
  if (!existsSync(dir)) {
    console.error(`❌ 找不到目录：${dir}\n   请把视频放进该目录（文件名=哲学家 id，如 plato.mp4）`);
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const files = readdirSync(dir)
    .filter((f) => VIDEO_EXT.includes(extname(f).toLowerCase()))
    .filter((f) => (only ? basename(f, extname(f)) === only : true))
    .filter((f) => statSync(join(dir, f)).isFile());

  if (files.length === 0) {
    console.log(`目录 ${dir} 里没有可处理的视频（支持 ${VIDEO_EXT.join(' / ')}）`);
    return;
  }

  const ok = [];
  const fail = [];

  for (const f of files) {
    const id = basename(f, extname(f));
    const src = join(dir, f);
    const dst = join(OUT_DIR, `${id}.mp3`);

    const args = ['-y', '-i', src, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-ar', '44100', '-ac', '1'];
    if (start) args.push('-ss', start);
    if (duration) args.push('-t', String(duration));
    args.push(dst);

    process.stdout.write(`[${id}] 抽取音轨... `);
    try {
      execFileSync('ffmpeg', args, { stdio: 'ignore' });
      const mb = (statSync(dst).size / 1024 / 1024).toFixed(2);
      console.log(`OK -> public/voices/${id}.mp3 (${mb} MB)`);
      ok.push(id);
    } catch (e) {
      console.log(`失败: ${e.message.split('\n')[0]}`);
      fail.push(id);
    }
  }

  console.log('\n===== 汇总 =====');
  console.log(`成功 ${ok.length} 个${ok.length ? '：' + ok.join(', ') : ''}`);
  if (fail.length) console.log(`失败 ${fail.length} 个：${fail.join(', ')}`);
  if (ok.length) {
    console.log('\n提示：重新构建前端后，对话页对应哲学家的音频按钮即可播放。');
    console.log('（这些素材应标注为「原著朗读/授权素材」，不要标为本人「原声」）');
  }
}

main();
