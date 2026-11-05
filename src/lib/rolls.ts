import type { ImageMetadata } from 'astro';
import { getDives, toPhoto, byName, type Photo } from './dives';
import { t, type Lang } from './i18n';

// 사진 페이지의 '롤(필름 한 통)' = 다이빙 하루 또는 일상 폴더 하나
export interface Roll {
  id: string;
  no: number;
  kind: 'dive' | 'daily';
  date: Date;
  title: string;
  photos: Photo[];
  /** 다이빙 롤이면 그 날의 로그 페이지 경로 */
  logPath?: string;
  place?: 'sea' | 'pool';
}

// daily/<폴더>/ 안의 사진들
const dailyFiles = import.meta.glob<ImageMetadata>(
  '/daily/*/*.{jpg,jpeg,JPG,JPEG,png,PNG,webp,WEBP}',
  { eager: true, import: 'default' },
);

/** 폴더 이름 "2026-10-31-오키나와-여행" → 날짜 + "오키나와 여행" */
function parseFolder(id: string, lang: Lang) {
  const m = id.match(/^(\d{4})-(\d{2})-(\d{2})(?:[-_ ](.+))?$/);
  if (!m) return { date: new Date(0), title: id.replace(/[-_]/g, ' ') };
  return {
    date: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])),
    title: m[4]?.replace(/[-_]/g, ' ') ?? t(lang, 'daily'),
  };
}

function dailyRolls(lang: Lang): Omit<Roll, 'no'>[] {
  const byFolder = new Map<string, Photo[]>();
  for (const [key, src] of Object.entries(dailyFiles)) {
    const [, , folder, file] = key.split('/');
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), toPhoto(src, file)]);
  }
  return [...byFolder].map(([id, photos]) => ({
    id,
    kind: 'daily' as const,
    ...parseFolder(id, lang),
    photos: photos.sort(byName),
  }));
}

/** 다이빙 + 일상 롤, 오래된 순으로 번호를 매기고 최신순으로 돌려줌 */
export async function getRolls(lang: Lang): Promise<Roll[]> {
  const dives = await getDives(lang);
  const diveRolls: Omit<Roll, 'no'>[] = dives
    .filter((d) => d.photos.length > 0)
    .map((d) => ({
      id: d.id,
      kind: 'dive',
      date: d.data.date,
      title: d.title,
      photos: d.photos,
      logPath: `dives/${d.id}`,
      place: d.data.place,
    }));
  return [...diveRolls, ...dailyRolls(lang)]
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id))
    .map((r, i) => ({ ...r, no: i + 1 }))
    .reverse();
}
