// Shared browser-side helpers for the CCTV control plane. Native ESM, no build step
// — served as a static file and imported by the UI. Used by every tab so the fetch
// contract and PTZ formatting live in exactly one place.

// ── API base 주입 체인 ────────────────────────────────────────────────────────
// UI 는 어느 오리진(리버스 프록시·CDN·정적 호스트)에서 서빙되든 backend 를 갈아끼울 수
// 있어야 한다. 우선순위: ?api= 쿼리(일회성·공유링크) > localStorage(개인 설정, 설정 화면)
// > <meta name="baro-api-base">(배포 시 주입) > **이 앱이 걸린 마운트**.
// ?api=reset 은 localStorage 를 지우는 탈출구 — 잘못된 주소를 저장해 UI 가 벽돌이 돼도
// 설정 화면 없이 복구할 수 있어야 한다(정적 파일 자체는 base 와 무관하게 항상 뜬다).
//
// **마운트 프리픽스는 앱의 사실이 아니라 배포 결정이다.** 예전에는 여기에 "/barocalory" 가
// 상수로 박혀 있었는데, 그것은 한 호스트에서 여러 서비스를 구분하려고 프록시가 붙인
// 네임스페이스였을 뿐이다. 앱은 자기가 어디에 걸렸는지를 이 모듈의 URL 에서 알아내고,
// backend 도 같은 마운트에 있다고 본다 — 루트(/)든 /barocalory/ 든 /<repo>/ 든 같은 코드가
// 맞는 곳을 친다. 다른 오리진의 backend 를 쓰려면 base 를 명시 지정하면 그쪽이 이긴다.
export const API_BASE_KEY = "baro-api-base";

// base 후보 정규화 — http(s) 절대주소만 채택한다. 스킴 없는 "192.0.2.10" 은 fetch 가
// 상대경로로 해석해 전 API 가 404(벽돌)가 되고, javascript: 등 이상 스킴은 주입 벡터라
// 전부 무효("")로 떨어뜨린다(리뷰 확정 결함). 끝 슬래시만 정규화하고 **경로는 보존한다** —
// backend 가 마운트 아래 있는 배포(`https://호스트/barocalory`)가 정상이기 때문이다.
export function cleanApiBase(v) {
  const s = String(v || "").trim().replace(/\/+$/, "");
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) return "";
  return s;
}

// I/O 없는 해석기 — 테스트를 위해 소스를 주입받는다. 반환: { base, source }.
//
// **추측하지 않는다.** 한때 "같은 마운트에 백엔드가 있겠거니" 하고 자기 오리진을 기본값으로
// 삼았는데, UI 가 백엔드와 분리 배포되는 지금은 그 추측이 틀린 쪽이 정상이다. 게다가 추측을
// 채택하면 설정 화면의 「초기화」가 의미를 잃는다 — 지워도 추측이 즉시 그 자리를 메워서
// "초기화했는데 왜 주소가 남아 있나"가 된다(실제로 그렇게 보고됐다).
//
// 출처를 함께 돌려주는 이유는 화면이 "연결 안 됨"의 원인을 정직하게 갈라 말하기 위해서다 —
// 설정을 안 한 것인가(none), 설정은 했는데 백엔드가 대답을 안 하는가.
export function resolveApiBaseInfoFrom({ search = "", stored = null, meta = null } = {}) {
  const q = new URLSearchParams(search).get("api");
  if (q && q !== "reset") {
    const c = cleanApiBase(q);
    if (c) return { base: c, source: "query" }; // 무효한 쿼리는 무시하고 다음 순위로
  }
  if (q !== "reset" && stored) {
    const c = cleanApiBase(stored);
    if (c) return { base: c, source: "stored" };
  }
  const m = cleanApiBase(meta);
  return m ? { base: m, source: "meta" } : { base: "", source: "none" };
}

// 편의 래퍼 — base 만 필요한 곳(대부분)이 쓴다.
export function resolveApiBaseFrom(src) {
  return resolveApiBaseInfoFrom(src).base;
}

// https 페이지에서 http base 를 부르면 **요청이 발사되지 않는다** — 혼합 콘텐츠 차단이다.
// 이것만은 fetch 를 해 보기 전에 **확정적으로** 알 수 있어서 따로 뽑았다. 나머지 실패
// (네트워크 불가·CORS·DNS)는 브라우저가 전부 같은 TypeError 로 뭉개므로 추측밖에 안 되지만,
// 이 경우는 추측이 아니다.
//
// 왜 굳이 가르나 — 증상이 원인을 가리키지 않기 때문이다. 화면에는 "Failed to fetch" 만
// 남아서 CORS 로 읽히는데, 실제로는 preflight 조차 나가지 않아 CORS 는 무대에 오르지도
// 않는다. 그 안내를 믿으면 백엔드의 cors.origins 를 고치며 시간을 버린다(2026-08-13 실제로 그랬다).
// 이미지(img src)도 안전하지 않다 — 현행 브라우저는 이미지 혼합 콘텐츠를 https 로 자동
// 승격하고, 백엔드에 TLS 가 없으면 승격이 실패해 결국 막힌다.
export function mixedContentBlocked(base, pageProtocol) {
  return String(pageProtocol || "") === "https:" && /^http:\/\//i.test(String(base || ""));
}

// ?api= 파라미터를 주소창에서 제거(replaceState). reset 이 URL 에 남은 채 새로고침·저장을
// 하면 그때마다 저장값이 다시 지워지는 루프가 되므로(리뷰 확정 결함) 소비 즉시 걷어낸다.
export function stripApiParamFromUrl() {
  try {
    const u = new URL(location.href);
    if (!u.searchParams.has("api")) return;
    u.searchParams.delete("api");
    history.replaceState(null, "", u.pathname + (u.searchParams.size ? "?" + u.searchParams : "") + u.hash);
  } catch {}
}

function resolveApiBase() {
  try {
    const q = new URLSearchParams(location.search).get("api");
    if (q === "reset") {
      try { localStorage.removeItem(API_BASE_KEY); } catch {}
      stripApiParamFromUrl(); // reset 은 1회성 — URL 에 남기면 이후 저장을 계속 지운다
    }
    let stored = null;
    try { stored = localStorage.getItem(API_BASE_KEY); } catch {}
    const meta = document.querySelector('meta[name="baro-api-base"]')?.content;
    return resolveApiBaseInfoFrom({ search: location.search, stored, meta });
  } catch {
    return { base: "", source: "none" }; // 브라우저 밖(node 테스트 등)
  }
}

const resolved = resolveApiBase();
export const API_BASE = resolved.base;
// "query"(공유링크·일회성) · "stored"(설정 화면) · "meta"(배포 시 주입) · "none"(미설정).
// page-chrome 이 이 값을 보고 안내를 가른다 — 미설정과 "설정했는데 무응답"은 다른 사실이다.
export const API_BASE_SOURCE = resolved.source;
export const API_BASE_EXPLICIT = resolved.source !== "none";

// fetch 경로: api("/ptz") → "<base>/api/ptz". base 는 마운트까지 포함한 완전한 주소다
// (미지정이면 이 앱의 마운트). backend 는 base-agnostic 이라 프록시 경유든 직결이든 통한다.
export const api = (p) => `${API_BASE}/api${p}`;
// fetch 를 안 타는 경로(img src·MJPEG 스트림·home-frame)용 — api() 만 고치면 이쪽이
// 조용히 동일출처에 남아 원격 base 에서만 이미지가 깨진다. 반드시 이 헬퍼를 쓸 것.
export const asset = (p) => `${API_BASE}${p}`;

export function fmtPtz(p) {
  return p ? `P ${p.panpos}  T ${p.tiltpos}  Z ${p.zoompos}` : "—";
}

export async function getJson(url) {
  return reqJson("GET", url);
}

export async function postJson(url, data = {}) {
  return reqJson("POST", url, data);
}

export async function reqJson(method, url, data) {
  const opt = { method };
  if (data !== undefined) {
    opt.headers = { "content-type": "application/json" };
    opt.body = JSON.stringify(data);
  }
  const r = await fetch(url, opt);
  const j = await r.json();
  if (!r.ok) {
    // 상태코드를 실어 보낸다 — 호출부가 "이 기기엔 그 능력이 없다"(501)와 진짜 장애를
    // 구분해야 하는데, 메시지 문자열을 파싱하게 두면 조용히 어긋난다.
    const err = new Error(j.error || ("HTTP " + r.status));
    err.status = r.status;
    // 본문 전체도 실어 보낸다. 거절이 언제나 문장 하나인 것은 아니다 — 백엔드는 error 말고도
    // code(quality_gate·unknown_device…)·hint 로 "그래서 뭘 해야 하나"를, 발행 게이트는
    // failures[]·noisyAnchors[] 로 "어느 줌이 튀었는지"까지 말한다. 여기서 message 만 뽑으면
    // 그 안내가 통째로 버려지고, 화면에 남는 선택지는 20분 재측정뿐이 된다.
    err.body = j;
    throw err;
  }
  return j;
}
