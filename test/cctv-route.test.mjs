// CCTV 제어 라우트의 배선 계약.
//
// 이 파일의 앞 판본(test/cctv-page.test.mjs 의 cctv 블록들)은 public/cctv.html 원문을 훑었다.
// 라우트로 옮기면서 **좌표 계산과 검출 판정은 src/pages/cctv/actions.test.mjs 가 값으로**
// 물게 됐고(정규식보다 훨씬 강하다), 여기 남은 것은 「그 판정을 화면이 실제로 부르는가」와
// 수명주기다. 단언은 파일까지 지정한다.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (rel) => readFile(new URL(rel, import.meta.url), "utf8");
const CCTV = {
  page: "../src/pages/cctv/page.jsx",
  actions: "../src/pages/cctv/actions.mjs",
  css: "../src/pages/cctv/cctv.css",
  ptz: "../src/components/ptz-pad.jsx",
  pointer: "../src/components/use-stage-pointer.mjs",
  hook: "../src/camera/use-preview.mjs",
};

test("CCTV — 라우트 계약", async () => {
  const page = await read(CCTV.page);
  assert.doesNotMatch(page, /createRoot|initPageChrome|createCameraSelect/,
    "라우트가 자기 문서·자기 크롬을 다시 세우면 안 된다");
  assert.match(page, /export default function CctvPage\(\)/, "라우트는 기본 내보내기다");
  for (const id of ["control", "stage", "view", "detector-overlays", "cctv-ptz-overlay",
    "control-ptz-mount", "viewbar", "cctv-preview-led", "cctv-preview-status",
    "cctv-preview-start", "cctv-preview-stop", "preview-mode", "snap-res", "snap-shot",
    "crosshair-toggle", "ptz-overlay-toggle", "fps-int", "fps-actual",
    "panel", "ptz", "busy", "det-test-status", "det-test-results", "log"]) {
    assert.match(page, new RegExp(`id="${id}"`), `${id} 누락`);
  }
  // 설정·캘리브레이션·주차면 탐색은 이 화면에서 떠났다 — 잔재가 남으면 두 화면이 생긴다.
  for (const marker of ["tab-settings", "calib-card", "set-save", "apibase-input",
                        "tab-discovery", "disc-view", "home-replay", "tabs"]) {
    assert.doesNotMatch(page, new RegExp(`id="${marker}"`), `${marker} 잔재`);
  }
  assert.doesNotMatch(page, /loadCctvSettings|initCalibCard|activeTab|discoveryPreview/);
});

// 프리뷰는 공용 훅이 소유한다. 카메라 전환의 두 규칙(놓아주기가 먼저 · 폴백을 새 기기에
// 물려주지 않는다)은 그 훅 한 곳에 있고, 화면마다 배선하지 않는다 — 배선을 빠뜨린 화면이
// 조용히 유령 시청자를 남기던 부류가 구조적으로 사라졌다.
test("CCTV — 프리뷰·폴링은 공용 훅을 쓴다", async () => {
  const page = await read(CCTV.page);
  assert.doesNotMatch(page, /createCameraPreview\(/, "프리뷰 생성은 훅의 몫이다");
  assert.match(page, /storageKey: "control", wantedKey: "control:preview-on\.v1"/,
    "저장된 선택 키를 유지해야 한다 — 바뀌면 켜 두었던 사람의 선택이 사라진다");
  // 숨겨진 탭에서는 카메라를 깨우지 않는다(가드 없이 돌던 시절 하루 10만 건 폴링 사고).
  assert.match(page, /useJobPoll\(readPtz, \{ intervalMs: 800 \}\)/);
  const hook = await read(CCTV.hook);
  assert.match(hook, /registerRelease\(/);
  assert.match(hook, /preview\.destroy\(\)/);
  assert.match(hook, /await preview\.stop\(\);/, "stop 은 await 해야 한다 — 연결 누적 방지");
});

// 3D 검출은 사각형이 아니라 투영된 직육면체다. 사이드카가 주는 것은 12개 모서리의 픽셀
// 선분과 미터 값이고 2D bbox 는 아예 없다 — boxes 로 옮기면 좌표 4개의 뜻이 "사각형의 대각
// 두 점"으로 바뀌어 차 한 대가 사각형 12개가 된다. (개수·가시성 판정은 actions 가 값으로 문다.)
test("CCTV — 3D 는 큐보이드로 그리고, 개수는 그린 쪽이 센다", async () => {
  const page = await read(CCTV.page);
  const actions = await read(CCTV.actions);
  assert.match(page, /\["det-test-vpd3d", "3D Box 검출", \["vpd_3d"\]\]/, "3D 버튼이 표에 있어야 한다");
  assert.match(page, /\["vpd", "lpd", "lpr", "vpd_3d"\]/, "「전체」가 전체여야 한다");
  // 버튼 잠금이 목록 전체에 걸려야 한다 — 빠진 버튼만 테스트 중에 다시 눌린다.
  assert.match(page, /DET_TARGETS\.map\(\(\[id, label, targets\]\) => \([\s\S]{0,220}disabled=\{detBusy/);
  // 그리는 판정과 세는 판정이 한 곳이다. 갈리면 화면은 비었는데 개수를 말하는 상태가 된다.
  assert.match(page, /const drawing = detectorOverlay\(payload\);/);
  assert.match(page, /n: drawing\.drawn/);
  assert.doesNotMatch(page, /children\.length|querySelectorAll\("\.det-box"\)/,
    "노드 수로 세면 3D 큐보이드 전체가 SVG 한 장이라 차 여러 대가 1개가 된다");
  // 프레임 밖 큐보이드는 선이 그어져도 한 픽셀도 안 보인다 — 보이는 것만 세야 한다.
  assert.match(actions, /segmentHitsRect\(/);
  assert.match(actions, /result\.boxes3d/);
  // 3D 를 사각형 요소로 그리면 방위가 사라진다 — SVG 선분이어야 한다.
  assert.match(page, /<line key=\{j\}/);
});

test("CCTV — 스크린샷: 원본은 preview 경로를 타지 않는다", async () => {
  const page = await read(CCTV.page);
  const shoot = page.slice(page.indexOf("const shoot = useCallback"), page.indexOf("// ── 검출 테스트"));
  assert.match(page, /id="snap-res"/, "해상도 선택이 있어야 한다");
  assert.match(page, /<option value="full">/);
  assert.match(page, /<option value="screen">/);
  // 원본 경로: /api/snapshot 을 직접 받는다 — preview=1 을 붙이면 저해상으로 되돌아간다.
  assert.match(shoot, /fetch\(api\("\/snapshot"\) \+ "\?t=" \+ Date\.now\(\)\)/);
  assert.doesNotMatch(shoot, /api\("\/snapshot"\)\s*\+\s*"\?preview=1/);
  // 받은 JPEG 을 그대로 저장한다(캔버스 재인코딩 금지 — 화질이 한 번 더 깎인다).
  assert.match(shoot, /const blob = await r\.blob\(\)[\s\S]{0,200}saveBlob\(blob, ""\)/);
  // 화면 해상도 경로만 캔버스를 쓴다.
  assert.match(shoot, /drawImage\(view, 0, 0\)[\s\S]{0,300}saveBlob\(blob, "-screen"\)/);
  // 능력 부재(501)와 진짜 장애를 구분해 준다 — 스냅샷을 못 주는 기기가 있다.
  assert.match(shoot, /`HTTP \$\{r\.status\}`/);
});

// 조작은 영상 위에 얹힌다 — 보면서 미는 것이 이 화면의 본업이라 시선이 오가지 않아야 한다.
// 옛 위젯은 절대 이동 카드를 **DOM 째로** 무대 안으로 옮겼고, 그것이 React 재조정과 부딪히는
// 유일한 자리였다. 지금은 무대 안에 그냥 그린다.
test("CCTV — PTZ 조작은 영상 위에 있고, DOM 을 옮기지 않는다", async () => {
  const page = await read(CCTV.page);
  const ptz = await read(CCTV.ptz);
  assert.match(page, /id="cctv-ptz-overlay" className="ptz-control-overlay" hidden=\{!ptzOverlayOn\}/);
  assert.match(page, /id="control-ptz-mount" className="ptz-controls-mount"><PtzPad ctl=\{ctl\} \/>/);
  assert.match(page, /\{ptzOverlayOn && <AbsoluteMove ctl=\{ctl\} overlay \/>\}/);
  // 옛 위젯이 하던 두 가지를 금지한다: 카드를 무대로 **옮기는 것**과 템플릿 문자열로
  // 붙이는 것. 주석은 걷고 본다 — 왜 그러지 않는지를 설명하는 주석이 그 이름을 인용한다.
  // (스크린샷의 <a> 임시 삽입은 다운로드 관용구라 대상이 아니다.)
  const code = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.doesNotMatch(code(ptz), /appendChild|innerHTML/, "조작 카드를 옮기거나 문자열로 붙이지 않는다");
  assert.doesNotMatch(code(page), /stage\.appendChild|overlay\.stage/, "무대로 DOM 을 옮기지 않는다");
  // 상대 이동만 되는 계열은 돌려줄 자세가 없다 — 없는 좌표를 지어내지 않는다.
  assert.match(ptz, /if \(j\.relative\)/);
  // 절대 이동의 빈칸 규칙과 속도 정규화는 actions 가 값으로 문다.
  assert.match(ptz, /absoluteMove\(abs\)/);
  assert.match(ptz, /normalizeSpeed\(speed\)/);
});

test("CCTV — 클릭은 센터링, 끌기는 박스줌", async () => {
  const page = await read(CCTV.page);
  const pointer = await read(CCTV.pointer);
  assert.match(page, /useStagePointer\(\{ imgRef: preview\.imgRef, onClick: centerAt, onBox: zoomBox/);
  assert.match(page, /api\("\/center"\)/);
  assert.match(page, /api\("\/center-box"\)/);
  // 손을 영상 밖에서 떼는 일이 흔하다 — mouseup 이 window 가 아니면 러버밴드가 남는다.
  assert.match(pointer, /window\.addEventListener\("mouseup", up\)/);
  assert.match(pointer, /window\.removeEventListener\("mouseup", up\)/);
  // 마커는 서버 응답이 아니라 **화면에 보이는** 팬이 끝난 뒤에 중앙으로 간다(프리뷰 1~2초 지연).
  assert.match(page, /watchDisplayedMotion\(\)[\s\S]{0,600}await motion\?\.settled\(\)/);
});

// 3D 박스가 서는 자리가 설치 높이 위다 — 높이를 모르면 큐보이드의 거리와 크기가 통째로
// 배율만큼 틀린다. 그래서 PTZ 옆에 늘 보인다. (출처 순서는 actions 가 값으로 문다.)
test("CCTV — PTZ 줄에 설치 높이(H)가 함께 나온다", async () => {
  const page = await read(CCTV.page);
  assert.match(page, /<h2>현재 PTZ &amp; 높이<\/h2>/);
  const fn = page.slice(page.indexOf("const loadMountHeight = useCallback"), page.indexOf("// 높이는 카메라마다 다르다"));
  assert.match(fn, /api\(`\/profiles\/camera\//);
  assert.match(fn, /extrinsic\?\.mount\?\.heightM/);
  assert.match(fn, /simulator\/cameras/);
  // 순서가 뒤집히면 발행된 측량이 씬 값에 덮인다 — 측량이 정본이다.
  assert.ok(fn.indexOf("profiles/camera/") < fn.indexOf("simulator/cameras"),
    "발행본을 먼저 보고, 없을 때만 씬에 묻는다");
  // 카메라가 바뀌면 다시 읽는다 — 옛 값을 두면 새 카메라의 3D 가 남의 설치 높이로 읽힌다.
  assert.match(page, /\[cam\.loaded, cam\.activeId, loadMountHeight\]/);
});

test("CCTV 라우트 CSS 에 전역 선택자가 없다", async () => {
  const css = await read(CCTV.css);
  for (const global of ["html", "body", "main", ":root", "header", "h1"]) {
    assert.doesNotMatch(css, new RegExp(`^${global}\\b[^{]*\\{`, "m"), `전역 선택자 "${global}" 가 남아 있다`);
  }
  // 고정폭 1200 은 이 화면의 사정이다 — 문서 전체를 넓히면 다른 라우트까지 가로로 끌린다.
  assert.match(css, /\.cctv-main[^}]*overflow: auto/);
  assert.match(css, /#control[^}]*min-width: 1200px/);
  // 높이 계산이 문서 기준(100vh)이면 셸의 헤더·게이트 배너만큼 넘친다.
  assert.doesNotMatch(css, /100vh/);
});
