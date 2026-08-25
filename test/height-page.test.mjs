// 설치 높이 라우트의 배선 계약. 값 판정(게이트·문구·경계)은 src/pages/height/actions.test.mjs
// 가 값으로 물고, 여기서는 그 판정을 화면이 **실제로 부르는가**와 수명주기를 본다.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (rel) => readFile(new URL(rel, import.meta.url), "utf8");
const HGT = {
  page: "../src/pages/height/page.jsx",
  actions: "../src/pages/height/actions.mjs",
  css: "../src/pages/height/height.css",
};

test("설치 높이 — 라우트 계약", async () => {
  const page = await read(HGT.page);
  // 라우트는 스스로 마운트하지 않는다 — 셸의 라우트 표가 부른다.
  assert.doesNotMatch(page, /createRoot|initPageChrome|createCameraSelect/,
    "라우트가 자기 문서·자기 크롬을 다시 세우면 안 된다");
  assert.match(page, /export default function HeightPage\(\)/, "라우트는 기본 내보내기다");
  // 화면이 갖는 것 — 하나라도 빠지면 이식 중 유실된 것이다.
  for (const id of ["hgt-wrap", "hgt-stage", "hgt-view", "hgt-phase", "hgt-status", "hgt-fps",
    "hgt-preview-start", "hgt-preview-stop", "hgt-preview-mode",
    "hgt-result-card", "hgt-result-state", "hgt-result-body",
    "hgt-extrinsic", "hgt-extrinsic-state",
    "hgt-manual-m", "hgt-manual-source", "hgt-manual-operator", "hgt-manual-note",
    "hgt-manual-publish", "hgt-manual-msg",
    "hgt-job-state", "hgt-ready", "hgt-optics-warn", "hgt-start", "hgt-stop", "hgt-job-msg"]) {
    assert.match(page, new RegExp(`id="${id}"`), `${id} 누락`);
  }
});

// 프리뷰는 공용 훅이 소유한다. 이 화면이 스스로 createCameraPreview 를 부르면 놓아주기
// 세 갈래를 또 손으로 배선해야 하고, 빠뜨린 화면이 조용히 유령 시청자를 남긴다.
test("설치 높이 — 프리뷰·폴링은 공용 훅을 쓴다", async () => {
  const page = await read(HGT.page);
  assert.doesNotMatch(page, /createCameraPreview\(/, "프리뷰 생성은 훅의 몫이다");
  assert.match(page, /useCameraPreview\(\{ storageKey: "height", wantedKey: "height:preview-on\.v1"/,
    "저장된 선택 키를 유지해야 한다 — 바뀌면 켜 두었던 사람의 선택이 사라진다");
  // 잡이 도는 동안만 되풀이해 묻고, 끝나면 스스로 멈춘다.
  assert.match(page, /useJobPoll\(loadJob, \{ intervalMs: 1500, enabled: running \}\)/);
  const hook = await read("../src/app/hooks/use-camera-preview.mjs");
  assert.match(hook, /registerRelease\(/, "카메라 전환 전에 놓아줘야 한다");
  assert.match(hook, /preview\.destroy\(\)/, "언마운트에서 위젯을 거둬야 한다");
  assert.match(hook, /window\.addEventListener\("pagehide", bye\)/, "문서 이탈도 막아야 한다");
  // 기억한 선택은 **카메라 목록을 받은 뒤에** 복원한다 — 그 전에는 어느 기기를 보게 될지
  // 서버도 화면도 확정하지 않은 상태다.
  assert.match(hook, /if \(!loaded \|\| restored\.current\) return;/);
});

test("설치 높이 — 잡이 도는 동안 카메라를 잠그되 프리뷰는 잠그지 않는다", async () => {
  const page = await read(HGT.page);
  // 잡이 몰고 있는 카메라를 갈아타면 결과가 다른 기기 것으로 섞인다.
  assert.match(page, /cam\.setEnabled\(!running\)/);
  // 프리뷰 조작은 예외다 — 잡이 도는 동안 카메라가 어디를 보고 있는지 확인하는 것이
  // 이 화면에서 영상을 켜는 유일한 이유다. 그때 못 켜면 프리뷰가 있을 이유가 없다.
  const previewBar = page.slice(page.indexOf('id="hgt-preview-start"'), page.indexOf('id="hgt-status"'));
  assert.doesNotMatch(previewBar, /disabled=\{running\}/, "프리뷰 버튼은 잡과 무관해야 한다");
  // 중지는 도는 동안에만 눌린다. 시작은 도는 동안 잠기고, 축이 없는 배포에서도 잠긴다.
  assert.match(page, /id="hgt-stop" disabled=\{!running\}/);
  assert.match(page, /id="hgt-start"[\s\S]{0,140}disabled=\{running \|\| !!jobError\}/);
});

test("설치 높이 — 발행 창구와 그 순서", async () => {
  const page = await read(HGT.page);
  // 시공 입력은 정본이다 — 발행본은 불변이고 정정도 새 리비전이라, 누르기 전에 말한다.
  const manual = page.slice(page.indexOf("async function publishManual"), page.indexOf("async function startJob"));
  assert.ok(manual.indexOf("manualHeightError(") < manual.indexOf("confirm("), "범위 검사가 확인 앞이어야 한다");
  assert.ok(manual.indexOf("confirm(") < manual.indexOf("/extrinsic`)"), "확인이 POST 앞이어야 한다");
  assert.match(manual, /source: manual\.source/, "출처는 사람이 고른 값이어야 한다");
  // 자동 측정은 보조 출처다 — 창구가 다르고(/height/publish), 근거가 문서에 함께 실린다.
  const measured = page.slice(page.indexOf("async function publishMeasured"));
  assert.ok(measured.indexOf("confirm(") < measured.indexOf('/height/publish'), "확인이 POST 앞이어야 한다");
  assert.match(measured, /api\("\/height\/publish"\)/);
  // 수 분간 카메라를 점유하고 그동안 수동 이동이 막힌다 — 누르기 전에 그 사실을 말한다.
  const start = page.slice(page.indexOf("async function startJob"), page.indexOf("async function stopJob"));
  assert.ok(start.indexOf("confirm(") < start.indexOf('/height/start'), "확인이 시작 앞이어야 한다");
});

test("설치 높이 — 문턱은 응답이 주고, 브라우저가 광학을 계산하지 않는다", async () => {
  const page = await read(HGT.page);
  const actions = await read(HGT.actions);
  // 문턱을 화면이 베끼면 백엔드가 값을 바꾼 날 화면만 옛 문턱으로 판정한다.
  assert.match(page, /resultSummary\(job\.result, job\.gates \|\| \{\}\)/);
  assert.match(actions, /gates\.grid \|\| \{\}/);
  assert.match(actions, /gates\.plate \|\| \{\}/);
  assert.doesNotMatch(actions.replace(/^\s*\/\/.*$/gm, ""), /minSpreadDeg\s*[:=]\s*\d/, "문턱 값을 화면이 들고 있으면 안 된다");
  // 픽셀→각 변환은 백엔드의 몫이다 — 이 화면에는 화각·초점거리 수식이 없어야 한다.
  // 주석은 걷고 본다: 왜 백엔드가 계산하는지를 설명하는 주석이 그 이름을 인용하기 때문이다.
  const code = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code(page) + code(actions), /zoomHfov|hfovDeg|focal/i);
});

test("설치 높이 라우트 CSS 에 전역 선택자가 없다", async () => {
  const css = await read(HGT.css);
  for (const global of ["html", "body", "main", ":root", "header", "h1"]) {
    assert.doesNotMatch(css, new RegExp(`^${global}\\b[^{]*\\{`, "m"), `전역 선택자 "${global}" 가 남아 있다`);
  }
  // 고정폭 1240 은 이 화면의 사정이다 — 문서 전체를 넓히면 다른 라우트까지 가로로 끌린다.
  assert.match(css, /\.hgt-main[^}]*overflow: auto/);
  assert.match(css, /#hgt-wrap[^}]*min-width: 1240px/);
  // 화면마다 조금씩 다른 「같은 이름」이 한 문서에 모이면 나중 것이 앞의 것을 조용히 덮는다.
  for (const bare of ["\\.kv", "\\.badge", "\\.frow"]) {
    assert.doesNotMatch(css, new RegExp(`^${bare}\\b`, "m"), `접두사 없는 선택자 ${bare} 가 남아 있다`);
  }
});
