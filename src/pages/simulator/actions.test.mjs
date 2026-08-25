import test from "node:test";
import assert from "node:assert/strict";
import {
  ptzSnapshot, readyStateOf, statusTextFromSimulatorState, endpointPayload,
  slotName, slotNameById, sortSlots, plateText, sceneStamp,
  mountYawOf, viewOf, viewYawOf, hfovOf, tiltposOf, hfovLimitsOf, coneOf, aimTargetFor, rigSignature,
  portBand, suggestPortsByConvention, pickSpawnPorts, bandFullNotice, portRangeHint,
  spawnRequestFrom, spawnOutcome, typedOrExact, installPatchFrom, driveChangeOf,
  installFieldsOf, cameraTitleLine, cameraPortsLine,
  deviceForCamera, cameraForDevice, resolveActiveCam, pickDevice,
  compareOracle, doomedCameraCount, restoreSummaryText, sceneMetaText, saveSceneText,
  MOVE_SPEED,
} from "./actions.mjs";
import { t } from "../../i18n.mjs";

const views = (rows) => new Map(rows.map((r) => [r.port, r]));
const cam = (over = {}) => ({
  id: "cam-1", hucomsPort: 8200, mjpegPort: 8300, spawned: true, note: "",
  heightAboveReferenceGroundCm: 600,
  mount: { location: { x: 100, y: 200, z: 610 }, baseYaw: 45 },
  groundReference: { zCm: 10 },
  ...over,
});

// ── 상태 ───────────────────────────────────────────────────────────────────────

test("ptzSnapshot: 반쪽 자세는 자세가 아니다", () => {
  assert.deepEqual(ptzSnapshot({ panpos: 100, tiltpos: -50, zoompos: 0 }),
    { panpos: 100, tiltpos: -50, zoompos: 0 });
  assert.deepEqual(ptzSnapshot({ panpos: "100", tiltpos: "0", zoompos: "0" }),
    { panpos: 100, tiltpos: 0, zoompos: 0 }, "문자열도 값이다");
  // 반쪽을 통과시키면 그 반쪽이 폼에 적히고, 다음 「적용」이 나머지를 0 으로 채워 보낸다.
  assert.equal(ptzSnapshot({ panpos: 100, tiltpos: null, zoompos: 0 }), null);
  assert.equal(ptzSnapshot({ panpos: 100 }), null);
  assert.equal(ptzSnapshot(null), null);
});

// 죽은 것이 무엇인가를 가려 말한다 — 「시뮬레이터 미연결」이라고 하면 사람이 UE 를 뒤진다.
test("readyStateOf: 백엔드 무응답과 시뮬 미연결은 다른 사실이다", () => {
  assert.deepEqual(readyStateOf({ ready: true, pluginVersion: "0.2.0" }),
    { led: "ready", text: t("시뮬레이터 준비됨") + " · v0.2.0" });
  assert.deepEqual(readyStateOf({ ready: true }), { led: "ready", text: t("시뮬레이터 준비됨") });
  assert.deepEqual(readyStateOf({ mode: "fake" }), { led: "warn", text: t("Fake 모드") });
  assert.deepEqual(readyStateOf({ unreachable: true, error: "ECONNREFUSED" }), {
    led: "off",
    text: t("백엔드 무응답 — 시뮬레이터 상태를 알 수 없습니다 ({e})", { e: "ECONNREFUSED" }),
  });
  // 계약은 message — error 는 로컬(fetch 실패) 폴백이다.
  assert.equal(readyStateOf({ message: "no route" }).text, t("시뮬레이터 미연결: {why}", { why: "no route" }));
  assert.equal(readyStateOf({}).text, t("시뮬레이터 미연결"));
});

test("statusTextFromSimulatorState: 어디에 붙어 있는가를 늘 함께 말한다", () => {
  assert.equal(
    statusTextFromSimulatorState({ ready: true, endpoint: { host: "10.0.0.5", port: 8095, name: "world" } }),
    `${t("연결됨")} · world · 10.0.0.5:8095`,
  );
  assert.equal(statusTextFromSimulatorState({ mode: "fake", endpoint: { host: "h" } }), `${t("Fake 모드")} · h`);
  assert.equal(statusTextFromSimulatorState({}), `${t("미연결")} · ${t("host 미설정")}`);
  assert.equal(statusTextFromSimulatorState({ endpoint: { host: "h", port: 1 }, message: "down" }),
    `${t("미연결")} · h:1 · down`);
});

// 빈 비밀번호 칸은 "모른다"이지 "지워라"가 아니다. 빈 문자열을 실어 보내면 호스트만 고치는
// 저장 한 번에 월드의 계정이 사라지고 모든 파생 카메라가 인증에 실패한다.
test("endpointPayload: 빈 비밀번호는 보내지 않는다", () => {
  assert.deepEqual(endpointPayload({ host: " h ", controlPort: " 8095 ", password: "" }),
    { host: "h", controlPort: "8095" });
  assert.deepEqual(endpointPayload({ host: "h", controlPort: "1", password: "pw" }),
    { host: "h", controlPort: "1", password: "pw" });
  // 계정·타임아웃도 빈 칸이면 빠진다 — 안 적은 칸이 저장 한 번에 지워지지 않게.
  assert.deepEqual(endpointPayload({ host: "h", controlPort: "1", username: " ", timeoutMs: "" }),
    { host: "h", controlPort: "1" });
  assert.deepEqual(endpointPayload({ host: "h", controlPort: "1", username: "admin", timeoutMs: "8000" }),
    { host: "h", controlPort: "1", timeoutMs: 8000, username: "admin" });
});

// ── 주차면·차량 ────────────────────────────────────────────────────────────────

test("slotName/sortSlots: 이름은 label 우선, 정렬은 숫자를 숫자로 본다", () => {
  assert.equal(slotName({ label: "A-2", id: "slot-2" }), "A-2");
  assert.equal(slotName({ id: "slot-2" }), "slot-2");
  assert.equal(slotName(null), "");
  const sorted = sortSlots([{ id: "P10" }, { id: "P2" }, { id: "P1" }]).map((s) => s.id);
  assert.deepEqual(sorted, ["P1", "P2", "P10"], "P10 이 P2 앞에 오면 눈으로 못 찾는다");
  assert.equal(slotNameById([{ id: "s1", label: "A-1" }], "s1"), "A-1");
  assert.equal(slotNameById([], "s9"), "s9", "목록에 없으면 id 라도 말한다");
});

test("plateText: 빈 조각은 빠지고 남은 것만 잇는다", () => {
  assert.equal(plateText({ city: "서울", prefix: "123", kor: "가", number: "4567" }), "서울 123가 4567");
  assert.equal(plateText({ prefix: "123", kor: "가", number: "4567" }), "123가 4567");
  assert.equal(plateText({ number: "4567" }), "4567");
  assert.equal(plateText({}), "");
});

test("sceneStamp: 못 읽는 시각은 에포크(1970)가 아니라 빈 칸이다", () => {
  assert.equal(sceneStamp(""), "");
  assert.equal(sceneStamp(null), "");
  assert.equal(sceneStamp("nonsense"), "");
  assert.match(sceneStamp("2026-08-12T03:04:00Z"), /^\d{2}-\d{2} \d{2}:\d{2}$/);
});

// ── 시야 — 서버가 낸 값만 읽는다 ────────────────────────────────────────────────

test("viewOf/viewYawOf/hfovOf: 안 닿는 카메라는 null 이지 0 이 아니다", () => {
  const byPort = views([{ port: 8200, viewYawDeg: 123.4, hfovDeg: 55, ptz: { tiltpos: 1500 } }]);
  const c = cam();
  assert.equal(viewYawOf(byPort, c), 123.4);
  assert.equal(hfovOf(byPort, c), 55);
  assert.equal(tiltposOf(byPort, c), 1500);
  // 0 으로 채우면 그 0 이 곧 "정면을 본다"는 거짓말이 되고, 실제로 89° 어긋난 곳을 가리켰다.
  const unreachable = cam({ hucomsPort: 9999 });
  assert.equal(viewOf(byPort, unreachable), null);
  assert.equal(viewYawOf(byPort, unreachable), null);
  assert.equal(hfovOf(byPort, unreachable), null);
  assert.equal(mountYawOf(c), 45);
  assert.equal(mountYawOf({}), 0, "설치방위는 씬이 늘 준다 — 없으면 0 이 그림의 기준이다");
});

test("hfovLimitsOf: 모르는 한계는 지어내지 않고 지금 각에 묶는다", () => {
  const full = views([{ port: 8200, hfovDeg: 30, hfovRange: { minDeg: 5, maxDeg: 60 } }]);
  assert.deepEqual(hfovLimitsOf(full, cam()), { min: 5, max: 60 });
  // 한계를 모르면 지금 화각에 묶어 아무 데도 못 가게 한다.
  const noRange = views([{ port: 8200, hfovDeg: 30 }]);
  assert.deepEqual(hfovLimitsOf(noRange, cam()), { min: 30, max: 30 });
  // 반쪽 한계도 「모른다」다 — min 만 믿고 max 를 지어내면 그 너머로 보낸다.
  const half = views([{ port: 8200, hfovDeg: 30, hfovRange: { minDeg: 5 } }]);
  assert.deepEqual(hfovLimitsOf(half, cam()), { min: 30, max: 30 });
  assert.equal(hfovLimitsOf(views([]), cam()), null, "화각조차 모르면 끌 것이 없다");
});

// 시뮬의 카메라는 액터(설치) → PanPivot(설치+팬) 의 FK 계층이다. 팬이 걸려 있으면 두 탭의
// 부채꼴이 다른 곳을 가리키는 것이 **맞는 그림**이다.
test("coneOf: 배치 탭은 설치방위·기준 시야, 컨트롤 탭은 보는 방향·지금 화각", () => {
  const byPort = views([{ port: 8200, viewYawDeg: 135, hfovDeg: 20, hfovRange: { minDeg: 5, maxDeg: 60 } }]);
  const c = cam();   // baseYaw 45, 팬 90° 걸린 상태
  assert.deepEqual(coneOf(byPort, c, { installMode: true }), { yaw: 45, half: 30 });
  assert.deepEqual(coneOf(byPort, c, { installMode: false }), { yaw: 135, half: 10 });
  // 안 닿는 카메라는 컨트롤 탭에서 시야를 안 그린다 — 모르는 것을 그리지 않는다.
  const gone = cam({ hucomsPort: 9999 });
  assert.equal(coneOf(byPort, gone, { installMode: false }), null);
  assert.equal(coneOf(byPort, gone, { installMode: true }), null, "기준 시야도 서버가 낸 한계에서 온다");
});

test("aimTargetFor: 팬은 몰고 있는 한 대, 설치방위는 스폰 카메라 전부", () => {
  const c = cam();
  // 제어 창구는 활성 카메라 한 대에만 닿는다.
  assert.equal(aimTargetFor(c, { tab: "drive", deviceId: "sim-cam-8200", activeCameraId: "sim-cam-8200" }), "pan");
  assert.equal(aimTargetFor(c, { tab: "drive", deviceId: "sim-cam-8200", activeCameraId: "sim-cam-8300" }), null);
  // 설치방위는 씬 PATCH — 레벨 저작은 403 이라 잡을 수 없는 것은 보이지도 않는다.
  assert.equal(aimTargetFor(c, { tab: "rig" }), "mount");
  assert.equal(aimTargetFor(cam({ spawned: false }), { tab: "rig" }), null);
});

// 시야가 서명에 없으면, 다른 카메라를 누가 돌려도 「바뀐 게 없다」고 판단해 다시 안 그린다.
test("rigSignature: 시야와 틸트가 서명에 든다", () => {
  const a = views([{ port: 8200, viewYawDeg: 10, hfovDeg: 30, ptz: { tiltpos: 100 } }]);
  const b = views([{ port: 8200, viewYawDeg: 90, hfovDeg: 30, ptz: { tiltpos: 100 } }]);
  const zoomed = views([{ port: 8200, viewYawDeg: 10, hfovDeg: 12, ptz: { tiltpos: 100 } }]);
  const tilted = views([{ port: 8200, viewYawDeg: 10, hfovDeg: 30, ptz: { tiltpos: 4000 } }]);
  const list = [cam()];
  assert.equal(rigSignature(list, a), rigSignature(list, a));
  assert.notEqual(rigSignature(list, a), rigSignature(list, b), "옆 카메라가 돌면 다시 그려야 한다");
  assert.notEqual(rigSignature(list, a), rigSignature(list, zoomed));
  assert.notEqual(rigSignature(list, a), rigSignature(list, tilted), "틸트는 틸트 앵커의 자리다");
  // 자리·높이·설치방위·대수도 리그의 사실이다.
  assert.notEqual(rigSignature(list, a), rigSignature([cam({ heightAboveReferenceGroundCm: 900 })], a));
  assert.notEqual(rigSignature(list, a), rigSignature([], a));
});

// ── 스폰 포트 ──────────────────────────────────────────────────────────────────

test("portBand: 반쪽 대역은 통째로 「대역 없음」이다", () => {
  const full = { cameraPortRange: { httpFrom: 8030, httpTo: 8040, mjpegFrom: 8130, mjpegTo: 8140 } };
  assert.deepEqual(portBand(full), { httpFrom: 8030, httpTo: 8040, mjpegFrom: 8130, mjpegTo: 8140 });
  // null 경계를 그대로 비교에 태우면 port > null 이 늘 참이라 모든 스폰이 「대역 밖」이 된다.
  assert.equal(portBand({ cameraPortRange: { httpFrom: 8030, httpTo: null, mjpegFrom: 8130, mjpegTo: 8140 } }), null);
  assert.equal(portBand({}), null);
  assert.equal(portBand(null), null);
});

// 8200 하드코딩이 정확히 그 사고였다 — 대역 8030~8040 인스턴스에서 폼이 8200 을 채워 409.
test("pickSpawnPorts: nextFree → 대역 만원 → 대역 없음, 가운데를 빠뜨리지 않는다", () => {
  const band = { cameraPortRange: { httpFrom: 8030, httpTo: 8040, mjpegFrom: 8130, mjpegTo: 8140 } };
  // 서버가 고른 쌍이 있으면 그것이다.
  assert.deepEqual(pickSpawnPorts({ ...band, nextFree: { httpPort: 8032, mjpegPort: 8132 } }, {}),
    { http: 8032, mjpeg: 8132 });
  // 대역은 있는데 빈 쌍이 없다 = 만원. 관례로 내려가면 대역 밖 값을 다시 제안한다.
  assert.deepEqual(pickSpawnPorts(band, { cameras: [], devices: [] }), { http: "", mjpeg: "" });
  // 대역 자체가 없을 때만 관례 탐색이다.
  assert.deepEqual(pickSpawnPorts(null, { cameras: [], devices: [] }), { http: 8200, mjpeg: 8300 });
});

test("suggestPortsByConvention: 쓰인 번호를 피한다 — 제어 포트까지 센다", () => {
  const used = suggestPortsByConvention({
    cameras: [{ hucomsPort: 8200, mjpegPort: 8300 }],
    devices: [{ port: 8201, mjpegPort: 8301 }],
  });
  assert.deepEqual(used, { http: 8202, mjpeg: 8302 });
  // 제어 포트는 기기 목록에 없다(월드 전역) — 그래도 카메라가 집으면 UE 가 400 으로 거절한다.
  assert.deepEqual(suggestPortsByConvention({ controlPort: 8200 }), { http: 8201, mjpeg: 8301 });
  // 짝 어느 한쪽만 겹쳐도 그 쌍은 못 쓴다.
  assert.deepEqual(suggestPortsByConvention({ cameras: [{ mjpegPort: 8300 }] }), { http: 8201, mjpeg: 8301 });
  // 낮은 쪽부터 찾는다 — 「최대 + 1」로 늘리면 CGI 포트가 MJPEG 대역으로 흘러든다.
  assert.deepEqual(suggestPortsByConvention({ cameras: [{ hucomsPort: 9000 }] }), { http: 8200, mjpeg: 8300 });
});

// 만원은 입력 실수가 아니라 상태다. 빈칸만 남기고 "입력하세요"로 끝내면 사람은 아무 값도
// 안 된다는 사실을 시도해 봐야만 알게 된다.
test("bandFullNotice: 대역이 있는데 빈 쌍이 없을 때만 말한다", () => {
  const band = { cameraPortRange: { httpFrom: 8030, httpTo: 8040, mjpegFrom: 8130, mjpegTo: 8140 } };
  assert.match(bandFullNotice(band), /8030/);
  assert.equal(bandFullNotice({ ...band, nextFree: { httpPort: 8031, mjpegPort: 8131 } }), "");
  assert.equal(bandFullNotice(null), "", "대역이 없으면 만원이라는 개념도 없다");
});

test("portRangeHint: 모르면 폼을 좁히지 않는다 — 추측이 옛 백엔드의 스폰을 죽인다", () => {
  const band = { cameraPortRange: { httpFrom: 8030, httpTo: 8040, mjpegFrom: 8130, mjpegTo: 8140 } };
  const known = portRangeHint(band);
  assert.deepEqual(known.http, { min: 8030, max: 8040 });
  assert.deepEqual(known.mjpeg, { min: 8130, max: 8140 });
  assert.ok(known.text.includes("8030"));
  const unknown = portRangeHint(null);
  assert.deepEqual(unknown.http, { min: 1, max: 65535 });
  assert.equal(unknown.text, "", "모르면 새기지 않는다");
});

// ── 세우기 ─────────────────────────────────────────────────────────────────────

test("spawnRequestFrom: 자리·높이·이름·포트·지면 — 하나라도 없으면 왜 못 세우는지 말한다", () => {
  const at = { x: 100, y: 200 };
  const ok = { heightM: "6", note: "이교수 · 입구 감시", httpPort: "8200", mjpegPort: "8300", yawDeg: "12.5", pitchDeg: "-31" };
  const scene = { cameras: [cam()], slots: [] };

  assert.equal(spawnRequestFrom({ location: null, form: ok, ...scene }).error, t("먼저 평면도에서 자리를 정하세요."));
  assert.equal(spawnRequestFrom({ location: at, form: { ...ok, heightM: "" }, ...scene }).error, t("높이를 입력하세요 (m)."));
  assert.equal(spawnRequestFrom({ location: at, form: { ...ok, heightM: "0" }, ...scene }).error, t("높이를 입력하세요 (m)."));
  // 씬 API 에 감사 로그가 없다 — 이름이 "누가 왜 세웠나"의 유일한 기록이다.
  assert.equal(spawnRequestFrom({ location: at, form: { ...ok, note: "  " }, ...scene }).error,
    t("이름을 입력하세요 — 누가 왜 세웠는지가 씬에 남는 유일한 기록입니다."));

  // 대역이 꽉 차서 빈 것과 사람이 지운 것은 다른 사실이다.
  const bandFull = { cameraPortRange: { httpFrom: 8030, httpTo: 8040, mjpegFrom: 8130, mjpegTo: 8140 } };
  assert.match(spawnRequestFrom({ location: at, form: { ...ok, httpPort: "" }, portInfo: bandFull, ...scene }).error, /8030/);
  assert.equal(spawnRequestFrom({ location: at, form: { ...ok, httpPort: "" }, ...scene }).error, t("포트를 입력하세요."));

  // 대역 검증은 제출 전에 — 자리·높이까지 다 정한 뒤에 받는 409 는 비싸다.
  const outOfBand = spawnRequestFrom({
    location: at, form: { ...ok, httpPort: "8200", mjpegPort: "8135" },
    portInfo: { ...bandFull, nextFree: { httpPort: 8031, mjpegPort: 8131 } }, ...scene,
  });
  assert.match(outOfBand.error, /8200/);
  assert.equal(outOfBand.body, null);
  const outOfMjpeg = spawnRequestFrom({
    location: at, form: { ...ok, httpPort: "8031", mjpegPort: "8300" },
    portInfo: { ...bandFull, nextFree: { httpPort: 8031, mjpegPort: 8131 } }, ...scene,
  });
  assert.match(outOfMjpeg.error, /MJPEG/);

  // 지면을 모르면 세우지 않는다 — 0 으로 가정하면 그 차이가 통째로 높이 오차가 된다.
  assert.match(spawnRequestFrom({ location: at, form: ok, cameras: [], slots: [] }).error, /지면 높이/);

  // 통과하면 z = 높이×100 + 지면.
  const good = spawnRequestFrom({ location: at, form: ok, ...scene });
  assert.equal(good.error, null);
  assert.deepEqual(good.body, {
    location: { x: 100, y: 200, z: 610 },
    yawDeg: 12.5, pitchDeg: -31, httpPort: 8200, mjpegPort: 8300, note: "이교수 · 입구 감시",
  });
  // 대역을 모르면 막지 않는다 — 추측으로 막으면 옛 백엔드에서 스폰 자체가 불가능해진다.
  assert.equal(spawnRequestFrom({ location: at, form: { ...ok, httpPort: "9999" }, ...scene }).error, null);
});

// 한 번 관측된 실패: 응답에 camera 키가 통째로 없고 note 가 "" 였는데 **카메라는 실제로
// 세워져 있었다**(2026-08-17). r.camera.id 를 곧장 읽으면 성공한 스폰에서 예외가 난다.
test("spawnOutcome: 응답이 카메라를 안 실어도 세워진 것은 사실이다", () => {
  const full = spawnOutcome({ camera: { id: "sim-cam-8200", hucomsPort: 8200, note: "why" } },
    { httpPort: 8200, note: "why" });
  assert.equal(full.camId, "sim-cam-8200");
  assert.equal(full.needsNoteRetry, false);
  assert.match(full.text, /sim-cam-8200/);

  const empty = spawnOutcome({}, { httpPort: 8200, note: "why" });
  assert.equal(empty.camId, null);
  assert.equal(empty.camPort, 8200, "요청한 포트가 그 카메라의 정체다");
  assert.equal(empty.needsNoteRetry, false, "받은 카메라가 없으면 고칠 대상도 없다");
  assert.match(empty.text, /sim-cam-8200/);

  // 이름이 안 들어갔으면 한 번 더 쓴다 — 그 값이 유일한 출처 기록이다.
  const lost = spawnOutcome({ camera: { id: "sim-cam-8200", note: "" } }, { httpPort: 8200, note: "why" });
  assert.equal(lost.needsNoteRetry, true);
});

// ── 설치·조종 ──────────────────────────────────────────────────────────────────

// 폼은 좌표를 cm 정수로 보여 준다. 그 표시를 그대로 보내면 아무것도 안 고치고 저장만 눌러도
// 카메라가 반올림한 만큼(≤5 mm) 움직인다.
test("typedOrExact: 표시와 같은 값이면 씬의 원값을 되돌려보낸다", () => {
  assert.equal(typedOrExact(100, 100.4), 100.4, "표시는 100 이었다 — 사람은 아무것도 안 적었다");
  assert.equal(typedOrExact(105, 100.4), 105, "사람이 적은 값은 사람이 적은 값으로 나간다");
  assert.equal(typedOrExact(null, 100.4), 100.4);
  assert.equal(typedOrExact(100, null), null);
});

test("installPatchFrom: 바뀐 칸만, 자리는 셋을 함께", () => {
  const c = cam();
  const same = { x: "100", y: "200", heightM: "6.00", bearing: "45.0", pitch: "-15.0", note: "" };
  const scene = { cameras: [c], slots: [] };

  assert.equal(installPatchFrom({ cam: null, form: same }).error,
    t("고칠 카메라를 찾지 못했습니다 — 목록을 다시 읽으세요."));
  // 아무것도 안 고쳤으면 보낼 것이 없다 — 표시 반올림이 「바뀐 척」 나가지 않는다.
  assert.equal(installPatchFrom({ cam: c, form: same, tiltpos: 1500, ...scene }).error, t("바뀐 값이 없습니다."));

  // x 만 고쳐도 셋을 함께 보낸다 — 축 하나만 보내면 나머지를 sim 이 0 으로 읽는다.
  const moved = installPatchFrom({ cam: c, form: { ...same, x: "150" }, tiltpos: 1500, ...scene });
  assert.deepEqual(moved.patch, { location: { x: 150, y: 200, z: 610 } });

  // 높이를 고치면 z = 높이×100 + 지면. x·y 는 손대지 않았으므로 씬의 원값 그대로.
  const raised = installPatchFrom({ cam: c, form: { ...same, heightM: "8" }, tiltpos: 1500, ...scene });
  assert.deepEqual(raised.patch, { location: { x: 100, y: 200, z: 810 } });
  // 지면을 모르면 옮기지 않는다.
  assert.match(installPatchFrom({ cam: c, form: { ...same, heightM: "8" }, tiltpos: 1500, cameras: [{ ...c, groundReference: null }], slots: [] }).error, /지면 높이/);

  // 설치 자세: 0.05° 는 toFixed(1) 표시 반올림 아래라 안 고친 칸이 새어 나가지 않는다.
  assert.deepEqual(installPatchFrom({ cam: c, form: { ...same, bearing: "45.03" }, tiltpos: 1500, ...scene }).error,
    t("바뀐 값이 없습니다."));
  assert.deepEqual(installPatchFrom({ cam: c, form: { ...same, bearing: "60" }, tiltpos: 1500, ...scene }).patch,
    { yawDeg: 60 });
  // 하향은 이 카메라의 틸트에서 온다(pitchDeg → tilt 를 다시 앉히는 값이다).
  assert.deepEqual(installPatchFrom({ cam: c, form: { ...same, pitch: "-30" }, tiltpos: 1500, ...scene }).patch,
    { pitchDeg: -30 });

  // 별명은 빈 문자열도 뜻이 있다("이름 지움") — 씬이 준 값과 다를 때만 보낸다.
  assert.deepEqual(installPatchFrom({ cam: c, form: { ...same, note: "새 이름" }, tiltpos: 1500, ...scene }).patch,
    { note: "새 이름" });
  const named = cam({ note: "옛 이름" });
  assert.deepEqual(installPatchFrom({ cam: named, form: { ...same, note: "" }, tiltpos: 1500, cameras: [named], slots: [] }).patch,
    { note: "" });

  // 씬이 좌표를 안 주면 옮기지 않는다. 높이만 고쳐도 셋을 함께 보내야 하는데 x·y 를 모르므로
  // 보낼 수가 없다 — 여기서 끊지 않으면 x·y 없는 location 이 나가 카메라가 원점으로 날아간다.
  const noLoc = cam({ mount: { baseYaw: 45 } });
  assert.equal(installPatchFrom({ cam: noLoc, form: { ...same, heightM: "8" }, tiltpos: 1500, cameras: [noLoc], slots: [] }).error,
    t("씬이 이 카메라의 설치 좌표를 주지 않았습니다."));
  // 좌표를 모르는 카메라에 x 를 적어도 견줄 원값이 없다 — 보낼 것이 없다고 말한다.
  assert.equal(installPatchFrom({ cam: noLoc, form: { ...same, x: "150" }, tiltpos: 1500, cameras: [noLoc], slots: [] }).error,
    t("바뀐 값이 없습니다."));
});

test("driveChangeOf: 남의 카메라 폼은 보낼 것이 없다", () => {
  const now = { panpos: 100, tiltpos: 200, zoompos: 300 };
  assert.equal(driveChangeOf({ form: { pan: "1", tilt: "2", zoom: "3" }, now: null }).error,
    t("조준할 수 없습니다 — 지금은 다른 카메라를 몰고 있습니다."));
  assert.equal(driveChangeOf({ form: { pan: "100", tilt: "200", zoom: "300" }, now }).error, t("바뀐 값이 없습니다."));
  // 반쪽 폼은 안 보낸다 — 나머지를 0 으로 채워 보내면 카메라가 원점으로 돈다.
  assert.equal(driveChangeOf({ form: { pan: "500", tilt: "", zoom: "300" }, now }).error, t("바뀐 값이 없습니다."));
  assert.deepEqual(driveChangeOf({ form: { pan: "500", tilt: "200", zoom: "300" }, now }).ptz,
    { panpos: 500, tiltpos: 200, zoompos: 300 });
});

test("installFieldsOf: 모르는 값은 빈 칸 — 0 으로 채우지 않는다", () => {
  const c = cam();
  const filled = installFieldsOf(c, { tiltpos: 1500, ptz: { panpos: 9000, tiltpos: 1500, zoompos: 0 } });
  assert.deepEqual(filled, {
    note: "", x: "100", y: "200", heightM: "6.00", bearing: "45.0", pitch: "-15.0",
    pan: "9000", tilt: "1500", zoom: "0",
  });
  // 채우는 쪽과 보내는 쪽의 이름표가 같아야 한다 — 한쪽만 고치면 그 칸이 조용히 「안 고침」이 된다.
  const patched = installPatchFrom({ cam: c, form: { ...filled, heightM: "9" }, tiltpos: 1500, cameras: [c], slots: [] });
  assert.deepEqual(patched.patch, { location: { x: 100, y: 200, z: 910 } });
  // PTZ 는 **지금 보고 있는 카메라**의 것이다 — 다른 카메라를 고른 폼에는 적지 않는다.
  const other = installFieldsOf(c, { tiltpos: 1500, ptz: null });
  assert.deepEqual([other.pan, other.tilt, other.zoom], ["", "", ""]);
  // 틸트를 모르는 카메라(안 닿음)는 하향각을 비워 둔다 — 0 으로 채우면 수평을 본다는 거짓말이다.
  assert.equal(installFieldsOf(c, {}).pitch, "");
  // 고른 카메라가 없으면 전부 빈 칸이다.
  assert.deepEqual(Object.values(installFieldsOf(null, {})), ["", "", "", "", "", "", "", "", ""]);
});

// "없습니다" 하나로 뭉뚱그리면 기준기를 고른 사람은 화면이 고장 났다고 읽는다.
test("cameraTitleLine: 기준기와 「목록이 비었다」는 다른 사실이다", () => {
  assert.equal(cameraTitleLine(cam()), "cam-1");
  assert.equal(cameraTitleLine(cam({ spawned: false })), "cam-1" + t(" · 레벨 저작(자세 고정)"));
  assert.equal(cameraTitleLine(null, { derived: false, name: "기준기A" }),
    t("{name} · 기준기 — 설치는 시뮬 카메라만 고칩니다", { name: "기준기A" }));
  assert.equal(cameraTitleLine(null, null), t("고른 카메라가 없습니다."));
  assert.equal(cameraPortsLine(cam()), t("제어 :{c} · 프리뷰 :{m}", { c: 8200, m: 8300 }));
  assert.equal(cameraPortsLine(cam({ mjpegPort: null })), t("제어 :{c} · 프리뷰 :{m}", { c: 8200, m: "—" }));
  assert.equal(cameraPortsLine(null), "");
});

// ── 기기 ↔ 씬 카메라 ────────────────────────────────────────────────────────────

test("cameraForDevice: 기준기는 포트가 같아도 씬 카메라가 아니다", () => {
  const cameras = [cam()];
  const devices = [{ id: "sim-cam-8200", port: 8200 }, { id: "ref-1", port: 8200, derived: false }];
  assert.equal(cameraForDevice(devices, cameras, "sim-cam-8200")?.id, "cam-1");
  // 포트 일치만 보면 기준기가 어쩌다 같은 포트를 갖는 순간 남의 카메라에 설치 폼이 붙는다.
  assert.equal(cameraForDevice(devices, cameras, "ref-1"), null);
  assert.equal(cameraForDevice(devices, cameras, "없는기기"), null);
  assert.equal(deviceForCamera(devices, cam())?.id, "sim-cam-8200");
  assert.equal(deviceForCamera([], cam()), null);
});

test("resolveActiveCam: 첫 카메라 폴백은 합성 fake 기기의 것뿐이다", () => {
  const cameras = [cam(), cam({ id: "cam-2", hucomsPort: 8201 })];
  const byPort = [{ id: "sim-cam-8201", port: 8201 }];
  assert.equal(resolveActiveCam({ devices: byPort, cameras, deviceId: "sim-cam-8201" }).cam.id, "cam-2");
  // 포트 없는 지어낸 기기 하나 = 씬 카메라 하나(fake 씬).
  const fake = resolveActiveCam({ devices: [{ id: "sim-fake" }], cameras, deviceId: "sim-fake" });
  assert.equal(fake.cam.id, "cam-1");
  // 기준기는 자기 하드웨어다 — 폴백을 태우면 남의 광학모델에 이 카메라의 PTZ 를 꽂는다.
  const ref = resolveActiveCam({ devices: [{ id: "ref-1", derived: false }], cameras, deviceId: "ref-1" });
  assert.equal(ref.cam, null);
  assert.match(ref.hint, /기준기/);
  // 포즈가 없으면 오버레이를 안 그린다고 말한다 — 조용히 비면 고장으로 읽힌다.
  const gone = resolveActiveCam({ devices: [{ id: "d", port: 9999 }], cameras, deviceId: "d" });
  assert.equal(gone.cam, null);
  assert.equal(gone.hint, t("이 카메라의 포즈 없음 — 오버레이 미표시"));
  assert.equal(resolveActiveCam({ devices: byPort, cameras, deviceId: "sim-cam-8201" }).hint, "");
});

test("pickDevice: 저장된 선택 → 서버의 활성 → 첫째", () => {
  const devices = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(pickDevice(devices, { savedId: "b", activeId: "c" }), "b");
  assert.equal(pickDevice(devices, { savedId: "없음", activeId: "c" }), "c");
  assert.equal(pickDevice(devices, { savedId: "없음", activeId: "없음" }), "a");
  assert.equal(pickDevice([], { savedId: "b" }), "", "카메라 0 대는 고장이 아니라 상태다");
});

// ── 오라클 ─────────────────────────────────────────────────────────────────────

test("compareOracle: 해상도가 다르면 배율로 맞추고, 프레임 밖은 통계에서 뺀다", () => {
  const frame = { width: 1920, height: 1080 };
  const targets = [{ id: "s1" }, { id: "s2" }, { id: "s3" }];
  const ours = {
    width: 1920, height: 1080,
    pins: [{ id: "s1", x: 100, y: 100 }, { id: "s2", x: 500, y: 500 }, { id: "s3", x: 0, y: 0, behind: true }],
  };
  const truth = {
    resolution: { width: 960, height: 540 },   // 절반 해상도 — 배율 2 로 맞춰야 한다
    points: [{ x: 50, y: 50 }, { x: 251, y: 250 }, { x: 0, y: 0 }],
  };
  const r = compareOracle({ ours, truth, targets, frame });
  assert.equal(r.truthPins.get("s1").d, 0, "같은 점이면 오차 0 — 배율을 안 맞추면 100px 오차가 난다");
  assert.equal(r.truthPins.get("s1").x, 100);
  assert.equal(r.truthPins.get("s2").d, 2);
  assert.equal(r.truthPins.has("s3"), false, "카메라 뒤는 견줄 값이 아니다");
  assert.match(r.summary, /2/);

  // 프레임 안에 든 것이 하나도 없으면 숫자를 짓지 않고 무엇을 해야 하는지 말한다.
  const outside = compareOracle({
    ours: { width: 1920, height: 1080, pins: [{ id: "s1", x: 100, y: 100 }] },
    truth: { resolution: frame, points: [{ x: -500, y: -500 }] },
    targets: [{ id: "s1" }], frame,
  });
  assert.match(outside.summary, /프레임 안에 든 주차면이 없습니다/);
});

// ── 저장된 씬 ──────────────────────────────────────────────────────────────────

test("doomedCameraCount: 저장본에 없는 스폰 카메라만 사라진다", () => {
  const cameras = [cam(), cam({ id: "cam-2", hucomsPort: 8201 }), cam({ id: "authored", hucomsPort: 8202, spawned: false })];
  const snap = { cameras: [{ httpPort: 8200 }] };
  assert.equal(doomedCameraCount(cameras, snap), 1, "8201 만 지워진다 — 레벨 저작은 애초에 못 지운다");
  assert.equal(doomedCameraCount(cameras, {}), 2);
  assert.equal(doomedCameraCount([], snap), 0);
});

test("씬 문구: 없는 숫자를 지어내지 않는다", () => {
  assert.match(restoreSummaryText({ cameras: { spawned: 2, moved: 1, removed: 0 }, cars: { restored: 5 } }), /2/);
  assert.match(restoreSummaryText({ failures: [1, 2] }), /2/);
  assert.equal(saveSceneText({ scene: { cameras: 3, cars: 2 } }),
    t("저장했습니다 — 카메라 {cams}대 · 차량 {cars}대", { cams: 3, cars: 2 }));
  assert.equal(saveSceneText({}), t("저장했습니다"), "요약이 없으면 0 을 지어내지 않는다");
  // 깨진 저장본은 숨기지 않는다 — 목록에서 사라지면 저장이 안 된 줄 알고 다시 저장한다.
  assert.equal(sceneMetaText({ error: "bad json" }), t("읽을 수 없음"));
  assert.match(sceneMetaText({ cameras: 2, cars: 3, savedAtUtc: "2026-08-12T03:04:00Z" }), /2/);
});

test("이동 속도는 한 곳에서 온다 — 조작 패드를 걷어내면서 고를 칸도 사라졌다", () => {
  assert.equal(MOVE_SPEED, 50);
});
