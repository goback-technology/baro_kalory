import { apiFetch } from "../lib/api.mjs";
// Native metadata is bound to its packet's JPEG, never to the active RTSP preview.
export const analyticsPath = (cameraId, suffix) =>
  `/cctv/devices/${encodeURIComponent(cameraId)}/analytics/${suffix}`;

export function detectionAgeMs(pair, now = Date.now()) {
  if (!pair) return null;
  return Math.max(0, Number(pair.detection.detectionAgeMs ?? pair.detection.ageMs) || 0) + Math.max(0, now - pair.observedAt);
}

export function nativeBoxes(detection) {
  const { width, height } = detection?.image || {};
  if (!(width > 0 && height > 0) || !Array.isArray(detection.objects)) return [];
  return detection.objects.flatMap((object) => {
    const b = object.bbox;
    if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite) || b.width <= 0 || b.height <= 0) return [];
    const x = Math.max(0, b.x), y = Math.max(0, b.y);
    const w = Math.min(width, b.x + b.width) - x, h = Math.min(height, b.y + b.height) - y;
    if (w <= 0 || h <= 0) return [];
    return [{ ...object, bbox: { x, y, width: w, height: h } }];
  });
}

// Coalesce metadata while one JPEG is in flight. A stopped/replaced stream cannot
// publish a late frame, even when a fetch implementation does not honor abort.
export function createAnalyticsStream({
  cameraId, api, onFrame, onStatus = () => {}, onError = () => {},
  fetchImpl = apiFetch,
  EventSourceImpl = globalThis.EventSource,
  createObjectURL = (blob) => URL.createObjectURL(blob),
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
  now = Date.now,
}) {
  let events = null, pending = null, fetching = false, request = null;
  let generation = 0, currentUrl = null, streamEpoch = null;

  async function pump(token) {
    if (fetching) return;
    fetching = true;
    try {
      while (pending && token === generation) {
        const pair = pending;
        pending = null;
        request = new AbortController();
        try {
          const response = await fetchImpl(api(analyticsPath(cameraId, `frames/${encodeURIComponent(pair.detection.frameId)}`)),
            { signal: request.signal, cache: "no-store" });
          // A slow browser can miss a bounded frame cache. Wait for the next event.
          if (response.status === 404 || response.status === 410) continue;
          if (!response.ok) throw new Error(`JPEG HTTP ${response.status}`);
          const blob = await response.blob();
          if (token !== generation) return;
          if (pair.detection.streamEpoch !== streamEpoch) continue;
          const url = createObjectURL(blob), previous = currentUrl;
          currentUrl = url;
          onFrame({ ...pair, blob, url });
          if (previous) revokeObjectURL(previous);
        } catch (error) {
          if (token === generation && pair.detection.streamEpoch === streamEpoch && error.name !== "AbortError") onError(error);
        }
      }
    } finally {
      if (token === generation) { fetching = false; request = null; }
    }
  }

  function stop() {
    generation += 1;
    events?.close(); events = null;
    request?.abort(); request = null;
    pending = null; fetching = false;
    streamEpoch = null;
  }

  function start() {
    stop();
    const token = generation;
    events = new EventSourceImpl(api(analyticsPath(cameraId, "events")));
    events.addEventListener("status", (event) => {
      if (token !== generation) return;
      try {
        const status = JSON.parse(event.data);
        if (status.cameraId && status.cameraId !== cameraId) return;
        if (status.streamEpoch && status.streamEpoch !== streamEpoch) {
          streamEpoch = status.streamEpoch;
          pending = null;
          request?.abort();
        }
        onStatus(status);
        if (status.state === "unsupported" || status.state === "disabled") stop();
      } catch (error) { onError(error); }
    });
    events.addEventListener("detections", (event) => {
      if (token !== generation) return;
      try {
        const detection = JSON.parse(event.data);
        if (detection.cameraId !== cameraId || !detection.frameId || !Array.isArray(detection.objects)) return;
        if (!(detection.image?.width > 0 && detection.image?.height > 0)) return;
        if (!detection.streamEpoch) return;
        streamEpoch ??= detection.streamEpoch;
        if (detection.streamEpoch !== streamEpoch) return;
        pending = { detection, observedAt: now() };
        void pump(token);
      } catch (error) { onError(error); }
    });
    events.addEventListener("error", () => {
      if (token === generation) onStatus({ cameraId, state: "disconnected", connected: false, stale: true });
      // EventSource retries automatically; stop() is the only manual close path.
    });
  }

  return {
    start, stop,
    destroy() { stop(); if (currentUrl) revokeObjectURL(currentUrl); currentUrl = null; },
  };
}

export async function analyzeDisplayedFrame(pair, { api, signal, fetchImpl = apiFetch }) {
  if (!pair?.blob) throw new Error("No displayed JPEG");
  const response = await fetchImpl(api("/inference/vehicle-det"), {
    method: "POST", headers: { "content-type": "image/jpeg" }, body: pair.blob, signal,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `ONI HTTP ${response.status}`);
  return { frameId: pair.detection.frameId, cameraId: pair.detection.cameraId, payload };
}
