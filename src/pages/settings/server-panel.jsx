// 서버 탭 — API 서버 base 카드 + 서비스 상태 카드.
//
// 벽돌 방지 설계(원본 그대로): base 카드는 API 호출 없이 렌더된다(정적 파일은 base 와
// 무관하게 항상 뜸). 저장 전 /api/version 프로브로 경고하되 강행은 허용(아직 안 뜬
// backend 를 미리 지정하는 경우). 탈출구는 주소창 ?api=reset.
import { useEffect, useState } from "react";
import { getJson, postJson, api, API_BASE, API_BASE_EXPLICIT, API_BASE_KEY, cleanApiBase, mixedContentBlocked, stripApiParamFromUrl } from "../../api.mjs";
import { t } from "../../i18n.mjs";
import { classifyProbeError, probeReportText } from "./actions.mjs";

// 입력값 정규화. **테스트와 저장이 같은 규칙을 써야 한다** — 따로 두면 "테스트는 통과했는데
// 저장된 건 다른 주소" 라는 최악의 어긋남이 생긴다.
function typedBase(raw) {
  raw = raw.trim();
  if (!raw) return "";
  // 스킴 생략("192.0.2.10")은 fetch 가 상대경로로 해석해 벽돌이 된다 — http:// 보정.
  if (!/^https?:\/\//i.test(raw)) raw = "http://" + raw;
  // 끝슬래시 정규화 + http(s) 검증. 경로는 보존한다 — 마운트를 포함한 주소가 정상이다.
  return cleanApiBase(raw);
}

// 프로브 — r.ok 와 **버전 필드까지** 본다. 엉뚱한 주소도 404 JSON 이 파싱은 되므로(캐치올)
// ok 검사 없이는 "확인됨: vundefined" 로 벽돌을 승인하게 된다.
async function probeBase(v) {
  // 부르기 전에 끝나는 경우 하나 — https 페이지 + http 주소는 브라우저가 요청을 막는다.
  // 실제로 시도하면 CORS 와 구분이 안 되는 TypeError 만 남으므로 여기서 먼저 가른다.
  if (mixedContentBlocked(v, location.protocol)) return { ok: false, kind: "mixed-content" };
  try {
    const r = await fetch(`${v}/api/version`, { signal: AbortSignal.timeout(4000) });
    let j = null;
    try { j = await r.json(); } catch { /* JSON 이 아닌 응답 — 아래에서 실패로 다룬다 */ }
    if (r.ok && j && (j.backendVersion || j.version)) {
      return { ok: true, version: j.backendVersion || j.version, upstream: r.headers.get("x-baro-upstream") };
    }
    return { ok: false, kind: "not-baro", reason: (j && j.error) || `HTTP ${r.status}` };
  } catch (e) { return classifyProbeError(e); }
}

export function ApiBaseCard() {
  // 입력칸은 **설정값만** 보여 준다. 추측한 주소나 현재 오리진을 채워 넣지 않는다 —
  // 채우면 「초기화」를 눌러도 값이 남아 있는 것처럼 보여서, 지워졌는지를 화면으로 구분할
  // 수 없게 된다(실제 보고된 혼란: 초기화했는데 자기 호스트 주소가 남았다).
  const [value, setValue] = useState(API_BASE_EXPLICIT ? API_BASE : "");
  const [status, setStatus] = useState(API_BASE_EXPLICIT ? "" : t("미설정 — 백엔드 주소를 지정해야 나머지 화면이 동작합니다"));

  useEffect(() => {
    if (!API_BASE_EXPLICIT) return;
    // 프록시 뒤의 실제 backend 는 프록시만 안다(브라우저에는 프록시 주소로만 보인다).
    // X-Baro-Upstream 이 있으면 그것까지 보여 준다 — 어느 backend 를 보는지가 제일 위험한 오해다.
    let alive = true;
    (async () => {
      try {
        const r = await fetch(api("/version"), { signal: AbortSignal.timeout(4000) });
        const upstream = r.headers.get("x-baro-upstream");
        if (alive && upstream) setStatus(`${t("연결됨")} · upstream ${upstream}`);
      } catch { /* 연결 실패는 page-chrome 게이트와 '서비스 상태' 카드가 진단한다 */ }
    })();
    return () => { alive = false; };
  }, []);

  const badForm = () => setStatus(t("주소 형식이 올바르지 않습니다") + ` (http:// ${t("또는")} https://)`);

  const onTest = async () => {
    const v = typedBase(value);
    if (!v) { badForm(); return; }
    setValue(v);                             // 정규화 결과를 눈으로 확인시킨다
    setStatus(t("확인 중") + "…");
    setStatus(probeReportText(v, await probeBase(v)));   // 테스트는 저장하지 않는다 — 확인만 한다
  };

  const onClear = () => {
    try { localStorage.removeItem(API_BASE_KEY); } catch { /* 저장소 사용 불가 */ }
    stripApiParamFromUrl();
    location.reload();
  };

  const onSave = async () => {
    if (!value.trim()) { onClear(); return; }
    const v = typedBase(value);
    if (!v) { badForm(); return; }
    setValue(v);
    setStatus(t("확인 중") + "…");
    const probe = await probeBase(v);
    setStatus(probeReportText(v, probe));
    if (!probe.ok) {
      // 혼합 콘텐츠는 "백엔드가 응답하지 않는다" 가 아니다 — 백엔드는 멀쩡할 수 있고 이
      // 화면이 부르지 못할 뿐이다. 저장 자체는 말릴 일이 아니고(http 출처에서 열면 바로
      // 쓴다), 이 페이지에서는 안 붙는다는 사실만 정확히 알린다.
      const head = probe.kind === "mixed-content"
        ? `${v} ` + t("는 이 페이지(https)에서 부를 수 없습니다 — 혼합 콘텐츠로 브라우저가 막습니다.")
        : `${v} ` + t("는 baro backend 로 응답하지 않습니다") + ` (${probe.reason}).`;
      const go = confirm(head + "\n" +
        t("그래도 저장할까요? 저장 후 화면이 멈추면 주소 뒤에 ?api=reset 을 붙여 여세요."));
      if (!go) { setStatus(t("저장 취소")); return; }
    }
    try { localStorage.setItem(API_BASE_KEY, v); } catch { /* 저장소 사용 불가 */ }
    stripApiParamFromUrl(); // ?api= 잔류 쿼리가 방금 저장한 값을 덮거나 지우는 것 방지
    location.reload();
  };

  return (
    <div className="card">
      <h2>API 서버</h2>
      <div className="row" style={{ gap: 8 }}>
        <input id="apibase-input" data-i18n-skip type="text" style={{ flex: 1, minWidth: 0 }}
          placeholder="http://<백엔드호스트>:8080"
          value={value} onChange={(e) => setValue(e.target.value)} />
        <button id="apibase-test" onClick={onTest}>연결 테스트</button>
        <button id="apibase-save" onClick={onSave}>저장</button>
        <button id="apibase-clear" onClick={onClear}>초기화</button>
      </div>
      <div id="apibase-status" className="hint" style={{ marginTop: 6 }}>{status}</div>
    </div>
  );
}

// 서비스 상태 자동 확인: 백엔드+카메라(/api/health), 검출기+LPR(probe-detection), LLM.
// 검출기·LPR·LLM 의 **입력칸 값**을 시험한다 — 값은 검출·판독 탭의 폼(detect)에서 온다.
export function StatusCard({ detect, statusTick }) {
  const [chips, setChips] = useState({ backend: null, camera: null, detector: null, lpr: null, llm: null });
  const [llmTitle, setLlmTitle] = useState("");

  const refresh = async () => {
    try {
      const h = await getJson(api("/health"));
      setChips((c) => ({ ...c, backend: true, camera: !!h.ok }));
    } catch { setChips((c) => ({ ...c, backend: false, camera: false })); }
    try {
      const r = await postJson(api("/cctv/probe-detection"), { detector: detect.detector.trim(), lpr: detect.lpr.trim() });
      setChips((c) => ({ ...c, detector: !!(r.detector && r.detector.reachable), lpr: !!(r.lpr && r.lpr.reachable) }));
    } catch { setChips((c) => ({ ...c, detector: false, lpr: false })); }
    // LLM 칩만 상태가 셋이다 — **붙는 것과 지금 추론할 수 있는 것은 다른 사실**이고(게이트
    // 웨이는 warmup 이 끝나야 답한다), 그 둘을 ❌ 하나로 뭉개면 화면이 "왜"를 못 말한다.
    // mode 를 안 보내므로 연결 확인이다 — 추론 슬롯을 쓰지 않아 자동 확인에 걸어도 된다.
    try {
      const r = await postJson(api("/cctv/probe-llm"), { url: detect.llmUrl.trim() });
      if (!r.reachable) { setChips((c) => ({ ...c, llm: "down" })); setLlmTitle(r.error || "unreachable"); }
      else if (r.ready === false) {
        setChips((c) => ({ ...c, llm: "warming" }));
        setLlmTitle(t("붙었지만 아직 추론할 수 없습니다") + (r.readyDetail ? ` — ${r.readyDetail}` : ""));
      } else {
        setChips((c) => ({ ...c, llm: "up" }));
        setLlmTitle((r.models || []).map((m) => m.id).join(" · "));
      }
    } catch (e) { setChips((c) => ({ ...c, llm: "down" })); setLlmTitle(String(e.message || e)); }
  };

  // 페이지를 열면 자동 확인 — 설정 로드가 폼을 채운 뒤에 돈다(statusTick 이 그 신호다).
  useEffect(() => { if (statusTick) refresh(); }, [statusTick]);   // eslint-disable-line react-hooks/exhaustive-deps

  const mark = (ok) => (ok === null ? "…" : ok ? "✅" : "❌");
  const llmMark = chips.llm === null ? "…" : chips.llm === "up" ? "✅" : chips.llm === "warming" ? "⏳" : "❌";
  return (
    <div className="card">
      <h2>서비스 상태</h2>
      <div className="row" style={{ gap: 16, fontSize: 13 }}>
        <span id="st-backend">{t("백엔드")} {mark(chips.backend)}</span>
        <span id="st-camera">{t("카메라")} {mark(chips.camera)}</span>
        <span id="st-detector">{t("검출기")} {mark(chips.detector)}</span>
        <span id="st-lpr">LPR {mark(chips.lpr)}</span>
        <span id="st-llm" title={llmTitle}>LLM {llmMark}</span>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button id="set-refresh-status" onClick={refresh}>상태 새로고침</button>{" "}
        <span className="hint">페이지를 열면 자동 확인합니다</span>
      </div>
    </div>
  );
}

export function ServerPanel({ detect, statusTick }) {
  return (
    <section data-panel="server" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <ApiBaseCard />
      <StatusCard detect={detect} statusTick={statusTick} />
    </section>
  );
}
