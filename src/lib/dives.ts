import type { ImageMetadata } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { t, type Lang } from './i18n';

// dives/<폴더>/photos 안의 사진을 모두 찾아서 폴더별로 묶음
const photoFiles = import.meta.glob<ImageMetadata>(
  '/dives/*/photos/*.{jpg,jpeg,JPG,JPEG,png,PNG,webp,WEBP}',
  { eager: true, import: 'default' },
);
const clipFiles = import.meta.glob<string>('/dives/*/clips/*.{mp4,MP4,webm,mov,MOV}', {
  eager: true,
  query: '?url',
  import: 'default',
});
// 영상 썸네일: clips/<이름>.jpg (npm run posters 가 하이라이트 장면으로 만듦)
const posterFiles = import.meta.glob<ImageMetadata>('/dives/*/clips/*.{jpg,jpeg,JPG,JPEG}', {
  eager: true,
  import: 'default',
});

export interface Clip {
  src: string;
  poster?: ImageMetadata;
}

export interface Photo {
  src: ImageMetadata;
  file: string;
  /** 파일 이름에 -me : 내가 나온 사진 */
  isMe: boolean;
  /** 파일 이름에 -pick : 고른 컷 (사진 페이지에 빨간 동그라미) */
  isPick: boolean;
  /** 내가 찍은 사진: 라이트룸에서 내보낸 YOUNG-…, 카메라 원본 KYG…, 또는 이름에 -byme */
  isByMe: boolean;
}

export interface Dive {
  id: string;
  no: number;
  entry: CollectionEntry<'dives'>;
  data: CollectionEntry<'dives'>['data'];
  title: string;
  location?: string;
  buddy?: string;
  /** 글을 렌더링할 항목 (영어 글이 있으면 영어) */
  bodyEntry: CollectionEntry<'dives'> | CollectionEntry<'divesEn'>;
  photos: Photo[];
  clips: Clip[];
  /** 사진이 없을 때 대신 쓸 첫 영상 썸네일 */
  poster?: ImageMetadata;
  cover?: Photo;
  /** 대표 사진 파일 경로 (강조색 뽑을 때 씀) */
  coverPath?: string;
  deck?: string;
  hasEnglish: boolean;
}

const natural = new Intl.Collator('en', { numeric: true }).compare;
const folderOf = (key: string) => key.split('/')[2];
const fileOf = (key: string) => key.split('/').pop()!;
// 파일 이름 속 표시: YOUNG-12-me.jpg, YOUNG-12-pick.jpg, YOUNG-12-me-pick.jpg
const tokensOf = (name: string) => name.replace(/\.[a-z0-9]+$/i, '').toLowerCase().split(/[-_ ]/);
export function toPhoto(src: ImageMetadata, file: string): Photo {
  const tokens = tokensOf(file);
  return {
    src,
    file,
    isMe: tokens.includes('me'),
    isPick: tokens.includes('pick'),
    isByMe: /^(young|kyg)/i.test(file) || tokens.includes('byme'),
  };
}
export const byName = (a: Photo, b: Photo) => natural(a.file, b.file);

function photosFor(id: string): Photo[] {
  return Object.entries(photoFiles)
    .filter(([k]) => folderOf(k) === id)
    .map(([k, src]) => toPhoto(src, fileOf(k)))
    .sort(byName);
}

function clipsFor(id: string) {
  return Object.entries(clipFiles)
    .filter(([k]) => folderOf(k) === id)
    .sort(([a], [b]) => natural(a, b))
    .map(([k, src]) => ({ src, poster: posterFiles[k.replace(/\.[^.]+$/, '.jpg')] }));
}

let cache: Promise<{ entries: CollectionEntry<'dives'>[]; en: Map<string, CollectionEntry<'divesEn'>> }>;
function load() {
  cache ??= (async () => {
    const entries = (await getCollection('dives')).sort((a, b) => a.data.date.getTime() - b.data.date.getTime());
    const en = new Map((await getCollection('divesEn')).map((e) => [e.id, e]));
    return { entries, en };
  })();
  return cache;
}

/** 오래된 순으로 번호를 매긴 다이빙 목록 (반환은 최신순) */
export async function getDives(lang: Lang): Promise<Dive[]> {
  const { entries, en } = await load();
  return entries
    .map((entry, i) => {
      const d = entry.data;
      const english = lang === 'en' ? en.get(entry.id) : undefined;
      const photos = photosFor(entry.id);
      const location = english?.data.location ?? d.location;
      const fallback = t(lang, d.place === 'pool' ? 'untitledPool' : 'untitledSea');
      const cover = photos.find((p) => p.file === d.cover) ?? photos[0];
      const clips = clipsFor(entry.id);
      return {
        id: entry.id,
        no: i + 1,
        entry,
        data: d,
        title: english?.data.title ?? d.title ?? location ?? fallback,
        location,
        buddy: english?.data.buddy ?? d.buddy,
        bodyEntry: english?.body?.trim() ? english : entry,
        photos,
        clips,
        poster: clips.find((c) => c.poster)?.poster,
        cover,
        coverPath: cover ? `dives/${entry.id}/photos/${cover.file}` : undefined,
        deck: english?.data.deck ?? d.deck,
        hasEnglish: Boolean(english),
      };
    })
    .reverse();
}

export function stats(dives: Dive[]) {
  const depths = dives.map((d) => d.data.maxDepth).filter((n): n is number => typeof n === 'number');
  return {
    days: dives.length,
    deepest: depths.length ? Math.max(...depths) : undefined,
    sea: dives.filter((d) => d.data.place === 'sea').length,
    pool: dives.filter((d) => d.data.place === 'pool').length,
    photos: dives.reduce((n, d) => n + d.photos.length, 0),
  };
}

/** 사진 기울기: 같은 사진은 항상 같은 각도 (새로고침해도 안 바뀜) */
export function tilt(seed: string, max = 3) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 1000) / 1000) * max * 2 - max;
}

