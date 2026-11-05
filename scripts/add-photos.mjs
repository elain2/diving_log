#!/usr/bin/env node
// 사진/영상을 다이빙 폴더에 넣어주는 스크립트.
//
//   npm run add -- "<사진 폴더>"                 → 촬영 날짜별로 dives/<날짜>/ 에 자동 분류
//   npm run add -- "<사진 폴더>" --into 2026-08-20-울릉도   → 지정한 폴더 하나에 모두 넣기
//
// - 사진은 긴 변 2000px JPG로 줄이고, 위치(GPS) 같은 메타데이터는 지움
// - 이미 들어있는 것과 같은 사진(내용 기준)은 건너뜀
// - 영상(.mp4/.mov)은 ffmpeg가 있으면 720p 무음 루프 클립으로 줄여 clips/ 에 넣음

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import exifr from 'exifr';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIVES = path.join(ROOT, 'dives');
const PHOTO_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.tif', '.tiff']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v']);
const MAX_SIDE = 2000;
const CLIP_SECONDS = 20;

function parseArgs(argv) {
  const sources = [];
  let into = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--into') into = argv[++i];
    else sources.push(argv[i]);
  }
  return { sources, into };
}

async function listFiles(dir) {
  const out = [];
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.') || ent.name.startsWith('_')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...(await listFiles(full)));
    else out.push(full);
  }
  return out;
}

// 16x16 흑백 평균 해시: 크기·압축이 달라도 같은 사진이면 거의 같은 값
async function photoHash(file) {
  const px = await sharp(file).rotate().resize(16, 16, { fit: 'fill' }).grayscale().raw().toBuffer();
  const avg = px.reduce((a, b) => a + b, 0) / px.length;
  return Array.from(px, (v) => (v > avg ? '1' : '0')).join('');
}

function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

const isDuplicate = (hash, known) => known.some((h) => hamming(h, hash) <= 6);

async function shotDate(file) {
  try {
    const exif = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate']);
    const d = exif?.DateTimeOriginal ?? exif?.CreateDate;
    if (d instanceof Date && !isNaN(d)) return d;
  } catch {
    // EXIF가 없는 파일은 아래에서 파일 수정 날짜를 씀
  }
  return (await fs.stat(file)).mtime;
}

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const TEMPLATE = (date) => `---
title: ""            # 제목 (비워두면 장소 이름으로 표시)
date: ${date}
location: ""         # 장소 예: 제주 서귀포 / 딥스테이션
type: freedive       # freedive(프리다이빙) | scuba(스쿠버)
place: sea           # sea(바다) | pool(수영장)
maxDepth:            # 최대 수심 (m, 숫자만)
# time: 2h           # 다이빙 시간
# waterTemp: 22      # 수온 (°C)
# visibility: 15     # 시야 (m)
# buddy: ""          # 버디
# discipline: CWT    # 프리다이빙 종목 (CWT, FIM, CNF, STA, DYN ...)
# cover: 사진파일.jpg  # 대표 사진 (생략하면 첫 사진)
# youtube: [영상ID]   # 유튜브 영상 (주소의 v= 뒤 11글자)
# mood: 🐟           # 스탬프에 찍힐 이모지 하나
draft: true          # 다 채우면 지우거나 false로 (true인 동안 사이트에 '작성 중' 표시)
---

오늘의 기록.
`;

async function ensureDive(folder, date) {
  const dir = path.join(DIVES, folder);
  await fs.mkdir(path.join(dir, 'photos'), { recursive: true });
  const md = path.join(dir, 'index.md');
  try {
    await fs.access(md);
  } catch {
    await fs.writeFile(md, TEMPLATE(date));
    console.log(`  + 새 기록 ${folder}/index.md`);
  }
  return dir;
}

async function existingHashes(photosDir) {
  const hashes = [];
  const names = new Set();
  for (const f of await fs.readdir(photosDir).catch(() => [])) {
    if (!PHOTO_EXT.has(path.extname(f).toLowerCase())) continue;
    names.add(f.toLowerCase());
    hashes.push(await photoHash(path.join(photosDir, f)));
  }
  return { hashes, names };
}

function freeName(base, names) {
  const ext = '.jpg';
  let name = `${base}${ext}`;
  for (let i = 2; names.has(name.toLowerCase()); i++) name = `${base}_${i}${ext}`;
  names.add(name.toLowerCase());
  return name;
}

async function addPhoto(file, dir, cache) {
  const photosDir = path.join(dir, 'photos');
  if (!cache.has(photosDir)) cache.set(photosDir, await existingHashes(photosDir));
  const known = cache.get(photosDir);
  const hash = await photoHash(file);
  if (isDuplicate(hash, known.hashes)) return 'dup';
  const name = freeName(path.parse(file).name, known.names);
  // sharp는 기본적으로 메타데이터(GPS 포함)를 저장하지 않음. 색 프로필만 sRGB로 유지
  await sharp(file)
    .rotate()
    .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
    .toColorspace('srgb')
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(path.join(photosDir, name));
  known.hashes.push(hash);
  return name;
}

async function hasFfmpeg() {
  try {
    await run('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

async function addVideo(file, dir) {
  const clipsDir = path.join(dir, 'clips');
  await fs.mkdir(clipsDir, { recursive: true });
  const out = path.join(clipsDir, `${path.parse(file).name}.mp4`);
  if (await hasFfmpeg()) {
    await run('ffmpeg', [
      '-y', '-i', file, '-t', String(CLIP_SECONDS), '-an',
      '-vf', 'scale=-2:720', '-c:v', 'libx264', '-crf', '28', '-preset', 'slow',
      '-movflags', '+faststart', '-map_metadata', '-1', out,
    ]);
    console.log(`  🎞  ${path.basename(out)} (앞 ${CLIP_SECONDS}초, 무음 클립)`);
    console.log(`     긴 영상은 유튜브(일부공개)에 올리고 index.md 의 youtube: 에 ID를 적어주세요.`);
  } else {
    const { size } = await fs.stat(file);
    if (size > 20 * 1024 * 1024) {
      console.log(`  ! ${path.basename(file)} 은 20MB가 넘어요. 유튜브에 올리는 걸 추천해요.`);
      return;
    }
    await fs.copyFile(file, out);
  }
}

async function main() {
  const { sources, into } = parseArgs(process.argv.slice(2));
  if (!sources.length) {
    console.log('사용법: npm run add -- "<사진 폴더>" [--into <다이빙 폴더 이름>]');
    process.exit(1);
  }

  const files = [];
  for (const src of sources) files.push(...(await listFiles(path.resolve(src))));
  const cache = new Map();
  let added = 0;
  let dups = 0;

  // 날짜 순으로 처리해서 결과가 보기 좋게
  const dated = await Promise.all(files.map(async (f) => ({ f, d: await shotDate(f) })));
  dated.sort((a, b) => a.d - b.d);

  for (const { f, d } of dated) {
    const ext = path.extname(f).toLowerCase();
    if (!PHOTO_EXT.has(ext) && !VIDEO_EXT.has(ext)) continue;
    const date = ymd(d);
    const dir = await ensureDive(into ?? date, date);
    try {
      if (VIDEO_EXT.has(ext)) {
        await addVideo(f, dir);
        added++;
        continue;
      }
      const result = await addPhoto(f, dir, cache);
      if (result === 'dup') dups++;
      else added++;
    } catch (err) {
      console.log(`  ! ${path.basename(f)} 처리 실패: ${err.message}`);
    }
  }
  console.log(`\n완료: ${added}개 추가, 중복 ${dups}개 건너뜀`);
}

main();
