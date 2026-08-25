// 대문 카드의 **내용**. 그리는 일은 page.jsx 가 한다.
//
// 목록은 PAGES 에서 파생한다 — 카드를 손으로 늘어놓으면 페이지를 추가한 날 그 카드만 빠지고,
// 그 사실을 아무도 모른다. 설명 문구만 여기 있다: pages.mjs 는 라우팅·버전·링크의 표이지
// 홍보 문구의 표가 아니고, 그 표를 읽는 곳(빌드·플러그인·테스트)에 문장을 얹으면 무거워진다.
import { PAGES, pageHref } from "../../pages.mjs";
import { openWithoutBackend } from "../../app/gate.mjs";

const BLURB = {
  cctv: ["CCTV 제어 · 모니터링",
    "등록된 카메라(실기 + 시뮬)의 PTZ 제어와 라이브 프리뷰, 클릭 센터링, 검출 테스트."],
  discovery: ["주차면 탐색 · 번호판 호밍",
    "프리셋(구도)마다 주차면 점을 지정하고, 각 점의 번호판이 가독 크기로 잡히는 조준해를 호밍으로 찾는다."],
  simulator: ["시뮬레이터 셋업",
    "시뮬레이터 씬 편집 — 주차면에 차량 배치, 차종·색상·번호판 설정. 시뮬(mode:sim) 카메라로 결과 확인."],
  settings: ["설정",
    "기기(장치) 등록·전환, API 서버 주소, 검출기·LPR·API 키, 서비스 상태 확인."],
  calibration: ["카메라 캘리브레이션",
    "기기별 광학(줌→화각)·조준 오차 실측 — 검증과 전체 캘리브레이션, 결과 저장."],
  height: ["설치 높이 · 측량",
    "카메라가 지면에서 몇 미터에 달렸는가 — 시공 실측 입력(정본)과 영상 자동 측정(보조). 광학 곡선이 있어야 잴 수 있다."],
};

// own: app-versions.json 의 내용(아직 안 왔으면 null). backendDown: 미연결 여부.
//
// 잠긴 카드는 **감추지 않는다.** 화면이 사라진 것이 아니라 아직 쓸 수 없는 것이고, 그 사실과
// 이유가 보여야 한다. 예전에는 카드의 href 문자열을 설정의 href 와 비교해 걸렀는데, 링크
// 체계가 바뀌면 그 비교가 조용히 빗나가 설정 카드까지 잠겼다 — 주소를 넣을 유일한 문이
// 잠기므로 첫 방문이 곧 벽돌이었다. 이제 페이지 id 로 묻는다.
export function homeCards({ own = null, backendDown = false } = {}) {
  return PAGES.filter((p) => p.slug).map((p) => {
    const [title, blurb] = BLURB[p.id] || [p.label, ""];
    return {
      id: p.id,
      title,
      blurb,
      versionKey: p.versionKey,
      version: `${p.badge} v${(own && own[p.versionKey]) || "—"}`,
      href: pageHref(p.id, { fromShell: true }),
      locked: backendDown && !openWithoutBackend(p.id),
    };
  });
}
