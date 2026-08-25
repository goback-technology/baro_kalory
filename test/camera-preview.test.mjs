// camera-preview 의 "대기 오버레이" 규율에 대한 행동 테스트.
//
// 두 결함이 실제 화면에서 관측돼 여기에 고정한다(2026-07-29, 로컬 pm2 dev 백엔드 + DevTools 실측):
//  1) 스냅샷 폴링이 매 프레임 setWaiting(true) 를 불러, 검정 오버레이 + "Wait..." 가 초당 5회
//     1.7ms 씩 켜졌다 꺼졌다 했다. 모니터 프레임(16.7ms)보다 짧아 위상이 맞는 순간에만 그려져
//     불규칙한 번쩍임이 됐다(합성 프레임의 2%). 서버가 빠를수록 심해지는 종류의 버그.
//  2) /api/stream 의 501("이 기기엔 스트림이 없다")을 일시 장애로 보고 12회(≈25초) 재시도해,
//     가상 PTZ·기준기 기기는 매번 25초 동안 화면이 통째로 "Wait..." 였다.
//
// 소스 문자열 매칭이 아니라 실제 호출을 센다 — 문자열 검사는 이 두 회귀를 못 잡는다.
import assert from "node:assert/strict";
import test from "node:test";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- 최소 DOM 스텁 -----------------------------------------------------------
// import 전에 심어야 한다(i18n 이 모듈 스코프에서 document.title 을 읽는다).
// document·window 의 리스너는 **세어야 한다** — 이 위젯보다 오래 사는 대상에 걸리므로,
// 떼지 못하면 버린 인스턴스가 계속 반응한다. 스텁이 등록/해제를 그대로 기록한다.
function listenerBus() {
  const handlers = new Map();   // type -> Set<fn>
  return {
    addEventListener(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
    },
    removeEventListener(type, fn) { handlers.get(type)?.delete(fn); },
    count: (type) => handlers.get(type)?.size || 0,
    async fire(type) { for (const fn of [...(handlers.get(type) || [])]) await fn(); },
  };
}

let docBus, winBus;
function installDom() {
  docBus = listenerBus();
  winBus = listenerBus();
  globalThis.document = {
    title: "test",
    hidden: false,
    visibilityState: "visible",
    addEventListener: (...a) => docBus.addEventListener(...a),
    removeEventListener: (...a) => docBus.removeEventListener(...a),
    querySelector: () => null,
    createElement: () => ({ getContext: () => null, width: 0, height: 0 }),
  };
  globalThis.window = {
    addEventListener: (...a) => winBus.addEventListener(...a),
    removeEventListener: (...a) => winBus.removeEventListener(...a),
  };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
}

// stage/img 스텁. img.src 대입은 "요청"으로 기록하고, autoLoad 면 load 이벤트를 비동기로 쏜다.
function makeStage({ autoLoad = true, loadDelayMs = 1 } = {}) {
  const handlers = new Map();
  const waitingLog = [];   // setWaiting 호출 이력 (true/false)
  const srcLog = [];
  const pausedLog = [];    // preview-paused 토글 이력
  const attrs = new Map(); // data-paused-label 등 — 실제 DOM 요소가 갖는 표면
  const stage = {
    classList: {
      toggle: (name, on) => {
        if (name === "preview-waiting") waitingLog.push(!!on);
        if (name === "preview-paused") pausedLog.push(!!on);
      },
    },
    setAttribute: (k, v) => attrs.set(k, v),
    removeAttribute: (k) => attrs.delete(k),
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
  };
  const img = {
    naturalWidth: 640,
    classList: { toggle() {} },
    closest: () => stage,
    parentElement: stage,
    addEventListener: (ev, fn) => { handlers.set(ev, fn); },
    removeEventListener: (ev, fn) => { if (handlers.get(ev) === fn) handlers.delete(ev); },
    removeAttribute() {},
    set src(v) {
      srcLog.push(v);
      if (!autoLoad) return;
      setTimeout(() => handlers.get("load") && handlers.get("load")(), loadDelayMs);
    },
    get src() { return srcLog[srcLog.length - 1] || ""; },
  };
  return { img, stage, waitingLog, srcLog, pausedLog, attrs,
           fire: (ev) => handlers.get(ev) && handlers.get(ev)() };
}

installDom();
const { createCameraPreview } = await import("../src/camera-preview.mjs");

test("스냅샷 폴링 정상 상태에서는 대기 오버레이를 켜지 않는다 (프레임 번쩍임 방지)", async () => {
  const { img, waitingLog, srcLog } = makeStage();
  const preview = createCameraPreview({
    img, streamUrl: "/s", snapshotUrl: "/snap",
    defaultMode: "snapshot", defaultIntervalMs: 0, storageKey: null,
  });
  preview.start();
  await sleep(120);
  await preview.stop();

  assert.ok(srcLog.length >= 5, `프레임이 실제로 돌아야 한다 (관측 ${srcLog.length})`);
  assert.ok(srcLog.every((s) => s.startsWith("/snap")), "스냅샷 URL 로 폴링해야 한다");

  // 첫 프레임이 도착한 뒤(첫 false) 에는 true 가 한 번도 나오면 안 된다.
  const firstFalse = waitingLog.indexOf(false);
  assert.notEqual(firstFalse, -1, "첫 프레임 후 대기 상태가 풀려야 한다");
  const afterFirstFrame = waitingLog.slice(firstFalse + 1);
  assert.deepEqual(
    afterFirstFrame.filter((v) => v === true), [],
    `정상 폴링 중 대기 오버레이가 ${afterFirstFrame.filter((v) => v).length}회 켜졌다 — 이것이 번쩍임의 원인이다`,
  );
});

test("첫 프레임 전과 오류 후에는 대기 오버레이를 켠다", async () => {
  const { img, waitingLog, fire } = makeStage({ autoLoad: false });
  const preview = createCameraPreview({
    img, streamUrl: "/s", snapshotUrl: "/snap",
    defaultMode: "snapshot", defaultIntervalMs: 0, storageKey: null,
  });
  preview.start();
  await sleep(20);
  assert.equal(waitingLog.at(-1), true, "첫 프레임 전에는 대기 표시가 켜져 있어야 한다");

  fire("load");                       // 프레임 도착
  assert.equal(waitingLog.at(-1), false);
  fire("error");                      // 스냅샷 실패
  assert.equal(waitingLog.at(-1), true, "오류 후에는 다시 대기 표시가 켜져야 한다");
  await preview.stop();
});

test("스트림 501 은 재시도하지 않고 즉시 스냅샷으로 폴백한다", async () => {
  const { img, srcLog } = makeStage();
  const streamHits = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    streamHits.push(String(url));
    return { ok: false, status: 501, body: null };
  };
  try {
    const preview = createCameraPreview({
      img, streamUrl: "/s", snapshotUrl: "/snap",
      defaultMode: "stream", defaultIntervalMs: 0, storageKey: null,
    });
    preview.start();
    // 옛 동작이면 이 구간에 500ms+ 간격으로 재연결 시도가 쌓인다.
    await sleep(1200);
    await preview.stop();

    assert.equal(streamHits.length, 1, `501 은 확정 답이므로 한 번만 물어야 한다 (관측 ${streamHits.length}회)`);
    assert.ok(srcLog.some((s) => s.startsWith("/snap")), "즉시 스냅샷 폴링으로 넘어가야 한다");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("스트림의 일시 장애(502)는 기존대로 재연결을 시도한다", async () => {
  const { img } = makeStage();
  const streamHits = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    streamHits.push(String(url));
    return { ok: false, status: 502, body: null };
  };
  try {
    const preview = createCameraPreview({
      img, streamUrl: "/s", snapshotUrl: "/snap",
      defaultMode: "stream", defaultIntervalMs: 0, storageKey: null,
    });
    preview.start();
    await sleep(1600);   // 재시도 간격 750ms, 1000ms …
    await preview.stop();
    assert.ok(streamHits.length >= 2, `502 는 재연결을 시도해야 한다 (관측 ${streamHits.length}회)`);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// 정지 상태에서 <img> 의 src 를 지우면 브라우저가 **깨진 이미지 아이콘 + alt 텍스트**를
// 좌상단에 그린다 — 사용자에게는 "링크가 깨졌다"로 읽힌다(실제로는 정상적인 정지).
// 2026-08-04 사용자 보고. 이미지를 감추고 화면 중앙에 상태를 글자로 쓴다.
test("정지하면 이미지를 감추고 중앙에 상태 글자를 띄운다 (깨진 이미지 금지)", async () => {
  const { img, stage, pausedLog, attrs } = makeStage();
  const preview = createCameraPreview({ img, stage, streamUrl: "/s", snapshotUrl: "/snap", defaultMode: "snapshot" });
  preview.start();
  await sleep(30);
  pausedLog.length = 0;

  await preview.stop();
  assert.equal(pausedLog.at(-1), true, "정지하면 preview-paused 가 켜져야 한다");
  assert.ok(attrs.get("data-paused-label"), "중앙에 그릴 문구가 attr 로 있어야 한다");

  // 다시 시작하면 정지 표시가 걷혀야 한다 — 안 걷으면 영상 위에 글자가 남는다.
  pausedLog.length = 0;
  preview.start();
  await sleep(30);
  assert.equal(pausedLog.includes(false), true, "재시작하면 정지 표시가 꺼져야 한다");
  assert.equal(attrs.get("data-paused-label"), undefined, "문구 attr 도 제거되어야 한다");
  await preview.stop();
});

test("대기와 정지는 동시에 뜨지 않는다 (오버레이 이중 겹침 방지)", async () => {
  const { img, stage, pausedLog } = makeStage({ autoLoad: false });
  const preview = createCameraPreview({ img, stage, streamUrl: "/s", snapshotUrl: "/snap", defaultMode: "snapshot" });
  await preview.stop();
  assert.equal(pausedLog.at(-1), true);
  pausedLog.length = 0;
  preview.start();          // start → apply → setWaiting(true) 가 정지 표시를 꺼야 한다
  await sleep(10);
  assert.equal(pausedLog.at(-1), false, "대기를 켜면 정지 표시는 꺼져야 한다");
  await preview.stop();
});

// 상태 구분(2026-08-04 이교수님 지시): **접속 시도 중 = Wait, 켜지 않은 상태 = 정지.**
// 예전에는 모듈 초기화가 setWaiting(true) 를 불러, 프리뷰를 켜지 않은 페이지(CCTV 기본값이
// 꺼짐)가 "Wait..." 를 영원히 띄웠다 — 기다릴 것이 없는데 기다린다고 말하는 화면이었다.
test("켜지 않은 초기 상태는 대기가 아니라 정지다", async () => {
  const { img, stage, waitingLog, pausedLog, attrs } = makeStage();
  createCameraPreview({ img, stage, streamUrl: "/s", snapshotUrl: "/snap", defaultMode: "snapshot" });
  // start() 를 부르지 않았다 — 아무것도 기다리지 않는 상태.
  assert.equal(pausedLog.at(-1), true, "정지 표시가 켜져 있어야 한다");
  assert.ok(attrs.get("data-paused-label"), "정지 문구가 있어야 한다");
  assert.deepEqual(waitingLog.filter((v) => v === true), [],
    "켠 적이 없는데 대기 오버레이가 뜨면 안 된다");
});

test("접속 시도 중에는 대기(Wait)로 표시한다", async () => {
  const { img, stage, waitingLog, pausedLog } = makeStage({ autoLoad: false });
  const preview = createCameraPreview({ img, stage, streamUrl: "/s", snapshotUrl: "/snap", defaultMode: "snapshot" });
  waitingLog.length = 0; pausedLog.length = 0;
  preview.start();                       // 첫 프레임이 아직 없다 = 접속 시도 중
  await sleep(10);
  assert.equal(waitingLog.at(-1), true, "접속 시도 중에는 대기 표시여야 한다");
  assert.equal(pausedLog.at(-1), false, "그때 정지 표시는 꺼져 있어야 한다");
  await preview.stop();
  assert.equal(pausedLog.at(-1), true, "정지하면 다시 정지 표시");
});

// --- destroy(): 라우트 이탈·언마운트 -----------------------------------------
// 화면 전환이 페이지 로드 없이 일어나면(SPA) 위젯을 스스로 거둬야 한다. stop() 은 다시
// start() 될 것을 전제로 리스너를 남기지만, 버린 인스턴스에는 돌아올 자리가 없다 —
// document 의 visibilitychange 가 남으면 화면에 없는 프리뷰가 탭 복귀마다 되살아나
// 스트림을 다시 연다. 유령 시청자가 카메라를 점유하는 그 부류다(2026-07-16 OOM).
test("destroy 는 폴링을 끊고 document·window 리스너를 남기지 않는다", async () => {
  const before = docBus.count("visibilitychange");
  const { img, srcLog } = makeStage();
  const preview = createCameraPreview({
    img, streamUrl: "/s", snapshotUrl: "/snap",
    modeButton: { addEventListener() {}, removeEventListener() {}, set textContent(v) {} },
    defaultMode: "snapshot", defaultIntervalMs: 0, storageKey: null,
  });
  assert.equal(docBus.count("visibilitychange"), before + 1, "위젯이 살아 있는 동안엔 걸려 있어야 한다");
  assert.ok(winBus.count("langchange") >= 1, "언어 전환 리스너도 등록된다");

  preview.start();
  await sleep(60);
  await preview.destroy();

  assert.equal(docBus.count("visibilitychange"), before, "destroy 뒤에 document 리스너가 남았다");
  assert.equal(winBus.count("langchange"), 0, "destroy 뒤에 window 리스너가 남았다");

  const after = srcLog.length;
  await sleep(60);
  assert.equal(srcLog.length, after, "destroy 뒤에도 폴링이 돌고 있다");
});

test("destroy 뒤에는 탭 복귀도 start() 도 스트림을 다시 열지 못한다", async () => {
  const { img, srcLog } = makeStage();
  const preview = createCameraPreview({
    img, streamUrl: "/s", snapshotUrl: "/snap",
    defaultMode: "snapshot", defaultIntervalMs: 0, storageKey: null,
  });
  preview.start();
  await sleep(40);
  await preview.destroy();
  const after = srcLog.length;

  await docBus.fire("visibilitychange");   // 살아 있는 다른 위젯이 있으면 이 이벤트는 계속 온다
  preview.start();                         // 호스트가 실수로 다시 불러도
  await sleep(60);
  assert.equal(srcLog.length, after, "버린 인스턴스가 되살아나 카메라를 점유했다");
});
