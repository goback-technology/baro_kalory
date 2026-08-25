// MJPEG(multipart/x-mixed-replace) player: fetch + per-part parsing + <img> painting
// via blob URLs. Exists because a plain <img src="stream"> gives no per-frame events,
// so the UI cannot show delivered fps — parsing ourselves gives exact frame timing.
// Works with both the UE sim stream and the ffmpeg mpjpeg proxy (both send a
// Content-Length header per part).
//
// 이 폴더의 preview.mjs 가 쓴다 — 이 모듈을 직접 부르는 화면은 없다.
//
// stop() 은 fetch 를 abort 하고 그 읽기 루프가 '실제로 끝날 때까지' await 한다. 이로써
// 호출부(탭/카메라/화면 전환)가 "이전 스트림이 완전히 꺼진 뒤" 다음을 시작할 수 있어,
// 전환 때마다 sim MJPEG 연결이 중복 누적(→ 스트림 저하)되는 것을 막는다. fetch 연결이
// 닫히면 서버(proxyTcpMjpeg)가 sim 소켓을 destroy 한다.

export function createMjpegPlayer({ img, onFps = () => {}, onError = () => {} } = {}) {
  let ctrl = null, blobUrl = null, running = null, fpsTick = createFpsCounter();
  // 세대 토큰. start() 는 `await stop()` 에서 이벤트 루프에 양보하는데, 그 창에서 다른
  // start() 가 겹치면 둘 다 ctrl 미할당 상태의 stop() 을 no-op 으로 통과해 fetch 를 두 개
  // 연다 — ctrl 은 나중 것으로 덮이고 앞의 fetch 는 abort 손잡이를 잃은 **유령 연결**이
  // 된다(2026-08-04 실측: 카메라 전환 반복 → 유령 누적 → ffmpeg/RTSP 세션이 카메라
  // 인코더를 나눠 먹어 fps 가 15→11로 깎였고, 백엔드 재시작만이 유령을 끊어 복구됐다).
  // await 뒤 세대가 달라졌으면 진 쪽이며, 시작하지 않고 물러난다.
  let gen = 0;

  async function start(url) {
    const my_gen = ++gen;                 // 이 시작의 세대 — 이후의 모든 start/stop 이 앞지른다
    await stopInternal();                 // 이전 스트림 완전 종료 후 시작(중복 연결 방지)
    if (my_gen !== gen) return;           // 기다리는 사이 더 새로운 의도가 나옴 — 시작하지 않는다
    const my = new AbortController();
    ctrl = my;
    fpsTick = createFpsCounter();
    running = (async () => {
      try {
        const res = await fetch(url, { signal: my.signal, cache: "no-store" });
        // status 를 오류에 실어 보낸다 — 호출부가 "일시 장애"와 "이 기기엔 스트림이 없음"을
        // 구분해야 하는데, 메시지 문자열을 파싱하게 두면 조용히 어긋난다.
        if (!res.ok || !res.body) {
          const err = new Error(`stream HTTP ${res.status}`);
          err.status = res.status;
          throw err;
        }
        const reader = res.body.getReader();
        let buf = new Uint8Array(0);
        for (;;) {
          const { done, value } = await reader.read();
          if (done) throw new Error("stream ended");
          buf = concatBytes(buf, value);
          for (;;) {
            const part = extractFrame(buf);
            if (!part) break;
            buf = part.rest;
            paint(part.jpeg);
          }
          // runaway guard: a source without Content-Length would grow forever
          if (buf.length > 32 * 1024 * 1024) throw new Error("unparsable stream (no Content-Length?)");
        }
      } catch (e) {
        if (ctrl === my && !my.signal.aborted) onError(e);
      }
    })();
    return running;
  }

  function paint(bytes) {
    const next = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
    const prev = blobUrl;
    blobUrl = next;
    img.src = next;
    // prev is already decoded/displayed; revoking only blocks future loads of that URL.
    if (prev) URL.revokeObjectURL(prev);
    const fps = fpsTick(performance.now());
    if (fps !== null) onFps(fps);
  }

  // abort 후 읽기 루프가 종료될 때까지 await → "완전히 꺼짐"을 보장(호출부가 await 가능).
  // 외부 stop 만 세대를 올린다 — start 가 내부적으로 부르는 정지(stopInternal)가 세대를
  // 올리면 start 가 자기 자신을 무효화해 아무것도 시작하지 못한다.
  async function stop() {
    gen++;                                // await 중인 start 가 있으면 무효화 — stop 이 이긴다
    await stopInternal();
  }
  async function stopInternal() {
    if (ctrl) { ctrl.abort(); ctrl = null; }
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
    if (running) { const r = running; running = null; try { await r; } catch { /* aborted */ } }
  }

  return { start, stop, isRunning: () => !!ctrl };
}

// --- fps counting (pure, exported for tests) ---

// 슬라이딩 윈도(기본 2초) 안의 프레임 수로 전달 fps 를 계산한다. "직전 프레임과의
// 도착 간격 역수"는 TCP 가 큰 프레임(~100KB)들을 몰아서 전달할 때 1~2ms 간격 페인트가
// 생겨 수백 fps 로 튀므로(실측 562) 쓰지 않는다 — 도착이 버스트해도 윈도 평균은 참값.
export function createFpsCounter(windowMs = 2000) {
  const stamps = [];
  return (now) => {
    stamps.push(now);
    while (stamps.length && stamps[0] <= now - windowMs) stamps.shift();
    if (stamps.length < 2 || now === stamps[0]) return null;
    return (stamps.length - 1) * 1000 / (now - stamps[0]);
  };
}

// --- multipart parsing (pure, exported for tests) ---

const HDR_END = new Uint8Array([13, 10, 13, 10]); // \r\n\r\n

// Pull one complete part off the front of buf. Returns { jpeg, rest } or null if
// more bytes are needed. Relies on the per-part Content-Length header.
export function extractFrame(buf) {
  const hdrEnd = indexOfSeq(buf, HDR_END);
  if (hdrEnd < 0) return null;
  const header = new TextDecoder("latin1").decode(buf.subarray(0, hdrEnd));
  const m = /content-length:\s*(\d+)/i.exec(header);
  if (!m) {
    // 헤더 블록에 길이가 없으면 이 스트림은 파싱 불가 — 호출부 runaway guard가 끊는다.
    return null;
  }
  const len = Number(m[1]);
  const frameStart = hdrEnd + HDR_END.length;
  if (buf.length < frameStart + len) return null; // frame not fully buffered yet
  return {
    jpeg: buf.subarray(frameStart, frameStart + len),
    rest: buf.subarray(frameStart + len),
  };
}

function concatBytes(a, b) {
  if (a.length === 0) return b instanceof Uint8Array ? b : new Uint8Array(b);
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function indexOfSeq(buf, seq) {
  outer: for (let i = 0; i <= buf.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) {
      if (buf[i + j] !== seq[j]) continue outer;
    }
    return i;
  }
  return -1;
}
