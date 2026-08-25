// 페이지 레지스트리 — 이 앱의 페이지 목록을 아는 유일한 곳(브라우저 쪽).
// 헤더 nav·버전 배지·home 카드가 전부 이 표를 본다. pack.mjs 와 개발 서버 라우팅
// (build/vite-kalory.mjs 의 ROUTES)도 이 표에서 파생시키므로, 페이지를 추가할 때 손으로
// 맞춰야 하는 미러는 styles/tailwind.css 의 @source 하나뿐이다.
export const PAGES = [
  { id: "home",        slug: "",            label: "홈",           versionKey: null,          badge: null },
  { id: "cctv",        slug: "cctv",        label: "CCTV 제어",     versionKey: "cctv",        badge: "CCTV" },
  { id: "discovery",   slug: "discovery",   label: "주차면 탐색",    versionKey: "discovery",   badge: "DISC" },
  { id: "simulator",   slug: "simulator",   label: "시뮬레이터 셋업", versionKey: "simulator",   badge: "SIM" },
  { id: "settings",    slug: "settings",    label: "설정",          versionKey: "settings",    badge: "SET" },
  { id: "calibration", slug: "calibration", label: "캘리브레이션",    versionKey: "calibration", badge: "CAL" },
  // 높이 축은 캘리브레이션 **뒤**다. 픽셀을 각으로 바꾸려면 발행된 줌→화각 곡선이 필요해서
  // 의존이 한 방향뿐이고(광학 먼저, 높이 나중), 목록 순서가 그 순서를 말한다.
  { id: "height",      slug: "height",      label: "설치 높이",       versionKey: "height",      badge: "HGT" },
];

export function getPage(id) {
  return PAGES.find((p) => p.id === id) || null;
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

export function pageHref(id) {
  const p = getPage(id);
  if (!p) return "./";
  if (isStaticBuild()) return p.slug ? `./${p.slug}.html` : "./index.html";
  return p.slug ? `./${p.slug}` : "./";
}
