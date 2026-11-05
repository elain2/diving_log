#!/usr/bin/env node
// 고친 내용을 한 번에 사이트에 올리는 스크립트.
//
//   npm run save                → 확인 → 커밋 → GitHub에 올리기 (몇 분 뒤 사이트 반영)
//   npm run save -- "메모"       → 커밋 메시지에 메모 붙이기
//   npm run save -- --dry       → 올리지 않고 무엇이 바뀌었는지만 보기
//
// 올리기 전에:
// - 기록 파일(index.md)에 틀린 값이 있으면 멈추고 알려줌
// - 직접 넣은 사진이 크거나 위치 정보가 있으면 자동으로 줄이고 지움

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const note = args.filter((a) => a !== '--dry').join(' ').trim();
const PHOTO = /\.(jpe?g|png|webp)$/i;
const MAX_SIDE = 2000;

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const say = (s) => console.log(s);

function changedFiles() {
  // -z: 한글 파일 이름도 그대로
  const out = git('status', '--porcelain', '-z', '--untracked-files=all');
  const files = [];
  const parts = out.split('\0').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const status = parts[i].slice(0, 2);
    const file = parts[i].slice(3);
    if (status[0] === 'R') i++; // 이름 바꾼 경우 다음 칸은 옛 이름
    files.push({ status, file });
  }
  return files;
}

// 직접 넣은 사진: 너무 크거나 메타데이터(GPS 등)가 있으면 사이트용으로 정리
async function tidyPhoto(rel) {
  const file = path.join(ROOT, rel);
  const meta = await sharp(file).metadata();
  const big = Math.max(meta.width ?? 0, meta.height ?? 0) > MAX_SIDE;
  if (!big && !meta.exif && !meta.xmp && !meta.iptc) return false;
  const buf = await sharp(file)
    .rotate()
    .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
    .toColorspace('srgb')
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const out = file.replace(/\.(png|webp)$/i, '.jpg');
  await fs.writeFile(out, buf);
  if (out !== file) await fs.rm(file);
  return true;
}

// 커밋 메시지용: 바뀐 기록 이름들 (dives/2026-08-15/… → 2026-08-15)
function summarize(files) {
  const names = new Set();
  for (const { file } of files) {
    const [top, sub] = file.split('/');
    if ((top === 'dives' || top === 'daily') && sub) names.add(sub);
    else if (/^about/.test(top)) names.add('about');
    else names.add(top);
  }
  const list = [...names];
  return list.length > 4 ? `${list.slice(0, 4).join(', ')} 외 ${list.length - 4}개` : list.join(', ');
}

async function main() {
  let files = changedFiles();
  let ahead = 0;
  try {
    ahead = Number(git('rev-list', '--count', '@{u}..HEAD').trim());
  } catch {
    // 아직 GitHub에 연결 안 된 브랜치
  }
  if (!files.length && !ahead) {
    say('바뀐 게 없어요. 이미 다 올라가 있어요.');
    return;
  }

  // 1. 직접 넣은 사진 정리
  const photos = files.filter((f) => f.status !== ' D' && PHOTO.test(f.file) && /^(dives|daily)\//.test(f.file));
  let tidied = 0;
  for (const p of photos) {
    if (!dry && (await tidyPhoto(p.file))) tidied++;
  }
  if (tidied) say(`📷 사진 ${tidied}장을 사이트용으로 줄이고 위치 정보를 지웠어요.`);

  // 2. 기록 파일 검사 (날짜 형식, 숫자 칸 등)
  say('🔎 기록 파일 확인 중…');
  try {
    execFileSync('npx', ['astro', 'sync'], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });
  } catch (err) {
    say('\n✋ 기록 파일에 고칠 곳이 있어서 멈췄어요:\n');
    const msg = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    say(msg.split('\n').filter((l) => /error|Error|→|\*\*|:\s/.test(l)).slice(0, 15).join('\n') || msg);
    say('\n해당 index.md 를 고친 뒤 다시 npm run save 해주세요.');
    process.exit(1);
  }

  files = changedFiles();
  if (files.length) {
    say('\n바뀐 것:');
    for (const { status, file } of files.slice(0, 20)) {
      const mark = status.includes('D') ? '－ 삭제' : status.includes('?') || status.includes('A') ? '＋ 추가' : '✎ 수정';
      say(`  ${mark}  ${file}`);
    }
    if (files.length > 20) say(`  … 외 ${files.length - 20}개`);
  }
  if (ahead) say(`\n아직 안 올린 커밋 ${ahead}개도 같이 올라가요.`);

  if (dry) {
    say('\n(--dry: 올리지 않았어요)');
    return;
  }

  // 3. 커밋 (커밋 시간 훅도 여기서 적용됨) → 올리기
  if (files.length) {
    git('add', '-A');
    const msg = `docs: update ${summarize(files)}${note ? `\n\n${note}` : ''}`;
    execFileSync('git', ['commit', '-q', '-m', msg], { cwd: ROOT, stdio: 'inherit' });
  }
  say('\n⬆️  올리는 중…');
  execFileSync('git', ['push', '-q'], { cwd: ROOT, stdio: 'inherit' });
  say('\n✅ 올렸어요! 2~3분 뒤 사이트에 반영돼요.');
  say('   https://elain2.github.io/young_diving_log/');
}

main().catch((err) => {
  say(`\n문제가 생겼어요: ${err.message}`);
  process.exit(1);
});
