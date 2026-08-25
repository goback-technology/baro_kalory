import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cctvPageUrl = new URL("../public/cctv.html", import.meta.url);

// 2026-07-29 요구 변경: 페이지를 열자마자 스트림을 시작하지 않는다.
// 시뮬 카메라는 캡처 예산이 유한해서(2대 동시 스트리밍 시 각 30->26fps 실측), 페이지를 여는
// 행위가 곧 카메라 점유가 되면 안 된다. 영상을 볼 의도는 시작 버튼으로만 표현한다.
test("CCTV 페이지는 열자마자 프리뷰를 켜지 않는다 — 지난 선택이 '켬'일 때만 자동 시작", async () => {
  const html = await readFile(cctvPageUrl, "utf8");
  const loopIndex = html.lastIndexOf("loopPtz();");
  assert.notEqual(loopIndex, -1, "CCTV 페이지 부트스트랩은 PTZ 루프를 시작해야 한다");

  const bootstrap = html.slice(Math.max(0, loopIndex - 400), loopIndex);
  assert.doesNotMatch(
    bootstrap,
    /(^|\n)\s*startControlPreview\(\);/,
    "부트스트랩이 프리뷰를 무조건 시작하면 안 된다 (설정만 보러 열어도 카메라를 점유한다)",
  );
  assert.match(
    bootstrap,
    /if \(readPreviewWanted\(\)\) startControlPreview\(\);/,
    "저장된 선택이 '켬'일 때만 자동 시작해야 한다",
  );
});

test("프리뷰 시작/정지 선택이 저장되고, 기본값은 꺼짐이다", async () => {
  const html = await readFile(cctvPageUrl, "utf8");
  // 기본값 꺼짐: 저장값이 정확히 "on" 일 때만 참
  assert.match(html, /localStorage\.getItem\(PREVIEW_WANTED_KEY\) === "on"/);
  // 저장소를 못 쓰는 환경에서도 꺼짐으로 떨어져야 한다(카메라 점유가 기본이 되지 않게)
  assert.match(html, /function readPreviewWanted\(\)[\s\S]{0,200}catch \{ return false; \}/);
  assert.match(html, /function startControlPreview\(\)[\s\S]{0,160}savePreviewWanted\(true\)/);
  assert.match(html, /async function stopControlPreview\(\)[\s\S]{0,160}savePreviewWanted\(false\)/);
});

test("시뮬레이터 페이지에도 프리뷰 시작/정지 게이트가 있다", async () => {
  const html = await readFile(new URL("../public/simulator.html", import.meta.url), "utf8");
  assert.match(html, /id="sim-preview-start"/, "시작 버튼이 있어야 한다");
  assert.match(html, /id="sim-preview-stop"/, "종료 버튼이 있어야 한다");
  // 무조건 preview.start() 하지 않는다 — 저장된 선택을 따른다
  assert.match(html, /localStorage\.getItem\(SIM_PREVIEW_WANTED_KEY\) === "on"/);
  assert.match(html, /if \(wanted\) startSimPreview\(\);/);
  // preview.start() 를 무조건 부르는 경로가 남아 있으면 게이트가 우회된다.
  // 허용되는 호출은 startSimPreview() 안의 1회뿐이고, 나머지는 실행 중이었을 때만 재개해야 한다.
  const unguarded = [...html.matchAll(/preview\.start\(\)/g)]
    .filter((m) => {
      // 같은 줄만 보면 안 된다(`.` 는 개행을 안 넘는다) — 앞 200자를 줄 넘어 훑는다.
      const before = html.slice(Math.max(0, m.index - 200), m.index);
      return !/simPreviewRunning|wasRunning|SIM_PREVIEW_WANTED_KEY/.test(before);
    })
    .map((m) => html.slice(0, m.index).split("\n").length);
  assert.deepEqual(unguarded, [], `가드 없는 preview.start() 가 남아 있다 (줄): ${unguarded.join(", ")}`);
});

// JS 로드 전 첫 페인트도 **정지**여야 한다. 예전에는 마크업이 preview-waiting 을 달고 있어,
// 프리뷰를 켜지 않는 페이지가 "Wait..." 로 시작해 그대로 머물렀다 — 기다릴 것이 없는데
// 기다린다고 말하는 화면이다(2026-08-04). 상태 구분: 접속 시도 중 = Wait, 안 켠 상태 = 정지.
// (동작 자체는 camera-preview.test.mjs 가 호출을 세어 검증한다. 여기는 첫 페인트 마크업만.)
test("첫 페인트는 대기가 아니라 정지 상태로 그린다", async () => {
  const [html, discovery] = await Promise.all([
    readFile(cctvPageUrl, "utf8"),
    readFile(new URL("../public/discovery.html", import.meta.url), "utf8"),
  ]);
  // height 는 SPA 라우트다 — 첫 페인트 마크업이 HTML 이 아니라 그 라우트 안에 있다.
  const height = await readFile(new URL("../src/pages/height/page.jsx", import.meta.url), "utf8");
  // 바닐라 페이지는 class=, 라우트는 className= 다. 계약은 같으므로 둘 다 받는다.
  const CLS = "(?:class|className)";
  for (const [page, stageId, imgId] of [[html, "stage", "view"], [discovery, "disc-stage", "disc-view"], [height, "hgt-stage", "hgt-view"]]) {
    assert.match(page, new RegExp(`id="${stageId}" ${CLS}="preview-stage preview-paused" data-paused-label="[^"]+"`),
      `${stageId} 는 정지 상태 + 문구로 첫 페인트를 그려야 한다`);
    assert.doesNotMatch(page, new RegExp(`id="${stageId}" ${CLS}="preview-waiting"`),
      `${stageId} 가 대기로 시작하면 안 켠 페이지가 영원히 Wait 로 남는다`);
    assert.match(page, new RegExp(`id="${imgId}" ${CLS}="preview-waiting-image"`),
      `${imgId} 는 감춰진 채로 시작해야 한다(깨진 이미지 아이콘 방지)`);
  }
});

test("header camera selector replaces the click-to-center guidance and uses the live switch API", async () => {
  const html = await readFile(cctvPageUrl, "utf8");
  assert.doesNotMatch(html, /화면을 클릭하면 그 지점이 가운데로 옵니다/);
  assert.match(html, /id="header-camera-select"/);
  // 셀렉터 로직은 camera-select.mjs 로 이동(2026-08-03 4앱 분리) — 페이지는 모듈을 조립만 한다.
  assert.match(html, /createCameraSelect\(\{/);
  assert.match(html, /cam\.load\(\)/);
  assert.match(html, /releasePreviewForCameraSwitch\(\)/);
  const mod = await readFile(new URL("../src/camera-select.mjs", import.meta.url), "utf8");
  assert.match(mod, /postJson\(api\("\/cctv\/active"\), \{ id \}\)/);
  // 놓아주기가 전환 요청보다 **앞**에 있어야 한다. 순서가 이 사고의 원인이었으므로 위치까지 못 박는다.
  const beforeIdx = mod.indexOf("await beforeChange(");
  const postIdx = mod.indexOf('postJson(api("/cctv/active")');
  assert.ok(beforeIdx > -1 && beforeIdx < postIdx, "beforeChange 가 /cctv/active 전환보다 먼저여야 한다");
});

test("설정·캘리브레이션·주차면 탐색은 CCTV 페이지에서 완전히 떠났다 (잔재 없음)", async () => {
  const html = await readFile(cctvPageUrl, "utf8");
  for (const marker of ['id="tab-settings"', 'id="calib-card"', 'id="set-save"', 'id="apibase-input"',
                        'id="tab-discovery"', 'id="disc-view"', 'id="home-replay"', 'id="tabs"']) {
    assert.doesNotMatch(html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${marker} 잔재`);
  }
  assert.doesNotMatch(html, /function loadCctvSettings|initCalibCard|syncHeaderCameraSelect/);
  // 탭이 사라졌으므로 activeTab 분기도 남아 있으면 안 된다 — 남으면 프리뷰가 조용히 안 켜진다.
  assert.doesNotMatch(html, /activeTab|discoveryPreview|loadDiscovery/);
});

test("CCTV manual and absolute PTZ controls use the shared video overlay", async () => {
  const [html, controls] = await Promise.all([
    readFile(cctvPageUrl, "utf8"),
    readFile(new URL("../src/ptz-controls.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(html, /id="cctv-ptz-overlay" class="ptz-control-overlay"/);
  assert.match(html, /id="control-ptz-mount" class="ptz-controls-mount"/);
  assert.match(html, /id="ptz-overlay-toggle"[^>]*checked/);
  assert.match(html, /overlay:\s*\{[\s\S]*?container: document\.getElementById\("cctv-ptz-overlay"\)/);
  assert.match(controls, /absoluteCard\.classList\.add\("ptz-absolute-card"\)/);
  assert.match(controls, /overlay\.toggle\.addEventListener\("change", updateOverlayVisibility\)/);
});

test("legacy parking spot registration UI is absent (점 기반 탐색이 대체했다)", async () => {
  const [html, discovery] = await Promise.all([
    readFile(cctvPageUrl, "utf8"),
    readFile(new URL("../public/discovery.html", import.meta.url), "utf8"),
  ]);
  for (const page of [html, discovery]) {
    for (const id of ["ws-save", "ws-goto", "ws-info", "spot-name", "spot-save", "mark-info"]) {
      assert.doesNotMatch(page, new RegExp(`id="${id}"`));
    }
    assert.doesNotMatch(page, /function loadSpots\(/);
    assert.doesNotMatch(page, /pendingMark/);
  }
  assert.match(discovery, /id="disc-ptlist"/);
});

// 2026-08-03 요구: 스냅샷은 프리뷰용 저해상도가 아니라 고해상도 원본으로 받는다.
// 프리뷰 <img> 는 720p 스트림이거나 ?preview=1 로 스트림에서 떠 온 프레임이라, 그걸 캔버스로
// 복사하면 화면 해상도가 그대로 파일이 된다. 원본은 ?preview=1 없이 받아야 하고, 재인코딩
// 없이 저장해야 한다(캔버스를 거치면 화질이 한 번 더 깎인다).
test("스크린샷은 원본/화면 해상도를 고르고, 원본은 preview 경로를 타지 않는다", async () => {
  const html = await readFile(cctvPageUrl, "utf8");
  assert.match(html, /id="snap-res"/, "해상도 선택이 있어야 한다");
  assert.match(html, /<option value="full">/);
  assert.match(html, /<option value="screen">/);
  // 원본 경로: /api/snapshot 을 직접 받는다 — preview=1 을 붙이면 저해상으로 되돌아간다.
  assert.match(html, /async function downloadFullSnapshot\(\)[\s\S]{0,400}fetch\(api\("\/snapshot"\)/);
  assert.doesNotMatch(html, /api\("\/snapshot"\)\s*\+\s*"\?preview=1/);
  // 받은 JPEG 을 그대로 저장한다(캔버스 재인코딩 금지).
  assert.match(html, /const blob = await r\.blob\(\)[\s\S]{0,200}saveBlob\(blob, ""\)/);
  // 화면 해상도 경로는 기존 캔버스 복사를 유지한다.
  assert.match(html, /function downloadScreenSnapshot\(\)[\s\S]{0,400}drawImage\(view, 0, 0\)/);
});

// 2026-08-04 사고 회귀: 기기를 연달아 전환했더니 이전 카메라가 유휴로 풀리지 않아 홈 복귀가
// 안 되고 프레임이 급감했다. 원인은 순서였다 — 서버 활성을 먼저 바꾸고 나서 프리뷰를 새
// 카메라로 "다시 연결" 했기 때문에, 그 사이 이전 카메라로 열린 MJPEG 스트림이 유령 시청자로
// 남았다. 놓아주기가 전환보다 먼저여야 하고, 전환이 곧 새 카메라 점유가 되어서도 안 된다.
test("카메라 전환은 프리뷰를 먼저 놓아주고, 자동으로 다시 켜지 않는다", async () => {
  const html = await readFile(cctvPageUrl, "utf8");
  assert.match(html, /beforeChange:\s*\(\)\s*=>\s*releasePreviewForCameraSwitch\(\)/,
    "전환 전에 프리뷰를 놓아주는 훅이 걸려 있어야 한다");
  assert.doesNotMatch(html, /onChange:\s*\(\)\s*=>\s*reconnectActiveCameraPreview\(\)/,
    "전환 후 자동 재연결은 점유를 이어받는다 — 되살리면 안 된다");
  const release = html.match(/async function releasePreviewForCameraSwitch\(\)[\s\S]*?\n\}/)[0];
  assert.match(release, /controlPreviewWanted\s*=\s*false/,
    "전환 시 '보고 싶음' 상태를 내려야 새 카메라를 자동 점유하지 않는다");
  assert.match(release, /savePreviewWanted\(false\)/, "그 상태가 저장소에도 남아야 한다");
  assert.match(release, /await controlPreview\.stop\(\)/, "stop 은 await 해야 한다 — 연결 누적 방지");
  assert.doesNotMatch(release, /controlPreview\.start\(\)/, "놓아주기 안에서 다시 시작하면 안 된다");
});

// 2026-08-04 실측 원인: 스트림 없는 기기(기준기 → /api/stream 501)를 한 번 거치면 그 탭이
// 세션 내내 스냅샷 모드(≈2.5fps, 매 폴마다 원본 CGI)에 갇혔다. 자동 폴백은 "그 기기가
// 스트림을 못 준다"는 사실일 뿐 사용자의 선택도, 새 기기에 대한 판정도 아니다.
test("기기 전환은 자동 스냅샷 폴백을 무효화한다 (저fps 고착 방지)", async () => {
  const [html, mod] = await Promise.all([
    readFile(cctvPageUrl, "utf8"),
    readFile(new URL("../src/camera-preview.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(mod, /function resetFallbackForNewDevice\(\)/, "폴백 무효화 API 가 있어야 한다");
  assert.match(mod, /fellBackToSnapshot\s*=\s*!!fallback && m === "snapshot"/,
    "자동 폴백만 표시해야 한다 — 사용자가 고른 스냅샷 모드는 대상이 아니다");
  const reset = mod.match(/function resetFallbackForNewDevice\(\)[\s\S]*?\n  \}/)[0];
  assert.match(reset, /if \(!fellBackToSnapshot\) return false;/,
    "사용자가 명시적으로 고른 스냅샷 모드는 건드리면 안 된다");
  // 저장은 명시적 선택일 때만 — 자동 폴백을 저장하면 브라우저가 영구 고착된다(.v2 키 사연).
  assert.match(mod, /if \(keyMode && !fallback\) localStorage\.setItem\(keyMode, m\);/,
    "폴백 저장 가드(!fallback)가 setItem 앞에 있어야 한다");
  assert.match(html, /controlPreview\.resetFallbackForNewDevice\(\)/,
    "카메라 전환 경로가 폴백을 걷어내야 한다");
});

// discovery 도 같은 전환 계약을 지켜야 한다. 다만 cctv 와 한 곳이 다르다 — 이 페이지는
// 프리뷰가 곧 작업 화면(영상 위에 점을 찍는 것이 본업)이라 전환 후 다시 켠다. 켜는 것은
// 괜찮지만 **놓아주기가 먼저**여야 하고, 폴백은 새 기기에 물려주지 않아야 한다.
test("discovery 도 전환 시 먼저 놓아주고 폴백을 걷어낸다", async () => {
  const html = await readFile(new URL("../public/discovery.html", import.meta.url), "utf8");
  assert.match(html, /beforeChange:\s*async\s*\(\)\s*=>\s*\{/, "놓아주기 훅이 있어야 한다");
  const before = html.match(/beforeChange:\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\n  \},/)[0];
  assert.match(before, /await discoveryPreview\.stop\(\)/, "stop 을 await 해야 한다");
  assert.match(before, /discoveryPreview\.resetFallbackForNewDevice\(\)/, "폴백을 걷어내야 한다");
  // 옛 형태(전환 후에야 stop→start)가 남아 있으면 유령 창이 다시 생긴다.
  assert.doesNotMatch(html, /onChange:\s*async\s*\(\)\s*=>\s*\{\s*await discoveryPreview\.stop\(\)/,
    "stop 이 onChange 에 남아 있으면 서버 전환보다 늦다");
  assert.match(html, /window\.addEventListener\("pagehide"/, "페이지 이탈 시 강제 종료는 유지되어야 한다");
});

// 3D 검출은 사각형이 아니라 투영된 직육면체다. 사이드카가 주는 것은 12개 모서리의 픽셀
// 선분과 미터 값이고 2D bbox 는 아예 없다 — boxes 로 옮기면 좌표 4개의 뜻이 "사각형의 대각
// 두 점"으로 바뀌어 차 한 대가 사각형 12개가 된다.
test("3D 결과는 boxes3d 로 읽고 큐보이드로 그린다 — boxes 로 접지 않는다", async () => {
  const html = await readFile(cctvPageUrl, "utf8");
  assert.match(html, /id="det-test-vpd3d"/);
  assert.match(html, /runDetectorTest\(\["vpd_3d"\]\)/);
  // 「전체」가 전체여야 한다.
  assert.match(html, /runDetectorTest\(\["vpd", "lpd", "lpr", "vpd_3d"\]\)/);
  // 버튼 잠금 배열에서 빠지면 그 버튼만 테스트 중에 다시 눌린다.
  const buttons = html.slice(html.indexOf("const detTestButtons = ["), html.indexOf("].filter(Boolean);"));
  assert.match(buttons, /det-test-vpd3d/);

  const draw = html.slice(html.indexOf("function drawBox3dOverlay("),
                          html.indexOf("function drawDetectorOverlay("));
  assert.match(draw, /result\.boxes3d/);
  assert.match(draw, /createElementNS\(NS, "line"\)/);
  assert.ok(!draw.includes("det-box"), "3D 를 사각형 요소로 그리면 방위가 사라진다");
});

// 적대적 리뷰가 재현한 결함: 그리는 쪽은 좌표를 클램프하고 퇴화한 것을 건너뛰는데 세는 쪽이
// 원좌표로 다시 판정하면, 화면은 비어 있는데 "영상 위 박스 n개"라고 말하는 상태가 성립한다.
// 사이드카는 프레임 밖 좌표를 정상 출력으로 낸다(클램프하지 않는다) — 드문 입력이 아니다.
test("「영상 위 박스 n개」는 그린 쪽이 센다 — 따로 다시 판정하지 않는다", async () => {
  const html = await readFile(cctvPageUrl, "utf8");
  assert.ok(!html.includes("drawnOverlayCount"), "세는 함수를 따로 두면 그리는 쪽과 갈린다");
  assert.match(html, /const n = drawDetectorOverlay\(payload\);/);
  assert.ok(!/n: detectorOverlays\.children\.length/.test(html),
    "노드 수로 세면 3D 큐보이드 전체가 SVG 한 장이라 차 여러 대가 1개가 된다");
  // 프레임 밖 큐보이드는 선이 그어져도 한 픽셀도 안 보인다 — 보이는 것만 세야 한다.
  const draw = html.slice(html.indexOf("function drawBox3dOverlay("),
                          html.indexOf("function drawDetectorOverlay("));
  assert.match(draw, /segmentHitsRect\(/);
});

// 카메라 목록은 **하나다.** 실기든 씬에 세운 것이든 같은 줄에 같은 모양으로 선다 — 어디에
// 기록돼 있는지는 백엔드의 내부 사정이라, 병합(등록 기기 + 씬 카메라)과 활성 판정(지금 몰고
// 있는 카메라)은 서버(/cctv/devices)가 끝내서 보낸다. 화면이 두 목록을 다시 합치면 그
// 봉합선(별도 묶음·derived 분기)이 반드시 보인다.
test("카메라 드롭다운은 한 목록이다 — 서버가 병합한 /cctv/devices 하나만 읽는다", async () => {
  const src = await readFile(new URL("../src/camera-select.mjs", import.meta.url), "utf8");
  assert.match(src, /api\("\/cctv\/devices"\)/);
  assert.ok(!src.includes("optgroup"), "시뮬 카메라를 따로 묶으면 저장 위치가 화면 구조로 샌다");
  assert.ok(!src.includes("/simulator/devices"), "병합은 서버의 일이다 — 화면이 두 목록을 합치지 않는다");
  assert.ok(!src.includes("/cctv/capabilities"), "활성 판정도 /cctv/devices 의 active 하나다");
});

// 3D 박스가 서는 자리가 설치 높이 위다 — 높이를 모르면 큐보이드의 거리와 크기가 통째로
// 배율만큼 틀린다. 그래서 PTZ 옆에 늘 보인다.
//
// 출처는 둘이고 순서가 있다: 발행된 설치 측량이 먼저(실카메라의 정본), 없으면 씬에 묻는다.
// 시뮬 카메라의 높이는 추정이 아니라 **엔진이 아는 값**이라, 발행본이 없다고 "모른다"고
// 말하는 것은 거짓이다. 실카메라에는 씬이라는 출처가 없으니 자연히 첫째만 남는다.
test("PTZ 줄에 설치 높이(H)가 함께 나온다 — 발행본 먼저, 없으면 씬", async () => {
  const html = await readFile(cctvPageUrl, "utf8");
  assert.match(html, /<h2>현재 PTZ &amp; 높이<\/h2>/);
  const fn = html.slice(html.indexOf("async function loadMountHeight("),
                        html.indexOf("function fmtWithHeight("));
  assert.match(fn, /api\(`\/profiles\/camera\//);
  assert.match(fn, /extrinsic\?\.mount\?\.heightM/);
  assert.match(fn, /simulator\/cameras/);
  // 순서가 뒤집히면 발행된 측량이 씬 값에 덮인다 — 측량이 정본이다.
  assert.ok(fn.indexOf("profiles/camera/") < fn.indexOf("simulator/cameras"),
    "발행본을 먼저 보고, 없을 때만 씬에 묻는다");
  // 어느 쪽도 모르면 0 이 아니라 "—" 다. 0 m 는 지면에 붙은 카메라라는 측정값처럼 읽힌다.
  assert.match(html, /mountHeightCm === null \? "—"/);
  // 카메라를 바꾸면 높이도 따라가야 한다.
  assert.match(html, /onChange: \(\) => loadMountHeight\(\)/);
});
