import type { ImageMetadata } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { getDives } from './dives';
import type { Lang } from './i18n';

const files = import.meta.glob<ImageMetadata>(['/dives/*/photos/*', '/daily/*/*'], { eager: true, import: 'default' });

/** about.md 내용 (영어 페이지는 about.en.md, 비어 있는 칸은 한국어 것을 씀) + 프로필 사진 */
export async function getProfile(lang: Lang) {
  const entries = await getCollection('about');
  const ko = entries.find((e) => e.id === 'ko')!;
  const entry: CollectionEntry<'about'> = entries.find((e) => e.id === lang) ?? ko;
  const pick = <T,>(a: T[], b: T[]) => (a.length ? a : b);

  const dives = await getDives(lang);
  const photoPath = entry.data.photo ?? ko.data.photo;
  const mePhoto = dives.flatMap((d) => d.photos).find((p) => p.isMe);
  const photo =
    (photoPath && (files[`/dives/${photoPath}`] ?? files[`/${photoPath}`])) ||
    mePhoto?.src ||
    dives.find((d) => d.cover)?.cover?.src;

  return {
    entry,
    name: entry.data.name,
    tagline: entry.data.tagline ?? ko.data.tagline,
    photo,
    certs: pick(entry.data.certs, ko.data.certs),
    favorites: pick(entry.data.favorites, ko.data.favorites),
    gear: pick(entry.data.gear, ko.data.gear),
  };
}
