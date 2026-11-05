# free.young.510 · dive log

바다와 수영장에서 숨 참고 내려간 날들의 기록.

## 새 다이빙 기록 추가하기 (3단계)

1. **사진 넣기** — 라이트룸에서 내보낸 폴더를 지정하면 촬영 날짜별로 알아서 나눠 넣어요.
   ```bash
   npm run add -- "/Users/kayoung/Documents/라이트룸 보정"
   ```
   - 하루치를 특정 폴더에 넣고 싶으면: `npm run add -- "<사진 폴더>" --into 2026-08-20-울릉도`
   - 사진은 자동으로 줄어들고(긴 변 2000px), 위치 정보(GPS)는 지워져요.
   - 한 번 넣은 원본은 기억해 두니까 같은 폴더를 여러 번 넣어도 괜찮아요. 사이트에서 지운 사진도 다시 안 들어와요.
   - **다이빙이 아닌 사진**(일상·여행·고양이…)은 `--daily` 를 붙여요. 사진 페이지에만 나와요.
     ```bash
     npm run add -- "<사진 폴더>" --daily --into 2026-10-31-오키나와
     ```
   - 짧은 영상(.mp4/.mov)은 앞 20초를 소리 없는 클립으로 줄여 넣어요. 긴 영상은 유튜브에 올려주세요.

2. **기록 쓰기** — `dives/<날짜>/index.md` 를 열어서 위쪽 칸(장소, 수심 등)을 채우고, `---` 아래에 글을 써요.
   - 다 채우면 `draft: true` 줄을 지워요. (남아 있으면 '작성 중' 스티커가 붙어요)
   - 폴더 이름을 `2026-08-20-울릉도` 처럼 바꿔도 돼요. 이게 페이지 주소가 돼요.

3. **올리기** — 저장하고 GitHub에 push 하면 몇 분 뒤 사이트에 반영돼요.

### 더 할 수 있는 것
| 하고 싶은 것 | 방법 |
|---|---|
| '내 사진'으로 표시 | 사진 파일 이름 끝에 `-me` 붙이기 (예: `YOUNG-12-me.jpg`) → 사진 페이지의 '내 사진' 필터에 나와요 |
| '고른 컷' 표시 (빨간 동그라미) | 파일 이름 끝에 `-pick` 붙이기 (예: `YOUNG-12-pick.jpg`, 둘 다면 `YOUNG-12-me-pick.jpg`) |
| 일상 사진 롤 이름 바꾸기 | `daily/` 안 폴더 이름을 `날짜-제목` 으로 (예: `2026-10-31-오키나와-여행` → "오키나와 여행") |
| 대표 사진 바꾸기 | `index.md` 에 `cover: YOUNG-12.jpg` |
| 유튜브 영상 넣기 | `youtube: [영상ID]` (주소 `youtube.com/watch?v=` 뒤 11글자) |
| 영어 글 쓰기 | 같은 폴더에 `index.en.md` 만들고 `title:` + 글 (안 쓰면 한국어로 나와요) |
| 사진 지우기 | `photos/` 안에서 그 파일만 지우기 |
| 자기소개·자격증 | 맨 위 폴더의 `about.md` (영어는 `about.en.md`) |
| 사이트 이름·GitHub 아이디 | `site.config.mjs` |

글 쓸 때 `**이렇게**` 감싸면 형광펜이 칠해지고, `> 이렇게` 쓰면 손글씨 메모가 돼요.

## 내 컴퓨터에서 미리 보기
```bash
npm install   # 처음 한 번만
npm run dev   # → http://localhost:4321/diving_log/
```

## 처음 배포할 때 (한 번만)
1. GitHub에 `diving_log` 저장소를 만들고 이 폴더를 push
2. `site.config.mjs` 의 `githubUser` 를 내 아이디로
3. 저장소 **Settings → Pages → Source** 를 **GitHub Actions** 로
4. 주소: `https://<아이디>.github.io/diving_log/`

## 폴더 구조
```
dives/<날짜>/index.md      기록 (한국어)
dives/<날짜>/index.en.md   기록 (영어, 선택)
dives/<날짜>/photos/       사진
dives/<날짜>/clips/        짧은 영상 (선택)
daily/<날짜-제목>/          일상 사진 (사진 페이지에만 나옴)
about.md                   나에 대한 글
site.config.mjs            사이트 이름 등
src/                       디자인 (안 만져도 돼요)
scripts/imported.json      이미 넣은 원본 기록 (지우지 마세요)
```
