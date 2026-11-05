export type Lang = 'ko' | 'en';

const dict = {
  ko: {
    log: '로그북',
    gallery: '사진',
    about: '나',
    all: '전체',
    sea: '바다',
    pool: '수영장',
    freedive: '프리다이빙',
    scuba: '스쿠버',
    me: '내 사진',
    diveDays: '다이빙한 날',
    deepest: '가장 깊이',
    photos: '장의 사진',
    date: '날짜',
    location: '장소',
    type: '종류',
    discipline: '종목',
    maxDepth: '최대 수심',
    time: '시간',
    water: '수온',
    vis: '시야',
    buddy: '버디',
    back: '← 로그북으로',
    prev: '이전 다이빙',
    next: '다음 다이빙',
    draft: '작성 중',
    untitledSea: '바다에 간 날',
    untitledPool: '수영장 가는 날',
    playVideo: '영상 재생',
    close: '닫기',
    since: '부터 쓰는 다이빙 일기',
    noneYet: '아직 기록이 없어요',
    certs: '자격증',
    favorites: '좋아하는 것',
    night: '밤 다이빙 모드',
    filter: '골라보기',
    dives: '번의 다이빙',
    moving: '움직이는 사진',
    videos: '영상',
  },
  en: {
    log: 'Logbook',
    gallery: 'Photos',
    about: 'Me',
    all: 'All',
    sea: 'Sea',
    pool: 'Pool',
    freedive: 'Freediving',
    scuba: 'Scuba',
    me: 'Me',
    diveDays: 'dive days',
    deepest: 'deepest',
    photos: 'photos',
    date: 'Date',
    location: 'Site',
    type: 'Type',
    discipline: 'Discipline',
    maxDepth: 'Max depth',
    time: 'Time',
    water: 'Water',
    vis: 'Visibility',
    buddy: 'Buddy',
    back: '← Back to logbook',
    prev: 'Previous dive',
    next: 'Next dive',
    draft: 'Draft',
    untitledSea: 'A day at sea',
    untitledPool: 'Pool day',
    playVideo: 'Play video',
    close: 'Close',
    since: ' — a diving diary',
    noneYet: 'No dives yet',
    certs: 'Certifications',
    favorites: 'Things I love',
    night: 'Night dive mode',
    filter: 'Filter',
    dives: 'dives',
    moving: 'Moving pictures',
    videos: 'Videos',
  },
} as const;

export type Key = keyof (typeof dict)['ko'];
export const t = (lang: Lang, key: Key) => dict[lang][key];

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

/** 언어에 맞는 사이트 내부 주소. href('en', 'gallery') → /diving_log/en/gallery/ */
export function href(lang: Lang, path = '') {
  const clean = path.replace(/^\/|\/$/g, '');
  const parts = [base, lang === 'en' ? 'en' : '', clean].filter(Boolean).join('/');
  return `/${parts.replace(/^\//, '')}/`.replace(/\/+/g, '/');
}

export function formatDate(d: Date, lang: Lang, style: 'long' | 'stamp' = 'long') {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if (style === 'stamp') return `${y}.${String(m).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
  if (lang === 'ko') return `${y}년 ${m}월 ${day}일`;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function monthLabel(key: string, lang: Lang) {
  const [y, m] = key.split('-').map(Number);
  const en = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  return lang === 'ko' ? { big: `${m}월`, small: `${en} ${y}` } : { big: en, small: String(y) };
}
