// Live CCTV preview for one <img>: MJPEG stream (smooth, default) OR snapshot
// polling (configurable interval + fps readout), with pause/resume and an automatic
// stream->snapshot fallback. The inference path always pulls a SEPARATE high-res
// JPEG, so the preview can be the lighter stream while detection stays full-res.
// Stream mode goes through createMjpegPlayer (fetch + part parsing) so the label
// can show the actually-delivered fps — an <img src=stream> gives no frame events.
//
// Shared by the control tab and the layout editor — same code, two instances.

import { api } from "./api.mjs";
import { createMjpegPlayer } from "./mjpeg-player.mjs";
import { createMotionSettleTracker } from "./motion-settle.mjs";
import { t } from "./i18n.mjs";

const STREAM_RETRY_LIMIT = 12;
// 서버가 "이 기기엔 프리뷰 스트림이 없다"고 답하는 상태코드(proxyMjpeg). 재시도 대상이 아니다.
const STREAM_UNSUPPORTED_STATUS = 501;
// 탭이 숨겨진 뒤 스트림을 자동으로 끊기까지의 유예. 탭 전환처럼 짧게 가려지는 경우엔
// 끊지 않고, 방치된 탭만 회수한다(시뮬 캡처 누수 방어 — 아래 onVisibilityChange 참조).
const HIDDEN_GRACE_MS = 60000;

export function createCameraPreview(opts) {
  const {
    img,
    // api() 기본값: 스트림/스냅샷은 fetch·img 혼용 경로라 API base 를 반드시 타야 한다
    // (base 만 바꾸고 이쪽이 동일출처에 남으면 원격 backend 에서 영상만 조용히 깨진다).
    streamUrl = api("/stream"),
    snapshotUrl = api("/snapshot"),
    modeButton = null,     // optional toggle button (stream <-> snapshot)
    intervalInput = null,  // optional snapshot-interval (ms) input
    fpsLabel = null,       // optional element to show "≈ N fps" / status
    storageKey = null,     // optional localStorage prefix to persist mode/interval
    defaultMode = "stream",
    defaultIntervalMs = 200,
    log = () => {},
  } = opts;

  // ".v2": 이전 빌드는 스트림 실패 시 '자동' 폴백까지 ":mode"에 저장해, 한 번이라도
  // 깨진 스트림을 본 브라우저가 저fps 스냅샷 모드에 영구 고착됐다. 키를 버전업해
  // 오염된 저장값을 전 기기에서 일괄 무효화한다(이후의 명시적 선택은 새 키로 유지).
  const keyMode = storageKey ? storageKey + ":mode.v2" : null;
  const keyInt = storageKey ? storageKey + ":interval" : null;

  let mode = (keyMode && localStorage.getItem(keyMode)) || defaultMode; // "stream" | "snapshot"
  // 자동 폴백으로 스냅샷에 내려왔는지. **저장하지 않는다** — 이건 "그 기기가 스트림을 못 준다"는
  // 사실이지 사용자의 선택이 아니다. 저장값은 명시적 선택만 담는다(위 .v2 주석).
  let fellBackToSnapshot = false;
  let intervalMs = defaultIntervalMs;
  if (keyInt) {
    const s = localStorage.getItem(keyInt);
    if (s !== null && Number.isFinite(Number(s))) intervalMs = clamp(Number(s), 0, 3000);
  }
  let paused = true;          // starts paused; host calls start() for the active tab
  let lastFrameAt = 0, fpsEma = 0, snapTimer = 0;
  let frameSeq = 0;
  const frameWaiters = new Set();
  let streamRetryTimer = 0;
  let streamRetryCount = 0;
  let hiddenTimer = 0;            // 백그라운드 유예 타이머
  let suspendedByHidden = false;  // 자동 정지인지(= 복귀 시 재개) 사용자 정지인지 구분
  // 스테이지는 **클래스**로 찾는다. id 를 나열하면 그 목록이 tailwind.css 의 오버레이 선택자와
  // 미러가 되어, 새 페이지를 추가할 때 한쪽만 고치면 그 페이지만 조용히 오버레이를 잃는다.
  const stage = img.closest(".preview-stage") || img.parentElement;

  // 등록한 리스너를 전부 기억한다 — destroy() 가 되돌릴 수 있어야 하기 때문이다.
  // document·window 에 건 것은 이 위젯보다 오래 사는 대상이라, 떼지 못하면 인스턴스가
  // 죽어도 리스너가 남는다. 페이지 전체를 새로 로드하던 시절에는 그 누수가 안 보였지만,
  // 화면 전환이 로드 없이 일어나면(SPA) 왕복할 때마다 쌓여 자동 정지·재개가 N중으로 돈다.
  const listeners = [];
  function on(target, type, handler) {
    target.addEventListener(type, handler);
    listeners.push([target, type, handler]);
  }
  let destroyed = false;

  const player = createMjpegPlayer({
    img,
    onFps: (fps) => setLabel(t("스트림") + " ≈ " + fps.toFixed(1) + " fps"),
    onError: (e) => {
      if (paused || mode !== "stream") return;
      // 501 은 "이 기기는 연속 MJPEG 를 서빙하지 않는다"는 서버의 확정 답이다(가상 PTZ·기준기·
      // 스트림 미구성 기기). 일시 장애가 아니므로 재시도는 25초를 버릴 뿐 — 즉시 스냅샷으로.
      if (e && e.status === STREAM_UNSUPPORTED_STATUS) { setMode("snapshot", true); return; }
      scheduleStreamReconnect();
    },
  });

  if (intervalInput) {
    intervalInput.value = intervalMs;
    on(intervalInput, "change", () => {
      intervalMs = clamp(Number(intervalInput.value) || 0, 0, 3000);
      intervalInput.value = intervalMs;
      if (keyInt) localStorage.setItem(keyInt, String(intervalMs));
    });
  }
  if (modeButton) on(modeButton, "click", () => setMode(mode === "stream" ? "snapshot" : "stream"));
  if (modeButton) on(window, "langchange", () => { modeButton.textContent = mode === "stream" ? t("프리뷰: 스트림(MJPEG)") : t("프리뷰: 스냅샷"); });

  function setLabel(t) { if (fpsLabel) fpsLabel.textContent = t; }
  function setWaiting(on) {
    img.classList.toggle("preview-waiting-image", on);
    if (stage) stage.classList.toggle("preview-waiting", on);
    if (on) setPaused(false, "");   // 대기와 정지는 동시에 뜰 수 없다 — 마지막 의도가 이긴다
  }
  // 정지 표시. src 를 지운 <img> 는 브라우저가 **깨진 이미지 아이콘 + alt** 로 그려서
  // 사용자에게 "링크가 깨졌다"로 읽힌다(실제로는 정상적인 정지). 이미지를 감추고 화면
  // 중앙에 상태를 글자로 쓴다. 문구는 CSS content: attr() 로 넘긴다 — i18n 을 통과한
  // 문자열이 그대로 화면에 오도록(하드코딩하면 언어 전환에서 굳는다).
  function setPaused(on, label) {
    img.classList.toggle("preview-waiting-image", on);
    if (!stage) return;
    stage.classList.toggle("preview-paused", on);
    if (on) stage.setAttribute("data-paused-label", label || t("정지됨"));
    else stage.removeAttribute("data-paused-label");
  }

  // 초기 상태는 **대기가 아니라 정지**다. paused=true 로 만들어지고 호스트가 start() 를
  // 부를 때까지 아무것도 기다리지 않기 때문이다. 예전에는 여기서 setWaiting(true) 를 불러,
  // 프리뷰를 켜지 않은 페이지(CCTV 기본값 = 꺼짐)가 "Wait..." 를 영원히 띄우고 있었다 —
  // 기다릴 것이 없는데 기다린다고 말하는 화면이었다(2026-08-04 사용자 지적).
  // 호스트 마크업도 같은 상태로 첫 페인트를 그린다(JS 로드 전).
  setPaused(true, t("정지됨"));

  function clearStreamRetry() {
    if (streamRetryTimer) {
      clearTimeout(streamRetryTimer);
      streamRetryTimer = 0;
    }
  }

  function scheduleStreamReconnect() {
    if (paused || mode !== "stream") return;
    if (streamRetryTimer) return;
    setWaiting(true);
    streamRetryCount += 1;
    if (streamRetryCount > STREAM_RETRY_LIMIT) {
      setMode("snapshot", true);
      return;
    }
    const delay = Math.min(3000, 500 + streamRetryCount * 250);
    setLabel(t("스트림 재연결 중…") + ` (${streamRetryCount}/${STREAM_RETRY_LIMIT})`);
    streamRetryTimer = setTimeout(async () => {
      streamRetryTimer = 0;
      if (paused || mode !== "stream") return;
      await player.stop();
      if (paused || mode !== "stream") return;
      player.start(streamUrl + "?t=" + Date.now());
    }, delay);
  }

  function markFrame() {
    frameSeq += 1;
    for (const waiter of [...frameWaiters]) {
      if (frameSeq <= waiter.after) continue;
      frameWaiters.delete(waiter);
      clearTimeout(waiter.timer);
      waiter.resolve(frameSeq);
    }
  }

  function waitForNextFrame({ after = frameSeq, timeoutMs = 1500 } = {}) {
    if (paused) return Promise.resolve(frameSeq);
    if (frameSeq > after) return Promise.resolve(frameSeq);
    return new Promise((resolve) => {
      const waiter = { after, resolve, timer: 0 };
      waiter.timer = setTimeout(() => {
        frameWaiters.delete(waiter);
        resolve(frameSeq);
      }, Math.max(0, Number(timeoutMs) || 0));
      frameWaiters.add(waiter);
    });
  }

  function clearFrameWaiters() {
    for (const waiter of [...frameWaiters]) {
      frameWaiters.delete(waiter);
      clearTimeout(waiter.timer);
      waiter.resolve(frameSeq);
    }
  }

  // "화면에 보이는" 움직임을 프레임 차분으로 감시한다. PTZ 정착(settle)은 카메라
  // 텔레메트리 기준이라, 실카메라 프리뷰(RTSP→ffmpeg→MJPEG, 실측 ~2초 지연)에서는
  // 서버 응답 시점에 화면이 아직 움직이기 전일 수 있다. 마커류 UI는 클릭 시점에
  // 감시를 시작해 두고, 서버 응답 후 settled()로 "화면상 이동 종료"를 기다린다.
  function watchDisplayedMotion({ sampleMs = 100, high = 5, low = 3, quietSamples = 3 } = {}) {
    const tracker = createMotionSettleTracker({ high, low, quietSamples });
    const cv = document.createElement("canvas");
    cv.width = 64; cv.height = 36;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    let prev = null, lastSeq = -1, stopped = false, timer = 0;
    const waiters = new Set();

    function finish(waiter, reason) {
      waiters.delete(waiter);
      for (const tm of waiter.timers) clearTimeout(tm);
      waiter.resolve(reason);
    }
    function sample() {
      if (stopped) return;
      timer = setTimeout(sample, sampleMs);
      if (paused || !img.naturalWidth || frameSeq === lastSeq) return; // 새 프레임일 때만 측정
      lastSeq = frameSeq;
      let g;
      try {
        cx.drawImage(img, 0, 0, cv.width, cv.height);
        const d = cx.getImageData(0, 0, cv.width, cv.height).data;
        g = new Float32Array(cv.width * cv.height);
        for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
      } catch { return; } // 깨진 프레임은 건너뜀 — settled() 타임아웃이 안전망
      if (prev) {
        let sum = 0;
        for (let i = 0; i < g.length; i++) sum += Math.abs(g[i] - prev[i]);
        if (tracker.push(sum / g.length)) {
          for (const w of [...waiters]) finish(w, "settled");
        }
      }
      prev = g;
    }
    // noMotionMs: 호출 후 이 시간까지 모션이 한 번도 안 보이면 종료(이동이 화면상
    // 식별 불가할 만큼 작았거나 이미 끝난 경우) — 무한 대기로 UI 를 잡아두지 않는다.
    function settled({ noMotionMs = 3000, timeoutMs = 8000 } = {}) {
      if (stopped || tracker.settled) return Promise.resolve("settled");
      return new Promise((resolve) => {
        const waiter = { resolve, timers: [] };
        waiter.timers.push(setTimeout(() => { if (!tracker.seenMotion) finish(waiter, "no-motion"); }, noMotionMs));
        waiter.timers.push(setTimeout(() => finish(waiter, "timeout"), timeoutMs));
        waiters.add(waiter);
      });
    }
    function stop() {
      stopped = true;
      clearTimeout(timer);
      for (const w of [...waiters]) finish(w, "stopped");
    }
    sample();
    return { settled, stop };
  }

  // 대기 오버레이를 여기서 켜지 않는다. <img> 는 새 src 가 디코드될 때까지 이전 프레임을
  // 계속 보여주므로 폴링 중에는 가릴 것이 없다. 매 프레임 켰다 끄면 그 창(로컬 실측 1.7ms)이
  // 모니터 프레임보다 짧아 화면 갱신과 겹치는 순간에만 그려지고, 결과는 불규칙한 검은
  // 번쩍임이다(실측: 초당 5회 토글 → 합성 프레임의 2%가 "Wait..." 로 덮임).
  // 서버가 빠를수록 심해진다는 점이 이 버그의 특징이었다.
  // 첫 프레임 전(apply)과 오류 후(img error)에만 오버레이를 켠다.
  function loopSnapshot() {
    if (paused || mode !== "snapshot") return;
    // preview=1 = "화면에 그릴 그림이지 추론용 원본이 아니다". 서버는 연속 스트림이 있으면
    // 거기서 한 장을 떠 주고(카메라에 새 렌더를 안 시킨다), 없으면 기존 스냅샷으로 폴백한다.
    // 이게 없으면 프리뷰가 추론용 고해상 캡처를 매 200ms 마다 새로 시켜, 시뮬에서는
    // 그 카메라의 절반을 프리뷰 혼자 먹고 다른 소비자의 스트림까지 무너뜨린다.
    img.src = snapshotUrl + "?preview=1&t=" + Date.now();
  }
  async function apply() {
    setWaiting(true);
    clearTimeout(snapTimer);
    clearStreamRetry();
    await player.stop();
    if (destroyed) return;   // 이 await 사이에 버려졌으면 새 연결을 열지 않는다
    if (modeButton) modeButton.textContent = mode === "stream" ? t("프리뷰: 스트림(MJPEG)") : t("프리뷰: 스냅샷");
    if (intervalInput) intervalInput.disabled = mode === "stream";
    if (mode === "stream") {
      streamRetryCount = 0;
      setLabel(t("스트림 연결 중…"));
      player.start(streamUrl + "?t=" + Date.now());
    } else {
      setLabel("—");
      lastFrameAt = 0;
      loopSnapshot();
    }
  }
  function setMode(m, fallback) {
    clearStreamRetry();
    mode = m;
    fellBackToSnapshot = !!fallback && m === "snapshot";
    // Persist only explicit user choices. An automatic stream→snapshot fallback is
    // session-only: persisting it once stuck every browser in low-fps snapshot mode
    // even after the stream endpoint was fixed.
    if (keyMode && !fallback) localStorage.setItem(keyMode, m);
    if (fallback) log(t("MJPEG 스트림 사용 불가 → 스냅샷 폴링으로 전환"));
    if (!paused) apply();
  }

  on(img, "load", () => {
    if (paused) return;
    setWaiting(false);
    markFrame();
    if (mode === "stream") streamRetryCount = 0;
    if (mode !== "snapshot") return;
    const now = Date.now();
    if (lastFrameAt) {
      const inst = 1000 / Math.max(1, now - lastFrameAt);
      fpsEma = fpsEma ? fpsEma * 0.7 + inst * 0.3 : inst;
      setLabel("≈ " + fpsEma.toFixed(1) + " fps");
    }
    lastFrameAt = now;
    snapTimer = setTimeout(loopSnapshot, intervalMs);
  });
  on(img, "error", () => {
    if (paused) return;                        // intentional stop — don't fall back
    setWaiting(true);
    if (mode === "stream") scheduleStreamReconnect();
    else snapTimer = setTimeout(loopSnapshot, 1500);
  });
  on(img, "dragstart", (e) => e.preventDefault());

  function start() { if (destroyed) return; paused = false; clearHiddenTimer(); suspendedByHidden = false; apply(); }
  // 스트림 fetch 가 완전히 종료될 때까지 await → 호출부가 "꺼진 뒤" 전환하도록.
  async function stop() {
    paused = true;
    clearTimeout(snapTimer);
    clearStreamRetry();
    clearHiddenTimer();
    suspendedByHidden = false;
    clearFrameWaiters();
    await player.stop();
    try { img.removeAttribute("src"); } catch (e) { /* noop */ }
    setWaiting(false);
    setPaused(true, t("정지됨"));
    setLabel(t("정지됨"));
  }

  // 방치된 탭 차단. 브라우저가 백그라운드로 가면 프레임을 소비하지 않지만 연결은
  // 살아 있고, 시뮬은 클라이언트가 하나라도 있으면 30fps 캡처를 계속 돌린다 —
  // 그 캡처 경로가 메모리를 흘려 결국 시뮬이 죽는다(2026-07-16 OOM: 잔존 연결 1개가
  // 8시간 15분 유지). 숨겨진 채 유예 시간이 지나면 스스로 끊고, 돌아오면 재개한다.
  function clearHiddenTimer() {
    if (hiddenTimer) { clearTimeout(hiddenTimer); hiddenTimer = 0; }
  }
  async function onVisibilityChange() {
    if (document.hidden) {
      if (paused || hiddenTimer) return;
      hiddenTimer = setTimeout(async () => {
        hiddenTimer = 0;
        if (paused || !document.hidden) return;
        await stop();
        // stop() 은 suspendedByHidden 을 스스로 지운다(사람이 끈 정지의 기본값) —
        // 자동 정지 표식은 반드시 stop() **뒤에** 세워야 복귀 때 재개된다.
        suspendedByHidden = true;
        paused = true;
        // 왜 멈췄는지가 화면에도 보여야 한다 — 그냥 "정지됨"이면 사용자가 자기가 껐다고 오해한다.
        setPaused(true, t("백그라운드 — 자동 정지"));
        setLabel(t("백그라운드 — 자동 정지"));
      }, HIDDEN_GRACE_MS);
      return;
    }
    clearHiddenTimer();
    if (suspendedByHidden) { suspendedByHidden = false; start(); }
  }
  on(document, "visibilitychange", onVisibilityChange);

  // 위젯을 통째로 버린다 — 화면이 이 프리뷰를 더는 소유하지 않을 때(라우트 이탈·컴포넌트
  // 언마운트) 부른다. stop() 과 다른 점은 **돌아올 자리가 없다**는 것이다: stop() 은 다시
  // start() 될 것을 전제로 리스너를 남기지만, destroy() 뒤에는 이 인스턴스가 아무것에도
  // 반응하지 않아야 한다. 특히 document 의 visibilitychange 는 이 위젯보다 오래 사는
  // 대상에 걸린 것이라, 떼지 않으면 버린 인스턴스가 탭 복귀마다 되살아나 스트림을 다시
  // 연다 — 화면에는 없는데 카메라는 점유하는 유령 시청자다.
  async function destroy() {
    destroyed = true;
    for (const [target, type, handler] of listeners.splice(0)) {
      try { target.removeEventListener(type, handler); } catch { /* 스텁·소멸한 노드 */ }
    }
    await stop();
  }

  // 기기가 바뀌면 자동 폴백을 **무효화한다.** 폴백은 "직전 기기가 스트림을 못 준다"는
  // 사실이었을 뿐, 새 기기에 대한 판정이 아니다. 이걸 안 걷어내면 기준기(previewStream=null →
  // /api/stream 501)를 한 번 거치는 순간 그 탭이 세션 내내 스냅샷(≈2.5fps, 원본 CGI 폴링)에
  // 갇히고, 실기로 돌아와도 그대로다 — 사용자에게는 "전환할수록 프레임이 깎이고 새로고침만이
  // 복구"로 보였다(2026-08-04 실측 원인). 사용자가 손으로 고른 스냅샷 모드는 건드리지 않는다.
  function resetFallbackForNewDevice() {
    if (!fellBackToSnapshot) return false;
    fellBackToSnapshot = false;
    const restored = (keyMode && localStorage.getItem(keyMode)) || defaultMode;
    if (restored === mode) return false;
    mode = restored;
    if (!paused) apply();
    return true;
  }

  return { start, stop, destroy, setMode, getMode: () => mode, isPaused: () => paused,
           didFallBack: () => fellBackToSnapshot, resetFallbackForNewDevice,
           waitForNextFrame, watchDisplayedMotion, getFrameSeq: () => frameSeq };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
