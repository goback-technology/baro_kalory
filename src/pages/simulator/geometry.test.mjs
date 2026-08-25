import test from "node:test";
import assert from "node:assert/strict";
import {
  toMap, toWorld, conePathD, tipAt, computeMapView, median, cameraHeightM, sceneGroundZcm,
  measureSlotPitchCm, slotBoxCm, poseFromPlacement, aimYawTowards, panposForYaw, turnBetween,
  tiltSliderPos, tiltSliderDeg, trackOffsetOf, hfovFromDrag, spreadClusters, CONE_LEN_RATIO,
} from "./geometry.mjs";

const slotAt = (id, x, y, extra = {}) => ({ id, transform: { location: { x, y, z: 10 } }, ...extra });
const camAt = (id, x, y, extra = {}) => ({ id, mount: { location: { x, y, z: 600 } }, ...extra });

// UE 는 +X 가 북, +Y 가 동이다. 화면 위를 북으로 두려면 mapX = worldY, mapY = -worldX 여야
// 하고, 그래야 yaw 0 인 카메라가 그림에서 위를 가리킨다.
test("toMap/toWorld: 위를 북으로 두는 회전이고 서로 역이다", () => {
  assert.deepEqual(toMap({ x: 100, y: 250 }), { x: 250, y: -100 });
  assert.deepEqual(toWorld(toMap({ x: 100, y: 250 })), { x: 100, y: 250 });
  // 좌표가 없으면 0 이다 — 그림의 원점이지 「모른다」가 아니다(그릴 자리는 있어야 한다).
  assert.deepEqual(toMap(null), { x: 0, y: -0 });
});

// sweep-flag 가 0 이면 SVG 가 반대쪽 원을 골라 호가 꼭짓점 쪽으로 파여 부채꼴이 오목해진다.
test("conePathD: 꼭짓점에서 뻗고 sweep-flag 는 1 이다", () => {
  const d = conePathD({ x: 0, y: 0 }, 0, 30, 100);
  assert.match(d, /^M 0 0 L /);
  assert.match(d, /A 100 100 0 0 1 /, "sweep 1 — 방위가 커지는 쪽이 평면도에서 시계방향");
  assert.match(d, /Z$/);
  // 방위 0 은 위쪽(−y). 반각 0 이면 두 모서리가 한 점이다.
  const straight = conePathD({ x: 0, y: 0 }, 0, 0, 100);
  assert.ok(straight.includes("L 0 -100"), straight);
});

test("tipAt: 방위 0 은 위, 90 은 오른쪽 — toMap 과 같은 규약", () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);
  const up = tipAt({ x: 0, y: 0 }, 0, 100);
  near(up.x, 0);
  near(up.y, -100);
  const right = tipAt({ x: 0, y: 0 }, 90, 100);
  near(right.x, 100);
  near(right.y, 0);
});

test("computeMapView: 씬이 보고한 것을 다 담고, 아무것도 없으면 null", () => {
  assert.equal(computeMapView([], []), null, "그릴 것이 없으면 뷰도 없다");
  // 여백은 최소 300 — 점 하나짜리 씬에서도 그림이 성립해야 한다.
  const one = computeMapView([slotAt("a", 0, 0)], []);
  assert.equal(one.width, 600);
  assert.equal(one.height, 600);
  // 슬롯만이 아니라 카메라도 담는다 — 사각형 밖의 카메라는 클릭할 수도 옮길 수도 없다.
  const withCam = computeMapView([slotAt("a", 0, 0)], [camAt("c", 5000, 0)]);
  const p = toMap({ x: 5000, y: 0 });
  assert.ok(p.x >= withCam.minX && p.x <= withCam.minX + withCam.width, "카메라 x 가 사각형 안");
  assert.ok(p.y >= withCam.minY && p.y <= withCam.minY + withCam.height, "카메라 y 가 사각형 안");
});

test("median: 짝수는 가운데 둘의 평균, 비면 null", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null, "0 이라고 우기지 않는다");
});

// Number(null) 도 Number("") 도 0 이고 0 은 유한하다 — 그 통과가 「모른다」를 「지면에 붙어
// 있다」로 바꾼다. 높이는 3D 큐보이드의 거리·크기가 걸린 값이다.
test("cameraHeightM: 값이 없으면 null 이지 0 이 아니다", () => {
  assert.equal(cameraHeightM({ heightAboveReferenceGroundCm: 620 }), 6.2);
  assert.equal(cameraHeightM({ heightAboveReferenceGroundCm: "620" }), 6.2, "문자열도 값이다");
  assert.equal(cameraHeightM({ heightAboveReferenceGroundCm: null }), null);
  assert.equal(cameraHeightM({}), null);
  assert.equal(cameraHeightM(null), null);
});

// 하필 지면을 물어볼 카메라가 없을 때가 **새 레벨에 첫 카메라를 세우는 순간**이다. 0 으로
// 두면 지면이 z=0 이 아닌 레벨에서 그 차이가 통째로 높이 오차가 된다.
test("sceneGroundZcm: 카메라가 있으면 씬의 값, 없으면 슬롯 z 의 중앙값", () => {
  assert.equal(sceneGroundZcm([{ groundReference: { zCm: 10 } }], []), 10);
  // 카메라가 여럿이면 답한 첫 카메라를 따른다(씬이 한 값을 계산해 모두에게 준다).
  assert.equal(sceneGroundZcm([{}, { groundReference: { zCm: 42 } }], []), 42);
  // 카메라가 하나도 없으면 슬롯에서 되돌려 센다 — 씬이 쓰는 방법과 같다.
  assert.equal(sceneGroundZcm([], [slotAt("a", 0, 0), slotAt("b", 0, 0)]), 10);
  assert.equal(sceneGroundZcm([], []), null, "슬롯도 카메라도 없으면 모른다");
});

test("measureSlotPitchCm: 같은 방향 이웃까지의 거리 — 통로 건너편은 세지 않는다", () => {
  const row = [slotAt("a", 0, 0), slotAt("b", 0, 250), slotAt("c", 0, 500)];
  assert.equal(measureSlotPitchCm(row), 250);
  assert.equal(measureSlotPitchCm([slotAt("a", 0, 0)]), null, "한 자리로는 간격을 잴 수 없다");
  // 방향이 90° 다른 자리는 통로 건너편이라 그 거리가 폭이 아니다.
  const across = [
    { ...slotAt("a", 0, 0), transform: { location: { x: 0, y: 0, z: 0 }, rotation: { yaw: 0 } } },
    { ...slotAt("b", 0, 250), transform: { location: { x: 0, y: 250, z: 0 }, rotation: { yaw: 0 } } },
    { ...slotAt("x", 30, 0), transform: { location: { x: 30, y: 0, z: 0 }, rotation: { yaw: 90 } } },
  ];
  assert.equal(measureSlotPitchCm(across), 250, "30 cm 떨어진 직교 자리는 이웃이 아니다");
});

test("slotBoxCm: 치수를 모르면 null — 규격을 지어내지 않는다", () => {
  // 길이는 type 문자열에서("5m"), 폭은 이 레벨의 간격에서.
  assert.deepEqual(slotBoxCm({ type: "5m" }, 250), { length: 500, width: 250 });
  // 폭이 자리보다 넓을 수는 없다 — 1m 자리가 5m 자리만큼 넓어지지 않게.
  assert.deepEqual(slotBoxCm({ type: "1m" }, 250), { length: 100, width: 100 });
  // type 을 못 읽으면 폭에서 되돌려 세운다.
  assert.deepEqual(slotBoxCm({ type: "bus" }, 250), { length: 500, width: 250 });
  // 간격을 모르면 길이의 절반을 폭으로.
  assert.deepEqual(slotBoxCm({ type: "5m" }, null), { length: 500, width: 250 });
  assert.equal(slotBoxCm({ type: "bus" }, null), null, "둘 다 모르면 사각형 대신 점이다");
});

// 사람이 각도를 상상해서 적는 일을 없애는 것이 요점이다 — 두 점이면 자세가 다 나온다.
test("poseFromPlacement: 두 점에서 방위·하향각이 나온다", () => {
  const p = poseFromPlacement({ from: { x: 0, y: 0 }, to: { x: 1000, y: 0 }, heightM: 6 });
  assert.equal(p.yawDeg, 0, "월드 +X 는 방위 0");
  // 높이 600cm, 수평 1000cm → atan2(600,1000) ≈ 30.96°, 아래니까 음수.
  assert.equal(p.pitchDeg.toFixed(1), "-31.0");
  // 동쪽(+Y)을 겨누면 90°.
  assert.equal(poseFromPlacement({ from: { x: 0, y: 0 }, to: { x: 0, y: 500 }, heightM: 6 }).yawDeg, 90);
  // 자기 발밑을 찍으면 거의 수직 — 다만 기기 한계(-89)를 넘지 않는다.
  assert.equal(poseFromPlacement({ from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, heightM: 6 }).pitchDeg, -89);
  // 아주 멀리 겨눠도 -1° 위로는 올라가지 않는다(수평보다 위를 보는 설치는 없다).
  const far = poseFromPlacement({ from: { x: 0, y: 0 }, to: { x: 10_000_000, y: 0 }, heightM: 6 });
  assert.equal(far.pitchDeg, -1);
  // 점이 없으면 폼의 기본 자세다.
  assert.deepEqual(poseFromPlacement({}), { yawDeg: 0, pitchDeg: -20 });
  // 높이가 없으면 폼 기본값 6 m 로 본다 — 빈 칸이 0 m 가 되면 하향각이 수평으로 눕는다.
  assert.equal(
    poseFromPlacement({ from: { x: 0, y: 0 }, to: { x: 1000, y: 0 }, heightM: "" }).pitchDeg.toFixed(1),
    "-31.0",
  );
});

test("aimYawTowards: 카메라에 겹친 커서는 방위가 아니다", () => {
  assert.equal(aimYawTowards({ x: 0, y: 0 }, { x: 100, y: 0 }), 0);
  assert.equal(aimYawTowards({ x: 0, y: 0 }, { x: 0, y: 100 }), 90);
  assert.equal(aimYawTowards({ x: 0, y: 0 }, { x: 5, y: 5 }), null, "10 cm 안은 각이 튄다 — 직전 값을 지킨다");
});

// 팬 = 보고 싶은 방위 − 설치방위. 0..35999 로 감는다 — 음수를 그대로 보내면 기기가 거절한다.
test("panposForYaw: 설치방위를 빼고 0..35999 로 감는다", () => {
  assert.equal(panposForYaw(90, 0), 9000);
  assert.equal(panposForYaw(0, 90), 27000, "음수가 아니라 되감긴 값이다");
  assert.equal(panposForYaw(-90, 0), 27000);
  assert.equal(panposForYaw(450, 0), 9000);
});

test("turnBetween: 얼마나 돌았나는 짧은 쪽으로 잰다", () => {
  assert.equal(turnBetween(10, 350), 20);
  assert.equal(turnBetween(350, 10), -20);
  assert.equal(turnBetween(90, 0), 90);
});

// 트랙의 양끝이 곧 기기 규약(휴컴스 틸트 −2000..9000)의 양끝이다. 한쪽만 고치면 앵커가 끈
// 자리와 다른 값이 나간다.
test("tiltSliderPos/Deg 는 서로 역함수다", () => {
  const len = 400;
  for (const deg of [0, 15, 45, 90, -5, -20]) {
    const back = tiltSliderDeg(tiltSliderPos(deg, len), len);
    assert.ok(Math.abs(back - deg) < 1e-9, `${deg}° → ${back}°`);
  }
  // 기준선(틸트 0)은 트랙 한가운데 — 값이 바뀌어도 이 자리는 움직이지 않는다.
  assert.equal(tiltSliderPos(0, len), len / 2);
  // 트랙 밖으로 끌어도 기기 한계에 물린다.
  assert.equal(tiltSliderDeg(0, len), 90);
  assert.equal(tiltSliderDeg(len, len), -20);
  // 한계 너머의 각도 트랙 끝에 물린다(90° 와 120° 가 같은 자리다).
  assert.equal(tiltSliderPos(120, len), tiltSliderPos(90, len));
});

// 앵커는 축 위를 미끄러지는 슬라이더다 — 커서가 옆으로 벗어나 있어도 축 위의 그 자리로 읽는다.
test("trackOffsetOf: 커서를 광축에 투영한다", () => {
  // 방위 0 = 월드 +X. 축 위로 100 간 점.
  assert.equal(trackOffsetOf({ x: 100, y: 0 }, { x: 0, y: 0 }, 0), 100);
  // 축과 직교로 벗어난 성분은 버린다.
  assert.equal(trackOffsetOf({ x: 100, y: 500 }, { x: 0, y: 0 }, 0), 100);
  // 뒤로 가면 음수 — 호출부가 0..trackLen 으로 문다.
  assert.equal(trackOffsetOf({ x: -50, y: 0 }, { x: 0, y: 0 }, 0), -50);
});

test("hfovFromDrag: 광축에서 벌어진 각의 두 배, 렌즈 한계에 물린다", () => {
  const limits = { min: 5, max: 60 };
  assert.equal(hfovFromDrag(15, 0, limits), 30);
  assert.equal(hfovFromDrag(-15, 0, limits), 30, "반대쪽 모서리를 끌어도 같은 값이다");
  assert.equal(hfovFromDrag(80, 0, limits), 60, "한계 너머로 끌어도 끝에서 멈춘다");
  assert.equal(hfovFromDrag(1, 0, limits), 5);
  assert.equal(hfovFromDrag(15, 0, null), null, "모르는 한계를 지어내 그 너머로 보내지 않는다");
});

// 한 폴에 여러 대가 붙으면 위에서 본 그림에서는 같은 한 점이다 — 그대로 그리면 넷 중
// 아무것도 못 고른다.
test("spreadClusters: 겹치는 카메라만 벌리고, 혼자면 제자리다", () => {
  const alone = spreadClusters([camAt("a", 0, 0)], 10);
  assert.deepEqual(alone.get("a"), { x: 0, y: -0 });
  const pole = spreadClusters([camAt("a", 0, 0), camAt("b", 1, 1)], 10);
  assert.notDeepEqual(pole.get("a"), pole.get("b"), "한 폴의 두 대가 겹쳐 그려지면 안 된다");
  // 멀리 떨어진 것은 안 묶는다 — 「같은 자리」의 기준은 화면에서 겹치는가다.
  const far = spreadClusters([camAt("a", 0, 0), camAt("b", 10_000, 0)], 10);
  assert.deepEqual(far.get("a"), { x: 0, y: -0 });
  // 자리 없는 카메라는 그릴 자리가 없다.
  assert.equal(spreadClusters([{ id: "ghost" }], 10).has("ghost"), false);
});

test("시야콘 길이 비율은 한 곳에서 온다 — 평면도와 고스트가 같은 값을 써야 한다", () => {
  assert.equal(CONE_LEN_RATIO, 0.22);
});
