// 설정 화면(SPA 라우트)의 DOM·배선 계약.
//
// 이 파일의 앞 판본은 public/settings.html 원문 하나를 정규식으로 훑었다. 라우트로 옮기면서
// 셋으로 갈렸다: **값 판정**은 src/pages/settings/actions.test.mjs 가 값으로 물고(그쪽이 훨씬
// 강하다), **DOM 과 배선**은 여기가 파일까지 지정해 물고, 전역 CSS 금지는 라우트 CSS 를 본다.
// 단언은 파일까지 지정한다 — 어느 파일에 있어도 통과하는 뭉친 검사보다 좁다.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (rel) => readFile(new URL(rel, import.meta.url), "utf8");
const SET = {
  page: "../src/pages/settings/page.jsx",
  devices: "../src/pages/settings/devices-panel.jsx",
  server: "../src/pages/settings/server-panel.jsx",
  detect: "../src/pages/settings/detect-panel.jsx",
  actions: "../src/pages/settings/actions.mjs",
  css: "../src/pages/settings/settings.css",
};

// 각 탭이 소유한 요소 — 하나라도 빠지면 이식 중 유실된 것이다. **어느 파일에 있어야 하는지**
// 까지 적는다: 인라인 시절에는 한 파일이라 그 구분이 없었고, 그래서 「기기 탭 요소가 서버
// 탭 코드에 있다」 같은 어긋남을 검사할 방법이 없었다.
const OWNED = {
  devices: [
    "set-current",                                                              // 현재 연결
    "dev-active", "dev-list", "set-cam-id", "dev-name", "dev-type", "dev-mode", // 목록·폼
    "dev-mode-hint", "dev-calib", "dev-calib-hint", "dev-height", "dev-height-hint",
    "dev-host-fields", "set-cam-host", "set-cam-port", "set-cam-user", "set-cam-pass",
    "dev-scheme", "dev-advanced", "dev-rtsp-path", "dev-rtsp-port", "dev-stream-fps",
    "dev-mjpeg-port", "dev-timeout", "dev-insecure-tls",
    "dev-fwmodid", "dev-portid", "dev-ptzportid", "dev-streamindex",
    "dev-vptz", "dev-vptz-on", "dev-vptz-hfov", "dev-vptz-maxmag", "dev-vptz-w", "dev-vptz-h",
    "dev-add", "dev-save", "dev-del", "dev-cancel", "set-probe",                // 조작 한 줄
    "dev-editor", "dev-edit-title", "dev-msg", "set-probe-out",
  ],
  server: [
    "apibase-input", "apibase-test", "apibase-save", "apibase-clear", "apibase-status",
    "st-backend", "st-camera", "st-detector", "st-lpr", "st-llm", "set-refresh-status",
  ],
  detect: [
    "set-detector", "set-probe-det", "set-det-out",
    "set-lpr", "set-probe-lpr", "set-lpr-out",
    "set-llm-url", "set-llm-model", "set-llm-timeout", "set-llm-aliases",
    "set-llm-note", "set-probe-llm", "set-run-llm", "set-llm-out",
    "set-key-anthropic", "set-key-openai", "set-key-hint",
    "set-save", "set-save-out",
  ],
};

test("설정 페이지 — 탭마다 자기 요소를 갖는다", async () => {
  const src = {
    devices: await read(SET.devices), server: await read(SET.server), detect: await read(SET.detect),
  };
  for (const [panel, ids] of Object.entries(OWNED)) {
    for (const id of ids) {
      assert.match(src[panel], new RegExp(`id="${id}"`), `${id} 누락 (${panel} 패널)`);
    }
  }
  // 패널 표식은 CSS 가 배치를 거는 자리다(2단·최대폭). 표식이 없으면 그 규칙이 안 걸린다.
  for (const [panel, file] of [["devices", src.devices], ["server", src.server], ["detect", src.detect]]) {
    assert.match(file, new RegExp(`data-panel="${panel}"`), `${panel} 패널 표식 누락`);
  }
});

// 탭이 주소에 실린다. 예전에는 localStorage 에만 있어서 "서버 탭을 보세요"를 링크로 말할 수
// 없었다 — 「설정 열고 두 번째 탭」이라고 설명해야 했다.
test("설정 페이지 — 탭은 주소에 실리고, 주소가 없으면 저장값으로 떨어진다", async () => {
  const page = await read(SET.page);
  assert.match(page, /hrefFor\("settings", x\.id\)/, "탭은 라우트 링크여야 한다");
  assert.match(page, /TAB_KEY = "settings:tab\.v1"/, "선택은 기억한다 — 다른 화면에 다녀와도 보던 곳으로");
  assert.match(page, /TABS\.some\(\(x\) => x\.id === sub\) \? sub : \(readStoredTab\(\) \|\| "devices"\)/,
    "주소 > 저장값 > 기기 탭 순서여야 한다");
  // 주소가 비어 있으면 채워 넣는다 — 그래야 지금 보는 화면과 주소가 같은 말을 한다.
  assert.match(page, /if \(!sub\) location\.replace\(hrefFor\("settings", tab\)\)/);
  for (const name of ["devices", "server", "detect"]) {
    assert.match(page, new RegExp(`id: "${name}"`), `탭 ${name} 누락`);
  }
});

test("설정 페이지 — 설정 로드는 한 곳이고, 라우트가 자기 크롬을 다시 세우지 않는다", async () => {
  const page = await read(SET.page);
  assert.match(page, /getJson\(api\("\/cctv\/config"\)\)/, "부트에서 설정을 로드해야 한다");
  assert.match(page, /export default function SettingsPage/, "라우트는 기본 내보내기다");
  assert.doesNotMatch(page, /createRoot|initPageChrome|createCameraSelect/,
    "라우트가 자기 문서·자기 크롬을 다시 세우면 안 된다");
  // 페이지 헤더 카메라 셀렉터 없음 — 활성 전환은 '활성 기기' 드롭다운(dev-active)이 담당한다.
  // (PAGES 의 camera:false 가 셀렉터를 안 세우는 것과 같은 결정이다.)
  assert.doesNotMatch(page + (await read(SET.devices)), /header-camera-select|useCamera/);
});

test("기기 탭 — 변경은 그 자리에서 서버로 간다", async () => {
  const src = await read(SET.devices);
  // 예전에는 확정 버튼이 브라우저 배열만 고치고 화면 밖 맨 아래 '저장'을 따로 눌러야 했는데,
  // 그 버튼 이름이 '적용'이라 누른 사람은 저장된 줄 알고 나갔다.
  assert.doesNotMatch(src, /id="dev-apply"/, "'이 기기 적용'은 아무것도 확정하지 않던 버튼이다");
  assert.match(src, /async function commitDevices\([\s\S]{0,400}postJson\(api\("\/cctv\/config"\)/,
    "기기 변경은 그 자리에서 서버로 가야 한다");
  // **map 함정**: toSaveEntry 는 (x, needsHost) 라 그대로 map 하면 두 번째 인자에 배열
  // 인덱스가 들어간다 — 목록 첫 기기만 needsHost=0(falsy) 이 되어 host·비밀번호·접속 11필드가
  // 통째로 빠진다. 첫 기기만 망가지므로 눈에 잘 안 띈다.
  assert.match(src, /nextList\.map\(\(x\) => toSaveEntry\(x, needsHostOf\(devTypes, x\.type\)\)\)/,
    "toSaveEntry 를 map 에 직접 넘기면 안 된다 — 인덱스가 needsHost 자리에 들어간다");
  // 삭제는 되돌릴 수 없고 즉시 반영된다 — 목록에서 사라지는 것만으로는 그 사실이 안 전해진다.
  assert.match(src, /confirm\(t\("기기 '\{id\}' 를 삭제합니다/, "삭제는 확인을 받아야 한다");
  assert.match(src, /devices\.length <= 1/, "마지막 한 대는 지울 수 없어야 한다");
  // 작성 취소는 '삭제'가 겸하지 않는다 — 그만두려는 사람에게 삭제밖에 없는 화면이었다.
  assert.match(src, /function cancelEditor\(/, "취소는 삭제와 별개 조작이어야 한다");
  // POST 앞 게이트 둘 — 왕복을 낭비하지 않고, 무엇이 빠졌는지 그 자리에서 말한다.
  const save = src.slice(src.indexOf("async function save()"), src.indexOf("function addDevice"));
  assert.ok(save.indexOf('t("ID를 입력하세요")') < save.indexOf("commitDevices("), "ID 검사가 POST 앞이어야 한다");
  assert.ok(save.indexOf('t("host를 입력하세요")') < save.indexOf("commitDevices("), "host 검사가 POST 앞이어야 한다");
  assert.ok(save.indexOf("vptzError(") < save.indexOf("commitDevices("), "가상 PTZ 검증이 POST 앞이어야 한다");
});

// 순서가 계약이다. 빌려오기는 기기가 등록된 뒤에야 성립하고(새 기기는 422 unknown_device),
// 높이는 빌려온 그 리비전 위에 얹혀야 한다.
test("기기 탭 — 저장: 커밋 → 빌려오기 → 높이 발행 순서", async () => {
  const src = await read(SET.devices);
  const save = src.slice(src.indexOf("async function save()"), src.indexOf("function addDevice"));
  const commit = save.indexOf("await commitDevices(");
  const borrow = save.indexOf("/copy`)");
  const height = save.indexOf("publishHeightIfChanged(");
  assert.ok(commit > 0 && borrow > commit, "빌려오기는 기기 저장 뒤여야 한다");
  assert.ok(height > borrow, "높이는 빌려오기 뒤여야 한다 — 빌려온 리비전 위에 얹힌다");
  // 캘리브레이션이 바뀌면 활성 기기를 다시 만들어야 한다 — 조준 곡선은 드라이버가 생성
  // 시점에 들고 가는 값이라, 재빌드 없이는 저장만 되고 조준은 옛 곡선으로 남는다.
  assert.match(save, /rebuildActive: staged\.id === staged\.active/);
  // published 가 없는 응답에서 무방비로 .revision 을 읽으면 성공한 복사가 "복사 실패"가 된다.
  assert.match(save, /res && res\.published \? res\.published\.revision : null/);
  // 실패해도 기기 저장은 되돌리지 않고 무엇이 안 됐는지만 말한다 — 조용히 삼키면
  // "빌렸다고 생각하는" 상태가 남는다.
  assert.match(save, /프로파일 복사 실패/);
});

test("기기 탭 — 설치 높이는 발행 창구로 나가고, 빈칸은 아무 일도 하지 않는다", async () => {
  const src = await read(SET.devices);
  const fn = src.slice(src.indexOf("async function publishHeightIfChanged"), src.indexOf("async function save()"));
  // 저장 안 된 기기는 얹을 프로파일이 없다 — 칸이 잠겨 있고 발행을 시도하지도 않는다.
  assert.match(fn, /if \(!height\.ready\) return "";/, "프로파일이 없으면 시도조차 하지 않아야 한다");
  // 빈칸·무변화·NaN·범위 판정은 actions 의 stageHeight 가 값으로 문다(actions.test.mjs).
  assert.match(fn, /stageHeight\(form\.height, height\.heightM\)/);
  assert.ok(fn.indexOf("confirm(") < fn.indexOf("/extrinsic`)"), "확인이 POST 앞이어야 한다");
  assert.match(fn, /\{ heightM: st\.heightM, source: "manual" \}/,
    "이 창구로 넣는 값은 사람이 잰 것이다 — 출처가 섞이면 다음 사람이 전부 실측으로 읽는다");
  // 읽기의 레이스 가드 — 읽는 사이에 다른 기기를 골랐으면 그 화면에 남의 값을 쓰지 않는다.
  assert.match(src, /if \(seq !== heightReq\.current\) return;/);
  // 404 는 장애가 아니라 답이다. 그 갈래는 actions 의 heightHintText 가 든다.
  assert.match(await read(SET.actions), /error\.status === 404[\s\S]{0,200}발행된 프로파일이 없습니다/);
});

test("기기 탭 — 목록: 행이 곧 선택이고, 순서는 사용자가 정한다", async () => {
  const src = await read(SET.devices);
  const css = await read(SET.css);
  // 행마다 붙던 '편집' 버튼은 이름이 길면 줄바꿈이 나면서 세로로 찌그러졌다.
  assert.match(src, /onClick=\{\(\) => selectDevice\(x\.id\)\}/, "행을 누르면 선택되어야 한다");
  assert.match(src, /dev-name[\s\S]{0,400}dev-meta/, "행 정보는 이름·식별자·주소로 나뉘어야 한다");
  assert.match(css, /#dev-list[^}]*overflow-y: auto/, "기기 목록은 높이를 제한하고 스크롤해야 한다");
  // 백엔드가 배열을 정렬하지 않고 받은 차례 그대로 저장하므로, 끌어 놓은 차례가 곧 저장 차례다.
  assert.match(src, /draggable/, "행을 끌 수 있어야 한다");
  assert.match(src, /async function moveDevice\([\s\S]{0,500}commitDevices\(/,
    "순서 변경도 그 자리에서 서버에 저장되어야 한다");
  assert.match(src, /onDragOver=\{\(e\) => \{[\s\S]{0,200}preventDefault\(\)/,
    "dragover 에서 preventDefault 하지 않으면 drop 이 발생하지 않는다");
  // Firefox 는 setData 가 없으면 드래그를 시작조차 하지 않는다.
  assert.match(src, /dataTransfer\.setData\("text\/plain"/);
  // 선택 행이 보이는 범위 밖이면 목록 **안에서만** 굴린다 — scrollIntoView 는 조건이 맞으면
  // 페이지까지 함께 굴려, 고른 순간 화면이 통째로 튄다.
  assert.match(src, /list\.scrollTop \+= /);
  // 주석을 걷고 본다 — 규칙을 설명하는 주석 자체가 그 이름을 인용하기 때문이다.
  assert.doesNotMatch(src.replace(/^\s*\/\/.*$/gm, ""), /scrollIntoView/);
});

test("기기 탭 — 접속 옵션은 전부 편집기가 다룬다", async () => {
  const src = await read(SET.devices);
  const actions = await read(SET.actions);
  // 프론트가 못 채우는 필드가 있으면 그 기기는 "연결 테스트는 통과하는데 화면은 안 나오는"
  // 상태로 등록된다(IDIS 실기: scheme 이 없어 평문 포트에 TLS, rtspPath 가 없어 프리뷰 501).
  for (const key of ["scheme", "mjpegPort", "timeoutMs", "rtspPath", "rtspPort",
                     "streamFps", "insecureTls", "fwModId", "portId", "ptzPortId", "streamIndex"]) {
    assert.match(actions, new RegExp(`DEV_CONN_KEYS[\\s\\S]{0,400}"${key}"`), `${key} 를 저장 payload 가 실어야 한다`);
    assert.match(src, new RegExp(`form\\.${key}`), `${key} 를 폼이 다뤄야 한다`);
  }
  // 시뮬레이터 주소는 예외다 — 카메라의 값이 아니라 월드 하나의 값이라 기기 편집기가 다루지
  // 않는다(백엔드가 400 으로 거절한다). 시뮬레이터 화면의 「시뮬레이터 주소」가 그 자리다.
  assert.doesNotMatch(src, /id="dev-scene-port"/);
  assert.doesNotMatch(src + actions, /"scenePort"|"controlPort"/);
  // 가상 PTZ 는 타입 바깥이다(백엔드도 타입을 보지 않는다) — host 필드 안에 두면 접속 대상이
  // 없는 타입에서 통째로 숨어 편집할 길이 사라진다.
  const hostFields = src.slice(src.indexOf('id="dev-host-fields"'), src.indexOf('id="dev-vptz"'));
  assert.doesNotMatch(hostFields, /id="dev-vptz-on"/, "가상 PTZ 는 host 필드 밖에 있어야 한다");
  // 씨앗값 셀렉트의 초기값 규칙 — intrinsics 가 있으면 "__keep", 없으면 "". 이게 어긋나면
  // 저장 한 번에 씨앗값이 지워진다("" 는 명시적 제거다).
  assert.match(src, /calib: d\.intrinsics \? "__keep" : ""/);
  // 캘리브레이션은 이 페이지 소관이 아니다 — 링크만 남는다.
  assert.doesNotMatch(src, /initCalibCard/);
  assert.match(src, /href="#\/calibration"/);
});

test("검출·판독 탭 — 이 탭 저장은 자기 값만 보낸다", async () => {
  const src = await read(SET.detect);
  const save = src.slice(src.indexOf("const save = async"), src.indexOf("return ("));
  // 기기까지 실어 보내면 즉시 반영과 두 벌이 되고, 화면에서 지운 기기가 이 경로로 되살아난다.
  assert.doesNotMatch(save, /devices:/, "이 탭 저장은 기기 목록을 보내지 않아야 한다");
  // 카드를 그려 놓고 payload 에서 빠뜨리면 화면은 고쳐지는데 값이 config 에 안 닿는다.
  assert.match(save, /llm: llmConfigOf\(/, "이 탭 저장이 llm 을 실어야 한다");
  assert.match(save, /detection: \{ detector:/);
  assert.match(save, /lpr: \{ url:/);
  // 키는 적었을 때만 보낸다 — 빈칸을 보내면 백엔드가 등록된 키를 지운다.
  assert.match(save, /if \(keyA \|\| keyO\)/);
  // 저장 뒤 무중단 적용은 세 갈래로 말한다: 재빌드할 기기 없음 / 성공 / 활성 적용 실패.
  const page = await read(SET.page);
  const apply = page.slice(page.indexOf("const applyAfterSave"));
  assert.match(apply, /if \(!cfg\.activeId\) return t\("✅ 저장됨\."\)/);
  assert.match(apply, /\{ id: cfg\.activeId, force: true \}/);
  assert.match(apply, /활성 적용 실패/);
});

// 두 테스트는 **다른 것을 묻는다.** 연결은 mode 를 안 보내 별칭 목록만 읽고(추론 슬롯 0),
// 동작은 mode:"run" 으로 추론을 1회 쓴다. 이 구분이 무너지면 둘 중 하나가 거짓말이 된다 —
// 연결이 추론을 쓰면 상태 카드가 진짜 판정을 밀어내고, 동작이 안 쓰면 "붙는데 못 쓰는"
// 상태(별칭 오타·vision 미지원·스키마 거절)를 통과로 읽는다.
test("검출·판독 탭 — 연결 테스트와 동작 테스트가 갈린다", async () => {
  const src = await read(SET.detect);
  const connect = src.slice(src.indexOf("const probeLlm = async"), src.indexOf("const runLlm = async"));
  assert.doesNotMatch(connect, /mode:/, "연결 테스트는 추론을 돌리면 안 된다");
  const run = src.slice(src.indexOf("const runLlm = async"), src.indexOf("const save = async"));
  assert.match(run, /mode: "run"/, "동작 테스트는 실제로 한 번 돌려야 한다");
  // 게이트웨이는 한 번에 하나만 돌린다 — 연타가 대기열을 채우면 진짜 판정이 밀린다.
  assert.match(run, /setRunning\(true\)/, "동작 테스트는 도는 동안 잠겨야 한다");
  assert.match(src, /id="set-run-llm" disabled=\{running\}/, "그 잠금이 실제로 버튼에 걸려야 한다");
  assert.match(run, /finally \{ setRunning\(false\); \}/, "실패해도 잠금은 풀려야 한다");
  // 상태 칩은 셋으로 갈린다: 못 붙음 · 붙었지만 warmup 중 · 준비됨. 둘로 뭉개면 화면이
  // "왜 안 되는지"를 말할 수 없다(게이트웨이는 warmup 전에 추론을 거절한다).
  assert.match(await read(SET.server), /r\.ready === false[\s\S]{0,200}"warming"/, "준비 안 된 상태를 따로 말해야 한다");
});

test("설정 라우트 CSS 에 전역 선택자가 없다", async () => {
  const css = await read(SET.css);
  // SPA 에서는 방문한 화면의 CSS 가 언로드되지 않고 쌓인다 — 접두사 없는 선택자를 남기면
  // 떠난 화면의 규칙이 다음 화면을 망가뜨린다. 전역 규칙은 셸(public/index.html)의 몫이다.
  for (const global of ["html", "body", "main", ":root", "header", "h1"]) {
    assert.doesNotMatch(css, new RegExp(`^${global}\\b[^{]*\\{`, "m"), `전역 선택자 "${global}" 가 남아 있다`);
  }
  // 기기 탭은 2단이다 — 왼쪽 목록, 오른쪽 편집. 두 단은 각자 스크롤한다(목록을 훑는 동안
  // 편집 중인 폼이 함께 밀려 올라가면 안 된다).
  assert.match(css, /section\[data-panel="devices"\][^}]*flex-direction: row/, "기기 탭은 2단이어야 한다");
  assert.match(css, /\.dev-card-list[^}]*min-height: 0/, "목록 단은 자기 안에서 스크롤해야 한다");
  assert.match(css, /\.dev-col-edit[^}]*overflow-y: auto/, "편집 단은 따로 스크롤해야 한다");
});
