import test from "node:test";
import assert from "node:assert/strict";
import { shouldSkipTick } from "./use-job-poll.mjs";

// 이 네 규칙이 폴링 루프의 전부다. 여섯 벌로 흩어져 있던 동안에는 어떤 화면이 무엇을
// 지키는지 아무도 몰랐고, 빠뜨린 가드가 곧 사고였다(하루 10만 건 폴링).
test("숨겨진 탭·겹침·조작 중에는 건너뛴다", () => {
  assert.equal(shouldSkipTick({}), false, "아무 이유가 없으면 돈다");
  assert.equal(shouldSkipTick({ hidden: true }), true, "방치된 탭이 종일 폴링하면 그 자체가 부하다");
  assert.equal(shouldSkipTick({ inFlight: true }), true,
    "겹치면 요청이 배로 늘고, 늦게 온 옛 응답이 새 응답을 덮어써 화면이 뒤로 간다");
  assert.equal(shouldSkipTick({ paused: true }), true,
    "끌고 있는 중에 서버 상태로 다시 그리면 손에서 물건이 튀어나간다");
  // 셋 중 하나라도 서면 건너뛴다 — 「전부 참일 때만」이 되면 가드가 사실상 사라진다.
  assert.equal(shouldSkipTick({ hidden: true, inFlight: false, paused: false }), true);
  assert.equal(shouldSkipTick({ hidden: false, inFlight: true, paused: false }), true);
  assert.equal(shouldSkipTick({ hidden: false, inFlight: false, paused: true }), true);
});
