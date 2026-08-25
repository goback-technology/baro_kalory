// 시뮬레이터 셋업 화면의 **구조**를 지키는 그물.
//
// 판정·계산은 이제 `src/pages/simulator/{actions,geometry}.mjs` 에 있고, 그쪽 테스트가 값으로
// 문다(포트 세 갈래, 부채꼴의 FK 단, 지면 판정, 표시 반올림, 스폰 응답 방어…). 여기 남는 것은
// 정규식이라야 잡히는 두 가지다:
//   1. **화면의 뼈대** — 어느 폼에 어느 칸이 있고, 어느 탭에 무엇이 사는가.
//   2. **배선** — 그 판정을 화면이 실제로 부르는가, 그리고 **제 손으로 다시 짜지 않았는가.**
// 2 가 이 파일의 본론이다. 모듈로 옮겨 놓고 화면이 옛 식을 그대로 들고 있으면 계산 지점이
// 둘로 갈라지고, 그때 갈라지는 것은 광학 모델이다(부채꼴과 영상 위 핀이 서로 다른 식이 된다).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const simulatorPageUrl = new URL("../public/simulator.html", import.meta.url);
const read = () => readFile(simulatorPageUrl, "utf8");
// 주석은 걷어내고 본다 — 규칙을 설명하는 주석이 그 규칙의 예시를 인용하면 스스로 걸린다.
const code = (s) => s.replace(/^\s*\/\/.*$/gm, "");

// 설정 탭에는 **시뮬레이터 주소 하나뿐**이다.
//
// 카메라 목록을 여기 두지 않는 이유: 같은 목록이 이미 두 군데 있다(위쪽 카메라 피커,
// 「카메라 배치」 탭의 목록). 설정 탭에 세 번째 사본을 두면 아무 힘도 없는 목록 하나가
// 늘 뿐이고 — 읽기 전용이라 고칠 수도 없고 클릭은 위 피커로 위임했다 — 320px 칸을 넘겨
// 내용이 잘렸다(실측 203px). 옛 기기 CRUD 창이 있던 자리를 채우려다 만든 사본이었다.
test("설정 탭은 시뮬레이터 주소 하나뿐이다 — 목록 사본을 두지 않는다", async () => {
  const html = await read();
  const panel = html.slice(
    html.indexOf(`id="sim-settings-panel"`),
    html.indexOf("<!-- 우: 씬 셋업 -->"),
  );
  assert.ok(panel.length > 200, "설정 패널을 못 읽었다");
  assert.match(panel, /id="sim-endpoint-host"/);
  for (const id of ["sim-set-list", "sim-set-status", "sim-set-add", "sim-set-id",
                    "sim-set-save", "sim-set-delete"]) {
    assert.doesNotMatch(panel, new RegExp(`id="${id}"`), `${id} 는 기기 CRUD 시절의 잔재다`);
  }
  assert.doesNotMatch(html, /sim-settings-layout|sim-device-detail\b/, "편집 창이 붙던 레이아웃도 함께 사라진다");

  // 넘치면 스크롤한다. overflow:hidden 이면 스크롤바도 없이 잘려서, 잘린 줄 모른다.
  assert.doesNotMatch(html, /#sim-settings-panel,\s*\n#sim-rig-panel \{\s*\n\s*overflow: hidden/);
});

test("simulator preview shares the first-paint waiting state", async () => {
  const html = await read();
  // preview-stage 는 오버레이 CSS 와 camera-preview 의 closest() 가 함께 보는 표식이다 —
  // 빠뜨리면 이 페이지만 대기/정지 오버레이 없이 깨진 이미지 아이콘을 그린다.
  assert.match(html, /id="stage" class="preview-stage preview-waiting"/);
  assert.match(html, /id="view" class="preview-waiting-image"/);
});

// 겨누는 일은 영상에서 한다(클릭 = 센터링, 드래그 = 박스줌). 조작 패드와 절대 위치 카드는
// 같은 일을 원단위로 한 번 더 하는 자리라 걷어냈다 — 남은 것은 설치 폼의 P·T·Z 한 줄뿐이다.
test("PTZ 는 설치 폼의 한 줄뿐이다 — 오버레이도 조작 패드도 없다", async () => {
  const html = await read();
  for (const gone of ["ptz-overlay", "sim-ptz-mount", "createPtzControls", "simPtz."]) {
    assert.ok(!html.includes(gone), gone + " 를 다시 두지 않는다");
  }
  // 조작 중 표시는 어느 탭에 있든 보여야 한다 — setBusy 가 모든 버튼을 잠그므로, 안 보이는
  // 탭에서는 화면이 그냥 굳은 것처럼 보인다. 그래서 뷰바에 남는다.
  const viewbar = html.slice(html.indexOf('<div id="viewbar">'), html.indexOf('<div id="sim-bottom-tabs">'));
  assert.match(viewbar, /id="busy"/);
  // 속도를 고를 칸도 패드와 함께 사라졌다 — 남은 이동은 전부 이 상수를 쓴다(값은 actions 의 것).
  assert.match(html, /\bMOVE_SPEED,/, "이동 속도는 actions 에서 들여온다");
  assert.doesNotMatch(code(html), /MOVE_SPEED\s*=/, "화면이 제 사본을 두면 두 값이 갈린다");
});

// 이건 휴컴스 시뮬이다. 도(°)로 바꿔 적으면 프로토콜이 쓰는 수와 화면이 쓰는 수가 갈리고,
// 로그·저장위치·오라클이 전부 원단위라 눈으로 대조할 수도 없게 된다.
test("PTZ 칸은 휴컴스 원단위다 — 컨트롤 탭의 것이다", async () => {
  const html = await read();
  const form = html.slice(html.indexOf('<form id="sim-cam-drive-form"'), html.indexOf('id="sim-cam-drive-apply"'));
  assert.match(form, /id="sim-cam-edit-pan"[^>]*min="0" max="35999"/);
  assert.match(form, /id="sim-cam-edit-tilt"[^>]*min="-2000" max="9000"/);
  assert.match(form, /id="sim-cam-edit-zoom"[^>]*min="0" max="65535"/);
  assert.ok(!html.includes("TILT_PER_DEG"), "도(°) 환산을 다시 들이지 않는다");

  // PTZ 는 지금 보고 있는 카메라의 것이다 — 다른 카메라를 고른 폼에 적으면 남의 자세를 적게 된다.
  const pick = html.slice(html.indexOf("function ptzOfSelected("), html.indexOf("// 평면도에서 끌어 바꾼 자리를"));
  assert.ok(pick.length > 60 && pick.length < 400, "ptzOfSelected 를 못 읽었다");
  assert.match(pick, /cameraDeviceFor\(cam\)\?\.id !== simActiveCameraId/);

  // 적용은 창구도 폼도 갈린다: 설치는 씬 PATCH(applyInstallEdit), 현재값은 제어 POST
  // (applyDriveEdit). 한 함수에 섞여 있던 시절에는 자리를 고치려던 손이 카메라를 움직였다.
  const drive = html.slice(html.indexOf("async function applyDriveEdit("), html.indexOf("async function spawnSceneCamera("));
  assert.match(drive, /postJson\(api\("\/simulator\/control\/ptz"\)/);
  assert.ok(!/reqJson\("PATCH"/.test(drive), "조종 적용이 씬(설치)을 건드리면 안 된다");
  assert.match(drive, /driveChangeOf\(\{/, "무엇이 바뀌었나는 actions 가 답한다");
  const install = html.slice(html.indexOf("async function applyInstallEdit("), html.indexOf("async function applyDriveEdit("));
  assert.match(install, /reqJson\("PATCH"/);
  assert.ok(!/simulator\/control\/ptz/.test(install), "설치 적용이 카메라를 몰면 안 된다");
  assert.match(install, /installPatchFrom\(\{/, "보낼 필드를 고르는 일은 actions 가 한다");
});

// 시뮬은 카메라를 **설치방위 + 팬** 으로 돌린다(PanPivot->SetWorldRotation(BaseYaw + CurrentPan)).
// 부채꼴은 그 합, 즉 **지금 보는 시야**다 — 설치방위만 그리면 팬이 걸린 카메라의 부채꼴이
// 카메라가 보지 않는 곳을 가리킨다(2026-08-12 실측 89°).
//
// **어느 단을 그리는가**(배치=설치방위, 컨트롤=설치+팬)는 coneOf 가 값으로 답하고 그쪽
// 테스트가 문다. 여기서 지키는 것은 화면이 그 답을 쓰는가, 그리고 제 식을 들지 않는가다.
test("부채꼴의 단은 탭이 정하고, 그 계산은 화면 밖에 있다", async () => {
  const html = await read();
  const map = html.slice(html.indexOf("function renderMap()"), html.indexOf("function renderTiltGhost("));
  assert.ok(map.length > 2000, "renderMap 을 못 읽었으면 이 검사는 아무것도 안 지킨다");
  assert.match(map, /coneOf\(simViewByPort, cam, \{ installMode: mapTabKey\(\) !== "drive" \}\)/);
  // 모르면 그리지 않는다 — 팬을 0 으로 채우면 89° 어긋난 곳을 가리킨다(실측).
  assert.match(map, /if \(cone !== null && !aiming\)/);
  // 방향도 화각도 서버가 낸 값이다. 화면이 raw PTZ 로 지어내면 그 순간 광학 모델이 두 벌이
  // 되고, 부채꼴과 영상 위의 핀이 서로 다른 식으로 그려진다.
  assert.ok(!/panpos \/ 100|zoomHfov|wideHFovDeg/.test(code(html)),
    "브라우저가 raw PTZ 로 방위·화각을 지어내지 않는다");
  // 렌즈 한계도 서버가 낸 값(hfovRange)이다 — 고정 상수를 들이지 않는다.
  assert.doesNotMatch(code(html), /hfovRange/, "한계 판정은 actions 의 hfovLimitsOf 하나뿐이다");
});

// 시야는 **카메라마다** 다르다. 몰고 있는 한 대의 값으로 나머지를 채우면 그 값이 곧 거짓이다
// (그렇게 해서 카메라를 바꾸는 것만으로 옆 카메라의 부채꼴이 69.6° 튀었다).
test("카메라마다의 시야는 카메라마다 물어서 얻는다 — 한 대의 값을 나눠 쓰지 않는다", async () => {
  const html = await read();
  assert.match(html, /getJson\(api\("\/simulator\/ptz"\)\)/);
  // 포트별 표에서 찾는 일만 화면에 남는다 — 값 판정은 actions 다.
  assert.match(html, /const viewOf = \(cam\) => viewOfPort\(simViewByPort, cam\);/);
  // 몰고 있는 카메라가 움직이면 그 시야도 낡는다 — 폴링(5초)을 기다리지 않고 다시 받는다.
  assert.match(html, /function applyPtz\(ptz\) \{[\s\S]*?fetchSimPtz\(\)\.then\(renderMap\)/);
  // 서명도 한 벌이다 — 화면이 제 서명을 짜면 시야를 빠뜨린 옛 판이 되돌아온다.
  assert.match(html, /const rigSignature = \(\) => signatureOf\(simCameras, simViewByPort\);/);
});

// 끌기는 **자리만** 옮긴다. 방향은 팬이 정하는 값이고, 그것을 지도에서 끌어 바꾸는 일은
// 아직 넣지 않았다(이교수님 지시, 2026-08-12) — 반쯤 남은 회전 경로가 없어야 한다.
test("평면도 끌기는 자리만 옮긴다 — 회전 경로는 없다", async () => {
  const html = await read();
  const drag = html.slice(html.indexOf("function beginCameraDrag("), html.indexOf("if (mapEl) {"));
  assert.match(drag, /reqJson\("PATCH", api\(`\/simulator\/cameras\/\$\{encodeURIComponent\(drag\.cam\.id\)\}`\),\s*\n\s*\{ location: \{ x: at\.x, y: at\.y, z: drag\.from\.z \} \}\)/);
  // 셋을 함께 보낸다 — 축 하나만 보내면 나머지를 sim 이 0 으로 읽어 카메라가 원점으로 날아간다.
  assert.match(drag, /if \(x === null \|\| y === null \|\| z === null\)/);
  assert.ok(!/rotate|dragCam\.yaw|mode:/.test(drag), "회전은 아직 넣지 않는다 — 흔적도 남기지 않는다");
  // 지도 밖에서 놓으면 반영하지 않는다(SVG 밖으로 외삽된 주차장 바깥 점이라).
  assert.match(html, /if \(dragCam\.moved && !mapEl\.contains\(event\.target\)\)/);
});

// 조준 앵커(시선 막대 끝)는 두 탭에 다 서지만 **적히는 축이 다르다**: 컨트롤 탭에서는 팬
// (카메라를 돌린다, 현재값), 배치 탭에서는 설치방위(폴을 돌려 단다 — 팬 불변). 같은 손짓,
// 다른 장부다. 어느 축인가의 판정은 aimTargetFor 에 있다.
test("조준 앵커 — 컨트롤 탭은 팬, 배치 탭은 설치방위에 적는다", async () => {
  const html = await read();
  // 앵커는 막대 끝에 선다.
  const map = html.slice(html.indexOf("function renderMap()"), html.indexOf("function renderTiltGhost("));
  assert.match(map, /const tip = tipAt\(p, yaw, coneLen\);/);
  assert.match(map, /cx: tip\.x, cy: tip\.y[\s\S]*?"map-aim-handle"/);
  assert.match(map, /beginAimDrag\(cam, e, aimTarget\)/);
  assert.match(map, /const aimTarget = aimTargetFor\(cam, \{/);
  // 줌 앵커는 컨트롤 탭에만 — 줌은 순수 현재값이라 설치 축에 낄 자리가 없다.
  assert.match(map, /if \(aimTarget === "pan"\) for \(const side of \[-1, 1\]\)/);

  const aim = html.slice(html.indexOf("async function finishAimDrag("), html.indexOf("async function finishCameraDrag("));
  assert.ok(aim.length > 200, "finishAimDrag 를 못 읽었으면 이 검사는 아무것도 안 지킨다");
  // 팬 경로: 팬 = 보고 싶은 방위 − 설치방위(계산은 geometry). 하향각·줌은 그대로 되돌려보낸다.
  assert.match(aim, /const panpos = panposForYaw\(yaw, mountYawOf\(drag\.cam\)\);/);
  assert.match(aim, /postJson\(api\("\/simulator\/control\/ptz"\), \{\s*\n\s*panpos,/);
  assert.match(aim, /tiltpos: now\.tiltpos, zoompos: now\.zoompos/);
  // 끄는 사이에 활성이 바뀌었으면 남의 카메라가 돈다.
  assert.match(aim, /if \(cameraDeviceFor\(drag\.cam\)\?\.id !== simActiveCameraId\)/);
  // 설치방위 경로: 씬 PATCH 하나 — 카메라를 몰지 않는다. 배치 탭의 부채꼴이 곧 설치방위라
  // 끈 각이 곧 새 설치방위다(오프셋 셈법이 없다).
  const mount = aim.slice(aim.indexOf('if (drag.target === "mount")'), aim.indexOf("// 팬(컨트롤 탭)"));
  assert.ok(mount.length > 100, "설치방위 분기를 못 읽었으면 이 검사는 아무것도 안 지킨다");
  assert.match(mount, /const yawDeg = yaw;/);
  assert.match(mount, /reqJson\("PATCH", api\(`\/simulator\/cameras\/\$\{encodeURIComponent\(drag\.cam\.id\)\}`\), \{ yawDeg \}\)/);
  assert.ok(!/control\/ptz/.test(mount), "설치방위 끌기가 카메라를 몰면 안 된다 — 팬은 그대로다");
});

// 틸트 슬라이더 — 막대 한가운데의 **녹색 기준선이 틸트 0**(수평)이고 자리에서 움직이지
// 않는다. 움직이는 것은 앵커원뿐이다. 자리↔각 환산(tiltSliderPos/Deg)은 geometry 의 것이고
// 서로 역함수라는 것을 그쪽 테스트가 문다.
test("틸트 슬라이더 — 기준선(틸트 0)은 고정, 앵커원만 끌린다", async () => {
  const html = await read();
  const map = html.slice(html.indexOf("function renderMap()"), html.indexOf("function renderTiltGhost("));
  // 기준선은 막대 한가운데 고정이다 — 앵커를 어디로 끌든 이 선은 그대로 있어야 기준으로 읽힌다.
  assert.match(map, /const zeroAt = \{ x: p\.x \+ Math\.sin\(rad\) \* mid, y: p\.y - Math\.cos\(rad\) \* mid \};/);
  assert.match(map, /"map-tilt-zero"/);
  // 앵커원의 자리는 틸트값에서 나온다(tiltSliderPos) — 값과 그림이 한 함수로 묶인다.
  assert.match(map, /const s = tiltSliderPos\(tiltNow \/ 100, coneLen\);/);
  assert.match(map, /beginTiltDrag\(cam, e, aimTarget, yaw, coneLen\)/);
  // 틸트를 모르는 카메라(안 닿음)에는 달지 않는다.
  assert.match(map, /if \(tiltNow !== null\)/);
  // 드래그 = 커서를 광축에 투영한 트랙 위 자리 → 각. 트랙 밖은 양끝(기기 한계)에 물린다.
  assert.match(html, /const s = trackOffsetOf\(world, tiltDrag\.from, tiltDrag\.axisYaw\);/);
  assert.match(html, /tiltDrag\.tiltDeg = tiltSliderDeg\(Math\.min\(Math\.max\(s, 0\), tiltDrag\.trackLen\), tiltDrag\.trackLen\);/);

  const fin = html.slice(html.indexOf("async function finishTiltDrag("), html.indexOf("// ── 부채꼴 모서리 끌기"));
  assert.ok(fin.length > 200, "finishTiltDrag 를 못 읽었으면 이 검사는 아무것도 안 지킨다");
  // 배치 탭: 씬 PATCH(pitchDeg, 음수가 아래 — 세우기와 같은 규약). 카메라를 몰지 않는다.
  const mount = fin.slice(fin.indexOf('if (drag.target === "mount")'), fin.indexOf("// 틸트(컨트롤 탭)"));
  assert.match(mount, /\{ pitchDeg: -drag\.tiltDeg \}/);
  assert.ok(!/control\/ptz/.test(mount), "설치 하향각 끌기가 제어 창구로 나가면 안 된다");
  // 컨트롤 탭: 틸트만 바꾸고 팬·줌은 그대로 되돌려보낸다.
  assert.match(fin, /panpos: now\.panpos, tiltpos: Math\.round\(drag\.tiltDeg \* 100\), zoompos: now\.zoompos/);
  assert.match(fin, /if \(cameraDeviceFor\(drag\.cam\)\?\.id !== simActiveCameraId\)/);
});

// 줌은 **각으로** 지시한다. 사람이 지도에서 다루는 것은 부채꼴의 벌어짐이고, 그 각이 이 렌즈의
// 어느 눈금인지는 백엔드의 광학 모델이 답한다 — 브라우저가 표를 들고 역보간하면 부채꼴과
// 영상 위 핀이 서로 다른 모델로 그려진다.
test("모서리 앵커를 끌면 화각이 나간다 — 줌 눈금은 백엔드가 옮긴다", async () => {
  const html = await read();
  const map = html.slice(html.indexOf("function renderMap()"), html.indexOf("function renderTiltGhost("));
  // 앵커는 부채꼴의 두 모서리(광축 ± 반각)에 선다.
  assert.match(map, /for \(const side of \[-1, 1\]\) \{[\s\S]*?const edge = \(yaw \+ side \* half\) \* Math\.PI \/ 180;/);
  assert.match(map, /"map-fov-handle"/);
  assert.match(map, /beginFovDrag\(cam, e\)/);

  const fov = html.slice(html.indexOf("async function finishFovDrag("), html.indexOf("async function finishAimDrag("));
  assert.ok(fov.length > 200, "finishFovDrag 를 못 읽었으면 이 검사는 아무것도 안 지킨다");
  assert.match(fov, /hfovDeg: drag\.hfov/);
  assert.ok(!/zoompos:/.test(fov), "브라우저가 줌 눈금을 계산하면 광학 모델이 두 벌이 된다");
  // 팬·틸트는 그대로 되돌려보낸다 — 화각만 바꾸려던 손이 카메라를 돌려 놓으면 안 된다.
  assert.match(fov, /panpos: now\.panpos, tiltpos: now\.tiltpos/);

  // 끄는 각 → 화각(한계에 물림)은 geometry 의 hfovFromDrag 하나다.
  assert.match(html, /const hfov = hfovFromDrag\(toward, fovDrag\.axisYaw, hfovLimitsOf\(fovDrag\.cam\)\);/);
  assert.match(html, /if \(hfov === null\) return;/, "한계를 모르면 끌 것이 없다");
});

// 설치(볼트로 박는 값: x·y·H·방위·하향)와 현재값(몰면서 바뀌는 값: P·T·Z)은 다른 축이다.
// 한 폼에 섞으면 자리를 고치려던 손이 카메라를 움직인다 — 그래서 탭이 갈린다(이교수님 지시,
// 2026-08-12). 평면도는 한 장을 두 탭이 도크로 나눠 쓰고, 기즈모가 탭의 뜻이다.
test("배치/컨트롤 탭 분리 — 평면도는 한 장, 기즈모·센터링은 탭이 뜻을 정한다", async () => {
  const html = await read();
  assert.match(html, /data-sim-tab="drive">카메라 컨트롤</);
  // 평면도는 재부모화로 공유한다 — 사본을 두 장 그리면 어느 쪽이 낡았는지 아무도 모른다.
  assert.equal(html.match(/id="sim-map"/g)?.length, 1, "지도는 한 장뿐이어야 한다");
  assert.match(html, /dock\.appendChild\(pane\)/);
  // 자리 끌기는 배치 탭에서만 — 컨트롤 탭에서 마커를 누르면 고르기만 한다.
  assert.match(html, /if \(mapTabKey\(\) !== "rig"\) \{ selectSceneCamera\(cam\.id\); return; \}/);
  // 영상 센터링의 뜻도 탭이 정한다: 배치 탭에서는 조준 뒤 그 자세를 설치로 굳힌다(rebase) —
  // 클릭한 곳이 팬 0 의 정면이 되도록 폴을 돌려 다는 것. 컨트롤 탭에서는 현재값만 움직인다.
  assert.match(html, /const toInstall = mapTabKey\(\) === "rig";/);
  assert.match(html, /\/rebase`\)/);
  const rebase = html.slice(html.indexOf("async function rebaseInstallToCurrent("), html.indexOf("window.addEventListener(\"mouseup\", async (e) => {"));
  assert.ok(!/panpos|baseYaw/.test(rebase), "굳히기 산수는 백엔드의 광학 모델이 한다 — 화면은 부르기만 한다");
});

test("카메라 목록은 읽기만 한다 — 만들고 지우는 자리는 /simulator/cameras 다", async () => {
  const html = await read();
  assert.match(html, /getJson\(api\("\/simulator\/devices"\)\)/);
  // 백엔드가 405 로 답하는 경로다. 화면에 남아 있으면 저장 버튼이 조용히 실패한다.
  assert.doesNotMatch(html, /"(POST|PATCH|DELETE)", api\(`?\/simulator\/devices/);
  // 씬을 고치는 자리는 카메라 라우트 하나다.
  assert.match(html, /reqJson\("PATCH", api\(`\/simulator\/cameras\//);
  assert.doesNotMatch(html, /postJson\(api\("\/cctv\/config"\)/);
});

test("simulator camera selection and control stay isolated from CCTV active state", async () => {
  const html = await read();
  // 저장 키는 actions 의 것이다 — 화면이 제 문자열을 들면 CCTV 쪽 키와 갈라질 자리가 생긴다.
  assert.match(html, /SIM_ACTIVE_CAMERA_KEY, SIM_PREVIEW_WANTED_KEY, SIM_CROSSHAIR_KEY,/);
  assert.doesNotMatch(code(html), /SIM_ACTIVE_CAMERA_KEY\s*=/);
  assert.match(html, /postJson\(api\("\/simulator\/active"\)/);
  assert.match(html, /postJson\(api\("\/simulator\/control\/ptz"\)/);
  assert.match(html, /streamUrl: api\("\/simulator\/stream"\)/);
  assert.match(html, /snapshotUrl: api\("\/simulator\/control\/snapshot"\)/);
  assert.doesNotMatch(html, /postJson\(api\("\/cctv\/active"\)/);
});

test("simulator camera switch refreshes scene data for the selected simulator", async () => {
  const html = await read();
  assert.match(html, /function invalidateSimulatorScene\(/);
  assert.match(html, /simCatalog = null/);
  assert.match(html, /getJson\(api\("\/simulator\/catalog"\)\)/);
  assert.match(html, /getJson\(api\("\/simulator\/slots"\)\)/);
  assert.match(html, /getJson\(api\("\/simulator\/cars"\)\)/);
  assert.match(html, /await Promise\.all\(\[\s*loadPtz\(\),\s*refreshCameraPose\(\),\s*loadSimulator\(\),\s*refreshSimulatorStatus\(\{ silent: true \}\),?\s*\]\)/);
});

test("simulator overlay asks the backend for pin coordinates — no optics in the browser", async () => {
  const html = await read();
  // 2026-07-28: 투영 수식은 백엔드 관문에만 있다. 브라우저가 광학 모듈을 다시 import 하면
  // 계산 지점이 둘로 갈라져 모델이 조용히 어긋난다 — 그 회귀를 여기서 막는다.
  assert.doesNotMatch(html, /from "\.\/profile\//);
  assert.doesNotMatch(html, /projectWorldToPixel|ptzCamera/);
  assert.match(html, /postJson\(api\("\/simulator\/overlay"\)/);
  // 선택·필터 변경은 캐시된 좌표로 다시 그린다(네트워크 왕복 없음).
  assert.match(html, /function renderPins\(\)/);
  // 오라클 대조의 배율 맞추기·통계는 actions 의 compareOracle 이 값으로 답한다.
  assert.match(html, /const cmp = compareOracle\(\{ ours, truth, targets, frame:/);
});

test("리그 갱신은 활성 카메라가 갈리면 PTZ 와 핀을 다시 읽는다", async () => {
  const html = await read();
  // 보고 있던 카메라를 지우면 서버가 활성 sim 기기를 스스로 갈아 끼운다. 프리뷰는 스트림이
  // 끊긴 자리에서 새 카메라로 재연결하는데, PTZ 표시와 핀만 옛 카메라 것으로 남으면
  // 새 카메라의 영상 위에 남의 주차면 핀이 얹힌다.
  const start = html.indexOf("async function refreshRig()");
  const refresh = html.slice(start, html.indexOf("function setSceneStatus(", start));
  assert.ok(refresh.length > 200, "refreshRig 를 못 읽었다");
  assert.match(refresh, /const activeBefore = simActiveCameraId/);
  assert.match(refresh, /simActiveCameraId !== activeBefore/);
  assert.match(refresh, /lastPtz = null/);
  assert.match(refresh, /await loadPtz\(\)/);
});

test("세우기는 씬만 건드린다 — 기기를 따로 만들지 않고, 실패해도 리그를 다시 읽는다", async () => {
  const html = await read();
  const start = html.indexOf("async function spawnSceneCamera(");
  const end = html.indexOf("async function removeSceneCamera(", start);
  const spawn = html.slice(start, end);
  // 기기 등록이라는 단계가 없어졌다. `register` 를 실어 보내면 받는 쪽이 없는 값을 보내는
  // 것이고, 이름 칸은 사람이 적은 값이 아무 데도 안 가는 죽은 입력이 된다.
  assert.doesNotMatch(spawn, /register/);
  assert.doesNotMatch(spawn, /rolledBack/, "되돌릴 등록이 없으므로 롤백 분기도 없다");
  // 실패해도 씬은 바뀌었을 수 있다 — 화면을 씬으로 되맞춘다.
  assert.match(spawn, /catch \(e\) \{[\s\S]*await refreshRig\(\)/);
  // 무엇을 보낼지·왜 못 세우는지는 actions 가 답한다.
  assert.match(spawn, /spawnRequestFrom\(\{/);
  assert.match(spawn, /spawnOutcome\(r, \{ httpPort: body\.httpPort, note \}\)/);
});

// 세우기와 설치는 같은 양을 다룬다 — 한 칸 안에서 같은 값이 두 이름을 가지면, 어느 쪽이
// 무엇인지 읽는 사람이 매번 다시 맞춰 봐야 한다.
test("세우기 폼과 설치 폼은 같은 이름·같은 배치를 쓴다", async () => {
  const html = await read();
  const rowsOf = (form) => [...form.matchAll(/<div class="sim-cam-place-row">([\s\S]*?)<\/div>/g)]
    .map((m) => [...m[1].matchAll(/<span>([^<]+)<\/span>/g)].map((s) => s[1]));
  const spawn = html.slice(html.indexOf('<form id="sim-cam-form"'), html.indexOf('<form id="sim-cam-edit-form"'));
  const edit = html.slice(html.indexOf('<form id="sim-cam-edit-form"'), html.indexOf('<form id="sim-cam-drive-form"'));
  // x·y 가 세우기에 없는 이유는 그 둘이 평면도 클릭에서 오기 때문이다.
  assert.deepEqual(rowsOf(spawn), [["H", "포트", "MJPEG"]]);
  // 설치 폼은 볼트로 박는 값만 다룬다 — 자리(x·y·H)와 설치 자세(방위·하향). P·T·Z(현재값)는
  // 컨트롤 탭이다.
  assert.deepEqual(rowsOf(edit), [["x", "y", "H"], ["방위", "하향"]]);
  // 방위·하향은 평면도 클릭에서 나오는 값이라 사람이 적을 칸이 아니다 — 감췄을 뿐 그대로 나간다.
  assert.match(spawn, /<input id="sim-cam-yaw" type="hidden" \/>/);
  assert.match(spawn, /<input id="sim-cam-pitch" type="hidden" \/>/);
  assert.ok(!spawn.includes("sim-cam-grid") && !spawn.includes("sim-cam-unit"),
    "옛 라벨 격자를 남겨 두지 않는다");

  // 배치에 들어가면서 선택을 비우므로, 취소하고 나오면 드롭다운이 가리키는 카메라로 돌아와야
  // 한다 — 안 그러면 위에서는 카메라를 고르고 있는데 아래 폼은 "없습니다" 라고 말한다.
  const cancel = html.slice(html.indexOf("function cancelPlacing() {"), html.indexOf("function finishPlacing()"));
  assert.match(cancel, /syncSelectionFromPicker\(\)/);
});

test("고르는 곳은 하나다 — 드롭다운과 평면도가 같은 카메라를 가리킨다", async () => {
  const html = await read();
  // 목록 사본이 다시 생기면 "고른 카메라"가 두 벌이 되어, 화면이 A 를 보여 주면서 B 를
  // 옮길 준비를 하고 있게 된다. 세 번째 사본을 지웠던 것과 같은 이유다.
  assert.ok(!html.includes('id="sim-cam-list"'), "카메라 목록을 다시 두지 않는다");
  assert.ok(!html.includes("renderSceneCameraList"), "목록 렌더러가 남아 있으면 안 된다");

  // 누르는 순간 고르고 **그대로 끌린다.** 첫 동작을 선택으로만 끝내면, 누르고 곧장 끄는 보통의
  // 손짓이 아무것도 안 움직이는 것으로 보인다("클릭해서 옮기면 안 움직여요" — 2026-08-11).
  const begin = html.slice(html.indexOf("function beginCameraDrag("), html.indexOf("function cancelCameraDrag("));
  assert.match(begin, /if \(cam\.id !== mapSelectedCameraId\) selectSceneCamera\(cam\.id\);/);
  // (좌표가 없어 못 옮기는 경우의 return 은 남아 있어야 한다 — 없애면 축 하나만 보내게 된다.)
  assert.ok(!/mapSelectedCameraId\) \{ selectSceneCamera\(cam\.id\); return; \}/.test(begin),
    "고르지 않았다는 이유로 첫 동작을 선택에서 끝내지 않는다");
  // 끌 수 있는 것은 스폰 카메라 전부다 — 커서가 그 사실을 말한다.
  assert.match(html, /const movable = cam\.spawned !== false;/);
  assert.ok(!html.includes("pickable"), "고른 것만 끌리던 시절의 커서 갈래는 남기지 않는다");
  // 고른 카메라의 시야만 뚜렷하다 — 콘 여럿이 같은 밝기로 겹치면 어느 것이 어느 카메라의
  // 것인지 알 수 없다.
  assert.match(html, /"map-cone" \+ \(selected \? " sel" : ""\)/);
  assert.match(html, /\.map-cone\.sel \{[\s\S]*?opacity: \.22;/);
  // 색만으로는 작은 평면도에서 "지금 이것" 이 안 읽힌다.
  assert.match(html, /r: selected \? dot \* 1\.35 : dot/);

  const sel = html.slice(html.indexOf("function selectSceneCamera(id) {"),
                         html.indexOf("const sceneCameraForDevice ="));
  assert.ok(sel.length > 300, "selectSceneCamera 를 못 읽었다");
  // 평면도에서 고르면 드롭다운도 간다 — 전환 경로(프리뷰 재시작·PTZ)는 한 벌뿐이라
  // 여기서 흉내 내지 않고 change 를 흘려 보낸다.
  assert.match(sel, /camSelect\.value = device\.id;\s*\n\s*camSelect\.dispatchEvent\(new Event\("change"\)\)/);
  // 드롭다운 쪽은 selectSceneCamera 를 되부르지 않는다 — 그러면 change 가 무한히 되돈다.
  const picker = html.slice(html.indexOf("function syncSelectionFromPicker() {"),
                            html.indexOf("// ── 고른 카메라의 설치"));
  assert.ok(!picker.includes("selectSceneCamera("), "되돌이가 생긴다");
  assert.match(html, /syncSelectionFromPicker\(\);\s*\n\s*log\(t\("카메라 전환 → \{id\}"/);
});

test("설치 폼은 늘 열려 있고, 고른 카메라의 자리·설치 자세를 고칠 수 있다", async () => {
  const html = await read();
  // hidden 이면 "편집" 을 눌러야 나오는 옛 폼이다.
  assert.match(html, /<form id="sim-cam-edit-form" class="sim-cam-form">/);
  for (const id of ["sim-cam-edit-x", "sim-cam-edit-y", "sim-cam-edit-height",
                    "sim-cam-edit-bearing", "sim-cam-edit-pitch",
                    "sim-cam-edit-pan", "sim-cam-edit-tilt", "sim-cam-edit-zoom"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  // z 칸은 두지 않는다 — z 는 높이에서 나온다(z = H×100 + 지면). 두 칸에서 같은 값을
  // 고치면 지면이 조용히 어긋난다.
  assert.ok(!html.includes('id="sim-cam-edit-z"'), "z 는 H 에서 파생된다");
  // 설치 줌이라는 것도 없다 — 줌은 순수 현재값이라 씬 PATCH 에 그 필드가 없다.
  assert.ok(!html.includes('id="sim-cam-edit-install-zoom"'), "설치 줌 칸을 만들지 않는다");

  const form = html.slice(html.indexOf('<form id="sim-cam-edit-form"'), html.indexOf('<form id="sim-cam-drive-form"'));
  const rows = [...form.matchAll(/<div class="sim-cam-place-row">([\s\S]*?)<\/div>/g)]
    .map((m) => [...m[1].matchAll(/<span>([^<]+)<\/span>/g)].map((s) => s[1]));
  assert.deepEqual(rows, [["x", "y", "H"], ["방위", "하향"]]);
  assert.match(html, /\.sim-cam-place-row \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  // 단위와 설명은 title 로 내렸다 — 화면에 늘 떠 있을 글이 아니라 그 칸을 의심할 때 찾는 글이다.
  assert.ok(!form.includes('class="unit"'), "단위 꼬리표를 다시 붙이지 않는다");
  assert.match(form, /id="sim-cam-edit-height"[^>]*title="[^"]*z = H×100/);
  // 누를 것은 둘뿐이다: 적용과 삭제. 되돌리기는 폼이 씬으로 스스로 되맞으므로 할 일이 없고,
  // 파일로 남기는 일은 「씬」 탭의 씬 저장이 맡는다.
  const buttons = [...form.matchAll(/<button id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(buttons, ["sim-cam-edit-apply", "sim-cam-edit-delete"]);
  // 별명은 씬(카메라의 note)에 산다 — 여기 사본을 두지 않는다.
  assert.match(html, /id="sim-cam-edit-note"/);

  const start = html.indexOf("async function applyInstallEdit(");
  const apply = html.slice(start, html.indexOf("async function applyDriveEdit(", start));
  assert.ok(apply.length > 200, "설치 적용 함수가 있어야 한다");
  assert.match(apply, /reqJson\("PATCH", api\(`\/simulator\/cameras\//);
  // 씬이 정본이다 — 실패해도 일부는 반영됐을 수 있으므로 화면을 씬으로 되맞춘다.
  assert.match(apply, /catch \(e\) \{[\s\S]*await refreshRig\(\)/);

  // 잠금은 hidden 으로 한다 — setBusy 가 모든 button 의 disabled 를 되돌리므로, disabled 로
  // 막아 둔 삭제 버튼은 다른 작업 하나가 끝날 때 되살아난다.
  const render = html.slice(html.indexOf("function renderCameraEditForm("),
                            html.indexOf("function syncCameraEditForm("));
  assert.match(render, /sim-cam-edit-delete"\)\.hidden = !cam \|\| authored/);
  assert.match(render, /node\.disabled = !cam \|\| authored/);
  // 레벨 저작 카메라도 이름은 고칠 수 있다 — 옮기지 못하는 것은 자세가 레벨의 것이기 때문이지
  // 사람이 부르는 이름까지 레벨의 것이어서가 아니다(플러그인도 같은 규칙).
  assert.match(render, /el\.note\.disabled = !cam;/);
  assert.match(render, /sim-cam-edit-apply"\)\.hidden = !cam;/);
  // 잠긴 칸만 있고 이유가 없으면 고장으로 읽힌다 — 아이디 줄이 그 한 가지(레벨 저작)를 말한다.
  // 이름 밑에 카메라 아이디, 그 밑에 포트 둘(제어·프리뷰) — 그 두 줄이 로그·API 응답에서
  // 이 카메라를 찾는 열쇠다. 문구 판정은 actions 의 cameraTitleLine 이 값으로 답한다.
  assert.match(render, /const idLine = cameraTitleLine\(cam, picked\);/);
  assert.match(render, /cameraPortsLine\(cam\)/);
});

// 폼의 칸은 editEls() 하나가 모아 둔다. 거기 없는 이름을 쓰면 el.<이름> 이 undefined 라
// **쓰는 순간** TypeError 다 — 화면은 멀쩡해 보이고 그 동작만 조용히 끝난다. 실제로 방위 칸이
// 폼에서 사라진 뒤에도 syncCameraEditForm 이 el.yaw 에 쓰고 있어서, Ctrl+끌기로 돌릴 때마다
// 마지막 줄이 터졌다(2026-08-12). getElementById 를 세는 검사로는 안 잡히는 부류다.
test("폼에 없는 칸에는 쓰지 않는다 — editEls 가 아는 이름만 쓴다", async () => {
  const html = await read();
  const decl = html.slice(html.indexOf("const editEls = () => ({"));
  const known = new Set([...decl.slice(0, decl.indexOf("});")).matchAll(/^\s*([a-zA-Z]+):/gm)].map((m) => m[1]));
  assert.ok(known.size >= 5, "editEls 를 못 읽었으면 이 검사는 아무것도 안 지킨다");

  // `el` 은 이 파일의 다른 곳에서도 흔한 이름이라(DOM 노드), **editEls() 를 받은 함수 안에서만**
  // 본다. 주석은 지우고 본다 — 이 검사를 설명하는 주석이 스스로 걸리면 안 된다.
  const bodies = [];
  for (let i = html.indexOf("const el = editEls();"); i !== -1; i = html.indexOf("const el = editEls();", i + 1)) {
    bodies.push(code(html.slice(i, html.indexOf("\n}", i))));
  }
  assert.ok(bodies.length >= 3, "editEls 를 쓰는 함수를 못 찾았다");
  const used = new Set(bodies.flatMap((body) => [...body.matchAll(/\bel\.([a-zA-Z]+)\b/g)].map((m) => m[1])));
  const missing = [...used].filter((name) => !known.has(name));
  assert.deepEqual(missing, [], `폼에 없는 칸: ${missing.join(", ")}`);

  // 폼을 채우는 값도 같은 이름표를 쓴다 — installFieldsOf 의 키와 editEls 의 키가 갈리면
  // 그 칸만 조용히 undefined 가 된다(입력칸에 "undefined" 가 찍힌다).
  assert.match(html, /for \(const \[key, node\] of Object\.entries\(el\)\) put\(node, fields\[key\]\);/);
});

test("끌어서 바꾼 값은 폼에도 반영된다 — 저장이 방금 끈 것을 되돌리지 않게", async () => {
  const html = await read();
  // 저장은 폼과 씬을 견주어 다른 칸만 보낸다. 그래서 끌고 난 뒤 폼에 옛 방위가 남아 있으면
  // 그 값이 그대로 "돌리라는 지시"가 되어 방금 끈 것을 되돌린다.
  const sync = html.slice(html.indexOf("function syncCameraEditForm("),
                          html.indexOf("// 폼은 좌표를 cm 정수로 보여 준다"));
  assert.ok(sync.length > 200, "syncCameraEditForm 을 못 읽었다");
  assert.match(sync, /mapSelectedCameraId !== camId/);   // 옆 카메라를 끌었으면 이 폼은 그대로 둔다
  assert.match(sync, /if \(changed\.location\)/);
  // 폼을 통째로 다시 채우면 저장 안 한 손글씨(높이·하향각)가 사라진다.
  assert.ok(!/el\.height\.value =/.test(sync) && !/el\.pitch\.value =/.test(sync),
    "동기화는 끌어서 바뀐 칸만 건드린다");

  const drag = html.slice(html.indexOf("function beginCameraDrag("), html.indexOf("if (mapEl) {"));
  // 실패했을 때도 맞춘다 — 그때 폼이 봐야 할 값은 끌던 값이 아니라 지금의 씬이다.
  assert.match(drag, /finally \{[\s\S]*await refreshRig\(\);[\s\S]*syncCameraEditForm\(drag\.cam\.id, \{ location: true \}\)/);

  // 폼이 늘 열려 있으므로 "고치는 중이면 폴링을 쉰다" 는 곧 "영영 쉰다" 다. 계속 돌되
  // **칸 단위로** 건너뛴다 — 폼 전체를 잠그면 이름 한 글자를 적은 뒤로 P·T·Z 가 영영 멈추고,
  // 영상을 클릭해 센터링해도 숫자가 안 바뀌어 "적용이 안 된다"로 보인다.
  assert.match(html, /const put = \(node, value\) => \{ if \(force \|\| !dirtyFields\.has\(node\.id\)\) node\.value = value; \};/);
  assert.match(html, /addEventListener\("input", \(event\) => \{ if \(event\.target\?\.id\) dirtyFields\.add\(event\.target\.id\); \}\)/);
  assert.ok(!html.includes("formDirty"), "폼 전체를 잠그는 잠금장치를 다시 두지 않는다");
  // 카메라를 바꾸면 옛 카메라에 적던 손글씨는 뜻을 잃는다 — 남겨 두면 다음 적용이 남의 값을 보낸다.
  assert.match(html, /mapSelectedCameraId = id;\s*\n\s*markClean\(\);/);
  // 센터링·박스줌·절대이동·앵커조준·틸트앵커·모서리줌·PTZ리셋은 PTZ 를 바꾼다.
  // 폴링(5초)을 기다리면 "눌렀는데 안 바뀐다"로 보인다. 갱신을 한 함수에 모아 둔 이유는
  // 자리마다 빠뜨렸기 때문이다 — 절대이동은 값을 보내 놓고 폼을 안 고쳐, 방금 보낸 값이
  // 화면에 돌아오지 않았다.
  assert.equal(html.match(/applyPtz\(j\.ptz\)/g)?.length, 7);
  assert.ok(!/lastPtz = j\.ptz/.test(html), "직접 대입하면 그 자리만 갱신을 빠뜨린다");
  // 카메라를 바꾸는 순간 옛 카메라의 팬을 새 카메라에 물려주지 않는다(남의 시야를 그리게 된다).
  assert.match(html, /simActiveCameraId = camSelect\.value;[\s\S]*?lastPtz = null;/);
});

test("저장된 씬은 카메라가 아니라 씬의 것이다 — 씬 탭에서 다루고 씬 상태줄에 적는다", async () => {
  const html = await read();
  const info = html.slice(html.indexOf('data-sim-tab-panel="info"'),
                          html.indexOf('data-sim-tab-panel="settings"'));
  // 저장본은 세운 카메라 + 차량 전체다. 카메라 옆에 두면 "이 카메라를 저장한다" 로 읽힌다.
  assert.match(info, /id="sim-scene-name"/);
  assert.match(info, /id="sim-scene-save"/);
  assert.match(info, /id="sim-scene-list"/);
  assert.match(info, /id="sim-scene-status"/);
  // 초기화와 복원은 같은 축의 양끝이라 한자리에 있어야 한다.
  assert.match(info, /id="sim-reset"/);

  const rig = html.slice(html.indexOf('data-sim-tab-panel="rig"'),
                         html.indexOf('data-sim-tab-panel="info"'));
  assert.ok(!rig.includes("sim-scene-save"), "저장 버튼이 카메라 칸에 남아 있으면 안 된다");

  // 결과도 씬 상태줄에 적는다 — 카메라 상태줄에 적으면 씬 전체의 일이 고른 카메라 하나의
  // 일처럼 읽힌다(버튼을 옮긴 것과 같은 이유다).
  const snap = html.slice(html.indexOf("async function loadSavedScenes("),
                          html.indexOf('document.getElementById("sim-cam-add").addEventListener'));
  assert.ok(!snap.includes("setCamStatus("), "저장/복원은 카메라 상태줄을 쓰지 않는다");
  assert.ok(snap.split("setSceneStatus(").length > 5, "씬 상태줄로 말한다");
});

// 이 화면의 저장은 **서버에 남는 저장**이다. 예전에는 스냅샷 JSON 을 브라우저가 내려받게
// 했는데, 그 파일은 받은 사람의 다운로드 폴더 밖에서는 존재하지 않았다 — 시뮬을 재시작하고
// 나서 되돌릴 것이 실제로 남아 있지 않았다는 뜻이다.
test("씬 저장은 서버로 간다 — 다운로드로 떨어뜨리지 않는다", async () => {
  const html = await read();
  const save = html.slice(html.indexOf("async function putScene("),
                          html.indexOf("async function saveSceneAs("));
  assert.match(save, /reqJson\("PUT", api\(`\/simulator\/scenes\//);
  // 본문 없이 부른다 — 서버가 시뮬에서 직접 읽는다(화면이 낡은 사이 저장하면 옛 씬이 남는다).
  assert.ok(!/JSON\.stringify/.test(save), "브라우저가 씬을 실어 나르지 않는다");

  const scenes = html.slice(html.indexOf("let savedScenes = [];"),
                            html.indexOf('document.getElementById("sim-cam-add").addEventListener'));
  assert.match(scenes, /getJson\(api\("\/simulator\/scenes"\)\)/);
  assert.match(scenes, /reqJson\("DELETE", api\(`\/simulator\/scenes\//);
  assert.match(scenes, /\/restore`\)/);

  // 내려받기 경로의 잔재가 남으면 저장이 두 곳으로 갈린다.
  for (const gone of ["createObjectURL", "sim-snap-save", "sim-snap-load", "sim-snap-file", "a.download"]) {
    assert.ok(!html.includes(gone), `내려받기 잔재가 남아 있다: ${gone}`);
  }
});

test("씬 탭을 열면 저장 목록을 서버에서 다시 읽는다", async () => {
  const html = await read();
  assert.match(html, /if \(key === "info"\) loadSavedScenes\(\);/);
});

// 이름을 고치는 것과 내용을 고치는 것은 다른 일이다. 한 버튼으로 묶으면(= 새 이름으로 저장)
// 이름만 고치려던 사람이 그 사이 달라진 씬까지 저장본에 옮겨 담게 된다.
test("이름 바꾸기는 서버가 파일을 옮긴다 — 새 이름으로 다시 저장하는 것이 아니다", async () => {
  const html = await read();
  const rename = html.slice(html.indexOf("async function renameSavedScene("),
                            html.indexOf("async function deleteSavedScene("));
  assert.match(rename, /postJson\(api\(`\/simulator\/scenes\/\$\{encodeURIComponent\(scene\.name\)\}\/rename`\)/);
  assert.ok(!rename.includes("putScene("), "이름 바꾸기가 지금 씬을 저장하면 내용이 함께 바뀐다");
  assert.ok(!/reqJson\("DELETE"/.test(rename), "옮기는 것이지 지웠다 다시 만드는 것이 아니다");

  // 덮어쓰기는 반대다: 이름은 그대로 두고 지금 씬을 담는다.
  const over = html.slice(html.indexOf("async function overwriteSavedScene("),
                          html.indexOf("async function renameSavedScene("));
  assert.match(over, /putScene\(scene\.name\)/);
});

// 저장되는 것은 카메라 하나가 아니라 이 월드다. 빈 칸을 두면 눈앞의 카메라 별명을 적게 되어
// 저장본 이름이 카메라 이름과 같아진다(실제로 그렇게 됐다).
test("저장 이름 칸은 비어 있으면 레벨 이름으로 채운다", async () => {
  const html = await read();
  const load = html.slice(html.indexOf("async function loadSavedScenes("),
                          html.indexOf("function renderSavedScenes("));
  assert.match(load, /getElementById\("sim-level"\)/);
  assert.match(load, /!nameEl\.value\.trim\(\)/);
});

test("카메라 배치 목록은 씬을 주기적으로 다시 읽되, 바뀐 게 없으면 다시 그리지 않는다", async () => {
  const html = await read();
  const start = html.indexOf("async function pollRig()");
  const end = html.indexOf("setInterval(", start);
  assert.ok(start > 0 && end > start, "주기 갱신 함수가 있어야 한다");
  const poll = html.slice(start, end);
  // 게이트는 두 단이다(2026-08-22 감사 [35]). 조준(PTZ)·영상 위 핀은 **어느 탭에서든**
  // 보이므로 그 갱신은 숨김 여부만 본다 — 옛 판처럼 지도 탭 게이트를 머리에 두면 기본
  // 탭(로그)에서 핀이 무기한 옛 자세로 남았다. 무거운 리그 갱신(카메라 목록·전체 시야·포트)만
  // 지도가 보일 때(rig/drive) 돈다 — 안 보는 지도를 위해 시뮬 게임스레드를 깨우지 않는다.
  assert.ok(poll.includes("if (document.hidden) return;"), "숨김 게이트가 머리에 있어야 한다");
  const ptzIdx = poll.indexOf('getJson(api("/simulator/control/ptz"))');
  const tabGate = poll.indexOf("if (mapTabKey() === null) return;");
  const rigFetch = poll.indexOf("fetchSimCameras()");
  assert.ok(ptzIdx > -1 && tabGate > -1 && rigFetch > -1, "두 단 게이트의 재료가 다 있어야 한다");
  assert.ok(ptzIdx < tabGate && tabGate < rigFetch,
    "조준 갱신은 탭 게이트보다 앞, 리그 갱신은 그 뒤여야 한다");
  // 사람이 배치 중이거나 조작이 도는 중에는 다시 그리지 않는다 — setBusy 가 모든 버튼의
  // disabled 를 되돌리므로 잠가 둔 버튼이 되살아난다. 끄는 중에 지도를 다시 만들면 끌던
  // 것이 손 아래에서 사라진다.
  //
  // **편집 중은 여기서 빠진다.** 폼이 늘 열려 있으므로 그걸로 쉬면 영영 쉰다 — 손대는 중인
  // 칸을 지키는 일은 dirtyFields 가 폼 안에서 맡는다.
  assert.match(poll, /placing \|\| dragCam \|\| busyEl\.textContent/);
  assert.ok(!poll.includes("editingCameraId"), "편집 여부로 폴링을 멈추지 않는다");
  // 조준(PTZ)은 이 화면만 바꾸는 값이 아니다 — 밖에서 돌아간 카메라 앞에서 화면이 옛 자세를
  // 계속 말하면, 값이 "연동되지 않는다" 로 보인다. 달라졌을 때만 고쳐 쓴다.
  assert.match(poll, /if \(ptz && fmt\(ptz\) !== fmt\(lastPtz\)\)/);
  // 바뀐 게 없으면 그리지 않는다(스크롤·커서 튐 방지).
  assert.match(poll, /if \(rigSignature\(\) === before\) return;/);
  // 등록부는 주기 호출 대상이 아니다 — loadCameras 는 활성 기기를 서버에 쓴다.
  assert.doesNotMatch(poll, /loadCameras\(/);
  // 포트는 옆 세션의 스폰이나 시뮬 재시작으로 낡는다. 다만 조기반환 **뒤**여야 한다 —
  // 앞에 두면 아무것도 안 바뀐 5초 주기마다 요청 하나를 공짜로 버린다.
  const early = poll.indexOf("if (rigSignature() === before) return;");
  const fetchPorts = poll.indexOf("fetchSimPorts()");
  assert.ok(fetchPorts > -1 && early < fetchPorts, "포트 갱신은 조기반환보다 뒤에 있어야 한다");
});

// 시뮬레이터 주소는 카메라와 별개다 — 카메라를 전부 지워도 연결이 남아야 한다.
// 회귀(2026-08-11): 주소가 카메라 기기의 scenePort 에 얹혀 있어서, 기기를 전부 지우자
// 백엔드가 인메모리 더블로 내려가고 화면이 실제 주차장 대신 빈 씬을 그렸다.
test("주소는 카메라가 아니라 시뮬레이터(월드)의 것이다 — 자기 화면과 자기 라우트를 갖는다", async () => {
  const html = await read();
  // 계정도 월드의 것이다 — 카메라마다 복사돼 있던 것을 이 한 자리로 모았다.
  for (const id of ["sim-endpoint-host", "sim-endpoint-port", "sim-endpoint-timeout",
                    "sim-endpoint-user", "sim-endpoint-pass",
                    "sim-endpoint-probe", "sim-endpoint-save", "sim-endpoint-status"]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} 누락`);
  }
  assert.match(html, /getJson\(api\("\/simulator\/endpoint"\)\)/, "시뮬레이터 주소를 읽어 와야 한다");
  assert.match(html, /reqJson\("PUT", api\("\/simulator\/endpoint"\)/, "주소는 PUT 으로 저장한다");
  // 기기 편집 폼은 제어 포트를 보내지 않는다 — 백엔드가 400 으로 거절한다.
  assert.doesNotMatch(html, /id="sim-set-sceneport"/);
  // 옛 이름을 값으로 다루는 곳이 없어야 한다(주석에 이름이 나오는 것은 내력 설명이라 무해).
  // 남아 있으면 그 이름으로 보낸 저장이 백엔드에서 400 으로 끊긴다 — 조용히 무시했다면
  // "포트 없음" = **해제**로 읽혀 시뮬레이터 주소가 통째로 지워졌을 값이다.
  assert.doesNotMatch(html, /\bscenePort\b\s*[:.=]|\.scenePort\b/);
  assert.match(html, /controlPort/, "제어 포트는 시뮬레이터 하나의 것이다");

  // 빈 칸을 어떻게 다루는가(특히 비밀번호)는 actions 의 endpointPayload 규칙이다 — 화면은
  // 칸을 읽어 넘기기만 한다. 여기서 다시 조립하면 그 규칙이 두 벌이 된다.
  const start = html.indexOf("function readEndpointForm()");
  const form = html.slice(start, html.indexOf("async function loadSceneEndpoint(", start));
  assert.match(form, /return endpointPayload\(\{/);
  assert.ok(!/\.\.\.\(/.test(form), "빈 칸 규칙을 화면이 다시 짜지 않는다");
});

// JS 가 부르는 element id 는 전부 DOM 에 있어야 한다. getElementById(...).disabled 처럼
// 곧바로 속성을 쓰는 자리가 많아, 없는 id 가 하나만 남아도 그 탭이 통째로 죽는다 —
// 입력칸을 지우면서 참조를 안 고쳐 실제로 그랬다(2026-08-11).
test("화면이 부르는 element id 는 전부 실재한다", async () => {
  const html = await read();
  const referenced = new Set([...html.matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]));
  const present = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  assert.ok(referenced.size > 50, "참조를 못 읽었다");
  assert.deepEqual([...referenced].filter((id) => !present.has(id)), []);
});

// 스폰 포트의 정본은 서버다. 세 갈래 판정과 대역 만원 문구는 actions 가 값으로 문다 —
// 여기서 지키는 것은 화면이 그 판정을 부르고 **제 관례를 다시 들이지 않는가**다.
// 8200 하드코딩이 정확히 그 사고였다(2026-08-17 재현: 대역 8030~8040 인스턴스에서 409).
test("스폰 포트는 서버가 정한다 — 화면은 관례를 다시 들이지 않는다", async () => {
  const html = await read();
  assert.match(html, /api\("\/simulator\/ports"\)/, "대역·빈 쌍을 서버에서 읽어야 한다");
  assert.match(html, /const pickSpawnPorts = \(\) => pickPorts\(simPortInfo,/);
  assert.match(html, /const portBand = \(\) => bandOf\(simPortInfo\);/);
  assert.match(html, /const bandFullNotice = \(\) => bandFullOf\(simPortInfo\);/);
  // 관례 탐색(8200·+100)은 대역 없는 인스턴스 전용이라 actions 안에만 산다.
  assert.doesNotMatch(code(html), /8200|nextFree/, "화면이 포트 관례를 다시 알면 안 된다");

  // 대역이 꽉 찼으면 폼을 여는 순간 말한다 — 빈칸은 "입력하세요"로 끝나 사람이 아무 값도
  // 안 된다는 사실을 시도해 봐야만 알게 된다.
  const finish = html.slice(html.indexOf("function finishPlacing"), html.indexOf("function beginCameraDrag"));
  assert.match(finish, /bandFullNotice\(\)/, "폼을 여는 순간 알려야 한다");
  // 직전에 세운 카메라의 근거가 다음 카메라에 묻어가면 기록이 있는 것처럼 보이면서 틀린다.
  assert.match(finish, /getElementById\("sim-cam-note"\)\.value = "";/);
  // 대역은 폼에도 새겨진다 — min/max 와 힌트 줄(실재하는 id 여야 한다).
  assert.match(html, /id="sim-cam-port-range"/);
  assert.match(html, /const hint = portRangeHint\(simPortInfo\);/);
});

// 씬 API 에는 감사 로그가 없다. 그래서 카메라의 note(이름)가 "누가 왜 세웠나"의 유일한
// 기록이고, 비워 둘 수 있게 하면 그 답이 아무 데도 남지 않는다 — 2026-08-17 에 실제로
// 서버 씬의 카메라 한 대를 두고 그 답을 못 찾았다(note 가 빈 문자열이었다).
test("세우기는 이름을 요구한다 — 출처가 씬에 남는 유일한 기록이다", async () => {
  const html = await read();
  const form = html.slice(html.indexOf('<form id="sim-cam-form"'), html.indexOf('id="sim-cam-spawn"'));
  assert.match(form, /id="sim-cam-note"[^>]*required/, "세우기 폼에 필수 이름 칸이 있어야 한다");

  const fn = html.slice(html.indexOf("async function spawnSceneCamera"), html.indexOf("async function removeSceneCamera"));
  // 검증은 POST 보다 먼저다 — 자리·높이까지 다 정한 뒤에 받는 거절은 비싸다.
  const guard = fn.indexOf("if (error) { setCamStatus(error); return; }");
  const post = fn.indexOf('postJson(api("/simulator/cameras")');
  assert.ok(guard > -1 && guard < post, "못 세우는 이유는 POST 보다 먼저 답해야 한다");
  // 이름은 스폰 본문에 실린다(그 조립은 actions 의 spawnRequestFrom 이 한다).
  assert.match(fn, /const note = body\.note;/);

  // 스폰 응답은 방어적으로 읽는다. 한 번 관측된 실패에서 응답에 `camera` 키가 없었는데
  // **카메라는 실제로 세워져 있었다** — r.camera.id 를 곧장 읽으면 성공한 스폰에서 예외가 나
  // 화면이 "실패"라고 말하면서 카메라는 씬에 서 있는 상태가 된다(baro_memo #55 코멘트).
  assert.doesNotMatch(code(fn), /r\.camera/, "응답의 camera 를 화면이 직접 읽으면 안 된다");
  assert.match(fn, /if \(out\.needsNoteRetry\)/,
    "이름 보정은 카메라를 받았을 때만 — 간헐 실패에는 재시도가 맞는 모양이다");
});
