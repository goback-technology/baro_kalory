// 백엔드 미연결 게이트. 백엔드가 대답하지 않으면 (1) 왜 그런지 배너로 말하고 (2) 그 화면이
// 할 수 있는 일이 없으면 본문 대신 안내를 그린다. 예전에는 같은 마운트에 백엔드가 있다고
// **추측**하고 그대로 진행해서, 분리 배포에서는 첫 화면이 이유 없이 비어 보였다.
//
// 확인은 **한 번의 /version 호출**이다. 따로 헬스체크를 더 치면 부팅마다 왕복이 두 번이 되고,
// 두 결과가 어긋나는 상태까지 생긴다 — 버전 배지와 연결 판정은 같은 응답에서 나와야 한다.
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, API_BASE, API_BASE_EXPLICIT } from "../api.mjs";
import { t } from "../i18n.mjs";
import { pageHref } from "../pages.mjs";
import { gateKind, gateText, backendVersionOf, openWithoutBackend } from "./gate.mjs";

const Ctx = createContext({ status: "probing", version: null, detail: "", kind: "ok", retry: () => {} });
export const useBackend = () => useContext(Ctx);

export function BackendProvider({ children }) {
  const [state, setState] = useState({ status: "probing", version: null, detail: "" });
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    if (!API_BASE_EXPLICIT) { setState({ status: "down", version: null, detail: "" }); return; }
    setState((s) => ({ ...s, status: "probing" }));
    (async () => {
      try {
        const r = await fetch(api("/version"), { signal: AbortSignal.timeout(5000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const version = backendVersionOf(await r.json());
        if (!version) throw new Error("not a baro backend");
        if (alive) setState({ status: "ok", version, detail: "" });
      } catch (e) {
        if (alive) setState({ status: "down", version: null, detail: String((e && e.message) || e).slice(0, 60) });
      }
    })();
    return () => { alive = false; };
  }, [tick]);

  const kind = gateKind({
    explicit: API_BASE_EXPLICIT, base: API_BASE, protocol: location.protocol,
    failed: state.status === "down",
  });
  return <Ctx.Provider value={{ ...state, kind, retry }}>{children}</Ctx.Provider>;
}

// 배너. 링크를 감추지 않는 이유와 같다 — 화면이 사라진 것이 아니라 **아직 쓸 수 없는 것**이고,
// 그 사실과 이유가 보여야 한다.
function GateBanner({ pageId, kind, base, detail }) {
  const { headline, guide } = gateText(kind);
  return (
    <div id="backend-gate" style={{
      padding: "10px 14px", borderBottom: "1px solid var(--color-warn,#ca4)",
      color: "var(--color-warn,#ca4)", font: "13px var(--font-mono)",
      display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
    }}>
      <span>{headline} — {guide}</span>
      {base && <span style={{ opacity: 0.7 }}>API {base}{detail ? ` (${detail})` : ""}</span>}
      {pageId !== "settings" && (
        <a className="navlink" href={pageHref("settings", { fromShell: true })}>{t("설정으로 이동")}</a>
      )}
    </div>
  );
}

// 미연결일 때 그 라우트가 본문을 그릴 수 있는가. 대문과 설정만 그린다 — 나머지는 열어 봐야
// 할 수 있는 일이 없고, 빈 화면을 보여 주는 것보다 이유를 말하는 편이 낫다.
export function BackendGate({ pageId, children }) {
  const { status, kind, detail, retry } = useBackend();
  if (status === "probing") return children;   // 첫 왕복 동안 화면을 깜빡이지 않는다
  if (status === "ok") return children;
  return (
    <>
      <GateBanner pageId={pageId} kind={kind} base={API_BASE} detail={detail} />
      {openWithoutBackend(pageId) ? children : (
        <main>
          <div className="card">
            <h2>{gateText(kind).headline}</h2>
            <p className="hint">{gateText(kind).guide}</p>
            <div className="row" style={{ marginTop: 10, gap: 8 }}>
              <a className="navlink" href={pageHref("settings", { fromShell: true })}>{t("설정으로 이동")}</a>
              <button onClick={retry}>{t("다시 확인")}</button>
            </div>
          </div>
        </main>
      )}
    </>
  );
}
