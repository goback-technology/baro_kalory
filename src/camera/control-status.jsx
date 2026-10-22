import { useEffect, useRef, useState } from "react";
import { api, releaseCameraControl, hasCameraLease, getControlIdentity } from "../lib/api.mjs";
import { useJobPoll } from "../lib/use-job-poll.mjs";
import { t } from "../i18n/index.mjs";
import { useCamera } from "./provider.jsx";
import { controlSummary, loadCameraControl, retryCameraRecovery, loadControlHistory } from "./control.mjs";

export function CameraControlStatus() {
  const { activeId, loaded, switching } = useCamera();
  return loaded && activeId && !switching ? <ControlStatus key={activeId} cameraId={activeId} /> : null;
}

function ControlStatus({ cameraId }) {
  const [control, setControl] = useState(null);
  const [unsupported, setUnsupported] = useState(false);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [auditEnabled, setAuditEnabled] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState({ events: [], nextCursor: 0, more: true });
  const [historyError, setHistoryError] = useState("");
  const [historyBusy, setHistoryBusy] = useState(false);
  const historyLoading = useRef(false);
  const alive = useRef(true);
  const requests = useRef(new Set());
  const generation = useRef(0);
  const recovering = useRef(false);

  useEffect(() => {
    alive.current = true;
    getControlIdentity().then((info) => { if (alive.current) setAuditEnabled(info?.features?.audit === true); }).catch(() => {});
    return () => {
      alive.current = false;
      generation.current += 1;
      for (const request of requests.current) request.abort();
      requests.current.clear();
    };
  }, []);

  async function refresh() {
    if (!alive.current || recovering.current) return;
    const token = ++generation.current;
    const request = new AbortController();
    requests.current.add(request);
    try {
      const next = await loadCameraControl(cameraId, {
        api, signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]),
      });
      if (!alive.current || token !== generation.current) return;
      setUnsupported(next === null);
      setControl(next);
      setError("");
    } catch (e) {
      if (alive.current && token === generation.current) setError(e.message || String(e));
    } finally { requests.current.delete(request); }
  }

  useJobPoll(refresh, { intervalMs: 2000, enabled: !unsupported, pauseWhen: () => recovering.current });

  async function recover() {
    if (recovering.current) return;
    recovering.current = true;
    generation.current += 1; // A GET started before recovery cannot replace its result.
    for (const request of requests.current) request.abort();
    const request = new AbortController();
    requests.current.add(request);
    setRetrying(true);
    setError("");
    try {
      const next = await retryCameraRecovery(cameraId, { api, signal: request.signal });
      if (alive.current) setControl(next);
    } catch (e) {
      if (alive.current) setError(e.message || String(e));
    } finally {
      requests.current.delete(request);
      recovering.current = false;
      if (alive.current) {
        setRetrying(false);
        // Recovery errors can still change the server's state. Always read it again.
        await refresh();
      }
    }
  }

  async function release() {
    if (recovering.current) return;
    recovering.current = true;
    setRetrying(true); setError("");
    try { await releaseCameraControl(cameraId); }
    catch (e) { if (alive.current) setError(e.message || String(e)); }
    finally {
      recovering.current = false;
      if (alive.current) { setRetrying(false); await refresh(); }
    }
  }

  async function readHistory(reset = false) {
    if (historyLoading.current) return;
    historyLoading.current = true;
    setHistoryBusy(true); setHistoryError("");
    const request = new AbortController();
    requests.current.add(request);
    try {
      const result = await loadControlHistory(cameraId, {
        api, after: reset ? 0 : history.nextCursor,
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]),
      });
      if (alive.current) setHistory((previous) => ({
        events: reset ? result.events : [...previous.events, ...result.events],
        nextCursor: result.nextCursor, more: result.events.length === 25,
      }));
    } catch (e) { if (alive.current) setHistoryError(e.message || String(e)); }
    finally { requests.current.delete(request); historyLoading.current = false; if (alive.current) setHistoryBusy(false); }
  }

  const summary = controlSummary(control);
  if (unsupported || (!summary && !error && !retrying && !auditEnabled)) return null;
  const warning = !!error || summary?.warn;
  return (
    <section data-role="camera-control-status" aria-live="polite" style={{
      padding: "10px 14px", borderBottom: "1px solid var(--color-line)",
      color: warning ? "var(--color-warn)" : "var(--color-fg)",
      display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 13,
    }}>
      <strong>{error ? t("카메라 제어 상태 미확인") : retrying ? t("처리 중…") : summary?.label}</strong>
      <span>{error || summary?.detail}</span>
      {summary?.canRetry && !error && <button onClick={recover} disabled={retrying}>
        {t("원위치 복귀 재시도")}
      </button>}
      {summary?.manual && hasCameraLease(cameraId) && !error && <button onClick={release} disabled={retrying}>
        {t("제어권 반납")}
      </button>}
      {error && <button onClick={refresh} disabled={retrying}>{t("다시 확인")}</button>}
      {auditEnabled && <button onClick={() => {
        setHistoryOpen(!historyOpen);
        if (!historyOpen && !history.events.length) readHistory(true);
      }}>{t("사용 기록")}</button>}
      {historyOpen && <div data-role="camera-control-history" style={{ width: "100%" }}>
        <p className="hint">{t("오래된 기록부터 시간순으로 표시합니다.")}</p>
        {historyError && <p role="alert">{historyError}</p>}
        <div style={{ overflowX: "auto", maxHeight: 260 }}>
          <table style={{ width: "100%", fontSize: 12 }}>
            <thead><tr><th>{t("시각")}</th><th>{t("호출자")}</th><th>{t("작업")}</th><th>{t("결과")}</th></tr></thead>
            <tbody>{history.events.map((entry) => <tr key={entry.seq}>
              <td>{entry.timestamp}</td>
              <td>{[entry.actor?.kind, entry.actor?.id].filter(Boolean).join(" / ")}</td>
              <td>{[entry.operation, entry.command, entry.purpose].filter(Boolean).join(" · ")}</td>
              <td>{[entry.event, entry.result, entry.code].filter(Boolean).join(" · ")}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {!historyBusy && !history.events.length && !historyError && <p>{t("사용 기록이 없습니다.")}</p>}
        <div className="row" style={{ gap: 8, marginTop: 6 }}>
          <button disabled={historyBusy} onClick={() => readHistory(true)}>{t("처음부터 다시 읽기")}</button>
          {history.more && <button disabled={historyBusy} onClick={() => readHistory()}>{t("다음 25개")}</button>}
        </div>
      </div>}
    </section>
  );
}
