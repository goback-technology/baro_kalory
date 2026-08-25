import test from "node:test";
import assert from "node:assert/strict";
import {
  framePoint, ptzNear, parseStoredHomeStatus, homeStatusLabel, homeStatusColor,
  pointHomeStatus, dotPosition, plateRect, maskPolygons, homeSummary,
  replayCaption, replayBoxes, pushThought, EMPTY_THOUGHTS, FRAME_W, FRAME_H,
} from "./actions.mjs";
import { t } from "../../i18n.mjs";

// 이 화면의 값어치는 「그 점이 어떻게 됐는가」를 정확히 말하는 데 있다. 성공·확인 불가·
// 보류·실패는 네 가지 다른 사실이고, 뭉치면 다음에 무엇을 해야 할지가 사라진다.

test("framePoint: 프레임 밖 클릭은 잘라 넣는다", () => {
  const rect = { left: 0, top: 0, width: 960, height: 540 };
  assert.deepEqual(framePoint({ clientX: 480, clientY: 270, rect }), { x: 960, y: 540 });
  // 밖으로 나간 점은 저장해도 조준할 수 없다.
  assert.deepEqual(framePoint({ clientX: -50, clientY: -50, rect }), { x: 0, y: 0 });
  assert.deepEqual(framePoint({ clientX: 2000, clientY: 2000, rect }), { x: FRAME_W, y: FRAME_H });
});

// 팬은 0/36000 을 넘어 이어진다 — 359.9° 와 0.1° 는 0.2° 차이지 359.8° 차이가 아니다.
test("ptzNear: 팬의 되감김을 건너서 잰다", () => {
  const a = { panpos: 35990, tiltpos: 1000, zoompos: 5000 };
  assert.equal(ptzNear(a, { panpos: 10, tiltpos: 1000, zoompos: 5000 }), true, "20 원단위 차이다");
  assert.equal(ptzNear(a, { panpos: 18000, tiltpos: 1000, zoompos: 5000 }), false);
  // 틸트·줌은 되감김이 없다.
  assert.equal(ptzNear(a, { panpos: 35990, tiltpos: 1200, zoompos: 5000 }), false);
  assert.equal(ptzNear(a, { panpos: 35990, tiltpos: 1000, zoompos: 7000 }), false);
  assert.equal(ptzNear(null, a), false, "모르는 위치는 「가깝다」가 아니다");
  assert.equal(ptzNear(a, null), false);
});

test("parseStoredHomeStatus: 모르는 값은 실패로 접는다 — 성공으로 접으면 거짓말이다", () => {
  assert.deepEqual(parseStoredHomeStatus("ok"), { status: "ok", code: null });
  assert.deepEqual(parseStoredHomeStatus("ok:whatever"), { status: "ok", code: null });
  assert.deepEqual(parseStoredHomeStatus("failed:detector_miss"), { status: "failed", code: "detector_miss" });
  assert.deepEqual(parseStoredHomeStatus("uncertain:target_ambiguous"), { status: "uncertain", code: "target_ambiguous" });
  assert.deepEqual(parseStoredHomeStatus("garbage"), { status: "failed", code: null }, "모르면 실패다");
  assert.deepEqual(parseStoredHomeStatus(""), { status: null, code: null }, "빈 값은 미호밍이다");
  assert.deepEqual(parseStoredHomeStatus(null), { status: null, code: null });
});

test("homeStatusLabel · 색: 네 갈래가 각각 다른 말과 색을 갖는다", () => {
  assert.equal(homeStatusLabel("ok", null, null, 42), t("성공") + " 42px");
  assert.equal(homeStatusLabel("ok", null, null, null), t("성공"));
  assert.equal(homeStatusLabel("unavailable"), t("번호판 확인 불가"));
  assert.equal(homeStatusLabel("uncertain", "target_ambiguous"), t("타깃 판정 보류"));
  assert.equal(homeStatusLabel("uncertain", "other"), t("판정 보류"));
  assert.equal(homeStatusLabel("failed", "detector_miss"), t("검출기 누락"));
  assert.equal(homeStatusLabel("failed", "target_lost"), t("타깃 추적 상실"));
  assert.equal(homeStatusLabel("failed", "unknown", "서버가 준 사유"), "서버가 준 사유");
  const colors = ["ok", "unavailable", "uncertain", "failed"].map(homeStatusColor);
  assert.equal(new Set(colors).size, 4, "네 갈래의 색이 겹치면 화면이 그 구분을 못 한다");
  assert.equal(homeStatusColor(null), "#8a9099", "미호밍은 회색이다");
});

test("pointHomeStatus: 진행 중 결과가 저장값을 이긴다", () => {
  const q = { id: "p1", lprStatus: "failed:detector_miss", platePx: 10 };
  const stored = pointHomeStatus(q, null);
  assert.equal(stored.hstat, "failed");
  // 방금 다시 호밍한 점이 옛 결과로 보이면 화면이 지난 일을 말하게 된다.
  const live = pointHomeStatus(q, { results: { p1: { status: "ok", platePx: 44 } }, currentId: null });
  assert.equal(live.hstat, "ok");
  assert.equal(live.hpx, 44);
  assert.equal(pointHomeStatus(q, { results: {}, currentId: "p1" }).isCur, true);
});

// 실패한 호밍의 픽셀은 카메라가 엉뚱한 데를 보고 잰 값이다 — 그걸로 그리면 점이 있지도
// 않은 자리로 옮겨 간다.
test("dotPosition: 성공한 호밍만 재투영 위치로 그린다", () => {
  const at = dotPosition({ x: 960, y: 540, lprStatus: "ok", homedPixel: { x: 480, y: 270 } });
  assert.deepEqual({ x: at.x, y: at.y }, { x: 480, y: 270 });
  assert.deepEqual({ l: at.leftPct, t: at.topPct }, { l: 25, t: 25 });
  const failed = dotPosition({ x: 960, y: 540, lprStatus: "failed:x", homedPixel: { x: 480, y: 270 } });
  assert.deepEqual({ x: failed.x, y: failed.y }, { x: 960, y: 540 }, "실패한 호밍의 픽셀은 쓰지 않는다");
  const none = dotPosition({ x: 100, y: 200 });
  assert.deepEqual({ x: none.x, y: none.y }, { x: 100, y: 200 });
});

test("plateRect: 퇴화한 상자는 그리지 않는다", () => {
  assert.deepEqual(plateRect([480, 270, 960, 540]), { left: 25, top: 25, width: 25, height: 25 });
  assert.equal(plateRect([960, 540, 480, 270]), null, "뒤집힌 좌표는 상자가 아니다");
  assert.equal(plateRect([1, 2, 3]), null);
  assert.equal(plateRect(null), null);
});

test("maskPolygons: 추적을 잃으면 옛 마스크를 남기지 않는다", () => {
  const target = [[0, 0], [10, 0], [10, 10]];
  assert.equal(maskPolygons({ maskState: "plate_locked", targetMask: target })[0].cls, "target");
  assert.equal(maskPolygons({ maskState: "target_acquire", targetMask: target }).length, 1);
  // 화면이 없는 차를 붙잡고 있다고 말하면 안 된다.
  assert.deepEqual(maskPolygons({ maskState: "track_lost", targetMask: target }), []);
  const amb = maskPolygons({ maskState: "target_ambiguous", candidateMasks: [target, target] });
  assert.equal(amb.length, 2);
  assert.equal(amb[0].cls, "candidate");
  // 점이 셋 미만이면 다각형이 아니다.
  assert.deepEqual(maskPolygons({ maskState: "plate_locked", targetMask: [[0, 0], [1, 1]] }), []);
  assert.deepEqual(maskPolygons(null), []);
});

test("homeSummary: 네 갈래를 각각 센다", () => {
  const s = homeSummary([{ status: "ok" }, { status: "ok" }, { status: "failed" }, { status: "uncertain" }]);
  assert.deepEqual(s.counts, { ok: 2, unavailable: 0, uncertain: 1, failed: 1 });
  assert.match(s.text, /2/);
  assert.deepEqual(homeSummary([]).counts, { ok: 0, unavailable: 0, uncertain: 0, failed: 0 });
  assert.deepEqual(homeSummary(null).counts, { ok: 0, unavailable: 0, uncertain: 0, failed: 0 });
});

// 인라인 시절 이 자막은 innerHTML 로 붙었고, 상류(VLM 의 reason·evidence)에서 온 문자열을
// escapeHtml 로 손수 막아야 했다. 그 방어를 한 번 빠뜨리면 그대로 주입이다.
test("replayCaption: 조각으로 돌려준다 — 마크업 문자열을 만들지 않는다", () => {
  const lines = replayCaption({
    step: 3, zoom: 12000, found: true, plateW: 88,
    vlm: { index: 1, reason: "<img src=x onerror=alert(1)>" },
    segment: { vpdSkipped: false, centerMasks: 1, plateCandidates: 2 },
    visibility: { verdict: "plate_visible", confidence: "high", evidence: "<b>ev</b>" },
  });
  assert.equal(lines.length, 4, "스텝 · VLM · 세그멘테이션 · 가시성");
  const flat = JSON.stringify(lines);
  assert.doesNotMatch(flat, /<br>|<span/, "마크업을 만들지 않는다");
  // 상류 문자열은 **텍스트 조각으로** 실려 온다 — React 가 그리면서 이스케이프한다.
  assert.match(flat, /onerror=alert/, "값은 버리지 않고 텍스트로 나른다");
  assert.equal(lines[1].color, "#e8c33a");
  assert.equal(lines[3].color, "#b7a4ff");
  // 못 찾은 스텝은 후보 수를 말한다.
  const miss = replayCaption({ step: 1, zoom: 5000, found: false, boxes: [[0, 0, 1, 1], [2, 2, 3, 3]] });
  assert.equal(miss.length, 1);
  assert.match(JSON.stringify(miss), /2/);
});

test("replayBoxes: 선택된 상자만 초록이고 나머지는 후보다", () => {
  const boxes = replayBoxes({ boxes: [[0, 0, 192, 108], [960, 540, 1152, 648]], pick: [960, 540, 1152, 648] });
  assert.equal(boxes.length, 2);
  assert.equal(boxes.filter((b) => b.color === "#16d05a").length, 1, "선택은 하나다");
  assert.equal(boxes[0].color, "rgba(255,255,255,.6)");
  assert.deepEqual({ l: boxes[0].left, t: boxes[0].top, w: boxes[0].width, h: boxes[0].height },
    { l: 0, t: 0, w: 10, h: 10 }, "[0,0,192,108] 은 왼쪽 위 10% 상자다");
  // 선택이 없으면 전부 후보다.
  assert.equal(replayBoxes({ boxes: [[0, 0, 1, 1]] }).every((b) => b.width2 === 1), true);
  assert.deepEqual(replayBoxes({}), []);
});

test("pushThought: 같은 단계를 두 줄로 쌓지 않고, 다섯 줄만 든다", () => {
  let s = EMPTY_THOUGHTS;
  s = pushThought(s, "첫 줄", "k1");
  s = pushThought(s, "첫 줄", "k1");
  assert.deepEqual(s.lines, ["첫 줄"], "같은 키는 되풀이하지 않는다");
  for (let i = 0; i < 8; i += 1) s = pushThought(s, `줄 ${i}`, `k${i}`);
  assert.equal(s.lines.length, 5, "최근 다섯 줄만");
  assert.equal(s.lines.at(-1), "줄 7");
  assert.deepEqual(pushThought(s, "", "kx"), s, "빈 문장은 쌓지 않는다");
});
