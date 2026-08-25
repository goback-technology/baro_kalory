import test from "node:test";
import assert from "node:assert/strict";
import {
  detectorBoxFrom, segmentHitsRect, detectorOverlay, detectorResultCard,
  fmtWithHeight, ptzErrorText, mountHeightFrom, framePoint, isDrag, boxOf,
  snapshotName, normalizeSpeed, absoluteMove,
} from "./actions.mjs";
import { t } from "../../i18n.mjs";

// 이 화면의 그물은 오래 HTML 정규식뿐이었다 — 좌표 계산과 판정이 DOM 조립에 섞여 있어
// node 로 물 수가 없었다. 여기 있는 규칙 대부분은 「화면이 말하는 것과 화면에 있는 것이
// 같아야 한다」는 한 가지다.

test("detectorBoxFrom: 사각형이든 다각형이든 외접 사각형으로 접는다", () => {
  assert.deepEqual(detectorBoxFrom([10, 20, 30, 40]), { x1: 10, y1: 20, x2: 30, y2: 40 });
  // 다각형(중첩 배열 포함)은 최소·최대로 접는다.
  assert.deepEqual(detectorBoxFrom([[5, 9], [40, 3], [22, 51]]), { x1: 5, y1: 3, x2: 40, y2: 51 });
  // 모자라거나 값이 아니면 그리지 않는다 — 없는 상자를 지어내지 않는다.
  assert.equal(detectorBoxFrom([1, 2, 3]), null);
  assert.equal(detectorBoxFrom(null), null);
  assert.equal(detectorBoxFrom("10,20,30,40"), null);
  assert.equal(detectorBoxFrom([1, 2, NaN, 4]), null, "NaN 이 섞이면 좌표가 모자란 것이다");
});

test("segmentHitsRect: 끝점이 둘 다 밖이어도 가로지르면 보인다", () => {
  assert.equal(segmentHitsRect(10, 10, 50, 50, 100, 100), true, "안쪽 선분");
  // 끝점 검사만으로는 못 잡는 부류 — 이것이 이 함수가 있는 이유다.
  assert.equal(segmentHitsRect(-50, 50, 150, 50, 100, 100), true, "가로질러 지나간다");
  assert.equal(segmentHitsRect(-50, -50, -10, -10, 100, 100), false, "통째로 밖");
  assert.equal(segmentHitsRect(200, 0, 200, 100, 100, 100), false, "경계와 평행하면서 밖");
  assert.equal(segmentHitsRect(0, 0, 0, 100, 100, 100), true, "경계 위는 보인다");
});

// **그린 쪽이 센다.** 그리는 판정(자르기·퇴화·화면 밖)과 세는 판정이 갈리면, 화면은 비었는데
// 「영상 위 박스 3개」라고 말하는 상태가 성립한다.
test("detectorOverlay: 그리지 않은 것은 세지 않는다", () => {
  const frame = { width: 1000, height: 1000 };
  // 프레임 밖으로 완전히 나간 상자는 잘라 내면 퇴화한다 — 그리지도 세지도 않는다.
  const out = detectorOverlay({ frame, results: { vpd: { boxes: [{ bbox: [1200, 1200, 1400, 1400] }] } } });
  assert.equal(out.drawn, 0);
  assert.equal(out.boxes.length, 0);
  // 걸친 상자는 잘려서 그려지고 하나로 센다.
  const clipped = detectorOverlay({ frame, results: { vpd: { boxes: [{ bbox: [900, 900, 1400, 1400] }] } } });
  assert.equal(clipped.drawn, 1);
  assert.equal(clipped.boxes[0].leftPct, 90);
  assert.equal(clipped.boxes[0].widthPct, 10, "프레임을 넘는 폭은 잘린다");
});

test("detectorOverlay: 3D 는 큐보이드 하나가 한 개다 — 선분 수가 아니다", () => {
  const frame = { width: 1000, height: 1000 };
  const cuboid = { segments: [[10, 10, 90, 10], [90, 10, 90, 90], [90, 90, 10, 90]], label_point: [50, 50], score: 0.91, label: "car" };
  const one = detectorOverlay({ frame, results: { vpd_3d: { boxes3d: [cuboid] } } });
  assert.equal(one.drawn, 1, "선분 셋이 큐보이드 하나다 — 셋으로 세면 차 한 대가 3개가 된다");
  assert.equal(one.svgs.length, 1);
  assert.equal(one.svgs[0].segments.length, 3);
  assert.equal(one.labels3d.length, 1);
  assert.match(one.labels3d[0].text, /3D #1 car 0\.91/);
  // 통째로 프레임 밖이면 선은 그어지되 한 픽셀도 안 보인다 — 세면 안 된다.
  const away = { segments: [[2000, 2000, 2100, 2100]], label_point: [2050, 2050] };
  const none = detectorOverlay({ frame, results: { vpd_3d: { boxes3d: [away] } } });
  assert.equal(none.drawn, 0, "안 보이는 큐보이드를 세면 화면이 비었는데 개수를 말하게 된다");
  assert.equal(none.svgs.length, 1, "그리기는 한다 — 자르는 것은 무대의 몫이다");
  assert.equal(none.labels3d.length, 0, "화면 밖 라벨은 달지 않는다");
});

test("detectorOverlay: 프레임 크기가 없으면 Hucoms 기준으로 떨어진다", () => {
  const o = detectorOverlay({ results: { vpd: { boxes: [{ bbox: [960, 540, 1920, 1080] }] } } });
  assert.deepEqual(o.frame, { w: 1920, h: 1080 });
  assert.equal(o.boxes[0].leftPct, 50);
});

test("detectorResultCard: 3D 는 픽셀이 아니라 미터를 적는다", () => {
  const card = detectorResultCard("vpd_3d", {
    ok: true, status: 200, count: 1, latencyMs: 42.4,
    boxes3d: [{ label: "car", score: 0.8, position_m: [12.34, -1.2], size_m: [4.5, 1.8, 1.4], yaw_deg: 91.2 }],
    calibration: { ground_plane: { mount_height_m: 6.5 }, status: "ok" }, cameraId: "cam-001",
  });
  assert.equal(card.title, "3D Box", "3D 는 약어가 아니다 — 대문자로 접으면 다른 사이드카 이름처럼 보인다");
  assert.match(card.lines[0], /12\.3/);
  assert.doesNotMatch(card.lines[0], /\[\d+,\d+/, "픽셀 좌표는 이 검출기의 답이 아니다");
  // 값이 없으면 "0" 이 아니라 "?" 다 — 0 m 도 방위 0° 도 측정값처럼 보인다.
  const missing = detectorResultCard("vpd_3d", { ok: true, boxes3d: [{ label: "car" }] });
  assert.match(missing.lines[0], new RegExp(t("· 앞 \\? m")), "모르는 값을 0 으로 적지 않는다");
  // 캘리브레이션이 이 측정의 전제다 — 기준 없이 미터만 적으면 틀린 지면으로 잰 값도 그럴듯하다.
  assert.ok(card.lines.some((l) => l.includes("6.50")), "기준 줄이 있어야 한다");
});

test("detectorResultCard: 응답은 정상인데 검출이 없는 것과 실패는 다르다", () => {
  assert.deepEqual(detectorResultCard("vpd", { ok: true, boxes: [] }).lines,
    [t("응답은 정상이나 검출 항목은 없습니다.")]);
  assert.deepEqual(detectorResultCard("vpd", { ok: false, error: "ECONNREFUSED" }).lines, ["ECONNREFUSED"]);
  assert.deepEqual(detectorResultCard("vpd", { ok: false }).lines, ["unreachable"]);
  // LPR 은 상자가 아니라 글자를 준다.
  assert.deepEqual(detectorResultCard("lpr", { ok: true, texts: ["12가 3456"] }).lines, ["12가 3456"]);
  // 목록은 여덟 줄에서 끊는다 — 카드가 화면을 통째로 먹으면 다른 결과를 못 본다.
  assert.equal(detectorResultCard("vpd", { ok: true, boxes: Array.from({ length: 20 }, () => ({ bbox: [0, 0, 1, 1] })) }).lines.length, 8);
});

test("mountHeightFrom: 발행본이 먼저, 없으면 씬 — 시뮬 높이는 추정이 아니다", () => {
  assert.equal(mountHeightFrom({ profileHeightM: 6.5 }), 650);
  // 발행본이 없으면 씬에 묻는다. 발행본이 없다고 "모른다"고 말하는 것이 오히려 거짓이다.
  assert.equal(mountHeightFrom({
    profileHeightM: null, cameraId: "sim-cam-8081",
    sceneCameras: [{ hucomsPort: 8081, heightAboveReferenceGroundCm: 720 }],
  }), 720);
  // 발행본이 있으면 씬을 보지 않는다(정본이 이긴다).
  assert.equal(mountHeightFrom({
    profileHeightM: 6.5, cameraId: "sim-cam-8081",
    sceneCameras: [{ hucomsPort: 8081, heightAboveReferenceGroundCm: 720 }],
  }), 650);
  // 둘 다 없으면 모른다 — 0 이 아니다.
  assert.equal(mountHeightFrom({ profileHeightM: null, cameraId: "cam-001", sceneCameras: [] }), null);
  assert.equal(mountHeightFrom({}), null);
});

test("fmtWithHeight · ptzErrorText: 능력 부재는 장애가 아니다", () => {
  const fake = (p) => `P${p.panpos}`;
  assert.equal(fmtWithHeight(fake, { panpos: 1 }, 650), "P1  H 650");
  assert.equal(fmtWithHeight(fake, { panpos: 1 }, null), "P1  H —", "모르는 높이를 0 으로 적지 않는다");
  // 절대 좌표가 없는 계열은 위치를 못 주는 것이 설계다 — "읽기 실패"로 부르면 정상 동작을
  // 고장으로 오인하게 만든다.
  assert.equal(ptzErrorText({ status: 501 }), t("이 기기는 위치를 알려주지 않습니다 (상대 이동 전용)"));
  assert.match(ptzErrorText({ status: 500, message: "boom" }), /boom/);
});

test("framePoint · isDrag · boxOf: 클릭과 끌기를 손떨림으로 가르지 않는다", () => {
  const rect = { left: 100, top: 50, width: 800, height: 450 };
  const p = framePoint({ clientX: 500, clientY: 275, rect, naturalWidth: 1920, naturalHeight: 1080 });
  assert.deepEqual({ x: p.x, y: p.y }, { x: 960, y: 540 }, "가운데를 누르면 프레임 가운데다");
  // 첫 스냅샷 전에는 Hucoms 기준 프레임으로 떨어진다(가짜 모드에서도 클릭이 성립해야 한다).
  const before = framePoint({ clientX: 500, clientY: 275, rect, naturalWidth: 0, naturalHeight: 0 });
  assert.deepEqual({ nw: before.nw, nh: before.nh }, { nw: 1920, nh: 1080 });
  // 8px 은 손떨림의 여유다 — 없으면 센터링하려던 클릭이 폭 2px 짜리 박스줌이 되어 최대 배율로 튄다.
  assert.equal(isDrag({ px: 10, py: 10 }, { px: 16, py: 14 }), false);
  assert.equal(isDrag({ px: 10, py: 10 }, { px: 30, py: 10 }), true);
  assert.deepEqual(boxOf({ x: 90, y: 10 }, { x: 10, y: 90 }), { startX: 10, startY: 10, endX: 90, endY: 90 },
    "어느 방향으로 끌어도 같은 상자다");
});

test("snapshotName: 언제·어느 카메라의 그림인지가 파일명에 있다", () => {
  const at = new Date(2026, 7, 25, 9, 5, 3);
  assert.equal(snapshotName("cam-001", at, ""), "barocalory-cam-001-20260825-090503.jpg");
  assert.equal(snapshotName("cam-001", at, "-screen"), "barocalory-cam-001-20260825-090503-screen.jpg");
  assert.equal(snapshotName(null, at, ""), "barocalory-cam-20260825-090503.jpg");
});

test("normalizeSpeed: 빈 칸(기기 기본값)과 0(움직이지 마라)은 다르다", () => {
  assert.equal(normalizeSpeed(""), undefined);
  assert.equal(normalizeSpeed(null), undefined);
  assert.equal(normalizeSpeed(0), undefined, "0 은 속도가 아니다 — 안 보낸 것으로 친다");
  assert.equal(normalizeSpeed(-5), undefined);
  assert.equal(normalizeSpeed("abc"), undefined);
  assert.equal(normalizeSpeed(50), 50);
  assert.equal(normalizeSpeed(999), 100, "상한에 붙인다");
  assert.equal(normalizeSpeed(0.4), 1, "반올림 뒤에도 최소 1");
});

// Number("") === 0 — 빈 칸을 그대로 태우면 「줌만 바꾸려던」 이동이 팬·틸트를 실제로
// 0 위치로 돌린다. 실기에서 이건 카메라가 홱 돌아가는 일이다.
test("absoluteMove: 세 값이 다 있어야만 절대 이동이다", () => {
  assert.deepEqual(absoluteMove({ pan: "100", tilt: "200", zoom: "300" }), { panpos: 100, tiltpos: 200, zoompos: 300 });
  assert.ok(absoluteMove({ pan: "", tilt: "200", zoom: "300" }).error);
  assert.ok(absoluteMove({ pan: "100", tilt: "  ", zoom: "300" }).error);
  assert.ok(absoluteMove({ pan: "100", tilt: "200", zoom: undefined }).error);
  // 0 은 값이다 — 빈 칸과 같이 취급하면 홈 위치로 못 간다.
  assert.deepEqual(absoluteMove({ pan: "0", tilt: "0", zoom: "0" }), { panpos: 0, tiltpos: 0, zoompos: 0 });
});
