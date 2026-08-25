# Inventory

## 목차

- [Repository](#repository)
- [Top-level structure](#top-level-structure)
- [src 의 구조](#src-의-구조)
- [Entrypoints and key modules](#entrypoints-and-key-modules)
- [Build and validation commands](#build-and-validation-commands)
- [Tests](#tests)
- [Notes](#notes)

## Repository

- Name: `baro_kalory`
- Path: **적지 않는다** — 체크아웃마다 다르고, 공개 저장소라 경로의 사용자명이 노출된다.
- Summary: PTZ CCTV 커미셔닝 콘솔 웹 UI. 정적 사이트(GitHub Pages)로 배포하고,
  제어 API 는 형제 저장소 `baro_calrory` 의 백엔드가 담당한다.
- 형제 저장소: `baro_calrory` — 제어 REST API, 광학·조준 기하 솔버, 카메라 드라이버.
  이 저장소는 그것을 **HTTP 로만** 호출한다.

## Top-level structure

```
public/          # SPA 셸(index.html) · 파비콘 · app-versions.json · 빌드 산출물 app.css(gitignore)
src/             # 앱 소스 — 아래 「src 의 구조」
styles/          # Tailwind 소스 (@source 는 디렉터리 스캔)
test/            # node:test — 여러 화면을 가로지르는 구조 그물
build/           # vite-kalory.mjs — /web/ 별칭 · 리다이렉트 셸 발행
vite.config.mjs  # dev 서버(프록시·.env) + dist 빌드
ecosystem.config.cjs # pm2 — 개발기 상주용. 앱 이름 kalory-dev. 설정값은 두지 않는다(.env 가 출처)
.env             # gitignore. vite.config 가 loadEnvFile 로 직접 읽는다 (.env.example 이 표본)
pnpm-workspace.yaml  # workspace 가 아니라 pnpm 설정용(allowBuilds) — pnpm 11 이 여기서 읽는다
.nojekyll        # Pages 가 밑줄로 시작하는 경로를 산출물에서 빼지 않게 한다
```

**퇴역한 것**(2026-08-25, React SPA 전환과 함께):

- `server.mjs`(자작 정적 서버 + 프록시)와 `pack.mjs`(dist 빌더) — Vite 가 둘의 역할을
  전부 흡수했다. `page-chrome.mjs`·`ptz-controls.mjs`·i18n DOM 워커도 같은 시점에 사라졌다.
- `public/<화면>.html` — 화면마다 있던 문서. 지금 `public/` 에 남은 문서는 **셸 하나**다.

**원본에서 빼고 온 것**(공개 저장소 판단):

- `public/_compare/`(8.2MB UE 화질 비교 렌더)와 `public/compare.html` — 내부 개발 부산물이고
  본문에 실명 인용이 있었다. 덕분에 저장소가 8.8MB → 560KB 가 됐다.

## src 의 구조

**폴더는 「같이 고치는 것끼리」로 가른다**(2026-08-25). 종류별(모두 훅은 hooks/, 모두 유틸은
utils/)이 아니다 — 그렇게 가르면 기능 하나를 고치는 데 폴더 넷을 왕복하게 된다.
**`src` 최상위에는 파일을 두지 않는다** — 낱개로 놓이면 「누가 쓰나」를 위치가 말해 주지 못한다.

```
src/
  app/          셸·라우팅·게이트    main · app · shell · router · routes · backend-gate
                                    gate · busy-provider · theme
  camera/       활성 카메라 + 프리뷰 provider · select · preview · use-preview
                                    mjpeg-player · motion-settle
  i18n/         언어               index(규칙 ~100줄) · dict(데이터 ~900줄)
  components/   공용 React 부품     ptz-pad · use-stage-pointer
  lib/          화면 무관 공용      api · format · prefs · use-job-poll
  pages/<id>/   화면 하나          page.jsx · actions.mjs · <id>.css (+ 그 화면만 쓰는 것)
```

- **`camera/` 는 밖으로 나가는 의존이 `lib/api`·`i18n` 둘뿐이다** — 통째로 읽어도 되고
  통째로 안 읽어도 된다. `mjpeg-player`·`motion-settle` 의 소비자는 `camera/preview` 하나다.
- **`i18n` 은 규칙과 데이터가 갈려 있다.** `t()` 하나를 보려고 900줄을 열 이유가 없어서다.
  다시 붙는 것을 테스트가 막는다(`index.mjs` 에 사전 항목이 나타나면 실패).
- **화면만 쓰는 것은 그 화면 폴더 안이다** — 예: `pages/calibration/profile-chart.mjs`,
  `pages/simulator/{geometry,map,endpoint-panel,scene-panel,setup-panel}`.

## Entrypoints and key modules

- 브라우저 진입: `public/index.html`(셸) → `./web/app/main.jsx`. Pages 에서는 저장소 이름이
  base path 가 되므로 링크는 전부 상대경로다.
- **화면 레지스트리: `src/app/routes.mjs`** — 헤더 nav·버전 배지·홈 카드·라우트 표·
  리다이렉트 셸이 전부 이 표 하나에서 파생된다. **손으로 맞춰야 하는 미러는 없다.**
- 라우팅: `src/app/router.mjs`(`parseHash` 순수 함수 + `useHashRoute`). 경로가 아니라
  **해시**를 쓰는 이유는 정적 호스트에 깊은 경로용 rewrite 가 없기 때문이다.
- **`?api=` 는 해시 앞에만 둔다**(`index.html?api=reset#/settings`). API base 는
  `location.search` 에서 읽으므로 해시 안의 쿼리는 그 파서에 닿지 않는다.
- API 계약: `src/lib/api.mjs` — base 주입 체인이 여기 있다(`memo.md` 참조).
- **`/web/` 규약이 남아 있다** — 셸이 `./web/app/main.jsx` 를 부르고 `build/vite-kalory.mjs`
  의 `resolveId` 가 그것을 `src/` 로 잇는다(dev·build 가 같은 훅을 탄다).
- **테스트가 두 자리에 있다** — 단위 테스트는 대상 옆(`src/**/*.test.mjs`), 여러 화면을
  가로지르는 구조 그물만 `test/`. `pnpm test` 가 두 글로브를 모두 돈다.
- 화면별 버전은 `public/app-versions.json`, 패키지 버전은 `package.json` — 화면에 바뀐 것이
  있으면 둘을 함께 올린다. **숫자를 문서에 복사하지 않는다**(반드시 낡는다).

## Build and validation commands

```bash
pnpm install
pnpm build          # Tailwind CLI — public/app.css 생성 (gitignore 산출물, clone 후 1회 필수)
pnpm dev            # Vite dev server (:8180, /api 는 backend 로 프록시)
pnpm test           # node:test
pnpm build:dist     # 정적 호스트용 dist (Pages 배포 산출물)
```

개발기 상주(pm2):

```bash
pm2 start ecosystem.config.cjs && pm2 save   # 앱 이름 kalory-dev
pm2 resurrect                                # 재부팅 후 — Windows 는 부팅 훅이 없다(memo.md)
pm2 logs kalory-dev --lines 30
```

- `public/app.css` 는 **gitignore 산출물**이다. 빌드하지 않으면 UI 가 무스타일로 나온다.
- `pnpm watch:css` 는 그대로 돌지 않는다 — `pnpm-workspace.yaml` 의 `allowBuilds` 가
  `@parcel/watcher: false` 로 네이티브 워처 빌드를 스킵해 둔다(어느 머신에서든 `pnpm install` 이
  통과하게 하려는 의도적 선택). 워처가 필요하면 그 값을 `true` 로 바꾼다. 1회성 `build:css` 는
  영향 없다.
- `pnpm test` 는 **두 글로브**를 돈다 — `test/**` 와 `src/**`. 소스 옆 테스트를 빠뜨리지 않는다.
- Pages 배포는 `main` push → `.github/workflows/pages.yml`(`pnpm test` → `pnpm build:dist` →
  `dist/` 발행). 저장소 Settings → Pages → Source 를 "GitHub Actions" 로 둬야 한다.
- pm2 로 올린 것과 `pnpm dev` 는 **같은 포트를 다툰다**. pm2 에 올려 둔 채 `pnpm dev` 를
  치면 `EADDRINUSE` 다 — 어느 쪽이 8180 을 잡고 있는지 `pm2 list` 로 먼저 본다.

## Tests

- `node:test` 기반. 실기·네트워크 불필요.
- **뷰는 JSX 원문 앵커로, 로직은 값으로 문다.** 컴포넌트 렌더 테스트 인프라(jsdom 등)는
  들이지 않았다 — 판정을 `actions.mjs` 로 내리고 그쪽을 실값으로 검증한다.
- **테스트 언어는 `t()` 로 양쪽을 맞춘다.** 한국어 리터럴 조각을 기대값으로 쓰면 노드가
  언어를 ko 로 고정해 둔 덕에 통과할 뿐이고, 실제로는 아무것도 검증하지 않는다
  (2026-08-25 그런 단언 넷이 발견됐다).

## Notes

- **도메인 수식이 없다.** 화각·투영·조준은 전부 백엔드가 계산해 값으로 내려준다.
  광학 모델을 이 저장소에 두면 두 벌로 갈라져 조용히 틀린 곳을 그린다.
- **런타임 의존성은 react·react-dom 둘뿐이다.** 라우터·상태 관리·UI 라이브러리를 들이지
  않았다(빌드 의존은 vite·tailwind).
- **라우트 CSS 에는 두 가지를 쓰지 않는다** — SPA 에서는 방문한 화면의 CSS 가 언로드되지
  않고 쌓이기 때문이다(둘 다 테스트가 문다): ① 전역 선택자(`html`·`body`·`main`·`header`),
  ② `#stage`·`#view`·`#viewbar` 처럼 **app.css 가 소유하는 공유 id** 를 접두사 없이 덮는 것.
- 백엔드가 광학을 선언하지 않은 기기에서는 화각 값이 **응답에 아예 없다** — 그 값을 쓰는
  화면은 없을 때를 반드시 처리해야 한다. 기본 곡선으로 대신 채우면 조용히 틀린다.
