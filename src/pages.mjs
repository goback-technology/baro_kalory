// 페이지 레지스트리 — 이 앱의 페이지 목록을 아는 유일한 곳(브라우저 쪽).
// 헤더 nav·버전 배지·home 카드가 전부 이 표를 본다. pack.mjs 와 개발 서버 라우팅
// (build/vite-kalory.mjs 의 ROUTES)도 이 표에서 파생시키므로, 페이지를 추가할 때 손으로
// 맞춰야 하는 미러는 styles/tailwind.css 의 @source 하나뿐이다.
//
// **spa** — 그 화면이 SPA 셸(index.html)의 라우트로 옮겨졌는가. 전환은 페이지 단위로
// 진행하므로 옮긴 것과 안 옮긴 것이 한동안 같은 dist 에 공존한다. 링크를 그리는 곳은
// 전부 pageHref() 하나를 보므로, 이 플래그 한 줄이 양쪽 링크를 동시에 맞춘다.
// 전 페이지가 옮겨 가면 이 플래그와 그 분기는 통째로 사라진다.
//
// **camera** — 헤더에 CCTV 셀렉터를 세우는 화면인가. 활성 카메라는 서버 전역 상태라
// 그것을 바꾸는 문을 아무 화면에나 두지 않는다(설정·시뮬레이터는 자기 목록을 따로 쓴다).
export const PAGES = [
  { id: "home",        slug: "",            label: "홈",           versionKey: null,          badge: null,   spa: true,  camera: false },
  { id: "cctv",        slug: "cctv",        label: "CCTV 제어",     versionKey: "cctv",        badge: "CCTV", spa: false, camera: true },
  { id: "discovery",   slug: "discovery",   label: "주차면 탐색",    versionKey: "discovery",   badge: "DISC", spa: false, camera: true },
  { id: "simulator",   slug: "simulator",   label: "시뮬레이터 셋업", versionKey: "simulator",   badge: "SIM",  spa: false, camera: false },
  { id: "settings",    slug: "settings",    label: "설정",          versionKey: "settings",    badge: "SET",  spa: true , camera: false },
  { id: "calibration", slug: "calibration", label: "캘리브레이션",    versionKey: "calibration", badge: "CAL",  spa: true , camera: true },
  // 높이 축은 캘리브레이션 **뒤**다. 픽셀을 각으로 바꾸려면 발행된 줌→화각 곡선이 필요해서
  // 의존이 한 방향뿐이고(광학 먼저, 높이 나중), 목록 순서가 그 순서를 말한다.
  { id: "height",      slug: "height",      label: "설치 높이",       versionKey: "height",      badge: "HGT",  spa: true , camera: true },
];

export function getPage(id) {
  return PAGES.find((p) => p.id === id) || null;
}

// 아직 자기 HTML 파일을 갖는 페이지들 — 빌드 진입점·dist 파일 목록·개발 서버 라우팅이
// 여기서 파생된다. SPA 로 옮긴 페이지는 실파일이 없고 리다이렉트 셸만 발행된다.
export const MPA_PAGES = PAGES.filter((p) => !p.spa);

export function pageFileOf(p) {
  return p.slug ? `${p.slug}.html` : "home.html";
}

// dist/CDN 정적 배포 감지 — 그 배포에서는 확장자 없는 경로를 서빙할 서버가 없어
// 링크가 ./<slug>.html 이어야 한다. pack.mjs 는 home 카드의 리터럴 href 만 재작성하고,
// JS 가 그리는 nav 와 게이트는 이 함수가 담당한다.
//
// **판정의 출처는 pack.mjs 가 dist HTML 에 심는 표식이다 — URL 로 추측하지 않는다.**
// 정적 호스트는 index.html 을 디렉터리 URL(`/<repo>/`)로 서빙해서 pathname 이 ".html" 로
// 끝나지 않는다. 대문에서만 나는 그 오판이 링크를 404 로 만드는 데서 그치지 않고, 미연결
// 게이트가 href 비교로 설정 카드를 가리므로 **설정 카드까지 잠가** 주소를 넣을 문이 사라진다.
// 표식이 없을 때의 pathname 검사는 소스 트리를 그대로 연 경우(…/public/cctv.html)를 위한 것.
export function isStaticBuild() {
  try {
    if (document.querySelector('meta[name="baro-static-build"]')) return true;
  } catch {}
  try { return location.pathname.endsWith(".html"); } catch { return false; }
}

// 화면 사이 링크. fromShell 은 **부르는 쪽이 이미 SPA 셸 안인가**를 말한다.
//   · 셸 안에서 SPA 라우트로  → 순수 해시. 같은 문서라 문서 로드 없이 바뀐다.
//   · 레거시 페이지에서 SPA 로 → 셸 문서로 가야 하므로 문서 상대 URL + 해시.
//   · 어느 쪽에서든 레거시로  → 지금까지와 같은 규칙(정적이면 실파일, 아니면 정규형).
export function pageHref(id, { fromShell = false } = {}) {
  const p = getPage(id);
  if (!p) return "./";
  const shellDoc = isStaticBuild() ? "./index.html" : "./";
  if (p.spa) {
    const hash = p.slug ? `#/${p.slug}` : "#/";
    return fromShell ? hash : shellDoc + hash;
  }
  if (!p.slug) return shellDoc;
  return isStaticBuild() ? `./${p.slug}.html` : `./${p.slug}`;
}
