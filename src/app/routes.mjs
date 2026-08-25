// 화면 레지스트리 — 이 앱의 화면 목록을 아는 유일한 곳(브라우저 쪽).
//
// 헤더 nav·버전 배지·홈 카드·라우트 표·리다이렉트 셸이 전부 이 표를 본다. 손으로 맞춰야
// 하는 미러는 하나도 없다.
//
// **camera** — 헤더에 CCTV 셀렉터를 세우는 화면인가. 활성 카메라는 서버 전역 상태라 그것을
// 바꾸는 문을 아무 화면에나 두지 않는다(설정·시뮬레이터는 자기 목록을 따로 쓴다).
export const PAGES = [
  { id: "home",        slug: "",            label: "홈",           versionKey: null,          badge: null,   camera: false },
  { id: "cctv",        slug: "cctv",        label: "CCTV 제어",     versionKey: "cctv",        badge: "CCTV", camera: true },
  { id: "discovery",   slug: "discovery",   label: "주차면 탐색",    versionKey: "discovery",   badge: "DISC", camera: true },
  { id: "simulator",   slug: "simulator",   label: "시뮬레이터 셋업", versionKey: "simulator",   badge: "SIM",  camera: false },
  { id: "settings",    slug: "settings",    label: "설정",          versionKey: "settings",    badge: "SET",  camera: false },
  { id: "calibration", slug: "calibration", label: "캘리브레이션",    versionKey: "calibration", badge: "CAL",  camera: true },
  // 높이 축은 캘리브레이션 **뒤**다. 픽셀을 각으로 바꾸려면 발행된 줌→화각 곡선이 필요해서
  // 의존이 한 방향뿐이고(광학 먼저, 높이 나중), 목록 순서가 그 순서를 말한다.
  { id: "height",      slug: "height",      label: "설치 높이",       versionKey: "height",      badge: "HGT",  camera: true },
];

export function getPage(id) {
  return PAGES.find((p) => p.id === id) || null;
}

// 옛 주소의 파일 이름 — 그 자리에는 리다이렉트 셸이 발행된다(build/vite-kalory.mjs).
// 작업자의 북마크가 `<slug>.html` 형태로 존재하고, 그 주소가 404 가 되는 것은 「화면이
// 사라졌다」로 읽힌다.
export function pageFileOf(p) {
  return p.slug ? `${p.slug}.html` : "home.html";
}

// 화면 사이 링크. 전 화면이 한 문서(셸) 안의 라우트라 **언제나 해시**다 — 문서가 하나뿐이니
// 배포 형태(개발 서버·정적 호스트·마운트 프리픽스)를 가릴 일도 없다.
//
// 배포 형태를 가리던 기계(정적 빌드 표식·isStaticBuild·확장자 재작성)는 이 전환과 함께
// 사라졌다. 그 기계는 대문에서만 오판이 나는 부류였고, 그 오판이 미연결 게이트의 href
// 비교를 통해 **설정 카드까지 잠가** 첫 방문을 벽돌로 만들었다(두 번 물렸다). 이제 판정할
// 것이 없다.
export function pageHref(id) {
  const p = getPage(id);
  if (!p) return "#/";
  return p.slug ? `#/${p.slug}` : "#/";
}
