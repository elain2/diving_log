#!/usr/bin/env node
// 영상 썸네일 만들기: clips/<이름>.mp4 옆에 clips/<이름>.jpg
// 영상에서 1초에 2장씩 뽑아, 가장 선명하고 담긴 게 많은 장면(하이라이트)을 고름.
//
//   npm run posters            → 썸네일이 없는 영상만 만들기
//   npm run posters -- --all   → 전부 다시 만들기

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIVES = path.join(ROOT, 'dives');

async function duration(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(stdout.trim()) || 0;
}

/** 영상 하나의 하이라이트 장면을 jpg로 저장 */
export async function makePoster(clip) {
  const out = clip.replace(/\.[^.]+$/, '.jpg');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'poster-'));
  try {
    // 처음·끝 10%는 흔들리거나 물 밖일 때가 많아서 뺌
    const len = await duration(clip);
    const start = len * 0.1;
    const span = Math.max(len * 0.8, 0.5);
    await run('ffmpeg', [
      '-v', 'error', '-ss', String(start), '-t', String(span), '-i', clip,
      '-vf', 'fps=2,scale=-2:360', '-q:v', '4', path.join(tmp, 'f%03d.jpg'),
    ]);
    const frames = (await fs.readdir(tmp)).filter((f) => f.endsWith('.jpg')).sort();
    if (!frames.length) return null;

    let best = { score: -1, i: 0 };
    for (const [i, f] of frames.entries()) {
      const s = await sharp(path.join(tmp, f)).stats();
      // 선명도 × 정보량, 너무 어둡거나 하얗게 날아간 장면은 깎음
      const mean = s.channels.slice(0, 3).reduce((a, c) => a + c.mean, 0) / 3;
      const exposure = 1 - Math.abs(mean - 120) / 160;
      const score = s.sharpness * s.entropy * Math.max(exposure, 0.1);
      if (score > best.score) best = { score, i };
    }

    // 고른 순간을 원래 크기로 다시 뽑기
    const at = start + best.i / 2;
    await run('ffmpeg', ['-v', 'error', '-y', '-ss', String(at), '-i', clip, '-frames:v', '1', '-vf', 'scale=-2:720', '-q:v', '3', out]);
    return out;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

async function main() {
  const all = process.argv.includes('--all');
  let made = 0;
  for (const dive of await fs.readdir(DIVES)) {
    const dir = path.join(DIVES, dive, 'clips');
    let files;
    try { files = await fs.readdir(dir); } catch { continue; }
    for (const f of files.filter((x) => /\.(mp4|mov|webm)$/i.test(x))) {
      const clip = path.join(dir, f);
      const jpg = clip.replace(/\.[^.]+$/, '.jpg');
      if (!all && (await fs.stat(jpg).catch(() => null))) continue;
      if (await makePoster(clip)) {
        made++;
        console.log(`  🖼  ${dive}/clips/${path.basename(jpg)}`);
      }
    }
  }
  console.log(made ? `완료: 썸네일 ${made}개` : '새로 만들 썸네일이 없어요.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
