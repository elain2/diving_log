import { defineConfig } from 'astro/config';
import { SITE } from './site.config.mjs';

// <아이디>.github.io 저장소면 주소 맨 뒤 경로가 없고, 아니면 /<repo>/ 아래에 열려요
const isUserSite = SITE.repo.toLowerCase() === `${SITE.githubUser}.github.io`.toLowerCase();

export default defineConfig({
  site: `https://${SITE.githubUser}.github.io`,
  base: isUserSite ? '/' : `/${SITE.repo}`,
  trailingSlash: 'ignore',
  image: { responsiveStyles: false },
});
