import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (rel) => readFile(new URL(rel, import.meta.url), "utf8");

// (설정 화면의 계약은 test/settings-page.test.mjs 로 갈라져 나갔다 — 라우트로 옮기면서
//  파일 하나가 두 화면을 물고 있을 이유가 없어졌다.)
// calibration 은 SPA 셸의 라우트다(2026-08-25) — 자기 HTML 문서가 없고, 헤더·크롬은 셸이,
// 카메라 셀렉터는 CameraProvider 가 준다. 단언은 파일까지 지정한다(어느 파일에 있어도
// 통과하는 뭉친 검사보다 좁다).
const CAL = {
  css: "../src/pages/calibration/calibration.css",
  app: "../src/pages/calibration/page.jsx",
  actions: "../src/pages/calibration/actions.mjs",
  overlay: "../src/pages/calibration/sweep-overlay.jsx",
  status: "../src/pages/calibration/status-card.jsx",
  card: "../src/pages/calibration/profile-card.jsx",
  list: "../src/pages/calibration/profile-list.jsx",
};

// 캘리브레이션 페이지는 2단이다 — 왼쪽은 저장소에 발행된 것 전량(카메라와 무관한 카탈로그),
// 오른쪽은 지금 고른 카메라의 작업면. 한 단에 세로로 쌓으면 목록에서 고른 것과 오른쪽에 뜬
// 것이 한 화면에 함께 보이지 않아 비교가 성립하지 않는다.
test("캘리브레이션 페이지 — 2단 배치와 프로파일 카탈로그", async () => {
  const css = await read(CAL.css);
  assert.match(css, /#cal-split[^}]*flex-direction: row/, "2단이어야 한다");
  assert.match(css, /\.cal-card-list[^}]*min-height: 0/, "목록 단은 자기 안에서 스크롤해야 한다");
  assert.match(css, /\.cal-col-detail[^}]*overflow-y: auto/, "작업면은 따로 스크롤해야 한다");
  // SPA 에서는 방문한 화면의 CSS 가 언로드되지 않고 쌓인다 — 접두사 없는 선택자를 남기면
  // 떠난 화면의 규칙이 다음 화면을 망가뜨린다. 전역 규칙은 셸(public/index.html)의 몫이다.
  for (const global of ["html", "body", "main", ":root", "header", "h1"]) {
    assert.doesNotMatch(css, new RegExp(`^${global}\\b[^{]*\\{`, "m"),
      `전역 선택자 "${global}" 가 라우트 CSS 에 남아 있다`);
  }
  // 쓰기는 전부 오른쪽 창구를 지난다 — 목록이 자기 몫의 복사/적용을 따로 부르면 두 벌이 되고,
  // 두 벌은 언젠가 한쪽만 고쳐진다.
  const list = await read(CAL.list);
  assert.match(list, /onPickMine\(\) : onPickOther\(p\.profileId\)/,
    "줄을 누르면 오른쪽 창구가 열려야 한다 (내 것이면 리비전, 남의 것이면 그 원본으로 복사)");
  const app = await read(CAL.app);
  assert.match(app, /onPickMine=\{openRevisionPanel\}/, "내 줄은 리비전 창으로 배선돼야 한다");
  assert.match(app, /onPickOther=\{\(pid\) => openCopyPanel\(pid\)\}/, "남의 줄은 그 원본 복사창으로 배선돼야 한다");
  assert.doesNotMatch(list, /postJson|reqJson/, "목록이 직접 쓰기를 부르면 안 된다");
  // 발행·복사·퇴역은 저장소의 목록을 바꾼다 — 함께 다시 읽지 않으면 두 단이 다른 말을 한다.
  assert.match(app, /Promise\.all\(\[loadProfile\(\), loadRevisions\(\), loadDrift\(\), loadInstalled\(\), loadProfileList\(\)\]\)/,
    "쓰기 뒤에 카탈로그도 다시 읽어야 한다");
});


test("캘리브레이션 페이지 — 라우트 계약", async () => {
  const app = await read(CAL.app);
  const status = await read(CAL.status);
  // 카드가 갖는 것 — 하나라도 빠지면 이식 중 유실된 것이다.
  assert.match(app, /id="calib-card"/, "calib-card 누락");
  for (const id of ["calib-desc", "calib-installed", "calib-verify", "calib-start",
    "calib-stop", "calib-advice", "calib-progress", "calib-bar", "calib-msg", "calib-result"]) {
    assert.match(status, new RegExp(`id="${id}"`), `${id} 누락`);
  }
  // 라우트는 **스스로 마운트하지 않는다** — 셸의 라우트 표가 부른다. 자기 루트를 만들면
  // 셸의 루트와 둘이 되어 프로바이더(카메라·잠금·게이트) 밖에서 도는 화면이 생긴다.
  assert.doesNotMatch(app, /createRoot|initPageChrome|createCameraSelect/,
    "라우트가 자기 문서·자기 크롬을 다시 세우면 안 된다");
  assert.match(app, /export default function CalibrationPage\(\)/, "라우트는 기본 내보내기다");
  assert.match(app, /useCamera\(\)/, "헤더 셀렉터는 CameraProvider 소유다");
  // 진행 중 카메라 전환 잠금 — 잡이 모는 카메라를 갈아타면 실기 오동작 + 결과가 엉뚱한
  // 기기에 저장된다.
  assert.match(app, /cam\.setEnabled\(!running\)/);
  // 폴링 누수 방지.
  assert.match(app, /clearInterval\(pollRef\.current\); \};\s*window\.addEventListener\("pagehide", bye\)/);
  // 스트림 놓아주기 — 라우트 이탈에는 pagehide 가 오지 않는다. 셋을 전부 걸어야 한다:
  // 카메라 전환 전(registerRelease) · 언마운트(cleanup 의 destroy) · 진짜 문서 이탈(pagehide).
  assert.match(app, /registerRelease\(\(\) => preview\.stop\(\)\)/, "카메라 전환 전에 놓아줘야 한다");
  assert.match(app, /preview\.destroy\(\)/, "언마운트에서 위젯을 거둬야 한다 — stop 만으로는 리스너가 남는다");
  assert.match(app, /window\.addEventListener\("pagehide", bye\)/, "문서 이탈도 막아야 한다");
  // 외부 의존은 api 모듈 + 셸의 프로바이더뿐 — cctv 쪽 코드를 호출하지 않는다.
  for (const src of [app, status]) {
    assert.doesNotMatch(src, /setBusy\(|showSwitching\(|controlPreview\.|discoveryPreview\./);
  }
});


test("캘리브레이션 페이지 — 발행된 프로파일 가시화", async () => {
  const card = await read(CAL.card);
  const status = await read(CAL.status);
  for (const id of ["profile-card", "profile-meta", "profile-charts", "profile-points"]) {
    assert.match(card, new RegExp(`id="${id}"`), `${id} 누락`);
  }
  // 리비전은 발행 후 불변이라 메모를 나중에 고칠 수 없다 — 저장하는 그 순간에 받아야 한다.
  assert.match(status, /이 측정에 붙일 이름·메모/, "메모 입력이 있어야 한다");
  assert.match(status, /note\.trim\(\) \? \{ note: note\.trim\(\) \} : \{\}/, "메모를 적었으면 저장 요청에 실어 보내야 한다");
  // 이름·메모는 사람이 적은 문자열이다 — React 의 텍스트 렌더가 그 규칙이고, 우회로를 만들지 않는다.
  assert.doesNotMatch(card, /dangerouslySetInnerHTML|innerHTML/, "서버 값은 텍스트로만 그린다");
  assert.match(card, /profile\.status === 404/, "발행 전(404)은 장애가 아니라 정상 상태로 안내해야 한다");
});


test("API 오류는 본문을 잃지 않는다", async () => {
  const src = await readFile(new URL("../src/lib/api.mjs", import.meta.url), "utf8");
  // 거절이 언제나 문장 하나인 것은 아니다 — 발행 게이트는 왜·어디를 구조로 준다.
  // 여기서 message 만 뽑으면 화면은 그걸 되살릴 방법이 없다.
  assert.match(src, /err\.body = j/, "오류 응답 본문을 호출부까지 넘겨야 한다");
  assert.match(src, /err\.status = r\.status/, "상태코드도 함께 넘겨야 한다");
});

test("프로파일 차트 — 한 그림에 축은 하나", async () => {
  const src = await readFile(new URL("../src/pages/calibration/profile-chart.mjs", import.meta.url), "utf8");
  assert.match(src, /export function miniChart/);
  assert.match(src, /export function chartFigure/);
  // 화각(도)과 조준 게인(배율)은 단위가 다르다. 한 그림에 두 축으로 겹쳐 그리면 두 곡선의
  // 교차점이 아무 의미도 없는데 의미가 있는 것처럼 읽힌다 — 차트를 나눈다.
  assert.doesNotMatch(src, /y2Label|yRight|secondAxis|rightAxis/, "두 번째 y 축을 만들지 않는다");
  // 막대는 범주 비교다 — 값 간격대로 놓으면 촘촘한 구간에서 서로 겹쳐 계단처럼 읽힌다.
  assert.match(src, /slot \* \(i \+ 0\.5\)/, "막대는 차례로 균등 배치해야 한다");
  // 색·글꼴을 하드코딩하면 테마 교체가 차트만 남기고 지나간다.
  assert.match(src, /var\(--color-accent/, "차트 색은 테마 토큰이어야 한다");
});

test("주차면 탐색 라우트 — 화면이 갖는 것", async () => {
  const page = await read("../src/pages/discovery/page.jsx");
  for (const id of [
    "disc-wrap", "disc-view", "disc-stage", "disc-points", "disc-masks", "disc-home-frame",
    "disc-home-box", "disc-monologue", "disc-crosshair", "disc-preview-mode", "disc-fps",
    "disc-ptz", "disc-status", "disc-name", "disc-add", "disc-preset-props", "disc-list",
    "disc-pt-label", "disc-home-status", "disc-vlm", "disc-vlm-replace", "disc-home-start",
    "disc-home-stop", "disc-clear", "disc-point-props", "disc-ptlist",
    "home-replay", "hr-img", "hr-overlay", "hr-cross", "hr-caption", "hr-prev", "hr-next", "hr-play", "hr-close",
  ]) {
    assert.match(page, new RegExp(`id="${id}"`), `${id} 누락`);
  }
  // 라우트는 스스로 마운트하지 않는다 — 셸의 라우트 표가 부른다.
  assert.doesNotMatch(page, /createRoot|initPageChrome|createCameraSelect|createCameraPreview/,
    "라우트가 자기 문서·자기 크롬·자기 위젯을 다시 세우면 안 된다");
  assert.match(page, /export default function DiscoveryPage\(\)/);
  // 이 화면은 프리뷰가 곧 작업면이다 — 꺼져 있으면 점을 찍을 수 없다.
  assert.match(page, /alwaysOn: true/);
  // 숨겨진 탭에서 카메라를 깨우지 않는 규칙은 훅이 든다(하루 10만 건 폴링 사고의 그물).
  assert.match(page, /useJobPoll\(readPtz, \{ intervalMs: 800 \}\)/);
  // 잡이 카메라를 모는 동안 전환을 잠근다 — 갈아타면 결과가 다른 기기 것으로 섞인다.
  assert.match(page, /cam\.setEnabled\(!running && !busy\)/);
});

// 리플레이 자막은 상류(VLM 의 reason·evidence)에서 온 문자열을 싣는다. 인라인 시절에는
// innerHTML 로 붙이면서 escapeHtml 로 손수 막았고, 그 방어를 한 번 빠뜨리면 그대로 주입이다.
test("주차면 탐색 라우트 — 서버 문자열을 마크업으로 만들지 않는다", async () => {
  const page = await read("../src/pages/discovery/page.jsx");
  const actions = await read("../src/pages/discovery/actions.mjs");
  // 주석은 걷고 본다 — 왜 그러지 않는지를 설명하는 주석이 그 이름을 인용한다.
  const code = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  // 마크업으로 나갈 수 있는 유일한 출처는 **사전 상수**다(문장 안에 색 조각이 박힌 범례
  // 한 줄). 그 형태를 먼저 걷어내고, 남은 것이 하나라도 있으면 서버 값이 마크업이 된 것이다.
  const rest = (code(page) + code(actions))
    .replace(/dangerouslySetInnerHTML=\{\{ __html: i18nHtml\("[\w.]+"\) \}\}/g, "");
  assert.doesNotMatch(rest, /dangerouslySetInnerHTML|innerHTML|escapeHtml/,
    "서버 값은 텍스트로만 그린다 — 이스케이프를 손으로 하지 않는다");
  // 자막은 조각 배열로 온다(값 판정은 actions.test.mjs 가 문다).
  assert.match(page, /replayCaption\(replay\.steps\[replay\.i\]\)/);
});

// (백엔드 미연결 게이트의 두 블록은 page-chrome.mjs 를 정규식으로 읽던 것이었다. 그 모듈이
//  사라지면서 **값 테스트로 승격**됐다 — src/app/gate.test.mjs 가 판정 넷과 「백엔드 없이
//  열리는 화면은 대문·설정뿐」을, src/pages/home/cards.test.mjs 가 카드 잠금을 값으로 문다.)

// 캘리브레이션 데이터가 저장소로 들어오는 문은 오래 "실기 20분 스윕 → 발행" 하나뿐이었다.
// 그래서 스윕을 못 돌리는 기기의 곡선은 갈 곳이 없었고, 설정 화면이 브라우저에서 곡선을
// 복사해 config 에만 넣는 우회로가 생겼다 — 그 결과 대상 카메라는 "보정은 있는데 발행본은
// 없는" 상태가 되어 두 화면이 서로 다른 말을 했다. 창구는 하나여야 한다.
test("캘리브레이션 페이지 — 프로파일 관리 창구", async () => {
  const app = await read(CAL.app);
  const card = await read(CAL.card);
  const actions = await read(CAL.actions);
  const status = await read(CAL.status);
  for (const id of [
    "profile-drift", "profile-actions", "profile-panel", "profile-msg", "profile-revisions",
    "prof-act-copy", "prof-act-import", "prof-act-apply", "prof-act-retire",
  ]) {
    assert.match(card, new RegExp(`id="${id}"`), `${id} 누락`);
  }
  assert.match(app, /id="profile-list"/, "profile-list 누락");   // 왼쪽 단: 카메라와 무관한 카탈로그

  // 발행의 정식 이름은 mint 다. /save 는 백엔드가 하위호환으로 남겨 둔 별칭이라 언제
  // 사라져도 이상하지 않다 — 별칭에 매달리지 않는다.
  assert.match(status, /api\("\/calibration\/mint"\)/, "발행은 mint 라우트로 가야 한다");
  assert.doesNotMatch(status, /calibration\/save/, "옛 별칭에 매달리지 않는다");

  // 네 동작이 전부 백엔드 창구를 지난다. 브라우저가 곡선을 만지면 두 곳 중 한 곳만 쓰인다.
  assert.match(card, /\/profiles\/camera\/\$\{encodeURIComponent\(id\)\}\/copy/, "복사는 창구 라우트를 불러야 한다");
  assert.match(app, /\/profiles\/camera\/\$\{enc\(id\)\}\/apply/, "적용은 창구 라우트를 불러야 한다");
  assert.match(app, /reqJson\("DELETE", api\(`\/profiles\/camera\//, "퇴역은 DELETE 여야 한다");
  assert.match(app, /\/profiles\/camera\/\$\{enc\(id\)\}\/revisions/, "이력을 읽어야 한다");

  // 드리프트 판정은 백엔드가 한다. 브라우저가 곡선을 다시 비교하면 두 번째 구현이 생기고,
  // 두 구현은 언젠가 서로 다른 답을 낸다 — 이 카드가 없애려는 병이 정확히 그것이다.
  assert.match(app, /help\?format=json[\s\S]{0,200}profileDrift/, "드리프트는 백엔드 라이브 상태에서 가져와야 한다");
  assert.doesNotMatch(app, /published[\s\S]{0,80}live[\s\S]{0,80}Math\.abs/, "브라우저가 곡선을 다시 비교하면 안 된다");

  // 서버가 준 문자열(경고문·메모·기기명)은 사람이 적은 값이다 — React 텍스트 렌더만 쓰고
  // innerHTML 우회로를 만들지 않는다(위 가시화 테스트가 카드 전체를 문다).
  assert.match(card, /driftLines\.map\(\(line, i\) =>/, "드리프트 경고는 줄 단위 텍스트로 그린다");

  // 퇴역은 목록에서 사라지고, 되돌리는 방법이 화면에 없다 — 확인을 받아야 한다.
  assert.match(app, /async function retireProfile\(\)[\s\S]{0,2200}confirm\(/, "삭제는 확인을 받아야 한다");
  // **언제** 씨앗값으로 돌아가는지는 백엔드 계약마다 다르다 — 예측하지 말고 끝난 뒤에 읽는다.
  // 다만 **한 칸(declared)만 읽으면 안 된다** — declared 는 발행본과 씨앗값을 구분하지 못해서,
  // 씨앗값 있는 기기는 퇴역 직후에도 true 다(2026-08-19 ref-ptz 실측). 전후를 찍어 **변화**를 본다.
  assert.match(actions, /export async function opticsSnapshot\(\)/, "퇴역 앞뒤 광학을 찍어야 한다");
  assert.match(app, /const before = await opticsSnapshot\(\)/, "기준점은 퇴역 전에 찍어야 한다");
  assert.match(app, /after: await opticsSnapshot\(\)/, "퇴역 후 상태를 다시 읽어야 한다");
  assert.match(actions, /function retireEffect\(before, after\)[\s\S]{0,1000}opticsSig\(before\) !== opticsSig\(after\)/,
    "한 칸이 아니라 변화를 봐야 한다 — declared 는 발행본과 씨앗값을 구분하지 못한다");
  assert.doesNotMatch(app + actions, /opticsDeclaredNow/, "declared 한 칸 판정은 돌아오면 안 된다");

  // 「발행본이 적용돼 있습니다」도 declared 하나로 판정하면 같은 거짓말이 된다 — 퇴역 직후
  // 씨앗값 광학을 보고도 발행본이라고 말했다. 발행본의 존재는 문서 저장소에 직접 묻는다.
  assert.match(actions, /hasProfile !== false/, "발행본 주장에는 발행본 존재 확인이 필요하다");
  assert.match(app, /revisions[\s\S]{0,80}length > 0/, "발행본 존재는 리비전 목록으로 확인한다");
  assert.match(app, /e\.status === 404 \? false : null/,
    "404 는 「확실히 없음」이다 — 장애(null)와 섞으면 발행본 없는 카메라가 발행본 있다고 보인다");
  assert.match(actions, /발행본이 없습니다[\s\S]{0,400}씨앗값이거나, 방금 삭제한 곡선/,
    "발행본 없이 광학만 있는 상태는 출처를 단정하지 말아야 한다 — 옛 계약이 아직 살아 있다");

  // 화면 표기는 「삭제」다. 백엔드 용어(retire)를 화면에 옮긴 「퇴역」은 작업자가 삭제 버튼을
  // 못 찾게 했다(2026-08-19) — 목록에서 사라지고 화면으로 못 되돌리면 작업자에게는 삭제다.
  assert.match(card, /prof-act-retire[\s\S]{0,400}>삭제</, "버튼은 「삭제」로 읽혀야 한다");
  assert.match(app, /발행본 전체를 삭제합니다/, "확인창도 같은 말을 써야 한다");
  assert.doesNotMatch(app + card, /퇴역<\/button>|를 퇴역시켰습니다/, "「퇴역」 표기가 화면으로 돌아오면 안 된다");

  // 성공할 수 없는 버튼은 눌리면 안 된다 — 발행본 없는 카메라에서 삭제·되돌리기가 눌리면,
  // 옆의 카탈로그(다른 카메라들 발행본)를 보고 누른 사람이 "지웠는데 남아 있다"를 겪는다
  // (2026-08-19 실제 상황). 실패 메시지도 어느 카메라 얘기인지 이름을 말해야 한다.
  const locks = card.match(/disabled=\{!hasProfile\}/g) || [];
  assert.ok(locks.length >= 2, `발행본 없으면 삭제·되돌리기가 잠겨야 한다 (지금 ${locks.length})`);
  assert.match(card, /다른 카메라의 발행본을 지우려면 헤더에서 그 카메라를 먼저 고르세요/, "잠금 사유가 다음 행동을 알려줘야 한다");
  assert.match(app, /에는 삭제할 발행본이 없습니다[\s\S]{0,80}다른 카메라의 것/, "안전망 메시지는 카메라 이름과 원인을 함께 말해야 한다");

  // 0.18.0(#73): 존재와 적용은 다른 축이다. 「적용 해제」는 지우기가 아니라 같은 카메라로
  // 적용 전/후를 비교해 보여주는 시연 상태다. 포인터가 없는 옛 백엔드에서는 이 축을 그리지
  // 않는다 — 없는 상태를 있는 척하는 버튼이 곧 죽은 코드다.
  assert.match(card, /id="prof-act-detach"/, "적용 해제 버튼이 있어야 한다");
  assert.match(app, /\{ revision: null \}/, "해제는 apply {revision:null} 이다");
  assert.match(app, /\{ follow: true \}/, "복귀는 apply {follow:true} 다");
  assert.match(app, /async function pinToRevision\(revision\)[\s\S]{0,400}\{ revision \}/,
    "옛 리비전 복귀는 0.18.0 부터 재발행이 아니라 고정이다 — 이력에 사본이 늘지 않는다");
  assert.match(app, /rollbackToRevision/, "포인터 없는 옛 백엔드용 재발행 경로는 남아야 한다");
  assert.match(actions, /optics\.source === "published"/, "설치 상태는 source 가 있으면 그걸 읽는다 — 추론은 물러난다");
  assert.match(actions, /적용 해제됨/, "detached 는 고장 경고가 아니라 비교 시연 상태로 그린다");
  assert.match(app, /setAppliedPtr\(null\)/, "포인터를 못 읽으면 이 축을 그리지 않는다");
  assert.match(card, /appliedPtr && !\(appliedPtr\.following !== false && appliedPtr\.revision == null\)/,
    "포인터 없음·미발행에서는 해제 축이 없어야 한다");

  // 발행이 곧 적용이다 — 런타임은 최신 발행본을 스스로 읽는다. 그래서 apply 는 확인이고,
  // 옛 리비전을 실어 보내면 409 다(백엔드 0.16.4). 되돌리기는 그 리비전의 **재발행**이다.
  assert.doesNotMatch(app, /\/apply`\), *revision *\?/, "옛 리비전을 apply 에 실어 보내면 안 된다 — 409 다");
  assert.match(app, /async function rollbackToRevision[\s\S]{0,400}\/copy`\)[\s\S]{0,160}fromRevision/,
    "되돌리기는 같은 카메라에서 fromRevision 으로 재발행해야 한다");
  // 응답 모양을 단정하면 키 하나 어긋난 날 성공이 빨간 줄로 보인다.
  assert.doesNotMatch(app, /res\.applied\.revision/, "응답 키를 단정하지 않는다");

  // 복사본을 "이 카메라 실측"이라고 말하면 안 된다 — 창구가 열린 이상 섞여 들어온다.
  assert.match(actions, /Number\.isFinite\(ins\.profileRevision\)/, "깔린 리비전 번호로 출처를 말해야 한다");
});


test("캘리브레이션 페이지 — 라이브 뷰와 스윕 오버레이", async () => {
  const app = await read(CAL.app);
  const overlay = await read(CAL.overlay);
  const status = await read(CAL.status);

  // 프리뷰는 공유 모듈을 쓴다. 두 벌째 구현을 두면 스트림 수명·폴백 규칙이 갈라진다.
  assert.match(app, /import \{ createCameraPreview \} from "\.\.\/\.\.\/camera\/preview\.mjs"/,
    "프리뷰는 공유 모듈이어야 한다");
  assert.doesNotMatch(app + overlay, /new EventSource|createMjpegPlayer/, "페이지가 스트림을 직접 몰면 안 된다");

  // 페이지를 여는 행위가 카메라 점유가 되면 안 된다 — 켜는 것은 사용자 선택이고 그것만 기억한다.
  assert.match(app, /calib:preview-on\.v1/, "프리뷰 켬/끔 선택을 기억해야 한다");
  assert.match(app, /addEventListener\("pagehide", bye\)/, "탭을 떠나면 업스트림도 끊어야 한다 — 유령 시청자가 카메라를 점유한다");
  assert.match(app, /const bye = \(\) => \{ preview\.stop\(\); \}/, "pagehide 가 프리뷰를 멈춰야 한다");
  assert.match(app, /await previewRef\.current\.stop\(\)/, "정지는 await 해야 한다 — 전환마다 연결이 누적된다");

  // 좌표는 언제나 1920x1080 논리 프레임이다. naturalWidth 로 재면 프리뷰 해상도가 바뀔 때
  // 오버레이만 조용히 어긋난다(화각은 그대로인데 픽셀 수만 다르다).
  assert.match(overlay, /FRAME_W = 1920, FRAME_H = 1080/, "논리 프레임 상수가 있어야 한다");
  assert.match(overlay, /viewBox=\{`0 0 \$\{FRAME_W\} \$\{FRAME_H\}`\}/, "오버레이는 논리 프레임 viewBox 를 써야 한다");
  // 단어가 아니라 **사용**을 본다 — 주석에서 "naturalWidth 를 쓰지 않는다"고 적는 것은 정당하다.
  assert.doesNotMatch(app + overlay, /\.natural(Width|Height)/, "naturalWidth 를 읽으면 안 된다");

  // 잔차는 합격선이 10px 언저리라 실척으로는 화면에서 안 보인다. 확대는 해도 되지만
  // **배율을 화면에 적어야** 한다 — 말없이 부풀린 그림은 거짓말이다.
  assert.match(overlay, /RESIDUAL_ZOOM/, "잔차 확대 배율이 상수로 있어야 한다");
  assert.match(overlay, /확대", \{ n: RESIDUAL_ZOOM \}|×\{n\} 확대/, "확대 배율을 화면에 적어야 한다");

  // recent[] 는 백엔드 모양이 바뀔 수 있다 — 없으면 조용히 건너뛰고, 성공으로 단정하지 않는다.
  assert.match(overlay, /Array\.isArray\(st\.recent\)/, "recent 를 방어적으로 읽어야 한다");
  assert.match(overlay, /s\.usable === false/, "usable 이 없을 때 성공으로 단정하지 않는다");

  // 0.17.1 의 진동 안정화(#92): settleMs 는 표본의 신뢰도 정보라 그린다. 다만 timeout 은
  // 설치 환경의 속성(고배율에서 화면이 영원히 안 멈춤)이지 고장이 아니다 — 빨간색은
  // unmeasurable/undecodable 에만 쓴다. 필드가 없는 옛 백엔드에서는 줄이 안 떠야 한다.
  assert.match(overlay, /last\.settleMs/, "표본의 안정화 대기를 보여줘야 한다");
  assert.match(overlay, /가장 조용한 순간 사용/, "timeout 은 최선 프레임 사용이라고 말해야 한다 — 고장이 아니다");
  assert.match(overlay, /settleWarn === "unmeasurable" \|\| last\.settleWarn === "undecodable"/,
    "고장 색은 진짜 문제에만 칠한다 — timeout 을 빨갛게 칠하면 정상이 사고처럼 보인다");
  assert.match(overlay, /settle !== null \|\| last\.settleWarn/, "필드가 없으면 줄 자체가 없어야 한다 (옛 백엔드)");

  // 0.19.0(#95): 판정은 구간 대 문턱이다. 구간이 게이트에 걸치면 fail 이 아니라 inconclusive —
  // 노이즈가 정한 판정을 불합격이라 부르면 완벽한 보정이 20분 재측정으로 이어진다.
  assert.match(status, /inconclusive: "판정 보류 — 측정 한계"/, "판정 보류는 불합격과 다른 말이어야 한다");
  assert.match(status, /보류 · 표본 부족/, "noise 와 few_samples 는 처방이 다르다 — 갈라 말해야 한다");
  assert.match(status, /worstOverGate/, "줌마다 기준이 달라졌으니 헤드라인은 기준 배수로 말해야 한다");
  assert.match(status, /ciAbsPx/, "오차 막대를 숫자 옆에 그려야 한다 — 맨숫자는 실제보다 정밀해 보인다");
  assert.match(status, /thresholdPx/, "기준을 하드코딩하지 않는다 — 줌마다 백엔드가 준 값을 쓴다");
  assert.match(status, /미보정 상태 측정/, "보정 전 기록의 fail 은 카메라 불량으로 읽히면 안 된다");
  assert.match(status, /certified 불린만 쓴다/, "논리 분기는 certified 로 — verdict!==fail 은 보류를 성공으로 삼킨다");
  assert.match(status, /r\.unmeasured/, "장면 탓 미측정은 판정 보류와 다른 축이다 — 따로 그린다");
  // 서버가 준 값은 텍스트로 — 사람이 적은 값이 섞이면 innerHTML 은 마크업이 된다.
  assert.doesNotMatch(overlay + status, /innerHTML|dangerouslySetInnerHTML/, "HUD·결과는 innerHTML 로 조립하지 않는다");
});


test("캘리브레이션 페이지 — 발행 게이트 거절에 화면 안의 길이 있다", async () => {
  const status = await read(CAL.status);
  // 422 quality_gate 는 alert 이 아니라 카드 안에서 다뤄야 한다.
  assert.match(status, /e\.status === 422 && e\.body && e\.body\.code === "quality_gate"/,
    "게이트 거절을 다른 실패와 갈라 다뤄야 한다");
  assert.match(status, /save\.phase === "gate"/, "거절 화면이 있어야 한다");
  assert.match(status, /그래도 발행/, "우회 버튼이 화면에 있어야 한다");
  assert.match(status, /saveSweep\(true\)/, "우회는 force 로 다시 보내야 한다");
  // 어느 줌이 스윕을 흐렸는지 없으면 남은 선택지는 20분 전체 재측정뿐이다.
  assert.match(status, /function NoisyAnchorNote\(/, "시끄러운 앵커를 짚어 줘야 한다");
  assert.match(status, /body\.noisyAnchors/, "거절할 때 앵커를 보여야 한다");
  assert.match(status, /res\.noisyAnchors/, "통과할 때도 앵커를 보여야 한다");
  // 불변 문서에 "왜 이 값이 여기 있나"가 남아야 한다. 메모는 컴포넌트 상태라 거절 화면이
  // 갈려도 사라지지 않고(옛 판은 상자를 비우며 실제로 날렸다: cam-real-002 rev 3),
  // 비었으면 우회 사유로 채워 둔다.
  assert.match(status, /if \(!note\.trim\(\)\) setNote\("발행 기준 미달을 알고 발행: "/, "비었으면 우회 사유로 채워야 한다");
  assert.match(status, /value=\{note\} onChange/, "거절 화면에도 메모 입력이 있어야 한다");
  assert.match(status, /failures && body\.failures\.length \? body\.failures : \[String\(body\.error/,
    "failures 가 비어도 왜를 보여야 한다");
  assert.match(status, /res\.forced/, "우회했다는 사실을 저장 후에도 말해야 한다");

  // fitRmsPx 는 앵커별 최댓값이다 — "피팅 67.3px" 로만 적으면 스윕 전체가 그런 줄 읽힌다.
  assert.doesNotMatch(status, /피팅 오차 \$\{r\.residual\.fitRmsPx\}px/, "최댓값을 스윕 성적처럼 적으면 안 된다");
  assert.match(status, /fitRmsMedianPx/, "대표값을 함께 보여야 한다");
});


test("캘리브레이션 페이지 — 발행이 적용까지 닿는다 (버전이 아니라 응답을 읽는다)", async () => {
  const actions = await read(CAL.actions);
  const app = await read(CAL.app);
  const status = await read(CAL.status);
  const card = await read(CAL.card);

  assert.match(actions, /export async function applyPublishedToRuntime\(id, res\)/,
    "적재 헬퍼는 발행 응답을 받아야 한다 — 무엇을 더 해야 하는지가 거기 적혀 있다");
  assert.match(actions, /reload\.required === false/,
    "백엔드가 할 일 없다고 답하면 아무것도 하지 않아야 한다 (0.17.0)");
  assert.match(actions, /postJson\(api\("\/cctv\/active"\), \{ id, force: true \}\)/,
    "옛 계약에서는 재선택이 유일한 길이고, force 없이는 unchanged:true 로 튕긴다");
  assert.doesNotMatch(actions + app + status + card, /backendVersion/,
    "백엔드 버전으로 갈래를 고르면 안 된다 — 응답이 답을 갖고 있고, 그래야 옛 갈래가 저절로 퇴역한다");

  // 발행하는 경로가 다섯이다(스윕 mint · 확인 · 복사 · 수입 · 되돌리기 재발행). 하나라도 응답을
  // 안 넘기면 그 경로만 0.17.0 에서 쓸데없이 재선택을 때린다 — 그러면 기기 컨텍스트가 다시
  // 지어지면서 스윕 결과를 쥔 캘리브레이션 매니저가 갈아치워진다(같은 스윕 두 번째 발행이 막힌다).
  // 지금은 writeAndApply 하나가 그 규칙을 갖는다: 확인·되돌리기(app)와 복사·수입(card 패널)이
  // 전부 이 관문을 지나고, 스윕 mint(status)는 결과 상자 안이라 직접 부른다.
  assert.match(app, /async function writeAndApply\(run\)[\s\S]{0,200}applyPublishedToRuntime\(await currentCameraId\(\), res\)/,
    "발행 응답이 적재 확인으로 이어져야 한다");
  const gateUses = (app.match(/writeAndApply\(/g) || []).length + (card.match(/writeAndApply\(/g) || []).length;
  assert.ok(gateUses >= 5, `확인·되돌리기·복사·수입이 전부 관문을 지나야 한다 (정의 1 + 호출 4 이상, 지금 ${gateUses})`);
  assert.match(status, /applyPublishedToRuntime\(await onSaved\.cameraId\(\), res\)/,
    "스윕 발행도 응답을 넘겨야 한다");

  // 사람을 SSH 로 보내던 문구는 사라져야 한다 — 더 싼 길을 알면서 안 알려주는 안내였다.
  assert.doesNotMatch(actions + app + status + card, /pm2 restart/, "재시작을 시키지 않는다");

  // 「적용했다」와 「할 일이 없었다」와 「안 됐다」는 다른 말이다. 셋을 한 문장으로 뭉치면
  // 사람이 화면을 안 믿기 시작한다.
  assert.match(actions, /export function appliedSuffix\(state\)/, "적재 결과를 갈라 말해야 한다");
  assert.match(actions, /발행 즉시 적용됐습니다/, "아무것도 안 해도 됐다는 사실을 말해야 한다");
  assert.match(actions, /카메라를 다시 고르면 적용됩니다/, "실패 시 사람이 할 일을 말해야 한다");
});


