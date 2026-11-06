#!/usr/bin/env node
// 사진/영상을 사이트에 넣어주는 스크립트.
//
//   npm run add -- "<사진 폴더>"                          → 촬영 날짜별로 dives/<날짜>/ 에 자동 분류
//   npm run add -- "<사진 폴더>" --into 2026-08-20-울릉도  → 지정한 다이빙 폴더 하나에 모두 넣기
//   npm run add -- "<사진 폴더>" --daily                  → 다이빙이 아닌 일상 사진: daily/<날짜>/ 에 넣기
//   npm run add -- "<사진 폴더>" --daily --into 2026-10-31-여행
//
// - 사진은 긴 변 2000px JPG로 줄이고, 위치(GPS) 같은 메타데이터는 지움
// - 한 번 넣은 원본 파일은 기억해 두고(scripts/imported.json) 다시 넣지 않음.
//   그래서 사이트에서 지우거나 다른 폴더로 옮긴 사진도 되살아나지 않음
// - 영상(.mp4/.mov)은 ffmpeg가 있으면 720p 무음 루프 클립으로 줄여 clips/ 에 넣음
//   하이라이트 장면은 썸네일(clips/<이름>.jpg)로 같이 만듦

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import exifr from 'exifr';
import { makePoster } from './posters.mjs';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIVES = path.join(ROOT, 'dives');
const DAILY = path.join(ROOT, 'daily');
const MANIFEST = path.join(ROOT, 'scripts', 'imported.json');
const PHOTO_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.tif', '.tiff']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v']);
const MAX_SIDE = 2000;
const CLIP_SECONDS = 20;

function parseArgs(argv) {
  const sources = [];
  let into = null;
  let daily = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--into') into = argv[++i];
    else if (argv[i] === '--daily') daily = true;
    else sources.push(argv[i]);
  }
  return { sources, into, daily };
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

// 원본 파일 내용의 지문. 같은 파일이면 이름·위치가 달라도 같은 값
async function fingerprint(file) {
  return crypto.createHash('sha1').update(await fs.readFile(file)).digest('hex');
}

async function loadManifest() {
  try {
    return new Set(JSON.parse(await fs.readFile(MANIFEST, 'utf8')));
  } catch {
    return new Set();
  }
}

async function saveManifest(seen) {
  await fs.writeFile(MANIFEST, JSON.stringify([...seen].sort(), null, 0) + '\n');
}

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
title: ""            # 제목 (세로로 크게 나옴. 비워두면 장소 이름으로 표시)
# deck: ""           # 한 줄 소개 (글 위에 굵게)
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
draft: true          # 다 채우면 지우거나 false로 (true인 동안 사이트에 '작성 중' 표시)
---

오늘의 기록.
`;

// 다이빙은 dives/<폴더>/photos/, 일상은 daily/<폴더>/ 에 사진이 들어감
async function targetDir(folder, date, daily) {
  if (daily) {
    const dir = path.join(DAILY, folder);
    await fs.mkdir(dir, { recursive: true });
    return { dir, photosDir: dir };
  }
  const dir = path.join(DIVES, folder);
  await fs.mkdir(path.join(dir, 'photos'), { recursive: true });
  const md = path.join(dir, 'index.md');
  try {
    await fs.access(md);
  } catch {
    await fs.writeFile(md, TEMPLATE(date));
    console.log(`  + 새 기록 dives/${folder}/index.md`);
  }
  return { dir, photosDir: path.join(dir, 'photos') };
}

async function freeName(photosDir, base) {
  const taken = new Set((await fs.readdir(photosDir)).map((f) => f.toLowerCase()));
  let name = `${base}.jpg`;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base}_${i}.jpg`;
  return name;
}

async function addPhoto(file, photosDir) {
  const name = await freeName(photosDir, path.parse(file).name);
  // sharp는 기본적으로 메타데이터(GPS 포함)를 저장하지 않음. 색은 sRGB로 맞춤
  await sharp(file)
    .rotate()
    .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
    .toColorspace('srgb')
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(path.join(photosDir, name));
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
    await makePoster(out).catch(() => {});
    console.log('     긴 영상은 유튜브(일부공개)에 올리고 index.md 의 youtube: 에 ID를 적어주세요.');
    return true;
  }
  const { size } = await fs.stat(file);
  if (size > 20 * 1024 * 1024) {
    console.log(`  ! ${path.basename(file)} 은 20MB가 넘어요. 유튜브에 올리는 걸 추천해요.`);
    return false;
  }
  await fs.copyFile(file, out);
  return true;
}

async function main() {
  const { sources, into, daily } = parseArgs(process.argv.slice(2));
  if (!sources.length) {
    console.log('사용법: npm run add -- "<사진 폴더>" [--daily] [--into <폴더 이름>]');
    process.exit(1);
  }

  const files = [];
  for (const src of sources) files.push(...(await listFiles(path.resolve(src))));
  const media = files.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return PHOTO_EXT.has(ext) || VIDEO_EXT.has(ext);
  });

  const seen = await loadManifest();
  const fresh = [];
  for (const f of media) {
    const id = await fingerprint(f);
    if (seen.has(id)) continue;
    seen.add(id); // 같은 파일이 두 폴더에 있어도 한 번만
    fresh.push({ f, id });
  }
  const skipped = media.length - fresh.length;

  // 날짜 순으로 처리해서 결과가 보기 좋게
  const dated = await Promise.all(fresh.map(async (x) => ({ ...x, d: await shotDate(x.f) })));
  dated.sort((a, b) => a.d - b.d);

  let added = 0;
  for (const { f, id, d } of dated) {
    const date = ymd(d);
    const isVideo = VIDEO_EXT.has(path.extname(f).toLowerCase());
    try {
      if (isVideo && daily) {
        console.log(`  - ${path.basename(f)}: 일상 폴더에는 영상을 넣지 않아요`);
        seen.delete(id);
        continue;
      }
      const { dir, photosDir } = await targetDir(into ?? date, date, daily);
      if (isVideo) {
        if (await addVideo(f, dir)) added++;
        else seen.delete(id);
      } else {
        await addPhoto(f, photosDir);
        added++;
      }
    } catch (err) {
      seen.delete(id); // 실패한 건 다음에 다시 시도할 수 있게
      console.log(`  ! ${path.basename(f)} 처리 실패: ${err.message}`);
    }
  }

  await saveManifest(seen);
  console.log(`\n완료: ${added}개 추가, 이미 넣은 파일 ${skipped}개 건너뜀`);
}

main();
