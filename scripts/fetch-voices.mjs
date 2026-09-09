/**
 * 抓取「原著有声书」到本地 public/voices/
 * ------------------------------------------------------------
 * ⚠️ 重要说明：
 *  1. 本项目沙盒网络被防火墙拦截（TCP 443 到 archive.org / librivox.org 超时），
 *     所以本脚本必须在**你自己的电脑**上运行（有正常网络）。
 *  2. 抓取的是 LibriVox 的「公有领域有声书」——即**朗诵者朗读该哲学家的著作**，
 *     不是哲学家本人的声音。苏格拉底 / 柏拉图 / 孔子等人生活在录音技术发明之前，
 *     他们的真实原声在物理上不存在，任何"原声"都只可能是 AI 合成或演员配音。
 *  3. 20 世纪的哲学家（加缪 / 萨特 / 海德格尔 / 维特根斯坦 / 福柯 等）仍在版权保护期内，
 *     LibriVox 没有收录，脚本会提示"未找到"，这些只能继续用 AI 朗读(TTS)。
 *
 * 用法（在本机项目根目录执行）：
 *   node scripts/fetch-voices.mjs              # 抓取全部
 *   node scripts/fetch-voices.mjs plato laozi  # 只抓指定 id
 *
 * 抓取成功后，对话页的「听原声」按钮即可播放（缺失时自动降级为 AI 朗读）。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../public/voices');

/** 哲学家 id -> LibriVox 检索用的书名（公有领域著作） */
const TARGETS = {
  // 古希腊 / 古罗马
  plato: 'Republic',
  aristotle: 'Nicomachean Ethics',
  socrates: 'Apology',
  marcus_aurelius: 'Meditations',
  epictetus: 'Enchiridion',
  seneca: 'On the Shortness of Life',
  plotinus: 'Enneads',
  pyrrho: 'Outlines of Pyrrhonism',

  // 中国 / 东方
  confucius: 'Analects',
  laozi: 'Tao Te Ching',
  zhuangzi: 'Zhuangzi',
  mencius: 'Mencius',
  huineng: 'Platform Sutra',
  buddha: 'Dhammapada',
  upanishads: 'Upanishads',
  nagarjuna: 'Madhyamaka',

  // 中世纪 / 近代
  augustine: 'Confessions',
  aquinas: 'Summa Theologica',
  descartes: 'Discourse on Method',
  spinoza: 'Ethics',
  leibniz: 'Monadology',
  pascal: 'Pensees',
  locke: 'Two Treatises of Government',
  berkeley: 'Principles of Human Knowledge',
  hume: 'Enquiry Concerning Human Understanding',
  rousseau: 'Social Contract',
  voltaire: 'Candide',
  kant: 'Critique of Pure Reason',
  hegel: 'Phenomenology of Spirit',
  schopenhauer: 'Studies in Pessimism',
  bentham: 'Principles of Morals and Legislation',
  mill: 'On Liberty',
  comte: 'Positive Philosophy',
  feuerbach: 'Essence of Christianity',
  marx: 'Communist Manifesto',
  kierkegaard: 'Fear and Trembling',
  nietzsche: 'Thus Spoke Zarathustra',
};

/** 查询 LibriVox API，取第一本书的 RSS 地址 */
async function findRss(title) {
  const url = `https://librivox.org/api/feed/audiobooks?title=${encodeURIComponent(title)}&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const book = data.books?.[0];
  if (!book) return null;
  return { rss: book.url_rss, title: book.title };
}

/** 从 RSS 里解析出第一个 mp3 直链 */
async function firstMp3FromRss(rssUrl) {
  const res = await fetch(rssUrl);
  if (!res.ok) return null;
  const xml = await res.text();
  const m = xml.match(/<enclosure[^>]+url="([^"]+\.mp3)"/i);
  return m ? m[1] : null;
}

async function downloadMp3(mp3Url, dest) {
  const res = await fetch(mp3Url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error('文件过小，可能不是有效音频');
  await writeFile(dest, buf);
  return buf.length;
}

async function main() {
  const only = process.argv.slice(2);
  const ids = only.length ? only : Object.keys(TARGETS);

  await mkdir(OUT_DIR, { recursive: true });

  const ok = [];
  const skipped = [];
  const failed = [];

  for (const id of ids) {
    const title = TARGETS[id];
    if (!title) {
      skipped.push(`${id} (该哲学家无公有领域有声书，继续使用 AI 朗读)`);
      continue;
    }
    const dest = resolve(OUT_DIR, `${id}.mp3`);
    if (existsSync(dest)) {
      skipped.push(`${id} (已存在，跳过)`);
      continue;
    }

    try {
      process.stdout.write(`[${id}] 检索《${title}》... `);
      const found = await findRss(title);
      if (!found) {
        console.log('未找到');
        failed.push(`${id} (LibriVox 无此公有领域有声书)`);
        continue;
      }
      const mp3 = await firstMp3FromRss(found.rss);
      if (!mp3) {
        console.log('RSS 中无 mp3');
        failed.push(`${id} (解析失败)`);
        continue;
      }
      const size = await downloadMp3(mp3, dest);
      console.log(`OK ${(size / 1024 / 1024).toFixed(1)} MB  (${found.title})`);
      ok.push(id);
    } catch (e) {
      console.log(`失败: ${e.message}`);
      failed.push(`${id} (${e.message})`);
    }
  }

  console.log('\n===== 汇总 =====');
  console.log(`成功: ${ok.length} 个 -> ${OUT_DIR}`);
  if (skipped.length) console.log(`跳过: ${skipped.length} 个\n  - ${skipped.join('\n  - ')}`);
  if (failed.length) console.log(`未找到/失败: ${failed.length} 个\n  - ${failed.join('\n  - ')}`);
  if (ok.length) {
    console.log('\n提示：这些是「朗诵者朗读其著作」，不是哲学家本人的声音。');
    console.log('抓取完成后请重新构建前端，界面即可播放。');
  }
}

main().catch((e) => {
  console.error('脚本出错:', e.message);
  process.exit(1);
});
