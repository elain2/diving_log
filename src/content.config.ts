import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 폴더 이름(예: 2026-08-20-울릉도)이 그대로 주소가 됨
const folderId = ({ entry }: { entry: string }) => entry.split('/')[0];

// YAML에서 값을 비워두면 null이 되므로 null도 '없음'으로 받아줌
const optNum = z.number().nullish().transform((v) => v ?? undefined);
const optStr = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v == null || v === '' ? undefined : String(v)));
const strList = z
  .union([z.string(), z.array(z.string())])
  .nullish()
  .transform((v) => (v == null ? [] : Array.isArray(v) ? v : [v]));

const dives = defineCollection({
  loader: glob({ base: './dives', pattern: '*/index.md', generateId: folderId }),
  schema: z.object({
    title: optStr,
    deck: optStr, // 부제 (제목 아래 한두 줄)
    date: z.coerce.date(),
    location: optStr,
    type: z.enum(['freedive', 'scuba']).default('freedive'),
    place: z.enum(['sea', 'pool']).default('sea'),
    maxDepth: optNum,
    time: optStr,
    waterTemp: optNum,
    visibility: optNum,
    buddy: optStr,
    discipline: optStr,
    cover: optStr,
    youtube: strList,
    mood: optStr,
    draft: z.boolean().default(false),
  }),
});

// 영어 버전: 바꾸고 싶은 글자만 적으면 나머지는 한국어 기록을 따라감
const divesEn = defineCollection({
  loader: glob({ base: './dives', pattern: '*/index.en.md', generateId: folderId }),
  schema: z.object({
    title: optStr,
    deck: optStr,
    location: optStr,
    buddy: optStr,
  }),
});

const about = defineCollection({
  loader: glob({
    base: '.',
    pattern: ['about.md', 'about.en.md'],
    generateId: ({ entry }) => (entry.includes('.en.') ? 'en' : 'ko'),
  }),
  schema: z.object({
    name: z.string(),
    tagline: optStr,
    since: optStr, // 다이빙 시작한 날 예: 2025-01 (달까지만 적으면 달까지만 보여줌)
    photo: optStr, // dives/ 안의 사진 경로 예: 2026-08-20/photos/YOUNG-12.jpg
    certs: z
      .array(z.object({ name: z.string(), org: optStr, date: optStr }))
      .default([]),
    favorites: strList,
    gear: strList, // 카메라·장비
  }),
});

export const collections = { dives, divesEn, about };
