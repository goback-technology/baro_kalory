import test from "node:test";
import assert from "node:assert/strict";
import { createFpsCounter, extractFrame } from "./mjpeg-player.mjs";

test("fps: 균일한 30fps 도착이면 ~30을 보고한다", () => {
  const tick = createFpsCounter(2000);
  let fps = null;
  for (let i = 0; i < 90; i++) fps = tick(i * 33.33);
  assert.ok(Math.abs(fps - 30) < 0.5, `expected ~30, got ${fps}`);
});

test("fps: 버스트 도착(프레임 4장이 1ms 간격)에도 뻥튀기되지 않는다", () => {
  // 실측 재현: TCP 가 ~100KB 프레임들을 몰아서 전달 → 1~2ms 간격 페인트.
  // 예전 '도착 간격 역수 EMA'는 이 패턴에서 562fps 까지 튀었다.
  const tick = createFpsCounter(2000);
  let fps = null, t = 0;
  for (let burst = 0; burst < 15; burst++) {
    t = burst * 133;                       // 버스트 간격 133ms (= 실효 30fps)
    for (let j = 0; j < 4; j++) fps = tick(t + j); // 버스트 안은 1ms 간격
  }
  assert.ok(fps > 25 && fps < 35, `expected ~30, got ${fps}`);
});

test("fps: 윈도 밖 과거 프레임은 계산에서 빠진다 (fps 하락 반영)", () => {
  const tick = createFpsCounter(2000);
  let t = 0, fps = null;
  for (let i = 0; i < 60; i++) { t = i * 33.33; tick(t); }   // 30fps 구간
  for (let i = 1; i <= 20; i++) { fps = tick(t + i * 200); } // 5fps 로 급락
  assert.ok(fps < 7, `expected ~5 after slowdown, got ${fps}`);
});

test("fps: 프레임 1장으로는 판정하지 않는다(null)", () => {
  const tick = createFpsCounter(2000);
  assert.equal(tick(100), null);
});

test("extractFrame: Content-Length 기반으로 파트 하나를 정확히 떼어낸다", () => {
  const enc = new TextEncoder();
  const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
  const header = enc.encode(`--ffmpeg\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`);
  const tail = enc.encode("\r\n--ffmpeg\r\nContent-Length: 9");
  const buf = new Uint8Array([...header, ...jpeg, ...tail]);
  const part = extractFrame(buf);
  assert.ok(part, "part should parse");
  assert.deepEqual([...part.jpeg], [...jpeg]);
  assert.equal(extractFrame(part.rest), null); // 다음 파트는 아직 미완 → null
});

// ── 유령 연결 회귀 (2026-08-04 실측 사고) ─────────────────────────────────────
// start() 는 `await stop()` 에서 이벤트 루프에 양보한다. 그 창에서 start 가 겹치면 둘 다
// ctrl 미할당 상태의 정지를 no-op 으로 통과해 fetch 를 두 개 열었고, ctrl 은 나중 것으로
// 덮여 앞의 fetch 가 abort 손잡이를 잃은 **유령 연결**이 됐다. 유령 하나가 ffmpeg/RTSP
// 세션 하나를 계속 점유해, 카메라 전환을 반복할수록 fps 가 깎였다(15→11, 재시작만이 복구).
import { createMjpegPlayer } from "./mjpeg-player.mjs";

function stubFetchTracking(signals) {
  // 연결이 "열린 채 유지"되는 fetch — abort 될 때만 끝난다(실제 fetch 의 abort 동작 재현).
  return (url, { signal }) => new Promise((_, reject) => {
    signals.push(signal);
    signal.addEventListener("abort", () => reject(new Error("AbortError")));
  });
}

test("동시 start 경쟁에서 살아남는 연결은 하나뿐이다 (유령 연결 금지)", async () => {
  const signals = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = stubFetchTracking(signals);
  try {
    const player = createMjpegPlayer({ img: {} });
    // 같은 틱에 두 번 시작 — 카메라 전환·재연결 타이머·시작 버튼이 겹치는 실제 패턴.
    player.start("u1");
    player.start("u2");
    // 두 start 가 각자의 await 를 지나 fetch 에 도달할 시간을 준다.
    for (let i = 0; i < 8; i++) await Promise.resolve();
    const live = signals.filter((s) => !s.aborted).length;
    assert.ok(live <= 1, `열린 연결이 ${live}개 — 유령 연결이 남았다`);
    await player.stop();
    assert.equal(signals.filter((s) => !s.aborted).length, 0, "stop 후에도 연결이 남아 있다");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("start 대기 중 stop 이 끼어들면 시작하지 않는다 (정지가 이긴다)", async () => {
  const signals = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = stubFetchTracking(signals);
  try {
    const player = createMjpegPlayer({ img: {} });
    player.start("u1");
    await player.stop();               // start 가 await 를 지나기 전에 정지 의도 도착
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(signals.filter((s) => !s.aborted).length, 0,
      "사용자가 정지한 뒤에 스트림이 살아나면 안 된다");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("정상 순차 사용은 그대로 동작한다: start→stop→start", async () => {
  const signals = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = stubFetchTracking(signals);
  try {
    const player = createMjpegPlayer({ img: {} });
    player.start("u1");
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(signals.filter((s) => !s.aborted).length, 1, "첫 시작이 연결을 열어야 한다");
    await player.stop();
    player.start("u2");
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(signals.filter((s) => !s.aborted).length, 1, "재시작 후에도 연결은 하나여야 한다");
    await player.stop();
    assert.equal(signals.filter((s) => !s.aborted).length, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});
