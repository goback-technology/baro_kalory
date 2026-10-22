import test from "node:test";
import assert from "node:assert/strict";
import { analyticsPath, createAnalyticsStream, detectionAgeMs, nativeBoxes, analyzeDisplayedFrame } from "./analytics.mjs";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const jpegResponse = (text = "jpeg") => ({ ok: true, status: 200, blob: async () => new Blob([text]) });
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}
const detection = (frameId, overrides = {}) => ({
  cameraId: "cam / night", frameId, streamEpoch: "session-1", source: "camera-native",
  image: { width: 720, height: 480 }, ageMs: 10, objects: [], ...overrides,
});
function fixture(fetchImpl = async () => jpegResponse()) {
  const frames = [], statuses = [], errors = [], urls = [], revoked = [], sources = [];
  class FakeEventSource {
    constructor(url) { this.url = url; this.handlers = {}; sources.push(this); }
    addEventListener(name, handler) { this.handlers[name] = handler; }
    emit(name, data) { this.handlers[name]?.({ data: JSON.stringify(data) }); }
    close() { this.closed = true; }
  }
  const client = createAnalyticsStream({
    cameraId: "cam / night", api: (p) => `http://backend/calory/api${p}`,
    onFrame: (frame) => frames.push(frame), onStatus: (s) => statuses.push(s), onError: (e) => errors.push(e),
    fetchImpl, EventSourceImpl: FakeEventSource,
    createObjectURL: (blob) => { const url = `blob:test-${urls.length}`; urls.push({ url, blob }); return url; },
    revokeObjectURL: (url) => revoked.push(url), now: () => 1000,
  });
  return { client, frames, statuses, errors, sources, urls, revoked };
}

test("camera and frame path preserves mount prefix and encodes identity", async () => {
  const requests = [];
  const f = fixture(async (url) => { requests.push(url); return jpegResponse(); });
  f.client.start();
  assert.equal(f.sources[0].url, "http://backend/calory/api/cctv/devices/cam%20%2F%20night/analytics/events");
  f.sources[0].emit("detections", detection("packet / 1"));
  await tick();
  assert.equal(requests[0], "http://backend/calory/api/cctv/devices/cam%20%2F%20night/analytics/frames/packet%20%2F%201");
  assert.equal(f.frames[0].detection.frameId, "packet / 1");
  assert.equal(f.frames[0].blob, f.urls[0].blob);
  assert.equal(analyticsPath("a", "status"), "/cctv/devices/a/analytics/status");
  f.client.destroy();
});

test("no metadata and foreign camera events cannot replace a valid empty detection", async () => {
  const f = fixture(); f.client.start();
  f.sources[0].emit("detections", detection("foreign", { cameraId: "other" }));
  f.sources[0].emit("detections", detection("pending", { objects: null }));
  f.sources[0].emit("detections", detection("bad", { image: { width: 0, height: 480 } }));
  f.sources[0].emit("detections", detection("empty"));
  await tick();
  assert.deepEqual(f.frames.map((p) => p.detection.frameId), ["empty"]);
  assert.deepEqual(f.frames[0].detection.objects, []);
  f.client.destroy();
});

test("one in-flight JPEG coalesces later events to the latest packet", async () => {
  const first = deferred(), requests = [];
  const f = fixture(async (url) => {
    requests.push(url);
    return requests.length === 1 ? first.promise : jpegResponse("latest");
  });
  f.client.start();
  for (const id of ["one", "two", "three"]) f.sources[0].emit("detections", detection(id));
  assert.equal(requests.length, 1);
  first.resolve(jpegResponse("one"));
  await tick();
  assert.equal(requests.length, 2);
  assert.match(requests[1], /frames\/three$/);
  assert.deepEqual(f.frames.map((p) => p.detection.frameId), ["one", "three"]);
  assert.deepEqual(f.revoked, ["blob:test-0"]);
  f.client.destroy();
  assert.deepEqual(f.revoked, ["blob:test-0", "blob:test-1"]);
});

test("stopping suppresses a late JPEG even if fetch ignores abort; held frame remains usable", async () => {
  const delayed = deferred();
  let signal;
  const f = fixture((_url, options) => { signal = options.signal; return delayed.promise; });
  f.client.start(); f.sources[0].emit("detections", detection("old"));
  f.client.stop();
  assert.equal(signal.aborted, true);
  assert.equal(f.sources[0].closed, true);
  delayed.resolve(jpegResponse("late"));
  await tick();
  assert.equal(f.frames.length, 0);
  assert.equal(f.urls.length, 0);
  f.client.destroy();
});

test("old stream callbacks and errors cannot mutate a restarted stream", async () => {
  const f = fixture(); f.client.start(); const previous = f.sources[0]; f.client.start();
  previous.emit("detections", detection("old")); previous.emit("status", { state: "error" }); previous.emit("error");
  f.sources[1].emit("detections", detection("new"));
  await tick();
  assert.deepEqual(f.frames.map((p) => p.detection.frameId), ["new"]);
  assert.equal(f.statuses.length, 0);
  f.client.stop();
  assert.equal(f.revoked.length, 0, "stopping preserves the already displayed Blob URL");
  f.client.destroy();
  assert.equal(f.revoked.length, 1);
});

test("expired frame cache entries are skipped without claiming a detection failure", async () => {
  let calls = 0;
  const f = fixture(async () => ++calls === 1 ? new Response("expired", { status: 410 }) : jpegResponse("fresh"));
  f.client.start(); f.sources[0].emit("detections", detection("expired"));
  await tick();
  f.sources[0].emit("detections", detection("fresh")); await tick();
  assert.deepEqual(f.frames.map((p) => p.detection.frameId), ["fresh"]);
  assert.equal(f.errors.length, 0);
  f.client.destroy();
});

test("server epoch change drops an old in-flight JPEG without closing the shared SSE", async () => {
  const old = deferred(), calls = [];
  const f = fixture((url, options) => {
    calls.push({ url, signal: options.signal });
    return calls.length === 1 ? old.promise : Promise.resolve(jpegResponse("new-epoch"));
  });
  f.client.start();
  f.sources[0].emit("detections", detection("old"));
  f.sources[0].emit("status", { cameraId: "cam / night", state: "connecting", streamEpoch: "session-2" });
  assert.equal(calls[0].signal.aborted, true);
  assert.ok(!f.sources[0].closed);
  f.sources[0].emit("detections", detection("new", { streamEpoch: "session-2" }));
  // A delayed event from the former epoch must not rotate identity backwards.
  f.sources[0].emit("detections", detection("late-old"));
  old.resolve(jpegResponse("old-epoch"));
  await tick();
  assert.deepEqual(f.frames.map((p) => p.detection.frameId), ["new"]);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /frames\/new$/);
  assert.equal(f.sources.length, 1);
  f.client.destroy();
});

test("disabled status closes the subscription; disconnected remains reconnectable", () => {
  const f = fixture(); f.client.start();
  f.sources[0].emit("error");
  assert.equal(f.statuses.at(-1).state, "disconnected");
  assert.equal(f.statuses.at(-1).connected, false);
  assert.equal(f.statuses.at(-1).stale, true);
  assert.ok(!f.sources[0].closed);
  f.sources[0].emit("status", { cameraId: "other", state: "disabled" });
  assert.ok(!f.sources[0].closed);
  f.sources[0].emit("status", { cameraId: "cam / night", state: "disabled" });
  assert.equal(f.sources[0].closed, true);
  f.client.destroy();
});

test("freshness follows detection age, not camera wall-clock or repeated receive time", () => {
  const pair = { detection: { ageMs: 25, detectionAgeMs: 4500, receivedAt: "2099-01-01T00:00:00Z" }, observedAt: 1000 };
  assert.equal(detectionAgeMs(pair, 1600), 5100);
  assert.equal(detectionAgeMs(pair, 900), 4500);
  assert.equal(detectionAgeMs(null), null);
});

test("native boxes retain packet image coordinates and clip invalid/outside rectangles", () => {
  const objects = [
    { className: "car", bbox: { x: 180, y: 120, width: 360, height: 240 } },
    { className: "truck", bbox: { x: 700, y: 470, width: 40, height: 20 } },
    { bbox: { x: 800, y: 0, width: 10, height: 10 } },
    { bbox: { x: NaN, y: 0, width: 10, height: 10 } },
  ];
  const boxes = nativeBoxes(detection("one", { objects }));
  assert.equal(boxes.length, 2);
  assert.deepEqual(boxes[0].bbox, objects[0].bbox);
  assert.deepEqual(boxes[1].bbox, { x: 700, y: 470, width: 20, height: 10 });
  assert.deepEqual(nativeBoxes(detection("none", { objects: null })), []);
});

test("ONI gets the exact held Blob, never a fresh camera snapshot", async () => {
  const blob = new Blob(["displayed-jpeg"]), calls = [];
  const pair = { detection: detection("held"), blob };
  const result = await analyzeDisplayedFrame(pair, {
    api: (p) => `http://backend/calory/api${p}`,
    fetchImpl: async (url, options) => {
      calls.push({ url, ...options });
      return Response.json({ backend: "vehicle-det", result: { bboxes: [] } });
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://backend/calory/api/inference/vehicle-det");
  assert.equal(calls[0].body, blob);
  assert.equal(calls[0].headers["content-type"], "image/jpeg");
  assert.equal(result.frameId, "held");
  assert.equal(result.cameraId, "cam / night");
  assert.deepEqual(result.payload.result.bboxes, []);
});

test("ONI error preserves service error and missing displayed frame sends nothing", async () => {
  await assert.rejects(analyzeDisplayedFrame(null, { api: () => "unused" }), /No displayed JPEG/);
  await assert.rejects(analyzeDisplayedFrame({ blob: new Blob(["jpeg"]), detection: detection("one") }, {
    api: () => "http://backend/inference", fetchImpl: async () => Response.json({ error: "ONI unavailable" }, { status: 503 }),
  }), /ONI unavailable/);
});
