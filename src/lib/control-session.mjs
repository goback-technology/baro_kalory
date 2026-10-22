const CAMERA_PATH = /^\/(?:ptz(?:\/nudge)?|center|center-box|capture-tuning|snapshot|stream|(?:cctv\/)?capabilities|discovery(?:\/.*)?|calibration(?:\/.*)?|height(?:\/.*)?)$/;
const MANUAL_PATH = /^\/(?:ptz(?:\/nudge)?|center|center-box|capture-tuning|discovery\/presets\/[^/]+\/goto)$/;
const JOB_START = /^\/(?:discovery\/plate-home|calibration|height)\/start$/;
const STALE_LEASE = new Set(["camera_lease_expired", "camera_lease_preempted", "stale_camera_lease"]);

function baseUrl(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url;
  } catch { return null; }
}

async function jsonResponse(response) {
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

// One browser tab's session. Tokens are scoped to the complete API base, never a
// URL parameter or localStorage value. Leases remain in memory and expire server-side.
export function createControlSession({ base = "", storage, fetchImpl = (...args) => globalThis.fetch(...args), now = Date.now } = {}) {
  const backend = baseUrl(base);
  const root = backend ? `${backend.origin}${backend.pathname.replace(/\/+$/, "")}` : "";
  const prefix = backend ? `${backend.pathname.replace(/\/+$/, "")}/api/` : "";
  const tokenKey = root ? `baro-control-token:${root}` : null;
  const store = () => storage === undefined ? globalThis.sessionStorage : storage;
  let cameraId = null, generation = 0, identityResult, identityPending = null;
  const leases = new Map(), acquiring = new Map();

  function token() {
    try { return tokenKey ? store()?.getItem(tokenKey) || "" : ""; }
    catch { return ""; }
  }

  function ownUrl(value) {
    if (!backend) return null;
    try {
      const url = new URL(String(value), root + "/");
      return url.origin === backend.origin && url.pathname.startsWith(prefix) ? url : null;
    } catch { return null; }
  }

  function send(url, options = {}) {
    const own = ownUrl(url), secret = own ? token() : "";
    const headers = new Headers(options.headers);
    if (secret) headers.set("authorization", `Bearer ${secret}`);
    // Never forward credentials through redirects, even to a second mount on
    // the same origin. API callers can configure the final base explicitly.
    return fetchImpl(url, { ...options, headers, ...(secret ? { redirect: "error" } : {}) });
  }

  async function identity({ refresh = false } = {}) {
    if (!backend) return null;
    if (refresh) { identityResult = undefined; identityPending = null; }
    if (identityResult !== undefined) return identityResult;
    if (!identityPending) {
      const pending = (async () => {
        const response = await send(`${root}/api/control/identity`, { signal: AbortSignal.timeout(5000), cache: "no-store" });
        if (response.status === 404) return null;
        const body = await jsonResponse(response);
        if (!body || typeof body.required !== "boolean" || (!body.features || typeof body.features !== "object")) throw new Error("Invalid control identity response.");
        return body;
      })();
      identityPending = pending;
      pending.then((result) => { if (identityPending === pending) identityResult = result; }, () => {})
        .finally(() => { if (identityPending === pending) identityPending = null; });
    }
    return identityPending;
  }

  const leaseUrl = (id, action = "") => `${root}/api/cctv/devices/${encodeURIComponent(id)}/control/lease${action}`;

  async function ensureLease(id) {
    if (acquiring.has(id)) return acquiring.get(id);
    const cached = leases.get(id);
    if (cached && cached.expiresAt > now() + 5000) return cached;
    const pending = (async () => {
      const response = await send(leaseUrl(id, cached ? "/renew" : ""), {
        method: "POST", signal: AbortSignal.timeout(5000), headers: { "content-type": "application/json", ...(cached ? { "X-Camera-Lease": cached.token } : {}) },
        body: JSON.stringify(cached ? {} : { purpose: "Browser camera control" }),
      });
      try {
        const body = await jsonResponse(response);
        const lease = body.lease;
        if (!lease || typeof lease.token !== "string" || !Number.isFinite(lease.expiresAt)) throw new Error("Invalid camera lease response.");
        leases.set(id, lease);
        return lease;
      } catch (error) {
        if (response.status === 409 || response.status === 401) leases.delete(id);
        throw error; // A failed renewal must never resend the user's movement.
      }
    })();
    acquiring.set(id, pending);
    try { return await pending; }
    finally { if (acquiring.get(id) === pending) acquiring.delete(id); }
  }

  async function release(id = cameraId) {
    if (!id) return;
    if (id === cameraId) generation += 1;
    // A lease acquisition already in flight must finish before it can be
    // released; generation invalidates the movement that was waiting for it.
    if (acquiring.has(id)) await acquiring.get(id);
    const lease = leases.get(id);
    if (!lease) return;
    try {
      await jsonResponse(await send(leaseUrl(id, "/release"), {
        method: "POST", signal: AbortSignal.timeout(5000), headers: { "content-type": "application/json", "X-Camera-Lease": lease.token }, body: "{}",
      }));
    } catch (error) {
      if (!STALE_LEASE.has(error.body?.code)) throw error;
    }
    if (leases.get(id) === lease) leases.delete(id);
  }

  async function setToken(value) {
    if (!tokenKey) throw new Error("Configure an API base before saving a control token.");
    const next = String(value || "").trim();
    if (next && (next.length < 32 || /\s/.test(next))) throw new Error("Control tokens require at least 32 characters without whitespace.");
    // Release with the old credential. An invalid/expired token can still be
    // replaced; any unreachable old ownership remains governed by its TTL.
    generation += 1;
    await Promise.allSettled([...new Set([...leases.keys(), ...acquiring.keys()])].map((id) => release(id)));
    const target = store();
    if (!target) throw new Error("Session storage is unavailable.");
    if (next) target.setItem(tokenKey, next); else target.removeItem(tokenKey);
    leases.clear(); identityResult = undefined; identityPending = null;
  }

  async function request(url, options = {}) {
    const own = ownUrl(url);
    if (!own) return fetchImpl(url, options);
    const method = String(options.method || "GET").toUpperCase();
    const path = own.pathname.slice(prefix.length - 1);
    // Settings and profile application also switch/rebuild the global active
    // context; release this tab's ownership before those legacy entry points.
    if (method === "POST" && path === "/cctv/active") {
      for (const id of new Set([...leases.keys(), ...acquiring.keys()])) await release(id);
    }
    const selected = cameraId, selectedGeneration = generation;
    let localPath = path, targetId = null, scoped = false;
    if (CAMERA_PATH.test(path)) {
      const info = await identity();
      if (info?.features?.cameraScoped && !selected) {
        throw new Error("Select a camera before sending a camera control request.");
      }
      if (info?.features?.cameraScoped && selected) {
        targetId = selected; scoped = true;
        own.pathname = prefix.slice(0, -1) + `/cctv/devices/${encodeURIComponent(selected)}${path === "/cctv/capabilities" ? "/capabilities" : path}`;
      }
    } else {
      const match = path.match(/^\/cctv\/devices\/([^/]+)(\/.*)$/);
      if (match && CAMERA_PATH.test(match[2])) {
        targetId = decodeURIComponent(match[1]); localPath = match[2]; scoped = true;
      }
    }
    const headers = new Headers(options.headers);
    let lease = null;
    if (scoped && method === "POST" && MANUAL_PATH.test(localPath)) {
      lease = await ensureLease(targetId);
      headers.set("X-Camera-Lease", lease.token);
    } else if (scoped && method === "POST" && JOB_START.test(localPath)) {
      lease = leases.get(targetId);
      if (lease) headers.set("X-Camera-Lease", lease.token);
    }
    if ((scoped || CAMERA_PATH.test(path)) && selectedGeneration !== generation) {
      throw Object.assign(new Error("Camera selection changed before the request was sent."), { name: "AbortError" });
    }
    const response = await send(own.href, { ...options, headers });
    if (method === "GET" && (scoped || CAMERA_PATH.test(path)) && selectedGeneration !== generation) {
      try { await response.body?.cancel(); } catch { /* release an obsolete stream before discarding it */ }
      throw Object.assign(new Error("Camera selection changed while the response was in flight."), { name: "AbortError" });
    }
    if (response.ok && scoped && method === "POST" && JOB_START.test(localPath)) leases.delete(targetId);
    if (lease && response.status === 409) {
      try { if (STALE_LEASE.has((await response.clone().json()).code)) leases.delete(targetId); } catch { /* preserve original response */ }
    }
    return response;
  }

  return {
    fetch: request, identity, release, setToken, hasToken: () => Boolean(token()),
    hasLease: (id = cameraId) => leases.has(id),
    url(value) {
      const own = ownUrl(value);
      if (!own || !cameraId || !identityResult?.features?.cameraScoped) return value;
      const path = own.pathname.slice(prefix.length - 1);
      if (!CAMERA_PATH.test(path)) return value;
      own.pathname = prefix.slice(0, -1) + `/cctv/devices/${encodeURIComponent(cameraId)}${path === "/cctv/capabilities" ? "/capabilities" : path}`;
      return own.href;
    },
    setCamera(id) { if (cameraId !== id) { cameraId = id || null; generation += 1; } },
  };
}
