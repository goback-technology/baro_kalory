import { useEffect, useRef, useState } from "react";
import { api, apiFetch } from "../../lib/api.mjs";
import { t } from "../../i18n/index.mjs";
import { analyticsPath, createAnalyticsStream, detectionAgeMs, nativeBoxes, analyzeDisplayedFrame } from "../../camera/analytics.mjs";

const STATES = {
  unsupported: "내장 분석 미지원", disabled: "내장 AI 모델 꺼짐", idle: "수신 대기",
  connecting: "연결 중", streaming: "수신 중", no_metadata: "AI 메타데이터 대기",
  disconnected: "재연결 중", stale: "결과 지연", error: "수신 오류",
};

export default function NativeAnalyticsPanel({ cameraId }) {
  const [status, setStatus] = useState({ state: "idle" });
  const [running, setRunning] = useState(false);
  const [checking, setChecking] = useState(true);
  const [pair, setPair] = useState(null);
  const [loadedFrame, setLoadedFrame] = useState(null);
  const [error, setError] = useState("");
  const [oni, setOni] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [now, setNow] = useState(Date.now);
  const stream = useRef(null), analysis = useRef(null);

  useEffect(() => {
    const abort = new AbortController();
    let disposed = false;
    const client = createAnalyticsStream({
      cameraId, api,
      onFrame: (frame) => { setPair(frame); setLoadedFrame(null); setError(""); },
      onStatus: (next) => {
        setStatus((previous) => ({ ...previous, ...next }));
        if (["disabled", "unsupported"].includes(next.state)) setRunning(false);
      },
      onError: (e) => setError(e.message),
    });
    stream.current = client;
    apiFetch(api(analyticsPath(cameraId, "status")), { signal: abort.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        if (!disposed) setStatus(result);
      }).catch((e) => { if (!disposed && e.name !== "AbortError") setError(e.message); })
      .finally(() => { if (!disposed) setChecking(false); });
    const tick = setInterval(() => setNow(Date.now()), 500);
    // Background tabs release their subscription. Resuming is an explicit action.
    const pause = () => {
      if (document.hidden) { client.stop(); setRunning(false); }
    };
    const leave = () => client.stop();
    document.addEventListener("visibilitychange", pause);
    window.addEventListener("pagehide", leave);
    return () => {
      disposed = true; abort.abort(); analysis.current?.abort(); client.destroy();
      clearInterval(tick);
      document.removeEventListener("visibilitychange", pause);
      window.removeEventListener("pagehide", leave);
    };
  }, [cameraId]);

  function start() {
    analysis.current?.abort(); analysis.current = null;
    setAnalyzing(false); setOni(null); setError(""); setRunning(true);
    setStatus((previous) => ({ ...previous, state: "connecting" }));
    stream.current.start();
  }

  function stop() { stream.current.stop(); setRunning(false); }

  async function analyze() {
    // Hold the exact Blob shown in the panel. Never ask /snapshot for a newer image.
    const selected = pair;
    stop(); setOni(null); setError(""); setAnalyzing(true);
    const abort = new AbortController();
    analysis.current = abort;
    try {
      const result = await analyzeDisplayedFrame(selected, { api, signal: abort.signal });
      if (!abort.signal.aborted) setOni(result);
    } catch (e) {
      if (!abort.signal.aborted) setError(e.message);
    } finally {
      if (!abort.signal.aborted) setAnalyzing(false);
    }
  }

  const detection = pair?.detection;
  const frameKey = detection ? `${detection.streamEpoch}:${detection.frameId}` : null;
  const boxes = nativeBoxes(detection);
  const age = detectionAgeMs(pair, now);
  const stale = !!detection && (status.stale || detection.stale
    || (status.streamEpoch && status.streamEpoch !== detection.streamEpoch)
    || age > (status.staleAfterMs || 5000));
  const disabled = status.supported === false || status.enabled === false || ["unsupported", "disabled"].includes(status.state);
  const stateLabel = !running && !disabled && !error && !status.error ? "수신 대기" : (STATES[status.state] || "수신 대기");
  const oniResult = oni?.payload?.result;
  const oniBoxes = Array.isArray(oniResult?.bboxes) ? oniResult.bboxes : [];
  return (
    <section className="card native-analytics" aria-label={t("카메라 내장 분석")}>
      <div className="native-analytics-heading">
        <h2>{t("카메라 내장 분석")}</h2>
        <span className="hint">FlexWATCH · camera-native</span>
      </div>
      <div className="row">
        <button onClick={start} disabled={checking || running || disabled}>{t("수신 시작")}</button>
        <button onClick={stop} disabled={!running}>{t("수신 정지")}</button>
        <button onClick={analyze} disabled={!pair || loadedFrame !== frameKey || analyzing}>{t("현재 프레임 ONI 분석")}</button>
      </div>
      <p className="hint" role="status">
        {!running && pair ? t("화면 고정") : t(stateLabel)}
        {status.model ? ` · ${status.model}` : ""}
        {age !== null ? ` · ${t("검출 갱신 후 {s}초", { s: (age / 1000).toFixed(1) })}` : ""}
        {stale ? ` · ${t("지난 결과")}` : ""}
      </p>
      {(error || status.error?.message) && <p className="native-analytics-error" role="alert">{error || status.error.message}</p>}
      {pair ? <>
        <div className="native-analytics-frame" style={{ aspectRatio: `${detection.image.width}/${detection.image.height}` }}>
          <img key={frameKey} src={pair.url} alt={t("내장 검출 대응 영상")}
               onLoad={(event) => {
                 if (event.currentTarget.naturalWidth === detection.image.width && event.currentTarget.naturalHeight === detection.image.height) setLoadedFrame(frameKey);
                 else { setLoadedFrame(null); setError(t("영상 크기와 검출 좌표가 일치하지 않습니다")); }
               }} onError={() => { setLoadedFrame(null); setError(t("검출 대응 영상을 읽을 수 없습니다")); }} />
          {loadedFrame === frameKey && <svg viewBox={`0 0 ${detection.image.width} ${detection.image.height}`} aria-label={t("내장 검출 박스")}>
            {boxes.map((object, index) => <g key={`${object.trackId}:${index}`}>
              <rect {...object.bbox} fill="none" stroke="#58e2b1" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              <text x={object.bbox.x > detection.image.width * 0.65 ? object.bbox.x + object.bbox.width - 3 : object.bbox.x + 3}
                    textAnchor={object.bbox.x > detection.image.width * 0.65 ? "end" : "start"}
                    y={Math.max(16, object.bbox.y - 4)} fontSize={Math.max(12, detection.image.width / 65)}>
                {object.className} #{object.trackId} {Math.round(object.confidence * 100)}%
              </text>
            </g>)}
          </svg>}
        </div>
        <p className="hint">
          {t("내장 검출 {n}개", { n: boxes.length })} · {detection.image.width}×{detection.image.height}
          <span title={t("같은 패킷의 영상과 결과입니다. 카메라의 추론 시각과 촬영 시각이 정확히 일치하는지는 확인되지 않았습니다.")}> · {t("영상·결과 대응 ⓘ")}</span>
        </p>
      </> : !disabled && <p className="hint">{running ? t("AI 메타데이터 대기") : t("수신을 시작하면 내장 검출과 대응 영상이 표시됩니다.")}</p>}
      {analyzing && <p role="status">{t("고정된 프레임을 ONI로 분석 중…")}</p>}
      {oni && <div className="det-result">
        <b>ONI · {t("고정된 프레임 분석")}</b>
        <p className="hint">{t("차량 {n}개 · {ms}ms", { n: oniBoxes.length, ms: Math.round(oni.payload.latencyMs || 0) })}</p>
        {oniBoxes.map((box, i) => <div key={i} className="det-line">
          {oniResult.classes?.[i] || "car"} · {Math.round((oniResult.confidences?.[i] || 0) * 100)}% · [{box.map((n) => Math.round(n)).join(", ")}]
        </div>)}
      </div>}
    </section>
  );
}
