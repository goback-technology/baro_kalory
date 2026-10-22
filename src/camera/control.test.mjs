import test from "node:test";
import assert from "node:assert/strict";
import { controlPath, controlSummary, loadCameraControl, retryCameraRecovery } from "./control.mjs";

const cameraId = "camera / one";
const api = (path) => `/calory/api${path}`;
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

test("control reads and recovery target the encoded camera, preserve mount and never change active camera", async () => {
  const requests = [];
  const signal = new AbortController().signal;
  const options = { api, signal, fetchImpl: async (url, init) => {
    requests.push({ url, init });
    return response({ cameraId, state: "idle", owner: null, recovery: null });
  } };
  assert.equal((await loadCameraControl(cameraId, options)).state, "idle");
  assert.equal((await retryCameraRecovery(cameraId, options)).state, "idle");
  assert.equal(controlPath(cameraId), "/cctv/devices/camera%20%2F%20one/control");
  assert.equal(requests[0].url, "/calory/api/cctv/devices/camera%20%2F%20one/control");
  assert.equal(requests[0].init.method, "GET");
  assert.equal(requests[0].init.signal, signal);
  assert.equal(requests[0].init.cache, "no-store");
  assert.equal(requests[1].url, requests[0].url + "/recover");
  assert.equal(requests[1].init.method, "POST");
  assert.deepEqual(JSON.parse(requests[1].init.body), {});
});

test("old backend GET 404 is unsupported, while recovery 404 and service errors remain errors", async () => {
  const old = { api, fetchImpl: async () => new Response("Not Found", { status: 404 }) };
  assert.equal(await loadCameraControl(cameraId, old), null);
  await assert.rejects(retryCameraRecovery(cameraId, { api, fetchImpl: async () => response({ error: "missing" }, 404) }),
    (e) => e.status === 404 && e.message === "missing");
  const control = { cameraId, state: "recovery_required", recovery: { canRetry: true } };
  for (const status of [409, 502]) {
    await assert.rejects(retryCameraRecovery(cameraId, {
      api, fetchImpl: async () => response({ error: "restore failed", code: "recovery_required", control }, status),
    }), (e) => e.status === status && e.body.control.cameraId === cameraId && e.message === "restore failed");
  }
  await assert.rejects(loadCameraControl(cameraId, {
    api, fetchImpl: async () => response({ error: "offline" }, 503),
  }), (e) => e.status === 503);
});

test("foreign camera or malformed success does not claim that this camera is free", async () => {
  for (const body of [{ cameraId: "other", state: "idle" }, { cameraId, state: "unknown" }, {}]) {
    await assert.rejects(loadCameraControl(cameraId, { api, fetchImpl: async () => response(body) }), /응답/);
  }
});

test("short manual occupancy stays quiet; long jobs and recovery are distinct, with explicit retry capability", () => {
  assert.equal(controlSummary(null), null);
  assert.equal(controlSummary({ state: "idle" }), null);
  for (const operation of ["manual", "switch"]) {
    assert.equal(controlSummary({ state: "owned", owner: { operation } }), null);
  }
  for (const operation of ["homing", "calibration", "height"]) {
    const summary = controlSummary({ state: "owned", owner: { operation, actor: { id: "local" } } });
    assert.match(summary.label, /진행 중/);
    assert.equal(summary.canRetry, false);
    assert.doesNotMatch(summary.label, /local/);
  }
  assert.equal(controlSummary({ state: "recovering", recovery: { canRetry: true } }).canRetry, false);
  assert.equal(controlSummary({ state: "recovery_required", recovery: {} }).canRetry, false);
  const failed = controlSummary({ state: "recovery_required", recovery: { error: "move failed", canRetry: true } });
  assert.equal(failed.canRetry, true);
  assert.equal(failed.warn, true);
  assert.equal(failed.detail, "move failed");
});

test("persistent manual human or AI ownership is visible without calling legacy actors authenticated", () => {
  for (const kind of ["human", "ai"]) {
    const summary = controlSummary({ state: "owned", owner: {
      operation: "manual", persistent: true, actor: { kind, id: "operator" }, purpose: "aim adjustment",
    } });
    assert.equal(summary.manual, true);
    assert.match(summary.detail, new RegExp(kind + " · operator · aim adjustment"));
    assert.doesNotMatch(summary.label + summary.detail, /인증/);
  }
});

test("audit history requests preserve camera ID and exclusive sequence cursor; foreign records are rejected", async () => {
  const { loadControlHistory } = await import("./control.mjs");
  let requested;
  const result = await loadControlHistory(cameraId, { api, after: 25, limit: 25, fetchImpl: async (url) => {
    requested = url;
    return response({ cameraId, events: [{ seq: 26, event: "acquire" }], nextCursor: 26 });
  } });
  assert.equal(requested, api(controlPath(cameraId) + "/history") + "?after=25&limit=25");
  assert.equal(result.nextCursor, 26);
  await assert.rejects(loadControlHistory(cameraId, { api, fetchImpl: async () => response({ cameraId: "other", events: [], nextCursor: 0 }) }), /기록/);
});
