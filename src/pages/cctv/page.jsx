// CCTV 제어 · 모니터링 — 라이브 프리뷰 위에서 클릭 센터링·박스줌, PTZ 패드, 검출 테스트.
//
// 좌표 계산과 검출 판정은 전부 actions.mjs 가 값으로 든다. 여기서는 그리기와 왕복만 한다 —
// 특히 「그린 쪽이 센다」는 규칙(화면은 비었는데 개수를 말하는 상태 방지)이 그쪽에 있다.
import { useCallback, useEffect, useRef, useState } from "react";
import { getJson, postJson, api, fmtPtz } from "../../api.mjs";
import { t } from "../../i18n.mjs";
import { useCamera } from "../../app/camera-provider.jsx";
import { useCameraPreview } from "../../app/hooks/use-camera-preview.mjs";
import { useJobPoll } from "../../app/hooks/use-job-poll.mjs";
import { usePtzControls, PtzPad, AbsoluteMove } from "../../components/ptz-pad.jsx";
import { useStagePointer } from "../../components/use-stage-pointer.mjs";
import {
  detectorOverlay, detectorResultCard, fmtWithHeight, ptzErrorText, mountHeightFrom, snapshotName,
} from "./actions.mjs";
import "./cctv.css";

const enc = encodeURIComponent;
const SNAP_RES_KEY = "cctv:snap-res.v1";
const CROSSHAIR_KEY = "cctv:crosshair.v1";
const read = (k, dflt) => { try { return localStorage.getItem(k) ?? dflt; } catch { return dflt; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 저장소 사용 불가 */ } };

const DET_TARGETS = [
  ["det-test-vpd", "VPD 테스트", ["vpd"]],
  ["det-test-lpd", "LPD 테스트", ["lpd"]],
  ["det-test-lpr", "LPR 테스트", ["lpr"]],
  ["det-test-vpd3d", "3D Box 검출", ["vpd_3d"]],
  ["det-test-all", "전체 테스트", ["vpd", "lpd", "lpr", "vpd_3d"]],
];

export default function CctvPage() {
  const cam = useCamera();
  const [lines, setLines] = useState([]);
  const log = useCallback((msg) => {
    setLines((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 200));
  }, []);

  const [lastPtz, setLastPtz] = useState(null);
  const [ptzText, setPtzText] = useState("—");
  const [mountHeightCm, setMountHeightCm] = useState(null);
  const [busy, setBusy] = useState("");
  const [marker, setMarker] = useState(null);          // { left, top } | null
  const [overlay, setOverlay] = useState(null);        // detectorOverlay 결과
  const [detCards, setDetCards] = useState([]);
  const [detStatus, setDetStatus] = useState("");
  const [detBusy, setDetBusy] = useState(false);
  const [crosshair, setCrosshair] = useState(() => read(CROSSHAIR_KEY, "on") !== "off");
  const [ptzOverlayOn, setPtzOverlayOn] = useState(true);
  const [snapRes, setSnapRes] = useState(() => read(SNAP_RES_KEY, "full"));
  const [snapBusy, setSnapBusy] = useState(false);
  const stageRef = useRef(null);

  const preview = useCameraPreview({
    storageKey: "control", wantedKey: "control:preview-on.v1", log,
  });

  const setPtz = useCallback((ptz, heightCm) => {
    setLastPtz(ptz);
    setPtzText(fmtWithHeight(fmtPtz, ptz, heightCm === undefined ? mountHeightCm : heightCm));
  }, [mountHeightCm]);

  // ── 설치 높이 ──────────────────────────────────────────────────────────────
  // PTZ 옆에 H 를 붙인다. 3D 박스 검출이 서는 자리가 정확히 이 값 위이기 때문이다 — 높이를
  // 모르면 큐보이드의 거리와 크기가 통째로 배율만큼 틀린다. 그래서 화면에 늘 보여야 한다.
  const loadMountHeight = useCallback(async () => {
    let id = "";
    try { id = (await getJson(api("/cctv/capabilities"))).cameraId || ""; } catch { /* 기기 무응답 */ }
    if (!id) { setMountHeightCm(null); return; }
    let profileHeightM = null;
    try { profileHeightM = (await getJson(api(`/profiles/camera/${enc(id)}`)))?.extrinsic?.mount?.heightM ?? null; }
    catch { /* 미발행·미측량 */ }
    let sceneCameras = [];
    if (profileHeightM === null || profileHeightM === undefined) {
      try { sceneCameras = (await getJson(api("/simulator/cameras"))).cameras || []; } catch { /* 시뮬 미연결 */ }
    }
    setMountHeightCm(mountHeightFrom({ profileHeightM, sceneCameras, cameraId: id }));
  }, []);

  // 높이는 카메라마다 다르다 — 전환하고도 옛 값을 그대로 두면 새 카메라의 3D 가 남의
  // 설치 높이로 읽힌다.
  useEffect(() => { if (cam.loaded) loadMountHeight(); }, [cam.loaded, cam.activeId, loadMountHeight]);
  useEffect(() => { setPtzText((prev) => (lastPtz ? fmtWithHeight(fmtPtz, lastPtz, mountHeightCm) : prev)); }, [mountHeightCm, lastPtz]);

  // ── PTZ 폴링 ──────────────────────────────────────────────────────────────
  // 숨겨진 탭에서는 카메라를 깨우지 않는다. 예전에는 가드 없이 800ms 마다 영구히 돌아,
  // 아무도 안 보는 탭 하나가 하루 10만 건 넘게 카메라 HTTP 를 두드렸다(useJobPoll 의 가드).
  const readPtz = useCallback(async () => {
    try {
      const ptz = await getJson(api("/ptz"));
      setLastPtz(ptz);
      setPtzText(fmtWithHeight(fmtPtz, ptz, mountHeightCm));
    } catch (e) {
      setLastPtz(null);
      setPtzText(ptzErrorText(e));
    }
  }, [mountHeightCm]);
  useJobPoll(readPtz, { intervalMs: 800 });

  // ── 조작 ──────────────────────────────────────────────────────────────────
  const ctl = usePtzControls({
    lastPtz, log,
    onPtz: (ptz) => setPtz(ptz),
    onBusy: (on, label) => setBusy(on ? t(label || "카메라 이동 중…") : ""),
  });

  const centerAt = useCallback(async (p) => {
    setMarker({ left: p.px, top: p.py });
    setBusy(t("카메라 이동 중…"));
    // 클릭 시점부터 표시 영상을 감시: 원(마커)은 서버 정착 응답이 아니라 "화면에 보이는"
    // 팬이 끝난 뒤에 중앙 십자로 옮긴다(프리뷰는 1~2초 지연).
    const motion = preview.preview()?.watchDisplayedMotion();
    try {
      const j = await postJson(api("/center"), {
        x: p.x, y: p.y, frameWidth: p.nw, frameHeight: p.nh, speed: ctl.speedOf(),
      });
      setPtz(j.ptz);
      await motion?.settled();
      const stage = stageRef.current;
      if (stage) setMarker({ left: stage.clientWidth / 2, top: stage.clientHeight / 2 });
      log(t("센터링 ({x}, {y}) → {p}", { x: p.x, y: p.y, p: fmtPtz(j.ptz) }));
    } catch (err) {
      log(t("센터링 실패") + ": " + err.message);
    } finally {
      motion?.stop();
      setBusy("");
    }
  }, [ctl, log, preview, setPtz]);

  const zoomBox = useCallback(async (box, from) => {
    setMarker(null);
    setBusy(t("카메라 이동 중…"));
    try {
      const j = await postJson(api("/center-box"), { ...box, frameWidth: from.nw, frameHeight: from.nh, speed: ctl.speedOf() });
      setPtz(j.ptz);
      log(t("박스줌 ({x1},{y1})-({x2},{y2}) → {p}",
        { x1: box.startX, y1: box.startY, x2: box.endX, y2: box.endY, p: fmtPtz(j.ptz) }));
    } catch (err) {
      log(t("박스줌 실패") + ": " + err.message);
    } finally { setBusy(""); }
  }, [ctl, log, setPtz]);

  const pointer = useStagePointer({ imgRef: preview.imgRef, onClick: centerAt, onBox: zoomBox, enabled: !busy });

  // ── 스크린샷 ──────────────────────────────────────────────────────────────
  // 화면에 보이는 프레임과 카메라 원본은 같은 그림이 아니다. 프리뷰는 720p 스트림이거나
  // ?preview=1 로 스트림에서 떠 온 저해상 프레임이라(그래야 카메라를 새로 돌리지 않는다),
  // 그걸 캔버스로 복사하면 화면 해상도가 그대로 파일이 된다. "원본"은 ?preview=1 없이
  // /api/snapshot 을 받는다 = 추론이 쓰는 그 원본이고, 재인코딩 없이 그대로 저장한다.
  const saveBlob = useCallback((blob, suffix) => {
    const name = snapshotName(cam.activeId, new Date(), suffix);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return name;
  }, [cam.activeId]);

  const shoot = useCallback(async () => {
    setSnapBusy(true);
    try {
      if (snapRes === "screen") {
        const view = preview.imgRef.current;
        if (!view?.naturalWidth || !view?.naturalHeight) { log(t("스크린샷 실패: 표시 중인 영상 프레임이 없습니다")); return; }
        const cv = document.createElement("canvas");
        cv.width = view.naturalWidth; cv.height = view.naturalHeight;
        cv.getContext("2d").drawImage(view, 0, 0);
        await new Promise((resolve) => cv.toBlob((blob) => {
          if (!blob) { log(t("스크린샷 실패: 인코딩 오류")); resolve(); return; }
          log(t("스크린샷 저장: {name}", { name: saveBlob(blob, "-screen") }) + ` (${cv.width}×${cv.height})`);
          resolve();
        }, "image/jpeg", 0.95));
        return;
      }
      // 캐시 무효화용 t= 만 붙인다. preview=1 을 붙이면 저해상 경로로 되돌아간다.
      const r = await fetch(api("/snapshot") + "?t=" + Date.now());
      if (!r.ok) {
        // 능력 부재(501)와 진짜 장애를 구분해 준다 — 스냅샷을 못 주는 기기가 있다.
        let why = `HTTP ${r.status}`;
        try { const j = await r.json(); if (j.error) why = j.error; } catch { /* JSON 아님 */ }
        log(t("스크린샷 실패") + ": " + why);
        return;
      }
      const blob = await r.blob();
      const bmp = await createImageBitmap(blob).catch(() => null);
      log(t("스크린샷 저장: {name}", { name: saveBlob(blob, "") }) + (bmp ? ` (${bmp.width}×${bmp.height})` : ""));
    } catch (e) {
      log(t("스크린샷 실패") + ": " + e.message);
    } finally { setSnapBusy(false); }
  }, [snapRes, preview, saveBlob, log]);

  // ── 검출 테스트 ───────────────────────────────────────────────────────────
  const runDetectorTest = useCallback(async (targets) => {
    setOverlay(null);
    setDetCards([]);
    setDetBusy(true);
    setDetStatus(t("{x} 테스트 중…", { x: targets.map((x) => x.toUpperCase()).join("/") }));
    try {
      const payload = await postJson(api("/cctv/detector-test"), { targets });
      setDetCards(Object.entries(payload.results || {}).map(([target, r]) => ({ target, ...detectorResultCard(target, r) })));
      // 그린 쪽이 센 수를 그대로 쓴다(자식 노드 수도, 다시 판정한 수도 아니다) — 3D 는
      // 큐보이드 전체가 SVG 한 장이라 노드로 세면 차 다섯 대가 "1개"가 된다.
      const drawing = detectorOverlay(payload);
      setOverlay(drawing);
      const ok = Object.values(payload.results || {}).filter((r) => r.ok).length;
      const total = Object.keys(payload.results || {}).length;
      setDetStatus(t("테스트 완료: {ok}/{total} 응답 · 영상 위 박스 {n}개", { ok, total, n: drawing.drawn }));
      log(t("Detector 테스트 완료: {ok}/{total} 응답, 박스 {n}개", { ok, total, n: drawing.drawn }));
    } catch (e) {
      setDetStatus(t("테스트 실패") + ": " + e.message);
      log(t("Detector 테스트 실패") + ": " + e.message);
    } finally { setDetBusy(false); }
  }, [log]);

  const locked = !!busy;
  return (
    <main className="cctv-main">
      <div id="control">
        <div id="left">
          <div id="stage" ref={stageRef}
               className={"preview-stage preview-paused" + (crosshair ? "" : " crosshair-off")}
               data-paused-label="정지됨">
            <img id="view" className="preview-waiting-image" alt="camera snapshot"
                 ref={preview.imgRef} {...pointer.handlers} />
            <div className="view-crosshair" aria-hidden="true" />
            {marker && <div id="marker" style={{ left: marker.left, top: marker.top }} />}
            {pointer.rubber && <div id="rubber" style={{ ...pointer.rubber }} />}
            <div id="detector-overlays">
              {overlay && overlay.svgs.map((s, i) => (
                <svg key={i} className="det-svg" viewBox={`0 0 ${overlay.frame.w} ${overlay.frame.h}`} preserveAspectRatio="none">
                  {/* 좌표를 자르지 않는다 — 사이드카도 자르지 않는다(화면 밖은 정상 출력이다).
                      실제로 잘라 보여 주는 것은 무대의 overflow:hidden 이다. */}
                  {s.segments.map((n, j) => (
                    <line key={j} x1={n[0]} y1={n[1]} x2={n[2]} y2={n[3]}
                          stroke={s.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                  ))}
                </svg>
              ))}
              {/* 라벨은 SVG 밖에 둔다. viewBox 안의 글자는 프레임 픽셀 단위로 스케일되어
                  1920 짜리 프레임에서는 읽을 수 없는 크기가 된다. */}
              {overlay && overlay.labels3d.map((l, i) => (
                <span key={i} className="det-label det-label-3d"
                      style={{ left: `${l.leftPct}%`, top: `${l.topPct}%`, borderLeft: `2px solid ${l.color}` }}>{l.text}</span>
              ))}
              {overlay && overlay.boxes.map((b, i) => (
                <div key={i} className="det-box" style={{
                  left: `${b.leftPct}%`, top: `${b.topPct}%`, width: `${b.widthPct}%`, height: `${b.heightPct}%`,
                  borderColor: b.color, background: b.color + "22",
                }}>
                  <span className="det-label" style={{ borderLeft: `2px solid ${b.color}` }}>{b.text}</span>
                </div>
              ))}
            </div>
            {/* 조작은 영상 위에 얹힌다 — 보면서 미는 것이 이 화면의 본업이라, 시선이
                영상과 패널을 오가지 않아야 한다. 토글은 감추기만 한다(자리를 옮기지 않는다).
                옛 위젯은 절대 이동 카드를 **DOM 째로** 무대 안으로 옮겼는데, 그것이 React
                재조정과 부딪히는 유일한 자리였다 — 여기서는 그냥 무대 안에 그린다. */}
            <div id="cctv-ptz-overlay" className="ptz-control-overlay" hidden={!ptzOverlayOn}>
              <div id="control-ptz-mount" className="ptz-controls-mount"><PtzPad ctl={ctl} /></div>
            </div>
            {ptzOverlayOn && <AbsoluteMove ctl={ctl} overlay />}
          </div>
          <div id="viewbar">
            <span id="cctv-preview-led" className={"cctv-led " + (preview.running ? "ready" : "wait")} title="CCTV 프리뷰 상태" />
            <span id="cctv-preview-status" className="hint">{preview.running ? t("실행 중") : t("준비됨")}</span>
            <button id="cctv-preview-start" disabled={preview.running} onClick={preview.start}>시작</button>
            <button id="cctv-preview-stop" disabled={!preview.running} onClick={preview.stop}>종료</button>
            <button id="preview-mode" ref={preview.modeBtnRef}>프리뷰: 스트림</button>
            <select id="snap-res" title="스크린샷 해상도" style={{ width: "auto", padding: "4px 6px", fontSize: 12 }}
                    value={snapRes} onChange={(e) => { setSnapRes(e.target.value); write(SNAP_RES_KEY, e.target.value); }}>
              <option value="full">원본 해상도</option>
              <option value="screen">화면 해상도</option>
            </select>
            <button id="snap-shot" disabled={snapBusy} onClick={shoot}
                    title="스크린샷 다운로드 — 원본은 카메라에서 새로 받고, 화면은 지금 보이는 프레임 그대로">스크린샷</button>
            <label style={{ margin: 0 }} title="화면 중앙 조준선 켜기/끄기">
              <input type="checkbox" id="crosshair-toggle" style={{ width: "auto" }} checked={crosshair}
                     onChange={(e) => { setCrosshair(e.target.checked); write(CROSSHAIR_KEY, e.target.checked ? "on" : "off"); }} /> Crosshair
            </label>
            <label style={{ margin: 0 }}>
              <input type="checkbox" id="ptz-overlay-toggle" style={{ width: "auto" }} checked={ptzOverlayOn}
                     onChange={(e) => setPtzOverlayOn(e.target.checked)} /> PTZ Overlay
            </label>
            <label>스냅샷 간격 <input id="fps-int" type="number" min="0" max="3000" step="50" ref={preview.intervalRef} /> ms</label>
            <span id="fps-actual" className="hint" ref={preview.fpsRef}>—</span>
            <span className="hint">(스트림=MJPEG 연속 · 스냅샷=폴링, 0=최대)</span>
          </div>
        </div>

        <div id="panel">
          <div className="card">
            <h2>현재 PTZ &amp; 높이</h2>
            <div id="ptz" className="ptz">{ptzText}</div>
            <div id="busy">{busy}</div>
          </div>

          <div className="card">
            <h2>Detector 테스트</h2>
            <div className="row" style={{ marginBottom: 8 }}>
              {DET_TARGETS.map(([id, label, targets]) => (
                <button key={id} id={id} disabled={detBusy || locked} onClick={() => runDetectorTest(targets)}>{label}</button>
              ))}
            </div>
            <div id="det-test-status" className="hint">
              {detStatus || "현재 화면 스냅샷을 검출 API로 보내고 결과 박스를 영상 위에 표시합니다."}
            </div>
            <div id="det-test-results" className="det-result-grid">
              {detCards.map((c) => (
                <div key={c.target} className="det-result">
                  <div className="det-result-head">
                    <b>{c.title}</b><span className="det-count">{c.meta}</span>
                  </div>
                  <div className="det-lines">
                    {c.lines.map((l, i) => <div key={i} className="det-line">{l}</div>)}
                  </div>
                  {c.preview && <pre className="det-json">{c.preview}</pre>}
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>로그</h2>
            <pre id="log">{lines.join("\n")}</pre>
          </div>
        </div>
      </div>
    </main>
  );
}
