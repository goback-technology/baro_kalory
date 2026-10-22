import test from "node:test";
import assert from "node:assert/strict";
import { createControlSession } from "./control-session.mjs";

const BASE = "https://api.example.com/calory";
const TOKEN = "browser-test-credential-" + "a".repeat(32);
const info = { required: false, configured: false, authenticated: false, actor: null,
  features: { cameraScoped: true, leases: true, audit: true } };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
function memory() {
  const data = new Map();
  return { data, getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
}
function harness(handler = () => json({ ok: true })) {
  let time = 10000, sequence = 0;
  const calls = [], storage = memory();
  const session = createControlSession({ base: BASE, storage, now: () => time, fetchImpl: async (url, options = {}) => {
    const call = { url: String(url), options, headers: new Headers(options.headers), path: new URL(url).pathname };
    calls.push(call);
    if (call.path.endsWith("/control/identity")) return json(info);
    if (call.path.endsWith("/control/lease")) return json({ lease: { token: `lease-${++sequence}`, expiresAt: time + 30000 } });
    return handler(call);
  } });
  session.setCamera("camera / one");
  return { session, calls, storage, setTime: (value) => { time = value; } };
}
const mutate = (session, path = "/ptz") => session.fetch(BASE + "/api" + path, { method: "POST", body: "{}" });

test("credentials are session scoped to the API origin and mount; redirects cannot forward them", async () => {
  const { session, calls, storage } = harness();
  await session.setToken(TOKEN);
  await session.fetch(BASE + "/api/config");
  for (const url of ["https://other.example.com/calory/api/config", "https://api.example.com/other/api/config", BASE + "/api-lookalike/config"]) await session.fetch(url);
  assert.equal(calls[0].headers.get("authorization"), `Bearer ${TOKEN}`);
  assert.equal(calls[0].options.redirect, "error");
  assert.ok(calls.slice(1).every((call) => !call.headers.has("authorization")));
  assert.deepEqual([...storage.data.keys()], [`baro-control-token:${BASE}`]);
  assert.ok(calls.every((call) => !call.url.includes(TOKEN)));
  const other = createControlSession({ base: "https://other.example.com", storage });
  assert.equal(other.hasToken(), false);
  await session.setToken("");
  assert.equal(session.hasToken(), false);
  await assert.rejects(session.setToken("short"), /32/);
  await assert.rejects(createControlSession().setToken(TOKEN), /API base/);
});

test("camera requests bind to the selected encoded ID; concurrent movement shares one lease", async () => {
  const { session, calls } = harness();
  await Promise.all([mutate(session), mutate(session, "/center")]);
  assert.equal(calls.filter((call) => call.path.endsWith("/identity")).length, 1);
  assert.equal(calls.filter((call) => call.path.endsWith("/control/lease")).length, 1);
  const moves = calls.filter((call) => /\/(ptz|center)$/.test(call.path));
  assert.equal(moves.length, 2);
  assert.ok(moves.every((call) => call.path.includes("/devices/camera%20%2F%20one/")));
  assert.ok(moves.every((call) => call.headers.get("X-Camera-Lease") === "lease-1"));
  await session.fetch(BASE + "/api/calibration/status");
  await session.fetch(BASE + "/api/cctv/config");
  assert.equal(calls.at(-2).path, "/calory/api/cctv/devices/camera%20%2F%20one/calibration/status");
  assert.equal(calls.at(-1).path, "/calory/api/cctv/config");
  assert.equal(session.url(BASE + "/api/snapshot?preview=1"), BASE + "/api/cctv/devices/camera%20%2F%20one/snapshot?preview=1");
  session.setCamera("two");
  assert.equal(session.url(BASE + "/api/snapshot"), BASE + "/api/cctv/devices/two/snapshot");
});

test("only identity 404 falls back to legacy routes; authentication and service errors block the movement", async () => {
  for (const status of [404, 401, 503]) {
    const calls = [];
    const session = createControlSession({ base: BASE, storage: memory(), fetchImpl: async (url) => {
      calls.push(url);
      return url.endsWith("/identity") ? json({ error: "identity unavailable" }, status) : json({ ok: true });
    } });
    session.setCamera("one");
    if (status === 404) {
      await mutate(session);
      assert.equal(calls.at(-1), BASE + "/api/ptz");
    } else {
      await assert.rejects(mutate(session), (error) => error.status === status);
      assert.equal(calls.length, 1);
    }
  }
});

test("renewal failure drops stale lease and never retries movement; next explicit input can acquire", async () => {
  const { session, calls, setTime } = harness((call) => call.path.endsWith("/renew")
    ? json({ error: "expired", code: "camera_lease_expired" }, 409) : json({ ok: true }));
  await mutate(session);
  setTime(39000);
  await assert.rejects(mutate(session), (error) => error.body.code === "camera_lease_expired");
  assert.equal(calls.filter((call) => call.path.endsWith("/ptz")).length, 1);
  assert.equal(session.hasLease(), false);
  await mutate(session);
  assert.equal(calls.filter((call) => call.path.endsWith("/ptz")).length, 2);
  assert.equal(calls.at(-1).headers.get("X-Camera-Lease"), "lease-2");
});

test("preempted movement is returned once and clears the lease without automatically replaying", async () => {
  const { session, calls } = harness(() => json({ error: "preempted", code: "camera_lease_preempted" }, 409));
  assert.equal((await mutate(session)).status, 409);
  assert.equal(session.hasLease(), false);
  assert.equal(calls.filter((call) => call.path.endsWith("/ptz")).length, 1);
});

test("successful job start passes and consumes the human lease; failure preserves it", async () => {
  let status = 409;
  const { session, calls } = harness((call) => call.path.endsWith("/start") ? json({ error: "blocked" }, status) : json({ ok: true }));
  await mutate(session);
  await mutate(session, "/height/start");
  assert.equal(session.hasLease(), true);
  status = 200;
  await mutate(session, "/discovery/plate-home/start");
  assert.equal(calls.at(-1).headers.get("X-Camera-Lease"), "lease-1");
  assert.equal(session.hasLease(), false);
});

test("selection release waits for acquisition and invalidates its pending movement", async () => {
  const acquired = deferred(), started = deferred(), calls = [];
  const session = createControlSession({ base: BASE, storage: memory(), fetchImpl: async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/identity")) return json(info);
    if (url.endsWith("/control/lease")) { started.resolve(); return acquired.promise; }
    return json({ ok: true });
  } });
  session.setCamera("one");
  const moving = mutate(session);
  const rejected = assert.rejects(moving, (error) => error.name === "AbortError");
  await started.promise;
  const releasing = session.release("one");
  acquired.resolve(json({ lease: { token: "held", expiresAt: Date.now() + 30000 } }));
  await Promise.all([releasing, rejected]);
  assert.equal(calls.filter((call) => call.url.endsWith("/ptz")).length, 0);
  assert.equal(calls.at(-1).url, BASE + "/api/cctv/devices/one/control/lease/release");
  assert.equal(session.hasLease(), false);
});

test("replacing credential first releases old ownership with its original credential", async () => {
  const { session, calls } = harness();
  await session.setToken(TOKEN);
  await mutate(session);
  await session.setToken(TOKEN + "b");
  const release = calls.find((call) => call.path.endsWith("/release"));
  assert.equal(release.headers.get("authorization"), `Bearer ${TOKEN}`);
  await session.fetch(BASE + "/api/version");
  assert.equal(calls.at(-1).headers.get("authorization"), `Bearer ${TOKEN}b`);
});

test("settings active-camera rebuild releases this tab's lease before the global switch", async () => {
  const { session, calls } = harness();
  await mutate(session);
  await mutate(session, "/cctv/active");
  assert.ok(calls.at(-2).path.endsWith("/control/lease/release"));
  assert.equal(calls.at(-1).path, "/calory/api/cctv/active");
  assert.equal(session.hasLease(), false);
});

test("a scoped backend cannot receive an implicit camera mutation before selection is loaded", async () => {
  const { session, calls } = harness();
  session.setCamera(null);
  await assert.rejects(mutate(session), /Select a camera/);
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 0);
});

test("legacy identity fallback cannot send a movement after the selected camera changes", async () => {
  const identity = deferred(), requests = [];
  const session = createControlSession({ base: BASE, storage: memory(), fetchImpl: async (url, options = {}) => {
    requests.push({ url, options });
    return url.endsWith("/identity") ? identity.promise : json({ ok: true });
  } });
  session.setCamera("one");
  const movement = mutate(session);
  const rejected = assert.rejects(movement, (error) => error.name === "AbortError");
  session.setCamera("two");
  identity.resolve(json({}, 404));
  await rejected;
  assert.equal(requests.filter((request) => request.options.method === "POST").length, 0);
});

test("late camera GET responses are discarded after selection changes", async () => {
  const delayed = deferred(), started = deferred();
  const { session } = harness((call) => {
    if (call.path.endsWith("/discovery/presets")) { started.resolve(); return delayed.promise; }
    return json({});
  });
  const reading = session.fetch(BASE + "/api/discovery/presets");
  const rejected = assert.rejects(reading, (error) => error.name === "AbortError");
  await started.promise;
  session.setCamera("two");
  delayed.resolve(json({ cameraId: "camera / one", presets: [] }));
  await rejected;
});

test("preview streams and capabilities follow the selected camera just like snapshot and control", async () => {
  const { session, calls } = harness();
  await session.fetch(BASE + "/api/cctv/capabilities");
  await session.fetch(BASE + "/api/stream?t=1");
  assert.equal(calls.at(-2).path, "/calory/api/cctv/devices/camera%20%2F%20one/capabilities");
  assert.equal(calls.at(-1).path, "/calory/api/cctv/devices/camera%20%2F%20one/stream");
  session.setCamera("two");
  assert.equal(session.url(BASE + "/api/stream"), BASE + "/api/cctv/devices/two/stream");
  assert.equal(session.url(BASE + "/api/cctv/capabilities"), BASE + "/api/cctv/devices/two/capabilities");
});
