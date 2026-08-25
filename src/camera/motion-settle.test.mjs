import test from "node:test";
import assert from "node:assert/strict";
import { createMotionSettleTracker } from "./motion-settle.mjs";

// 실측 시계열 (2026-07-08, /cctv 실카메라 클릭 센터링을 헤드리스 Chrome으로 재현,
// 64×36 그레이 다운샘플 100ms 차분): 유휴 노이즈 → 팬(피크 34.5) → 감쇠 꼬리 → 유휴.
const MEASURED = [
  0.25, 0.74, 0.32, 0.19, 0.32, 0.19, 0.32, 0.21, 0.34, 0.23, 0.38, 0.78,
  0.47, 0.29, 0.46, 0.3, 0.52, 2.34,            // ← OSD 시계 틱 수준까지는 모션 아님
  34.53, 7.04, 9, 4.86, 3.41,                    // ← 팬 (모두 ≥high 또는 중간대)
  2.25, 2.84, 1.58,                              // ← quiet 3연속 → 정착
  1.57, 1.07,
];

test("motion-settle: 실측 팬 시계열에서 모션 종료 지점에 정착한다", () => {
  const tr = createMotionSettleTracker();
  const settledAt = [];
  MEASURED.forEach((v, i) => { if (tr.push(v)) settledAt.push(i); });
  assert.equal(tr.seenMotion, true);
  assert.equal(tr.settled, true);
  // 정착 완성 샘플 = 팬 감쇠 후 quiet 3연속의 세 번째(1.58, 인덱스 25)
  assert.deepEqual(settledAt, [25]);
});

test("motion-settle: 모션 없는 유휴 노이즈(OSD 틱 포함)에서는 정착하지 않는다", () => {
  const tr = createMotionSettleTracker();
  for (const v of [0.2, 0.8, 0.15, 2.34, 0.3, 0.9, 1.2, 0.4, 2.31, 0.5]) {
    assert.equal(tr.push(v), false);
  }
  assert.equal(tr.seenMotion, false);
  assert.equal(tr.settled, false);
});

test("motion-settle: 중간대(low~high) 샘플은 quiet 연속을 끊는다", () => {
  const tr = createMotionSettleTracker({ high: 5, low: 3, quietSamples: 3 });
  tr.push(30);                          // 모션 시작
  tr.push(1); tr.push(1);               // quiet 2연속
  tr.push(4);                           // 중간대 → 리셋 (모션 재시작은 아님)
  tr.push(1); tr.push(1);
  assert.equal(tr.settled, false);
  assert.equal(tr.push(1), true);       // 다시 3연속 채워야 정착
  assert.equal(tr.settled, true);
});

test("motion-settle: 재모션이 오면 정착 전 quiet 를 무효화한다", () => {
  const tr = createMotionSettleTracker();
  tr.push(20); tr.push(1); tr.push(1);
  tr.push(15);                          // 다시 큰 모션
  tr.push(1); tr.push(1);
  assert.equal(tr.settled, false);
  assert.equal(tr.push(1), true);
});

test("motion-settle: 비수치 입력은 무시한다", () => {
  const tr = createMotionSettleTracker();
  assert.equal(tr.push(NaN), false);
  assert.equal(tr.push(undefined), false);
  tr.push(20);
  assert.equal(tr.push(NaN), false);    // 상태 훼손 없음
  tr.push(1); tr.push(1);
  assert.equal(tr.push(1), true);
});
