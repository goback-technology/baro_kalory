// 시뮬레이터 셋업 **라우트**의 구조를 지키는 그물.
//
// 판정·계산은 `src/pages/simulator/{actions,geometry}.mjs` 에 있고 그쪽 테스트가 값으로 문다
// (포트 세 갈래, 부채꼴의 FK 단, 지면 판정, 표시 반올림, 스폰 응답 방어…). 여기 남는 것은
// 정규식이라야 잡히는 두 가지다:
//   1. **화면의 뼈대** — 어느 폼에 어느 칸이 있고, 어느 탭에 무엇이 사는가.
//   2. **배선** — 그 판정을 화면이 실제로 부르는가, 그리고 **제 손으로 다시 짜지 않았는가.**
// 2 가 본론이다. 모듈로 옮겨 놓고 화면이 옛 식을 그대로 들고 있으면 계산 지점이 둘로 갈라지고,
// 이 화면에서 갈라지는 것은 광학 모델이다(부채꼴과 영상 위 핀이 서로 다른 식이 된다).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (f) => readFile(new URL(`../src/pages/simulator/${f}`, import.meta.url), "utf8");
const page = () => read("page.jsx");
const map = () => read("map.jsx");
// 주석은 걷어내고 본다 — 규칙을 설명하는 주석이 그 규칙의 예시를 인용하면 스스로 걸린다.
const code = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
// 「H·포트」 같은 칸 이름표를 줄 단위로 뽑는다.
const rowsOf = (form) => [...form.matchAll(/className="sim-cam-place-row">([\s\S]*?)<\/div>/g)]
  .map((m) => [...m[1].matchAll(/<span>([^<]+)<\/span>/g)].map((s) => s[1]));

// 설정 탭에는 **시뮬레이터 주소 하나뿐**이다.
//
// 카메라 목록을 여기 두지 않는 이유: 같은 목록이 이미 두 군데 있다(위쪽 카메라 피커, 평면도).
// 세 번째 사본을 두면 아무 힘도 없는 목록 하나가 늘 뿐이고 — 읽기 전용이라 고칠 수도 없고
// 클릭은 위 피커로 위임했다 — 320px 칸을 넘겨 내용이 잘렸다(실측 203px).
test("설정 탭은 시뮬레이터 주소 하나뿐이다 — 목록 사본을 두지 않는다", async () => {
  const src = await page();
  const panel = await read("endpoint-panel.jsx");
  assert.ok(panel.length > 200, "설정 패널을 못 읽었다");
  assert.match(panel, /id="sim-endpoint-host"/);
  for (const id of ["sim-set-list", "sim-set-status", "sim-set-add", "sim-set-id",
                    "sim-set-save", "sim-set-delete"]) {
    assert.doesNotMatch(panel, new RegExp(`id="${id}"`), `${id} 는 기기 CRUD 시절의 잔재다`);
  }
  assert.doesNotMatch(src + panel, /sim-settings-layout|sim-device-detail\b/, "편집 창이 붙던 레이아웃도 함께 사라진다");
});

test("프리뷰 스테이지는 공용 표식을 단다", async () => {
  const src = await page();
  // preview-stage 는 오버레이 CSS 와 camera-preview 의 closest() 가 함께 보는 표식이다 —
  // 빠뜨리면 이 화면만 대기/정지 오버레이 없이 깨진 이미지 아이콘을 그린다.
  // (첫 페인트가 대기가 아니라 **정지**여야 한다는 계약은 cctv-page.test.mjs 가 네 화면을
  //  함께 문다 — 같은 규칙을 화면마다 따로 두면 한 화면만 조용히 어긋난다.)
  assert.match(src, /id="stage" data-paused-label/);
  assert.match(src, /id="view" ref=\{viewRef\} className="preview-waiting-image"/);
});

// SPA 에는 pagehide 가 안 온다. 라우트를 떠날 때 스트림을 안 놓으면 유령 시청자로 남아
// 카메라를 점유하고, document 리스너까지 쌓여 왕복마다 늘어난다(2026-07-16 OOM 의 모양).
test("프리뷰는 놓아주기 세 갈래를 다 건다 — 라우트 이탈·문서 이탈·카메라 전환", async () => {
  const src = await page();
  assert.match(src, /window\.addEventListener\("pagehide", bye\)/, "진짜 문서 이탈");
  assert.match(src, /window\.removeEventListener\("pagehide", bye\)/);
  assert.match(src, /preview\.destroy\(\)/, "언마운트 — stop 과 달리 document 리스너까지 거둔다");
  // 카메라 전환 전 stop 을 **await** 한다 — 안 하면 연결이 누적돼 스트림이 저하된다.
  assert.match(src, /await previewRef\.current\?\.stop\(\); *\/\/ 이전 스트림 완전 종료 대기/);
  // 페이지를 여는 것이 곧 카메라 점유가 되면 안 된다 — 저장된 선택만 따른다.
  assert.match(src, /if \(readPref\(SIM_PREVIEW_WANTED_KEY, "off"\) === "on"\) startPreview\(\);/);
  const starts = [...code(src).matchAll(/previewRef\.current\?\.start\(\)/g)]
    .filter((m) => !/previewRunning/.test(code(src).slice(Math.max(0, m.index - 200), m.index)));
  assert.deepEqual(starts.map(() => 1), [], "가드 없는 start() 가 남으면 게이트가 우회된다");
});

// 겨누는 일은 영상에서 한다(클릭 = 센터링, 드래그 = 박스줌). 조작 패드와 절대 위치 카드는
// 같은 일을 원단위로 한 번 더 하는 자리라 걷어냈다 — 남은 것은 조종 폼의 P·T·Z 한 줄뿐이다.
test("PTZ 는 조종 폼의 한 줄뿐이다 — 오버레이도 조작 패드도 없다", async () => {
  const src = await page();
  for (const gone of ["ptz-overlay", "sim-ptz-mount", "usePtzControls", "PtzPad"]) {
    assert.ok(!src.includes(gone), gone + " 를 다시 두지 않는다");
  }
  // 조작 중 표시는 어느 탭에 있든 보여야 한다 — 조작 중에는 모든 버튼이 잠기므로, 안 보이는
  // 탭에서는 화면이 그냥 굳은 것처럼 보인다. 그래서 뷰바에 남는다.
  const viewbar = src.slice(src.indexOf('<div id="viewbar">'), src.indexOf('<div id="sim-bottom-tabs"'));
  assert.match(viewbar, /id="busy"[^>]*>\{busyLabel\}/);
  // 속도를 고를 칸도 패드와 함께 사라졌다 — 남은 이동은 전부 이 상수를 쓴다(값은 actions 의 것).
  assert.match(src, /\bMOVE_SPEED, ORACLE_TOLERANCE_PX,/, "이동 속도는 actions 에서 들여온다");
  assert.doesNotMatch(code(src), /MOVE_SPEED\s*=/, "화면이 제 사본을 두면 두 값이 갈린다");
  // 영상 위의 클릭·끌기 배선은 공용 훅이다 — 이 화면과 CCTV 가 같은 것을 두 벌 갖고 있었다.
  assert.match(src, /useStagePointer\(\{ imgRef: viewRef, onClick: centerAt, onBox: zoomBox/);
});

// 이건 휴컴스 시뮬이다. 도(°)로 바꿔 적으면 프로토콜이 쓰는 수와 화면이 쓰는 수가 갈리고,
// 로그·저장위치·오라클이 전부 원단위라 눈으로 대조할 수도 없게 된다.
test("PTZ 칸은 휴컴스 원단위다 — 컨트롤 탭의 것이다", async () => {
  const src = await page();
  const form = src.slice(src.indexOf('id="sim-cam-drive-form"'), src.indexOf('id="sim-cam-drive-apply"'));
  assert.match(form, /id="sim-cam-edit-pan" type="number" min="0" max="35999"/);
  assert.match(form, /id="sim-cam-edit-tilt" type="number" min="-2000" max="9000"/);
  assert.match(form, /id="sim-cam-edit-zoom" type="number" min="0" max="65535"/);
  assert.ok(!src.includes("TILT_PER_DEG"), "도(°) 환산을 다시 들이지 않는다");

  // PTZ 는 지금 보고 있는 카메라의 것이다 — 다른 카메라를 고른 폼에 적으면 남의 자세를 적게 된다.
  const pick = src.slice(src.indexOf("const ptzOfSelected ="), src.indexOf("useEffect(() => {", src.indexOf("const ptzOfSelected =")));
  assert.match(pick, /deviceForCamera\(S\.current\.devices, cam\)\?\.id !== S\.current\.activeCameraId/);

  // 적용은 창구도 폼도 갈린다: 설치는 씬 PATCH(applyInstall), 현재값은 제어 POST(applyDrive).
  // 한 함수에 섞여 있던 시절에는 자리를 고치려던 손이 카메라를 움직였다.
  const drive = src.slice(src.indexOf("const applyDrive ="), src.indexOf("const resetDrive ="));
  assert.match(drive, /postJson\(api\("\/simulator\/control\/ptz"\)/);
  assert.ok(!/reqJson\("PATCH"/.test(drive), "조종 적용이 씬(설치)을 건드리면 안 된다");
  assert.match(drive, /driveChangeOf\(\{/, "무엇이 바뀌었나는 actions 가 답한다");
  const install = src.slice(src.indexOf("const applyInstall ="), src.indexOf("const applyDrive ="));
  assert.match(install, /reqJson\("PATCH", api\(`\/simulator\/cameras\//);
  assert.ok(!/simulator\/control\/ptz/.test(install), "설치 적용이 카메라를 몰면 안 된다");
  assert.match(install, /installPatchFrom\(\{/, "보낼 필드를 고르는 일은 actions 가 한다");
});

// 시뮬은 카메라를 **설치방위 + 팬** 으로 돌린다(PanPivot->SetWorldRotation(BaseYaw + CurrentPan)).
// 부채꼴은 그 합, 즉 지금 보는 시야다 — 설치방위만 그리면 팬이 걸린 카메라의 부채꼴이 카메라가
// 보지 않는 곳을 가리킨다(2026-08-12 실측 89°). 어느 단을 그리는가는 coneOf 가 값으로 답한다.
test("부채꼴의 단은 탭이 정하고, 그 계산은 화면 밖에 있다", async () => {
  const src = await map();
  assert.match(src, /coneOf\(viewByPort, cam, \{ installMode: tab !== "drive" \}\)/);
  // 모르면 그리지 않는다 — 팬을 0 으로 채우면 89° 어긋난 곳을 가리킨다(실측).
  assert.match(src, /if \(cone !== null && !aiming\)/);
  // 방향도 화각도 서버가 낸 값이다. 화면이 raw PTZ 로 지어내면 그 순간 광학 모델이 두 벌이
  // 되고, 부채꼴과 영상 위의 핀이 서로 다른 식으로 그려진다.
  for (const src2 of [src, await page()]) {
    assert.ok(!/panpos \/ 100|zoomHfov|wideHFovDeg|hfovRange/.test(code(src2)),
      "브라우저가 raw PTZ·렌즈표로 방위·화각을 지어내지 않는다");
  }
});

// 시야는 **카메라마다** 다르다. 몰고 있는 한 대의 값으로 나머지를 채우면 그 값이 곧 거짓이다
// (그렇게 해서 카메라를 바꾸는 것만으로 옆 카메라의 부채꼴이 69.6° 튀었다).
test("카메라마다의 시야는 카메라마다 물어서 얻는다 — 한 대의 값을 나눠 쓰지 않는다", async () => {
  const src = await page();
  assert.match(src, /getJson\(api\("\/simulator\/ptz"\)\)/);
  assert.match(src, /new Map\(\(r\.list \|\| \[\]\)\.filter\(\(row\) => row\.ptz\)\.map\(\(row\) => \[Number\(row\.port\), row\]\)\)/);
  // 몰고 있는 카메라가 움직이면 그 시야도 낡는다 — 폴링(5초)을 기다리지 않고 다시 받는다.
  const apply = src.slice(src.indexOf("const applyPtz ="), src.indexOf("const loadPtz ="));
  assert.match(apply, /if \(!changed\) return;/);
  assert.match(apply, /fetchPtzTable\(\);/);
  // 서명도 한 벌이다 — 화면이 제 서명을 짜면 시야를 빠뜨린 옛 판이 되돌아온다.
  assert.match(src, /rigSignature\(S\.current\.cameras, S\.current\.viewByPort\)/);
});

// 끌기는 **자리만** 옮긴다. 방향은 팬이 정하는 값이고, 그것을 지도에서 끌어 바꾸는 일은
// 조준 앵커가 따로 맡는다 — 자리 끌기에 회전이 섞이면 안 된다.
test("평면도 자리 끌기는 자리만 옮긴다", async () => {
  const src = await page();
  const drag = src.slice(src.indexOf("const finishCamDrag ="), src.indexOf("useEffect(() => {", src.indexOf("const finishCamDrag =")));
  assert.match(drag, /reqJson\("PATCH", api\(`\/simulator\/cameras\/\$\{enc\(d\.cam\.id\)\}`\),\s*\n\s*\{ location: \{ x: at\.x, y: at\.y, z: d\.from\.z \} \}\)/);
  assert.ok(!/yawDeg|pitchDeg/.test(drag), "자리 끌기가 자세를 건드리면 안 된다");
  // 좌표 셋이 다 있어야 끌린다 — 축 하나만 보내면 나머지를 sim 이 0 으로 읽어 원점으로 날아간다.
  const begin = src.slice(src.indexOf("const onCamDown ="), src.indexOf("const onAimDown ="));
  assert.match(begin, /if \(x === null \|\| y === null \|\| z === null\) return;/);
  // 지도 밖에서 놓으면 반영하지 않는다(SVG 밖으로 외삽된 주차장 바깥 점이라).
  assert.match(src, /if \(d\.moved && !inside\)/);
  assert.match(src, /평면도 안에서 놓아야 옮겨집니다/);
});

// 조준 앵커(시선 막대 끝)는 두 탭에 다 서지만 **적히는 축이 다르다**: 컨트롤 탭에서는 팬
// (카메라를 돌린다, 현재값), 배치 탭에서는 설치방위(폴을 돌려 단다 — 팬 불변). 같은 손짓,
// 다른 장부다. 어느 축인가의 판정은 aimTargetFor 에 있다.
test("조준 앵커 — 컨트롤 탭은 팬, 배치 탭은 설치방위에 적는다", async () => {
  const m = await map();
  // 앵커는 막대 끝에 선다.
  assert.match(m, /const tip = tipAt\(p, yaw, coneLen\);/);
  assert.match(m, /cx=\{tip\.x\} cy=\{tip\.y\}[\s\S]*?"map-aim-handle"/);
  assert.match(m, /onAimDown\(e, cam, aimTarget\)/);
  assert.match(m, /const aimTarget = aimTargetFor\(cam, \{/);
  // 줌 앵커는 컨트롤 탭에만 — 줌은 순수 현재값이라 설치 축에 낄 자리가 없다.
  assert.match(m, /if \(aimTarget === "pan"\) \{\s*\n\s*for \(const side of \[-1, 1\]\)/);

  const src = await page();
  const aim = src.slice(src.indexOf("const finishAim ="), src.indexOf("const finishCamDrag ="));
  assert.ok(aim.length > 400, "finishAim 을 못 읽었으면 이 검사는 아무것도 안 지킨다");
  // 팬 경로: 팬 = 보고 싶은 방위 − 설치방위(계산은 geometry). 하향각·줌은 그대로 되돌려보낸다.
  assert.match(aim, /const panpos = panposForYaw\(yaw, mountYawOf\(d\.cam\)\);/);
  assert.match(aim, /panpos, tiltpos: now\.tiltpos, zoompos: now\.zoompos,/);
  // 끄는 사이에 활성이 바뀌었으면 남의 카메라가 돈다.
  assert.match(aim, /deviceForCamera\(S\.current\.devices, d\.cam\)\?\.id !== S\.current\.activeCameraId/);
  // 설치방위 경로: 씬 PATCH 하나 — 카메라를 몰지 않는다. 배치 탭의 부채꼴이 곧 설치방위라
  // 끈 각이 곧 새 설치방위다(오프셋 셈법이 없다).
  const mount = aim.slice(aim.indexOf('if (d.target === "mount")'), aim.indexOf("// 팬(컨트롤 탭)"));
  assert.ok(mount.length > 100, "설치방위 분기를 못 읽었으면 이 검사는 아무것도 안 지킨다");
  assert.match(mount, /const yawDeg = yaw;/);
  assert.match(mount, /reqJson\("PATCH", api\(`\/simulator\/cameras\/\$\{enc\(d\.cam\.id\)\}`\), \{ yawDeg \}\)/);
  assert.ok(!/control\/ptz/.test(mount), "설치방위 끌기가 카메라를 몰면 안 된다 — 팬은 그대로다");
});

// 틸트 슬라이더 — 막대 한가운데의 **녹색 기준선이 틸트 0**(수평)이고 자리에서 움직이지
// 않는다. 움직이는 것은 앵커원뿐이다. 자리↔각 환산(tiltSliderPos/Deg)은 geometry 의 것이고
// 서로 역함수라는 것을 그쪽 테스트가 문다.
test("틸트 슬라이더 — 기준선(틸트 0)은 고정, 앵커원만 끌린다", async () => {
  const m = await map();
  // 기준선은 막대 한가운데 고정이다 — 앵커를 어디로 끌든 이 선은 그대로 있어야 기준으로 읽힌다.
  assert.match(m, /const zeroAt = tipAt\(p, yaw, coneLen \/ 2\);/);
  assert.match(m, /"map-tilt-zero" \+ \(selected \? " sel" : ""\)/);
  // 앵커원의 자리는 틸트값에서 나온다 — 값과 그림이 한 함수로 묶인다.
  assert.match(m, /tipAt\(p, yaw, tiltSliderPos\(tiltNow \/ 100, coneLen\)\)/);
  assert.match(m, /onTiltDown\(e, cam, aimTarget, yaw, coneLen\)/);
  // 틸트를 모르는 카메라(안 닿음)에는 달지 않는다.
  assert.match(m, /if \(tiltNow !== null\)/);
  // 고른 카메라의 기준선만 뚜렷하다 — .sel 을 붙여 놓고 규칙이 없으면 죽은 클래스다.
  const css = await read("simulator.css");
  assert.match(css, /\.map-tilt-zero\.sel \{/);

  const src = await page();
  // 드래그 = 커서를 광축에 투영한 트랙 위 자리 → 각. 트랙 밖은 양끝(기기 한계)에 물린다.
  assert.match(src, /const s = trackOffsetOf\(world, d\.from, d\.axisYaw\);/);
  assert.match(src, /tiltSliderDeg\(Math\.min\(Math\.max\(s, 0\), d\.trackLen\), d\.trackLen\)/);

  const fin = src.slice(src.indexOf("const finishTilt ="), src.indexOf("const finishFov ="));
  assert.ok(fin.length > 400, "finishTilt 을 못 읽었으면 이 검사는 아무것도 안 지킨다");
  // 배치 탭: 씬 PATCH(pitchDeg, 음수가 아래 — 세우기와 같은 규약). 카메라를 몰지 않는다.
  const mount = fin.slice(fin.indexOf('if (d.target === "mount")'), fin.indexOf("// 틸트(컨트롤 탭)"));
  assert.match(mount, /\{ pitchDeg: -d\.tiltDeg \}/);
  assert.ok(!/control\/ptz/.test(mount), "설치 하향각 끌기가 제어 창구로 나가면 안 된다");
  // 컨트롤 탭: 틸트만 바꾸고 팬·줌은 그대로 되돌려보낸다.
  assert.match(fin, /panpos: now\.panpos, tiltpos: Math\.round\(d\.tiltDeg \* 100\), zoompos: now\.zoompos/);
});

// 줌은 **각으로** 지시한다. 사람이 지도에서 다루는 것은 부채꼴의 벌어짐이고, 그 각이 이 렌즈의
// 어느 눈금인지는 백엔드의 광학 모델이 답한다 — 브라우저가 표를 들고 역보간하면 부채꼴과
// 영상 위 핀이 서로 다른 모델로 그려진다.
test("모서리 앵커를 끌면 화각이 나간다 — 줌 눈금은 백엔드가 옮긴다", async () => {
  const m = await map();
  // 앵커는 부채꼴의 두 모서리(광축 ± 반각)에 선다.
  assert.match(m, /const edge = rad\(yaw \+ side \* half\);/);
  assert.match(m, /"map-fov-handle"/);
  assert.match(m, /onFovDown\(e, cam\)/);

  const src = await page();
  const fov = src.slice(src.indexOf("const finishFov ="), src.indexOf("const finishAim ="));
  assert.ok(fov.length > 400, "finishFov 를 못 읽었으면 이 검사는 아무것도 안 지킨다");
  assert.match(fov, /hfovDeg: d\.hfov/);
  assert.ok(!/zoompos:/.test(fov), "브라우저가 줌 눈금을 계산하면 광학 모델이 두 벌이 된다");
  // 팬·틸트는 그대로 되돌려보낸다 — 화각만 바꾸려던 손이 카메라를 돌려 놓으면 안 된다.
  assert.match(fov, /panpos: now\.panpos, tiltpos: now\.tiltpos/);
  // 끄는 각 → 화각(한계에 물림)은 geometry 의 hfovFromDrag 하나다.
  assert.match(src, /const hfov = hfovFromDrag\(toward, d\.axisYaw, hfovLimitsOf\(S\.current\.viewByPort, d\.cam\)\);/);
  assert.match(src, /if \(hfov === null\) return;/, "한계를 모르면 끌 것이 없다");
});

// 설치(볼트로 박는 값: x·y·H·방위·하향)와 현재값(몰면서 바뀌는 값: P·T·Z)은 다른 축이다.
// 한 폼에 섞으면 자리를 고치려던 손이 카메라를 움직인다 — 그래서 탭이 갈린다(이교수님 지시,
// 2026-08-12). 평면도는 **한 장**이고 두 탭이 그 옆칸만 바꿔 단다.
test("배치/컨트롤 탭 분리 — 평면도는 한 장, 기즈모·센터링은 탭이 뜻을 정한다", async () => {
  const src = await page();
  assert.match(src, /\["drive", "카메라 컨트롤"\]/);
  // 사본을 두 장 그리면 같은 씬이 두 그림이 되고, 어느 쪽이 낡았는지 아무도 모른다.
  assert.equal(src.match(/<RigMap/g)?.length, 1, "평면도는 한 곳에서만 그린다");
  // 도크 이사(appendChild)는 패널이 두 벌이던 시절의 방편이다 — 한 그리드에 두고 옆칸만
  // 갈면 옮길 일 자체가 없어진다.
  assert.ok(!/appendChild|sim-map-dock/.test(src), "평면도를 DOM 으로 옮겨 앉히지 않는다");
  assert.match(src, /\{tab === "rig" \? \(/, "옆칸은 탭이 고른다");
  // 자리 끌기는 배치 탭에서만 — 컨트롤 탭에서 마커를 누르면 고르기만 한다.
  assert.match(src, /if \(S\.current\.tab !== "rig"\) \{ selectSceneCamera\(cam\.id\); return; \}/);
  // 영상 센터링의 뜻도 탭이 정한다: 배치 탭에서는 조준 뒤 그 자세를 설치로 굳힌다(rebase) —
  // 클릭한 곳이 팬 0 의 정면이 되도록 폴을 돌려 다는 것. 컨트롤 탭에서는 현재값만 움직인다.
  assert.equal(src.match(/const toInstall = S\.current\.tab === "rig";/g)?.length, 2, "센터링과 박스줌 둘 다");
  const rebase = src.slice(src.indexOf("const rebaseInstall ="), src.indexOf("const [marker, setMarker]"));
  assert.match(rebase, /\/rebase`\)/);
  assert.ok(!/panpos|baseYaw/.test(rebase), "굳히기 산수는 백엔드의 광학 모델이 한다 — 화면은 부르기만 한다");
});

test("카메라 목록은 읽기만 한다 — 만들고 지우는 자리는 /simulator/cameras 다", async () => {
  const src = await page();
  assert.match(src, /getJson\(api\("\/simulator\/devices"\)\)/);
  // 백엔드가 405 로 답하는 경로다. 화면에 남아 있으면 저장 버튼이 조용히 실패한다.
  assert.doesNotMatch(src, /"(POST|PATCH|DELETE)", api\(`?\/simulator\/devices/);
  // 씬을 고치는 자리는 카메라 라우트 하나다.
  assert.match(src, /reqJson\("PATCH", api\(`\/simulator\/cameras\//);
  assert.doesNotMatch(src, /postJson\(api\("\/cctv\/config"\)/);
});

test("시뮬 카메라 선택·제어는 CCTV 활성 상태와 섞이지 않는다", async () => {
  const src = await page();
  // 저장 키는 actions 의 것이다 — 화면이 제 문자열을 들면 CCTV 쪽 키와 갈라질 자리가 생긴다.
  assert.match(src, /SIM_ACTIVE_CAMERA_KEY, SIM_PREVIEW_WANTED_KEY, SIM_CROSSHAIR_KEY,/);
  assert.doesNotMatch(code(src), /SIM_ACTIVE_CAMERA_KEY\s*=/);
  assert.match(src, /postJson\(api\("\/simulator\/active"\)/);
  assert.match(src, /postJson\(api\("\/simulator\/control\/ptz"\)/);
  assert.match(src, /streamUrl: api\("\/simulator\/stream"\)/);
  assert.match(src, /snapshotUrl: api\("\/simulator\/control\/snapshot"\)/);
  assert.doesNotMatch(src, /postJson\(api\("\/cctv\/active"\)/);
  // 이 화면은 헤더의 CCTV 셀렉터를 쓰지 않는다 — 자기 목록과 자기 활성 창구를 쓴다.
  assert.doesNotMatch(src, /useCamera\b/);
});

test("카메라를 바꾸면 그 시뮬레이터의 씬을 다시 읽는다", async () => {
  const src = await page();
  assert.match(src, /const invalidateScene =/);
  assert.match(src, /catalogRef\.current = null/);
  assert.match(src, /getJson\(api\("\/simulator\/catalog"\)\)/);
  assert.match(src, /getJson\(api\("\/simulator\/slots"\)\)/);
  assert.match(src, /getJson\(api\("\/simulator\/cars"\)\)/);
  assert.match(src, /await Promise\.all\(\[loadPtz\(\), refreshCameraPose\(\), loadScene\(\), refreshStatus\(\{ silent: true \}\)\]\)/);
  // 옛 카메라의 팬을 새 카메라에 물려주지 않는다 — 남의 시야를 그리게 된다.
  const sw = src.slice(src.indexOf("const switchCamera ="), src.indexOf("const selectSceneCamera ="));
  assert.match(sw, /setActiveCameraId\(id\);[\s\S]*?setLastPtz\(null\);/);
});

test("오버레이 좌표는 백엔드에 묻는다 — 브라우저에 광학이 없다", async () => {
  const src = await page();
  // 2026-07-28: 투영 수식은 백엔드 관문에만 있다. 브라우저가 광학 모듈을 다시 import 하면
  // 계산 지점이 둘로 갈라져 모델이 조용히 어긋난다 — 그 회귀를 여기서 막는다.
  assert.doesNotMatch(src, /from "\.\.\/\.\.\/profile\//);
  assert.doesNotMatch(src, /projectWorldToPixel|ptzCamera/);
  assert.match(src, /postJson\(api\("\/simulator\/overlay"\)/);
  // 오라클 대조의 배율 맞추기·통계는 actions 의 compareOracle 이 값으로 답한다.
  assert.match(src, /const cmp = compareOracle\(\{ ours, truth, targets, frame:/);
  // 핀은 **프레임 좌표의 백분율**로 앉는다 — px 로 앉히면 그릴 때마다 <img> 를 재야 하고,
  // 창 크기가 바뀔 때마다 서버에 좌표를 되물어야 했다(그 왕복이 통째로 없어진다).
  assert.match(src, /const pct = \(v, of\) => `\$\{\(v \/ of\) \* 100\}%`;/);
  assert.doesNotMatch(code(src), /getBoundingClientRect|addEventListener\("resize"/);
});

test("리그 갱신은 활성 카메라가 갈리면 PTZ 와 핀을 다시 읽는다", async () => {
  const src = await page();
  // 보고 있던 카메라를 지우면 서버가 활성 sim 기기를 스스로 갈아 끼운다. 프리뷰는 스트림이
  // 끊긴 자리에서 새 카메라로 재연결하는데, PTZ 표시와 핀만 옛 카메라 것으로 남으면
  // 새 카메라의 영상 위에 남의 주차면 핀이 얹힌다.
  const refresh = src.slice(src.indexOf("const refreshRig ="), src.indexOf("const switchCamera ="));
  assert.ok(refresh.length > 300, "refreshRig 를 못 읽었다");
  assert.match(refresh, /const activeBefore = S\.current\.activeCameraId/);
  assert.match(refresh, /S\.current\.activeCameraId !== activeBefore/);
  assert.match(refresh, /setLastPtz\(null\)/);
  assert.match(refresh, /await loadPtz\(\)/);
});

test("세우기는 씬만 건드린다 — 기기를 따로 만들지 않고, 실패해도 리그를 다시 읽는다", async () => {
  const src = await page();
  const spawn = src.slice(src.indexOf("const spawnCamera ="), src.indexOf("const removeCamera ="));
  // 기기 등록이라는 단계가 없어졌다. `register` 를 실어 보내면 받는 쪽이 없는 값을 보내는
  // 것이고, 이름 칸은 사람이 적은 값이 아무 데도 안 가는 죽은 입력이 된다.
  assert.doesNotMatch(spawn, /register/);
  assert.doesNotMatch(spawn, /rolledBack/, "되돌릴 등록이 없으므로 롤백 분기도 없다");
  // 실패해도 씬은 바뀌었을 수 있다 — 화면을 씬으로 되맞춘다.
  assert.match(spawn, /catch \(e\) \{[\s\S]*await refreshRig\(\)/);
  // 무엇을 보낼지·왜 못 세우는지는 actions 가 답하고, 검증은 POST 보다 먼저다.
  const guard = spawn.indexOf("if (error) { setCamStatus(error); return; }");
  const post = spawn.indexOf('postJson(api("/simulator/cameras")');
  assert.ok(guard > -1 && guard < post, "못 세우는 이유는 POST 보다 먼저 답해야 한다");
  assert.match(spawn, /spawnRequestFrom\(\{/);
  assert.match(spawn, /spawnOutcome\(r, \{ httpPort: body\.httpPort, note \}\)/);
  // 응답을 무방비로 읽으면 **성공한 스폰에서 예외가 나** 화면이 "실패"라고 말하는데 카메라는
  // 씬에 서 있는 상태가 된다(2026-08-17 실측).
  assert.doesNotMatch(code(spawn), /r\.camera/);
  assert.match(spawn, /if \(out\.needsNoteRetry\)/);
});

// 세우기와 설치는 같은 양을 다룬다 — 한 칸 안에서 같은 값이 두 이름을 가지면, 어느 쪽이
// 무엇인지 읽는 사람이 매번 다시 맞춰 봐야 한다.
test("세우기 폼과 설치 폼은 같은 이름·같은 배치를 쓴다", async () => {
  const src = await page();
  const spawn = src.slice(src.indexOf('id="sim-cam-form"'), src.indexOf('id="sim-cam-edit-form"'));
  const edit = src.slice(src.indexOf('id="sim-cam-edit-form"'), src.indexOf('id="sim-cam-drive-form"'));
  // x·y 가 세우기에 없는 이유는 그 둘이 평면도 클릭에서 오기 때문이다.
  assert.deepEqual(rowsOf(spawn), [["H", "포트", "MJPEG"]]);
  // 설치 폼은 볼트로 박는 값만 다룬다 — 자리(x·y·H)와 설치 자세(방위·하향). P·T·Z(현재값)는
  // 컨트롤 탭이다.
  assert.deepEqual(rowsOf(edit), [["x", "y", "H"], ["방위", "하향"]]);
  // 방위·하향은 평면도 클릭에서 나오는 값이라 사람이 적을 칸이 아니다 — 감췄을 뿐 그대로 나간다.
  assert.match(spawn, /id="sim-cam-yaw" type="hidden"/);
  assert.match(spawn, /id="sim-cam-pitch" type="hidden"/);
  // 세우기 폼은 자리를 정한 뒤에만 뜬다 — 정하지 않은 채 뜬 폼은 보낼 곳이 없다.
  assert.match(src, /\{placing\?\.stage === "ready" && \(/);
  // 배치에 들어가면서 선택을 비우므로, 취소하고 나오면 드롭다운이 가리키는 카메라로 돌아와야
  // 한다 — 안 그러면 위에서는 카메라를 고르고 있는데 아래 폼은 "없습니다" 라고 말한다.
  const cancel = src.slice(src.indexOf("const cancelPlacing ="), src.indexOf("const finishPlacing ="));
  assert.match(cancel, /cameraForDevice\(S\.current\.devices, S\.current\.cameras, S\.current\.activeCameraId\)/);
});

test("고르는 곳은 하나다 — 드롭다운과 평면도가 같은 카메라를 가리킨다", async () => {
  const src = await page();
  // 목록 사본이 다시 생기면 "고른 카메라"가 두 벌이 되어, 화면이 A 를 보여 주면서 B 를
  // 옮길 준비를 하고 있게 된다.
  assert.ok(!src.includes('id="sim-cam-list"'), "카메라 목록을 다시 두지 않는다");
  // 누르는 순간 고르고 **그대로 끌린다.** 첫 동작을 선택으로만 끝내면, 누르고 곧장 끄는 보통의
  // 손짓이 아무것도 안 움직이는 것으로 보인다("클릭해서 옮기면 안 움직여요" — 2026-08-11).
  const begin = src.slice(src.indexOf("const onCamDown ="), src.indexOf("const onAimDown ="));
  assert.match(begin, /if \(cam\.id !== S\.current\.mapSelectedId\) selectSceneCamera\(cam\.id\);/);
  assert.match(begin, /setDrag\(\{ kind: "cam"/);

  const m = await map();
  // 끌 수 있는 것은 스폰 카메라 전부다 — 커서가 그 사실을 말한다.
  assert.match(m, /const movable = cam\.spawned !== false;/);
  assert.ok(!m.includes("pickable"), "고른 것만 끌리던 시절의 커서 갈래는 남기지 않는다");
  // 고른 카메라의 시야만 뚜렷하다 — 콘 여럿이 같은 밝기로 겹치면 어느 것이 어느 카메라의
  // 것인지 알 수 없다. 색만으로는 작은 평면도에서 "지금 이것" 이 안 읽힌다.
  assert.match(m, /"map-cone" \+ \(selected \? " sel" : ""\)/);
  assert.match(m, /r=\{selected \? dot \* 1\.35 : dot\}/);
  const css = await read("simulator.css");
  assert.match(css, /\.map-cone\.sel \{[\s\S]*?opacity: \.22;/);

  // 평면도에서 고르면 드롭다운도 간다 — 전환 경로(프리뷰 재시작·PTZ)는 한 벌뿐이라
  // 여기서 흉내 내지 않고 그 함수를 부른다.
  const sel = src.slice(src.indexOf("const selectSceneCamera ="), src.indexOf("// 드롭다운이 갈리면"));
  assert.match(sel, /if \(device\.id !== S\.current\.activeCameraId\) switchCamera\(device\.id\);/);
  // 드롭다운 쪽은 selectSceneCamera 를 되부르지 않는다 — 그러면 전환이 무한히 되돈다.
  const sync = src.slice(src.indexOf("// 드롭다운이 갈리면"), src.indexOf("// ── 설치/조종 폼 채우기"));
  assert.ok(!sync.includes("selectSceneCamera("), "되돌이가 생긴다");
  // 기준기는 씬에서 파생된 것이 아니라 config 에 사는 계약의 정본이다 — 포트 일치만 보면
  // 기준기가 어쩌다 같은 포트를 갖는 순간 남의 카메라에 설치 폼이 붙는다(actions 가 문다).
  assert.match(sync, /cameraForDevice\(devices, cameras, activeCameraId\)/);
});

test("설치 폼은 늘 열려 있고, 고른 카메라의 자리·설치 자세를 고칠 수 있다", async () => {
  const src = await page();
  for (const id of ["sim-cam-edit-x", "sim-cam-edit-y", "sim-cam-edit-height",
                    "sim-cam-edit-bearing", "sim-cam-edit-pitch", "sim-cam-edit-note",
                    "sim-cam-edit-pan", "sim-cam-edit-tilt", "sim-cam-edit-zoom"]) {
    assert.match(src, new RegExp(`id="${id}"`));
  }
  // z 칸은 두지 않는다 — z 는 높이에서 나온다(z = H×100 + 지면). 두 칸에서 같은 값을
  // 고치면 지면이 조용히 어긋난다. 설치 줌이라는 것도 없다.
  assert.ok(!src.includes('id="sim-cam-edit-z"'), "z 는 H 에서 파생된다");
  assert.ok(!src.includes('id="sim-cam-edit-install-zoom"'), "설치 줌 칸을 만들지 않는다");

  const form = src.slice(src.indexOf('id="sim-cam-edit-form"'), src.indexOf('id="sim-cam-drive-form"'));
  assert.match(form, /id="sim-cam-edit-height"[\s\S]{0,200}title="[^"]*z = H×100/);
  // 누를 것은 둘뿐이다: 적용과 삭제. 되돌리기는 폼이 씬으로 스스로 되맞으므로 할 일이 없고,
  // 파일로 남기는 일은 「씬」 탭의 씬 저장이 맡는다.
  const buttons = [...form.matchAll(/<button id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(buttons, ["sim-cam-edit-apply", "sim-cam-edit-delete"]);
  // 레벨 저작 카메라도 이름은 고칠 수 있다 — 옮기지 못하는 것은 자세가 레벨의 것이기 때문이지
  // 사람이 부르는 이름까지 레벨의 것이어서가 아니다(플러그인도 같은 규칙).
  assert.match(form, /id="sim-cam-edit-note"[\s\S]{0,400}disabled=\{!selectedCam\}/);
  assert.match(form, /id="sim-cam-edit-x"[\s\S]{0,200}disabled=\{!selectedCam \|\| authored\}/);
  // 삭제는 고친 것을 되돌릴 수 없으므로 레벨 저작에는 아예 보이지 않는다.
  assert.match(form, /\{selectedCam && !authored && \(/);
  // 조종(P·T·Z)은 현재값이다 — 레벨 저작이 고정하는 것은 설치이지 조준이 아니다.
  const drive = src.slice(src.indexOf('id="sim-cam-drive-form"'), src.indexOf('id="sim-info-panel"'));
  assert.match(drive, /id="sim-cam-edit-pan"[\s\S]{0,200}disabled=\{!selectedCam\}/);
  assert.ok(!/authored/.test(drive), "조종을 레벨 저작으로 잠그면 이 폼이 통째로 죽은 기능이 된다");
  // 잠긴 칸만 있고 이유가 없으면 고장으로 읽힌다 — 아이디 줄이 그 한 가지(레벨 저작)를 말하고,
  // 그 밑의 포트 두 줄이 로그·API 응답에서 이 카메라를 찾는 열쇠다.
  assert.match(form, /cameraTitleLine\(selectedCam, pickedDevice\)/);
  assert.match(form, /cameraPortsLine\(selectedCam\)/);
});

// 폼을 채우는 쪽(installFieldsOf)과 보내는 쪽(installPatchFrom)이 **같은 이름표**를 써야 한다.
// 한쪽만 고치면 그 칸이 조용히 「안 고침」이 된다 — 입력은 되는데 저장이 안 나가는 모양이라,
// 화면만 봐서는 원인이 폼에 있는지 서버에 있는지 알 수 없다.
test("폼의 칸 이름표는 채우는 쪽·보내는 쪽이 같다", async () => {
  const src = await page();
  const actions = await read("actions.mjs");
  const blank = src.slice(src.indexOf("const BLANK_EDIT = {"), src.indexOf("};", src.indexOf("const BLANK_EDIT = {")));
  const keys = [...blank.matchAll(/(\w+):/g)].map((m) => m[1]).sort();
  assert.ok(keys.length === 9, `BLANK_EDIT 를 못 읽었다: ${keys.join(",")}`);
  // installFieldsOf 의 「고른 카메라 없음」 반환이 곧 그 이름표의 정본이다.
  const empty = actions.slice(actions.indexOf("if (!cam) return { note:"), actions.indexOf("};", actions.indexOf("if (!cam) return { note:")));
  const fieldKeys = [...empty.matchAll(/(\w+): ""/g)].map((m) => m[1]).sort();
  assert.deepEqual(keys, fieldKeys, "폼 상태와 installFieldsOf 의 키가 갈렸다");
  // 화면은 그 이름표로 통째로 채운다 — 칸마다 손으로 옮기면 하나를 빠뜨려도 안 보인다.
  assert.match(src, /for \(const \[k, v\] of Object\.entries\(fields\)\) if \(!dirty\.current\.has\(k\)\) next\[k\] = v;/);
});

test("끌어서 바꾼 값은 폼에도 반영된다 — 저장이 방금 끈 것을 되돌리지 않게", async () => {
  const src = await page();
  // 저장은 폼과 씬을 견주어 다른 칸만 보낸다. 그래서 끌고 난 뒤 폼에 옛 좌표가 남아 있으면
  // 그 값이 그대로 "옮기라는 지시"가 되어 방금 끈 것을 되돌린다.
  const drag = src.slice(src.indexOf("const finishCamDrag ="), src.indexOf("useEffect(() => {", src.indexOf("const finishCamDrag =")));
  assert.match(drag, /dirty\.current\.delete\("x"\);\s*\n\s*dirty\.current\.delete\("y"\);/);
  assert.match(drag, /await refreshRig\(\);/);
  // 높이·하향각은 건드리지 않는다 — 자리를 옮겼다는 이유로 저장 안 한 손글씨가 사라지면 안 된다.
  assert.ok(!/dirty\.current\.delete\("heightM"\)|dirty\.current\.clear\(\)/.test(drag),
    "자리 끌기가 폼 전체를 되맞추면 안 된다");

  // 폼이 늘 열려 있으므로 "고치는 중이면 폴링을 쉰다" 는 곧 "영영 쉰다" 다. 계속 돌되
  // **칸 단위로** 건너뛴다 — 폼 전체를 잠그면 이름 한 글자를 적은 뒤로 P·T·Z 가 영영 멈추고,
  // 영상을 클릭해 센터링해도 숫자가 안 바뀌어 "적용이 안 된다"로 보인다.
  assert.match(src, /dirty\.current\.add\(key\)/);
  assert.ok(!src.includes("formDirty"), "폼 전체를 잠그는 잠금장치를 다시 두지 않는다");
  // 카메라를 바꾸면 옛 카메라에 적던 손글씨는 뜻을 잃는다 — 남겨 두면 다음 적용이 남의 값을 보낸다.
  assert.match(src, /setMapSelectedId\(id\);\s*\n\s*markClean\(\);/);
  // 센터링·박스줌·절대이동·앵커조준·틸트앵커·모서리줌·PTZ리셋은 PTZ 를 바꾼다. 폴링(5초)을
  // 기다리면 "눌렀는데 안 바뀐다"로 보인다. 갱신을 한 함수에 모아 둔 이유는 자리마다 빠뜨렸기
  // 때문이다 — 절대이동은 값을 보내 놓고 폼을 안 고쳐, 방금 보낸 값이 화면에 돌아오지 않았다.
  assert.equal(src.match(/applyPtz\(j\.ptz\)/g)?.length, 7);
  assert.match(src, /if \(r\.ptz\) applyPtz\(r\.ptz\);/, "굳히기(rebase)도 같은 함수를 쓴다");
  assert.ok(!/setLastPtz\(j\.ptz\)/.test(src), "직접 대입하면 그 자리만 갱신을 빠뜨린다");
});

test("저장된 씬은 카메라가 아니라 씬의 것이다 — 씬 탭에서 다루고 씬 상태줄에 적는다", async () => {
  const info = await read("scene-panel.jsx");
  // 저장본은 세운 카메라 + 차량 전체다. 카메라 옆에 두면 "이 카메라를 저장한다" 로 읽힌다.
  for (const id of ["sim-scene-name", "sim-scene-save", "sim-scene-list", "sim-scene-status", "sim-reset"]) {
    assert.match(info, new RegExp(`id="${id}"`), `${id} 는 씬 탭의 것이다`);
  }
  // 결과도 씬 상태줄에 적는다 — 카메라 상태줄에 적으면 씬 전체의 일이 고른 카메라 하나의
  // 일처럼 읽힌다(버튼을 옮긴 것과 같은 이유다). 이 패널의 setStatus 가 곧 그 줄이다.
  assert.ok(!info.includes("setCamStatus("), "저장/복원은 카메라 상태줄을 쓰지 않는다");
  assert.ok(info.split("setStatus(").length > 5, "씬 상태줄로 말한다");
  assert.match(info, /<div id="sim-scene-status"[^>]*>\{status\}<\/div>/, "그 줄이 이 패널의 것이어야 한다");
});

// 이 화면의 저장은 **서버에 남는 저장**이다. 예전에는 스냅샷 JSON 을 브라우저가 내려받게
// 했는데, 그 파일은 받은 사람의 다운로드 폴더 밖에서는 존재하지 않았다 — 시뮬을 재시작하고
// 나서 되돌릴 것이 실제로 남아 있지 않았다는 뜻이다.
test("씬 저장은 서버로 간다 — 다운로드로 떨어뜨리지 않는다", async () => {
  const src = await page();
  const scene = await read("scene-panel.jsx");
  const save = scene.slice(scene.indexOf("const putScene ="), scene.indexOf("const saveSceneAs ="));
  assert.match(save, /reqJson\("PUT", api\(`\/simulator\/scenes\//);
  // 본문 없이 부른다 — 서버가 시뮬에서 직접 읽는다(화면이 낡은 사이 저장하면 옛 씬이 남는다).
  assert.ok(!/JSON\.stringify/.test(save), "브라우저가 씬을 실어 나르지 않는다");
  assert.match(scene, /getJson\(api\("\/simulator\/scenes"\)\)/);
  assert.match(scene, /reqJson\("DELETE", api\(`\/simulator\/scenes\//);
  assert.match(scene, /\/restore`\)/);
  // 내려받기 경로의 잔재가 남으면 저장이 두 곳으로 갈린다.
  for (const gone of ["createObjectURL", "sim-snap-save", "sim-snap-load", "sim-snap-file", "a.download"]) {
    assert.ok(!(src + scene).includes(gone), `내려받기 잔재가 남아 있다: ${gone}`);
  }
  // 복원은 되돌릴 수 없다 — 무엇이 사라지는지 세어서 보여준 뒤에 묻는다.
  const restore = scene.slice(scene.indexOf("const restoreSavedScene ="));
  assert.match(restore, /doomedCameraCount\(cameras, snap\)/);
  // 레벨이 다르면 409 다. 강행 여부는 사람이 정한다 — 다른 주차장의 좌표를 이 레벨에
  // 쏟아붓는 일이라 조용히 force 를 붙이면 안 된다.
  assert.match(restore, /if \(e\.status !== 409\) throw e;/);
  assert.match(restore, /r = await postJson\(path, \{ force: true \}\);/);
  // 복원 뒤 씬을 다시 채우는 일은 부모의 몫이다 — 여기서 하면 이 탭 하나가 화면 전체를 안다.
  assert.match(restore, /await onRestored\(\);/);
  assert.doesNotMatch(scene, /refreshRig\(\)|loadScene\(\)/, "패널이 씬을 직접 다시 읽으면 안 된다");
  assert.match(src, /const reloadAfterRestore = useCallback/, "부모가 그 되읽기를 들어야 한다");
});

test("탭을 열면 그 탭이 보는 것을 서버에서 다시 읽는다", async () => {
  const src = await page();
  // 리그는 이 화면 밖에서도 바뀐다.
  assert.match(src, /if \(tab === "rig" \|\| tab === "drive"\) refreshRig\(\);/);
  // 주소와 저장 목록도 같은 규칙을 따르되, 각 패널이 스스로 읽는다 — 자기 탭에서만
  // 마운트되므로 마운트가 곧 「탭을 열었다」이고, 여는 쪽과 읽는 쪽을 갈라 둘 이유가 없다.
  // (저장본은 다른 브라우저에서도 늘어나므로 열 때마다 다시 읽어야 한다.)
  const endpoint = await read("endpoint-panel.jsx");
  assert.match(endpoint, /useEffect\(\(\) => \{ load\(\); \}, \[load\]\);/, "패널이 마운트에서 주소를 읽어야 한다");
  assert.match(src, /\{tab === "settings" && \(\s*<EndpointPanel/, "그 패널은 설정 탭에서만 선다");
  const scene = await read("scene-panel.jsx");
  assert.match(scene, /useEffect\(\(\) => \{ loadSavedScenes\(\); \}, \[loadSavedScenes\]\);/,
    "패널이 마운트에서 저장 목록을 읽어야 한다");
  assert.match(src, /\{tab === "info" && \(\s*<ScenePanel/, "그 패널은 씬 탭에서만 선다");
});

// 이름을 고치는 것과 내용을 고치는 것은 다른 일이다. 한 버튼으로 묶으면(= 새 이름으로 저장)
// 이름만 고치려던 사람이 그 사이 달라진 씬까지 저장본에 옮겨 담게 된다.
test("이름 바꾸기는 서버가 파일을 옮긴다 — 새 이름으로 다시 저장하는 것이 아니다", async () => {
  const scene = await read("scene-panel.jsx");
  const rename = scene.slice(scene.indexOf("const renameSavedScene ="), scene.indexOf("const deleteSavedScene ="));
  assert.match(rename, /postJson\(api\(`\/simulator\/scenes\/\$\{enc\(scene\.name\)\}\/rename`\)/);
  assert.ok(!rename.includes("putScene("), "이름 바꾸기가 지금 씬을 저장하면 내용이 함께 바뀐다");
  assert.ok(!/reqJson\("DELETE"/.test(rename), "옮기는 것이지 지웠다 다시 만드는 것이 아니다");
  // 덮어쓰기는 반대다: 이름은 그대로 두고 지금 씬을 담는다.
  assert.match(scene, /putScene\(scene\.name\)/);
});

// 저장되는 것은 카메라 하나가 아니라 이 월드다. 빈 칸을 두면 눈앞의 카메라 별명을 적게 되어
// 저장본 이름이 카메라 이름과 같아진다(실제로 그렇게 됐다).
test("저장 이름 칸은 비어 있으면 레벨 이름으로 채운다", async () => {
  const scene = await read("scene-panel.jsx");
  assert.match(scene, /const level = catalog\?\.level \|\| "";/, "레벨은 부모가 준 카탈로그에서 온다");
  // **사람이 적어 둔 이름은 덮지 않는다.** prev 를 보고 비었을 때만 채우는 것이 그 규칙이고,
  // 무조건 대입으로 바꾸면 이름을 적는 도중 카탈로그가 도착하는 순간 글자가 사라진다.
  assert.match(scene, /setName\(\(prev\) => \(prev\.trim\(\) \? prev : level\)\);/);
  assert.match(scene, /if \(!level\) return;/, "레벨을 모르면 아무것도 하지 않는다");
});

test("씬은 주기적으로 다시 읽되, 바뀐 게 없으면 다시 그리지 않는다", async () => {
  const src = await page();
  const poll = src.slice(src.indexOf("const pollTick ="), src.indexOf("useJobPoll("));
  assert.ok(poll.length > 500, "주기 갱신 함수를 못 읽었다");
  // 게이트는 두 단이다(2026-08-22 감사 [35]). 조준(PTZ)·영상 위 핀은 **어느 탭에서든** 보이므로
  // 그 갱신은 숨김 여부만 본다 — 지도 탭 게이트를 머리에 두면 기본 탭(로그)에서 핀이 무기한
  // 옛 자세로 남는다. 무거운 리그 갱신만 지도가 보일 때(rig/drive) 돈다.
  const ptzIdx = poll.indexOf('getJson(api("/simulator/control/ptz"))');
  const tabGate = poll.indexOf('if (S.current.tab !== "rig" && S.current.tab !== "drive") return;');
  const rigFetch = poll.indexOf("fetchCameras()");
  assert.ok(ptzIdx > -1 && tabGate > -1 && rigFetch > -1, "두 단 게이트의 재료가 다 있어야 한다");
  assert.ok(ptzIdx < tabGate && tabGate < rigFetch,
    "조준 갱신은 탭 게이트보다 앞, 리그 갱신은 그 뒤여야 한다");
  // 숨김·겹침 가드는 공용 훅의 것이다 — 이 화면의 pollRig 가 그 훅의 사양이었다.
  assert.match(src, /useJobPoll\(pollTick, \{/);
  assert.match(src, /intervalMs: 5000/);
  // 사람이 배치 중이거나 조작이 도는 중에는 다시 그리지 않는다 — 끄는 중에 지도를 다시
  // 만들면 끌던 것이 손 아래에서 사라진다. **편집 중은 여기서 빠진다**(폼이 늘 열려 있다).
  assert.match(src, /pauseWhen: \(\) => !!\(S\.current\.placing \|\| dragRef\.current \|\| S\.current\.busyLabel\)/);
  assert.ok(!src.includes("editingCameraId"), "편집 여부로 폴링을 멈추지 않는다");
  // 밖에서 돌아간 카메라 앞에서 화면이 옛 자세를 계속 말하면 값이 "연동되지 않는다"로 보인다.
  assert.match(poll, /if \(ptz && fmt\(ptz\) !== fmt\(S\.current\.lastPtz\)\)/);
  // 바뀐 게 없으면 그리지 않는다(스크롤·커서 튐 방지). 포트는 그 조기반환 **뒤**여야 한다 —
  // 앞에 두면 아무것도 안 바뀐 5초 주기마다 요청 하나를 공짜로 버린다.
  const early = poll.indexOf("=== sig) return;");
  const fetchPorts = poll.indexOf("fetchPorts()");
  assert.ok(early > -1 && fetchPorts > early, "포트 갱신은 조기반환보다 뒤에 있어야 한다");
  // 등록부는 주기 호출 대상이 아니다 — loadDevices 는 활성 기기를 서버에 쓴다.
  assert.doesNotMatch(poll, /loadDevices\(/);
});

// 시뮬레이터 주소는 카메라와 별개다 — 카메라를 전부 지워도 연결이 남아야 한다.
// 회귀(2026-08-11): 주소가 카메라 기기의 scenePort 에 얹혀 있어서, 기기를 전부 지우자
// 백엔드가 인메모리 더블로 내려가고 화면이 실제 주차장 대신 빈 씬을 그렸다.
test("주소는 카메라가 아니라 시뮬레이터(월드)의 것이다", async () => {
  const src = await page();
  const panel = await read("endpoint-panel.jsx");
  // 계정도 월드의 것이다 — 카메라마다 복사돼 있던 것을 이 한 자리로 모았다.
  for (const id of ["sim-endpoint-host", "sim-endpoint-port", "sim-endpoint-timeout",
                    "sim-endpoint-user", "sim-endpoint-pass",
                    "sim-endpoint-probe", "sim-endpoint-save", "sim-endpoint-status"]) {
    assert.match(panel, new RegExp(`id="${id}"`), `${id} 누락`);
  }
  assert.match(panel, /getJson\(api\("\/simulator\/endpoint"\)\)/, "시뮬레이터 주소를 읽어 와야 한다");
  assert.match(panel, /reqJson\("PUT", api\("\/simulator\/endpoint"\)/, "주소는 PUT 으로 저장한다");
  // 옛 이름을 값으로 다루는 곳이 없어야 한다. 남아 있으면 그 이름으로 보낸 저장이 백엔드에서
  // 400 으로 끊긴다 — 조용히 무시했다면 "포트 없음" = **해제**로 읽혀 주소가 통째로 지워졌을 값이다.
  assert.doesNotMatch(src + panel, /\bscenePort\b/);
  assert.match(panel, /controlPort/, "제어 포트는 시뮬레이터 하나의 것이다");
  // 빈 칸을 어떻게 다루는가(특히 비밀번호 — 빈 칸은 "모른다"이지 "지워라"가 아니다)는 actions 의
  // endpointPayload 규칙이다. 여기서 다시 조립하면 그 규칙이 두 벌이 된다.
  assert.equal(panel.match(/endpointPayload\(form\)/g)?.length, 2, "테스트와 저장 둘 다 그 규칙을 쓴다");
  assert.match(panel, /placeholder=\{hasPassword \? t\("\(저장됨 · 변경 시에만 입력\)"\) : t\("비밀번호"\)\}/);
  // 주소가 바뀌면 씬이 통째로 바뀐다 — 그 되읽기는 화면 전체를 아는 부모의 몫이고, 패널은
  // 부른다는 사실만 안다. 패널이 직접 씬을 손대기 시작하면 이 화면을 두 곳에서 몰게 된다.
  assert.match(panel, /await onSaved\(\);/, "저장 뒤 씬 되읽기를 부모에게 넘겨야 한다");
  assert.doesNotMatch(panel, /invalidateScene|loadDevices|loadScene\(/, "패널이 씬을 직접 몰면 안 된다");
  assert.match(src, /const reloadAfterEndpointChange = useCallback/, "부모가 그 되읽기를 들어야 한다");
});

// 스폰 포트의 정본은 서버다. 세 갈래 판정과 대역 만원 문구는 actions 가 값으로 문다 —
// 여기서 지키는 것은 화면이 그 판정을 부르고 **제 관례를 다시 들이지 않는가**다.
// 8200 하드코딩이 정확히 그 사고였다(2026-08-17 재현: 대역 8030~8040 인스턴스에서 409).
test("스폰 포트는 서버가 정한다 — 화면은 관례를 다시 들이지 않는다", async () => {
  const src = await page();
  assert.match(src, /api\("\/simulator\/ports"\)/, "대역·빈 쌍을 서버에서 읽어야 한다");
  assert.match(src, /pickSpawnPorts\(S\.current\.portInfo, \{/);
  // 관례 탐색(8200·+100)은 대역 없는 인스턴스 전용이라 actions 안에만 산다.
  assert.doesNotMatch(code(src), /8200|nextFree/, "화면이 포트 관례를 다시 알면 안 된다");
  // 대역이 꽉 찼으면 폼을 여는 순간 말한다 — 빈칸은 "입력하세요"로 끝나 사람이 아무 값도
  // 안 된다는 사실을 시도해 봐야만 알게 된다.
  const finish = src.slice(src.indexOf("const finishPlacing ="), src.indexOf("const spawnCamera ="));
  assert.match(finish, /bandFullNotice\(S\.current\.portInfo\)/, "폼을 여는 순간 알려야 한다");
  // 직전 카메라의 근거가 다음 카메라에 묻어가면 기록이 있는 것처럼 보이면서 틀린다.
  assert.match(finish, /note: "",/);
  // 대역은 폼에도 새겨진다 — min/max 와 힌트 줄.
  assert.match(src, /id="sim-cam-port-range"/);
  assert.match(src, /min=\{portRangeHint\(portInfo\)\.http\.min\} max=\{portRangeHint\(portInfo\)\.http\.max\}/);
});

// 씬 API 에는 감사 로그가 없다. 그래서 카메라의 note(이름)가 "누가 왜 세웠나"의 유일한
// 기록이고, 비워 둘 수 있게 하면 그 답이 아무 데도 남지 않는다 — 2026-08-17 에 실제로
// 서버 씬의 카메라 한 대를 두고 그 답을 못 찾았다(note 가 빈 문자열이었다).
test("세우기는 이름을 요구한다 — 출처가 씬에 남는 유일한 기록이다", async () => {
  const src = await page();
  const form = src.slice(src.indexOf('id="sim-cam-form"'), src.indexOf('id="sim-cam-spawn"'));
  assert.match(form, /id="sim-cam-note"[\s\S]{0,120}required/, "세우기 폼에 필수 이름 칸이 있어야 한다");
});

// SPA 에서는 방문한 화면의 CSS 가 언로드되지 않고 쌓인다. 떠난 화면의 규칙이 다음 화면을
// 망가뜨리지 않으려면 두 가지를 지켜야 한다.
test("시뮬레이터 라우트 CSS 는 자기 화면 밖으로 새지 않는다", async () => {
  const css = await read("simulator.css");
  // 1. 전역 선택자를 쓰지 않는다 — 셸(public/index.html)이 화면 높이를 소유한다.
  for (const global of ["html", "body", "main", ":root", "header", "h1", "\\*"]) {
    assert.doesNotMatch(css, new RegExp(`^${global}\\b[^{]*\\{`, "m"), `전역 선택자 "${global}" 가 남아 있다`);
  }
  // 2. **공유 id 를 건드리는 규칙은 전부 #sim-main 아래.** #stage·#view·#viewbar·#log 는
  //    app.css 가 소유하는 공용 컴포넌트라 CCTV 화면도 같은 이름을 쓴다 — 접두사 없이 덮으면
  //    이 화면을 한 번 들른 뒤의 CCTV 스테이지가 860×484 로 굳는다.
  for (const shared of ["#stage", "#view", "#viewbar"]) {
    assert.doesNotMatch(css, new RegExp(`^${shared}\\b`, "m"), `공유 id ${shared} 를 접두사 없이 덮는다`);
    if (css.includes(shared)) assert.match(css, new RegExp(`#sim-main ${shared}|#sim-bottom-tabs ${shared}`));
  }
  // 앱 공용 표피(.danger·.muted)는 라우트가 아니라 app.css 가 갖는다 — 여기 두면 이 화면을
  // 한 번 들른 뒤에야 다른 화면의 「삭제」가 붉어진다.
  assert.doesNotMatch(css, /^button\.danger|^\.muted/m);
  const app = await readFile(new URL("../styles/tailwind.css", import.meta.url), "utf8");
  assert.match(app, /button\.danger \{/);
});

// React 가 그리는 화면에서 DOM 을 직접 잡으면 다음 렌더가 그 손질을 되돌린다 — 그리고 그
// 되돌림은 조용하다(화면이 한 번 맞았다가 틀려진다).
test("라우트는 DOM 을 직접 잡지 않는다 — ref 로 잡는 것은 명령형 위젯뿐이다", async () => {
  for (const src of [await page(), await map()]) {
    assert.doesNotMatch(code(src), /document\.getElementById|querySelectorAll|innerHTML|createElementNS/);
  }
  // 프리뷰 위젯만 <img>·모드버튼·fps 라벨을 소유한다(501 폴백·재연결 규칙이 그 안에 있다).
  const src = await page();
  assert.match(src, /img: viewRef\.current/);
  assert.match(src, /modeButton: modeBtnRef\.current/);
});

// ── 오른쪽 단: 주차면 · 차량 ────────────────────────────────────────────────
//
// 이 단에는 그물이 **하나도 없었다**(2026-08-25 발견 — 패널을 제 파일로 떼면서, 200줄이
// 통째로 옮겨졌는데 아무 테스트도 걸리지 않아 드러났다). 주석에 「왜」가 적혀 있는 규칙이
// 다섯인데 그중 하나도 검증되지 않고 있었으므로 여기서 채운다.
test("오른쪽 단 — 주차면 목록과 차량 폼이 갖는 것", async () => {
  const setup = await read("setup-panel.jsx");
  for (const id of ["sim-panel", "slot-card", "sim-slots", "sim-sel-slot",
                    "sim-cartype", "sim-color", "sim-color-chip", "sim-platetype",
                    "sim-plate-city", "sim-plate-prefix", "sim-plate-kor", "sim-plate-number",
                    "sim-spawn", "sim-apply", "sim-delete", "sim-force", "sim-status"]) {
    assert.match(setup, new RegExp(`id="${id}"`), `${id} 누락`);
  }
});

// 슬롯을 고르는 자리는 하나다. 평면도와 이 목록은 같은 슬롯을 두 방식으로 그린 것이라,
// 선택을 양쪽이 따로 들면 클릭한 자리와 켜진 자리가 갈린다.
test("슬롯 선택은 부모가 들고, 차량 폼은 그것을 받아 읽는다", async () => {
  const src = await page();
  const setup = await read("setup-panel.jsx");
  assert.match(src, /const pickSlot = useCallback\(\(slot\) => \{\s*\n\s*setSelectedSlot\(slot\.id\);\s*\n\s*setSelectedCar\(slot\.carId \|\| null\);/);
  // 평면도와 목록이 **같은 함수**를 부른다.
  assert.match(src, /onSlotClick=\{pickSlot\}/, "평면도가 그 선택을 써야 한다");
  assert.match(src, /onPickSlot=\{pickSlot\}/, "오른쪽 목록도 같은 선택을 써야 한다");
  // 고른 차가 바뀌면 그 차의 값을 읽어 폼에 올린다 — 읽는 일은 폼을 가진 쪽의 것이다.
  assert.match(setup, /useEffect\(\(\) => \{\s*\n\s*if \(selectedCar\) loadCarIntoForm\(selectedCar\);/);
  assert.doesNotMatch(setup, /setSelectedSlot/, "선택을 패널이 다시 들면 두 벌이 된다");
});

test("차량 폼은 마지막 요청만 이긴다 — 느린 응답이 방금 고른 차를 덮지 않게", async () => {
  const setup = await read("setup-panel.jsx");
  const load = setup.slice(setup.indexOf("const loadCarIntoForm ="), setup.indexOf("// 고른 차가 바뀌면"));
  assert.match(load, /const req = \+\+reqSeq\.current;/, "요청마다 번호를 매겨야 한다");
  // 성공·실패 **양쪽** 모두에서 확인해야 한다. 성공만 막으면, 느린 실패가 방금 고른 차의
  // 자리에 「조회 실패」를 적는다.
  assert.equal(load.match(/if \(req !== reqSeq\.current\) return;/g)?.length, 2,
    "성공과 실패 양쪽에서 낡은 응답을 버려야 한다");
  // 무언으로 삼키면 직전 차량의 값이 방금 고른 차량의 것처럼 남고, 이어지는 「적용」이
  // 그 낡은 값으로 PATCH 한다.
  assert.match(load, /setStatus\(t\("차량 조회 실패"\)/, "조회 실패는 말해야 한다");
});

test("차량 쓰기 셋 — 창구와 순서", async () => {
  const setup = await read("setup-panel.jsx");
  assert.match(setup, /postJson\(api\("\/simulator\/cars"\), \{ slotId: selectedSlot, force, \.\.\.carBody\(\) \}\)/);
  assert.match(setup, /reqJson\("PATCH", api\("\/simulator\/cars\/"\) \+ enc\(applied\), carBody\(\)\)/);
  assert.match(setup, /reqJson\("DELETE", api\("\/simulator\/cars\/"\) \+ enc\(id\)\)/);
  // 2xx 인데 본문이 비면 스폰은 됐는데 화면만 「실패」라고 말한다 — 카메라 스폰과 같은 방어다.
  assert.match(setup, /const car = r\.car \|\| null;/);
  assert.match(setup, /car\?\.id \? t\("스폰됨: \{id\}"/, "본문이 없어도 성공은 성공이라고 말해야 한다");
  // 씬 재적재가 상태줄을 비우므로 성공 보고는 **그 뒤**다. 순서가 뒤집히면 방금 적은 결과가
  // 곧바로 지워져 「아무 일도 안 일어났다」로 보인다.
  const spawn = setup.slice(setup.indexOf("const simSpawn ="), setup.indexOf("const simApply ="));
  assert.ok(spawn.indexOf("await onSceneChanged()") < spawn.indexOf('setStatus(car?.id'),
    "재적재가 먼저, 보고가 나중이어야 한다");
  // 삭제는 즉시 선점을 푼다 — 재적재가 빈 슬롯에서 재확인하지만, 그 사이 「선택 차량에 적용」이
  // 이미 없는 차를 향할 수 있다.
  const del = setup.slice(setup.indexOf("const simDelete ="));
  assert.ok(del.indexOf("setSelectedCar(null)") < del.indexOf("await onSceneChanged()"),
    "선점 해제가 재적재보다 먼저여야 한다");
});

// 상태줄은 이 패널만의 것이 아니다 — 씬 재적재와 「전체 초기화」(씬 탭)도 같은 줄에 적는다.
// 패널이 자기 상태로 들면 그 두 경로가 말할 자리를 잃는다.
test("차량 상태줄은 부모가 든다 — 씬 재적재와 초기화도 같은 줄에 적는다", async () => {
  const src = await page();
  const setup = await read("setup-panel.jsx");
  assert.match(setup, /status, setStatus, onSceneChanged,/, "상태줄은 props 로 받는다");
  assert.doesNotMatch(setup, /useState\(""\)[\s\S]{0,40}[Ss]tatus/, "패널이 상태줄을 다시 들면 안 된다");
  assert.match(src, /const \[carStatus, setCarStatus\] = useState\(""\);/);
  assert.match(src, /status=\{carStatus\} setStatus=\{setCarStatus\}/);
  // 전체 초기화(씬 탭 버튼)의 결과도 이 줄에 적힌다.
  assert.match(src, /setCarStatus\(t\("\{n\}대 초기화됨"/);
});
