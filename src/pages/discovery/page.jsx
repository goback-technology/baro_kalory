// 주차면 탐색 · 번호판 호밍.
//
// 프리셋(구도) → 그 구도에서 점(x,y) → 각 점의 번호판까지 줌인 호밍. 이 화면은 프리뷰가
// 곧 작업면이라(영상 위에 점을 찍는 것이 본업) 열면 켠다 — 제어 콘솔의 「열자마자 켜지
// 않는다」는 그쪽 계약이고 여기서는 반대가 맞다.
import { useCallback, useEffect, useRef, useState } from "react";
import { getJson, postJson, reqJson, api, asset, fmtPtz } from "../../api.mjs";
import { t, i18nHtml } from "../../i18n/index.mjs";
import { useCamera } from "../../app/camera-provider.jsx";
import { useCameraPreview } from "../../app/hooks/use-camera-preview.mjs";
import { useJobPoll } from "../../app/hooks/use-job-poll.mjs";
import { ptzErrorText } from "../cctv/actions.mjs";
import {
  framePoint, ptzNear, homeStatusColor, homeStatusLabel, pointHomeStatus, dotPosition,
  plateRect, maskPolygons, homeSummary, replayCaption, replayBoxes,
  pushThought, EMPTY_THOUGHTS, CURRENT_COLOR, FRAME_W, FRAME_H,
} from "./actions.mjs";
import "./discovery.css";

const P = (id) => api("/discovery/presets/") + id;

export default function DiscoveryPage() {
  const cam = useCamera();
  const [status, setStatus] = useState("");
  const [lastPtz, setLastPtz] = useState(null);
  const [ptzText, setPtzText] = useState("");
  const [busy, setBusy] = useState("");

  const [presets, setPresets] = useState([]);
  const [cameraId, setCameraId] = useState(null);
  const [selPresetId, setSelPresetId] = useState(null);
  const [points, setPoints] = useState([]);
  const [selPointId, setSelPointId] = useState(null);
  const [newName, setNewName] = useState("");
  const [vlmReplace, setVlmReplace] = useState(false);

  const [home, setHome] = useState(null);          // 호밍 status 응답
  const [homeLive, setHomeLive] = useState(null);  // { results, currentId }
  const [thoughts, setThoughts] = useState(EMPTY_THOUGHTS);
  const [replay, setReplay] = useState(null);      // { steps, presetId, pointId, i, playing }
  const replayTimer = useRef(0);

  const preview = useCameraPreview({ storageKey: "discovery", alwaysOn: true, log: setStatus });

  const selPreset = presets.find((p) => p.id === selPresetId) || null;
  const atPreset = !!(selPreset && selPreset.ptz && ptzNear(lastPtz, selPreset.ptz));
  const running = !!home && home.state === "running";

  // ── 읽기 ──────────────────────────────────────────────────────────────────
  const loadPoints = useCallback(async (presetId) => {
    if (!presetId) { setPoints([]); return; }
    try {
      const got = (await getJson(P(presetId) + "/points")).points || [];
      setPoints(got);
      setSelPointId((cur) => (cur && got.some((q) => q.id === cur) ? cur : null));
      // 프리셋 행의 「N점」 배지도 함께 맞춘다 — 재조회 없이(추가·삭제 직후의 어긋남 방지).
      setPresets((prev) => prev.map((p) => (p.id === presetId ? { ...p, points: got } : p)));
    } catch (e) { setStatus(t("점 로드 실패") + ": " + e.message); }
  }, []);

  const loadPresets = useCallback(async () => {
    try {
      const d = await getJson(api("/discovery/presets"));
      if (d.cameraId) setCameraId(d.cameraId);
      const list = d.presets || [];
      setPresets(list);
      setSelPresetId((cur) => {
        const next = cur && list.some((p) => p.id === cur) ? cur : null;
        loadPoints(next);
        return next;
      });
    } catch (e) { setStatus(t("프리셋 로드 실패") + ": " + e.message); }
  }, [loadPoints]);

  // PTZ 는 이 화면이 직접 폴링한다. 숨겨졌을 때 카메라를 깨우지 않는 규칙은 훅이 든다 —
  // 가드가 없던 시절 아무도 안 보는 탭 하나가 하루 10만 건 넘게 카메라 HTTP 를 두드렸다.
  const readPtz = useCallback(async () => {
    try {
      const ptz = await getJson(api("/ptz"));
      setLastPtz(ptz);
      setPtzText(t("현재 {p}", { p: fmtPtz(ptz) }));
    } catch (e) {
      setLastPtz(null);
      setPtzText(ptzErrorText(e));
    }
  }, []);
  useJobPoll(readPtz, { intervalMs: 800 });

  // ── 호밍 폴링 ─────────────────────────────────────────────────────────────
  // 도는 동안은 250ms 로 촘촘히 — 이 화면은 진행을 보여 주는 것이 본업이다.
  const readHome = useCallback(async () => {
    let st;
    try { st = await getJson(api("/discovery/plate-home/status")); }
    catch (e) { setStatus(t("호밍 상태 조회 실패(재시도 중)") + ": " + e.message); return; }
    setHome(st);
    const c = st.current;
    if (st.state === "running" && c) {
      // 독백 중복 억제는 **문장 내용** 기준 — step/phase 키는 검출→재조준 전이에서 충돌한다.
      setThoughts((prev) => pushThought(prev, c.thought, `${c.pointId}:${c.thought}`));
    } else if (st.state && st.state !== "idle") {
      setThoughts((prev) => pushThought(prev, `${t("호밍 종료")} — ${homeSummary(st.results).text}`, "__end__"));
    }
    // 진행 결과를 점 목록에 실시간 색표기(처리중은 running 일 때만 — done 중 stale 방지).
    const live = { results: {}, currentId: (st.state === "running" && c) ? c.pointId : null };
    for (const r of (st.results || [])) live.results[r.pointId] = r;
    setHomeLive(live);
    if (st.state === "done" || st.state === "stopped" || st.state === "failed") await loadPresets();
  }, [loadPresets]);
  const homePoll = useJobPoll(readHome, { intervalMs: running ? 250 : 2000, enabled: true });

  // 첫 로드 + 카메라 전환. 페이지 로드 시엔 **진행 중인 잡에만** 다시 붙는다 — 이미 끝난
  // 잡(이전 세션·테스트 잔재)을 배너로 되살리면 방금 끝난 일처럼 읽힌다.
  useEffect(() => { if (cam.loaded) loadPresets(); }, [cam.loaded, cam.activeId, loadPresets]);

  // 잡이 카메라를 모는 동안 카메라 전환을 잠근다 — 갈아타면 실기가 엉뚱하게 움직이고
  // 결과가 다른 기기 것으로 섞인다.
  useEffect(() => { cam.setEnabled(!running && !busy); }, [cam, running, busy]);

  // ── 쓰기 ──────────────────────────────────────────────────────────────────
  const withBusy = useCallback(async (label, fn) => {
    setBusy(label);
    setStatus(label);
    try { return await fn(); } finally { setBusy(""); }
  }, []);

  async function selectPreset(id, doGoto) {
    setSelPresetId(id);
    setSelPointId(null);
    await loadPoints(id);
    const p = presets.find((x) => x.id === id);
    if (!doGoto || !p) return;
    await withBusy(t("프리셋으로 이동 중…"), async () => {
      try {
        const j = await postJson(P(id) + "/goto", {});
        if (j.ptz) { setLastPtz(j.ptz); setPtzText(fmtPtz(j.ptz)); }
        setStatus(t("'{name}' 구도. 영상 위를 클릭해 주차면 점을 찍으세요.", { name: p.name }));
      } catch (e) { setStatus(t("이동 실패") + ": " + e.message); }
    });
  }

  async function addPreset() {
    try {
      const j = await postJson(api("/discovery/presets"), { name: newName.trim() || undefined });
      setNewName("");
      if (j.preset) setSelPresetId(j.preset.id);
      await loadPresets();
      setStatus(t("프리셋 추가됨 (현재 카메라 위치를 저장)."));
    } catch (e) { setStatus(t("추가 실패") + ": " + e.message); }
  }

  async function renamePreset(p, name) {
    const next = String(name || "").trim();
    if (!next || next === p.name) return;
    try { await reqJson("PUT", P(p.id), { name: next }); await loadPresets(); }
    catch (e) { setStatus(t("이름 변경 실패") + ": " + e.message); }
  }

  async function deletePreset(p) {
    if (!confirm(t("프리셋 '{name}'을(를) 삭제할까요? (그 안의 점들도 함께 삭제)", { name: p.name }))) return;
    try {
      await reqJson("DELETE", P(p.id));
      if (selPresetId === p.id) { setSelPresetId(null); setPoints([]); }
      await loadPresets();
    } catch (e) { setStatus(t("삭제 실패") + ": " + e.message); }
  }

  async function vlmAutoDetect() {
    if (!selPresetId) { setStatus(t("먼저 프리셋을 선택하세요.")); return; }
    // 정합 최종 판정은 서버의 409 가 한다 — 화면은 구도로 먼저 옮겨 줄 뿐이다.
    if (!atPreset) await selectPreset(selPresetId, true);
    await withBusy(t("VLM 주차인식 계산 중… (수십 초)"), async () => {
      try {
        const j = await postJson(P(selPresetId) + "/auto-detect", { replace: vlmReplace });
        await loadPresets();
        setStatus(t("VLM({prov}·{model}) 주차인식: 점 {c}개 {act}.",
          { prov: j.provider, model: j.model, c: j.count, act: vlmReplace ? t("교체") : t("추가") }));
      } catch (e) { setStatus(t("VLM 인식 실패") + ": " + e.message); }
    });
  }

  async function startHoming(pointIds) {
    if (!selPresetId) { setStatus(t("먼저 프리셋을 선택하세요.")); return; }
    if (!pointIds && !points.length) { setStatus(t("프리셋에 점이 없습니다 (먼저 점을 찍거나 VLM 자동 검출).")); return; }
    try {
      await postJson(api("/discovery/plate-home/start"), { presetId: selPresetId, ...(pointIds ? { pointIds } : {}) });
      setThoughts(EMPTY_THOUGHTS);
      setStatus(pointIds ? t("번호판 호밍 시작…") : t("번호판 호밍 시작 — 카메라가 점마다 줌인합니다."));
      homePoll.refresh();
    } catch (e) { setStatus(t("호밍 시작 실패") + ": " + e.message); }
  }

  async function stopHoming() {
    try { await postJson(api("/discovery/plate-home/stop"), {}); homePoll.refresh(); }
    catch (e) { setStatus(t("중지 실패") + ": " + e.message); }
  }

  async function addPoint(x, y) {
    if (!selPresetId) { setStatus(t("먼저 프리셋을 선택하세요.")); return; }
    if (!atPreset) { setStatus(t("프리셋 구도에서만 점을 찍을 수 있습니다. (프리셋을 클릭해 이동)")); return; }
    try {
      const j = await postJson(P(selPresetId) + "/points", { x, y });
      setSelPointId(j.point ? j.point.id : null);
      await loadPoints(selPresetId);
      setStatus(t("점 '{name}' 추가 ({x},{y}).", { name: j.point.name, x, y }));
    } catch (e) { setStatus(t("점 추가 실패") + ": " + e.message); }
  }

  async function renamePoint(q, name) {
    const next = String(name || "").trim();
    if (!next || next === q.name) return;
    try { await reqJson("PUT", P(selPresetId) + "/points/" + q.id, { name: next }); await loadPoints(selPresetId); }
    catch (e) { setStatus(t("이름 변경 실패") + ": " + e.message); }
  }

  async function deletePoint(id) {
    try {
      await reqJson("DELETE", P(selPresetId) + "/points/" + id);
      if (selPointId === id) setSelPointId(null);
      await loadPoints(selPresetId);
    } catch (e) { setStatus(t("삭제 실패") + ": " + e.message); }
  }

  async function clearAllPoints() {
    if (!selPresetId) { setStatus(t("먼저 프리셋을 선택하세요.")); return; }
    if (!points.length) { setStatus(t("삭제할 점이 없습니다.")); return; }
    if (!confirm(t("이 프리셋의 주차면 점 {n}개를 모두 삭제할까요?", { n: points.length }))) return;
    try {
      const j = await reqJson("DELETE", P(selPresetId) + "/points");
      setSelPointId(null);
      await loadPresets();
      setStatus(t("점 {n}개 삭제됨.", { n: (j && j.removed) || 0 }));
    } catch (e) { setStatus(t("삭제 실패") + ": " + e.message); }
  }

  async function aimPoint(q) {
    await withBusy(t("조준 중…"), async () => {
      try {
        const j = await postJson(api("/center"), { x: q.x, y: q.y, frameWidth: FRAME_W, frameHeight: FRAME_H });
        if (j.ptz) { setLastPtz(j.ptz); setPtzText(fmtPtz(j.ptz)); }
        setStatus(t("'{name}' 조준.", { name: q.name }));
      } catch (e) { setStatus(t("조준 실패") + ": " + e.message); }
    });
  }

  async function viewPlate(q) {
    if (!q.closeupPtz) { setStatus(t("이 점은 아직 번호판 호밍이 안 됐습니다.")); return; }
    await withBusy(t("점 '{name}' 번호판으로 이동…", { name: q.name }), async () => {
      try {
        const j = await postJson(api("/ptz"), { ...q.closeupPtz });
        if (j.ptz) { setLastPtz(j.ptz); setPtzText(fmtPtz(j.ptz)); }
        setStatus(t("점 '{name}' 번호판 보기 — z{z} · {px}px (프리셋을 클릭하면 와이드 복귀).",
          { name: q.name, z: (j.ptz && j.ptz.zoompos) || "?", px: q.platePx || "?" }));
      } catch (e) { setStatus(t("번호판 보기 실패") + ": " + e.message); }
    });
  }

  // ── 리플레이 ──────────────────────────────────────────────────────────────
  const closeReplay = useCallback(() => {
    clearInterval(replayTimer.current);
    replayTimer.current = 0;
    setReplay(null);
  }, []);
  useEffect(() => () => clearInterval(replayTimer.current), []);

  function openReplay(q) {
    if (!(q.homeSteps && q.homeSteps.length)) { setStatus(t("이 점은 과정 기록이 없습니다.")); return; }
    clearInterval(replayTimer.current);
    replayTimer.current = 0;
    setReplay({ steps: q.homeSteps, presetId: selPresetId, pointId: q.id, name: q.name, i: 0, playing: false });
  }
  function replayNav(d) {
    setReplay((r) => (r ? { ...r, i: Math.max(0, Math.min(r.steps.length - 1, r.i + d)) } : r));
  }
  function replayPlay() {
    setReplay((r) => {
      if (!r) return r;
      if (r.playing) { clearInterval(replayTimer.current); replayTimer.current = 0; return { ...r, playing: false }; }
      replayTimer.current = setInterval(() => {
        setReplay((cur) => {
          if (!cur) return cur;
          if (cur.i >= cur.steps.length - 1) { clearInterval(replayTimer.current); replayTimer.current = 0; return { ...cur, playing: false }; }
          return { ...cur, i: cur.i + 1 };
        });
      }, 1100);
      // 끝이면 처음부터.
      return { ...r, i: r.i >= r.steps.length - 1 ? 0 : r.i, playing: true };
    });
  }

  // ── 그리기 ────────────────────────────────────────────────────────────────
  const c = home && home.current;
  // 호밍 중: 검출한 **바로 그 스냅샷**을 라이브 뷰에 띄워 박스와 정합한다(스트림 lag 제거).
  const frameUrl = (running && c && c.step != null && c.pointId && (home.cameraId || cameraId))
    ? asset(`/home-frame/${home.cameraId || cameraId}/${home.presetId}/${c.pointId}/${c.step}`) : null;
  const plate = running && c ? plateRect(c.plate) : null;
  // 마스크는 검출 프레임 좌표다 — 프레임이 실제로 떠 있을 때만 그린다(같은 게이트).
  const masks = frameUrl && c ? maskPolygons(c) : [];
  const selPoint = points.find((q) => q.id === selPointId) || null;

  const homeStatusText = (() => {
    if (!home || home.state === "idle") return t("대기 중");
    if (running && c) return null;   // 아래에서 굵게 그린다
    const label = home.state === "done" ? t("완료") : home.state === "stopped" ? t("중지됨") : home.state;
    return `${label} · ${homeSummary(home.results).text}`
      + (home.error ? ` · ${home.error}` : "")
      + (home.cameraStranded ? t(" · 카메라 복귀 실패(수동 확인 필요)") : "");
  })();

  return (
    <main className="disc-main">
      <div id="disc-wrap">
        <div id="disc-left">
          <div id="disc-stage" className="preview-stage preview-paused" data-paused-label="정지됨">
            <img id="disc-view" className="preview-waiting-image" alt="discovery preview"
                 title="프리셋 구도에서 영상 위를 클릭하면 주차면 점이 추가됩니다."
                 ref={preview.imgRef}
                 onDragStart={(e) => e.preventDefault()}
                 onClick={(e) => {
                   const p = framePoint({ clientX: e.clientX, clientY: e.clientY, rect: e.currentTarget.getBoundingClientRect() });
                   addPoint(p.x, p.y);
                 }} />
            {frameUrl && <img id="disc-home-frame" alt="homing detection frame" src={frameUrl} style={{ display: "block" }} />}
            {/* 와이드 점 오버레이는 줌 뷰에 안 맞아 호밍 중 숨긴다. */}
            <div id="disc-points" style={{ display: frameUrl ? "none" : "" }}>
              {atPreset && points.map((q) => {
                const at = dotPosition(q);
                const { hstat } = pointHomeStatus(q, homeLive);
                return (
                  <div key={q.id} className={"pdot" + (q.id === selPointId ? " sel" : "")}
                       style={{ left: `${at.leftPct}%`, top: `${at.topPct}%`, ...(hstat ? { background: homeStatusColor(hstat) } : {}) }}
                       title={`${q.name} (${at.x},${at.y})` + (q.platePx ? ` · ${q.platePx}px` : "")}
                       onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setSelPointId(selPointId === q.id ? null : q.id); }}>
                    <span className="pdot-lab">{q.name}</span>
                  </div>
                );
              })}
            </div>
            <svg id="disc-masks" viewBox={`0 0 ${FRAME_W} ${FRAME_H}`} preserveAspectRatio="xMidYMid meet"
                 aria-hidden="true" style={{ display: masks.length ? "block" : "none" }}>
              {masks.map((m, i) => <polygon key={i} points={m.points} className={m.cls} />)}
            </svg>
            <div id="disc-home-box" className={c && c.maskState === "plate_locked" ? "locked" : ""}
                 style={{ position: "absolute", border: "2px solid #16d05a", boxShadow: "0 0 0 1px #000, 0 0 8px #16d05a",
                          pointerEvents: "none", display: plate ? "block" : "none",
                          ...(plate ? { left: `${plate.left}%`, top: `${plate.top}%`, width: `${plate.width}%`, height: `${plate.height}%` } : {}) }} />
            <div id="disc-crosshair" aria-hidden="true" />
            <div id="disc-monologue" aria-hidden="true">
              {thoughts.lines.map((th, i) => <div key={i} className="th">{th}</div>)}
            </div>
          </div>
          <div className="row" style={{ width: 860, maxWidth: "100%" }}>
            <button id="disc-preview-mode" ref={preview.modeBtnRef}>프리뷰: 스트림</button>
            <span id="disc-fps" className="hint" ref={preview.fpsRef}>—</span>
            <span id="disc-ptz" className="pz">{ptzText}</span>
          </div>
          <div id="disc-status" className="hint">{status}</div>
        </div>

        <div id="disc-panel">
          <div className="card">
            <h2>프리셋 (구도)</h2>
            <div className="row" style={{ marginBottom: 8 }}>
              <input id="disc-name" placeholder="프리셋 이름" style={{ width: 140 }}
                     value={newName} onChange={(e) => setNewName(e.target.value)} />
              <button id="disc-add" title="현재 카메라 구도를 새 프리셋으로 저장"
                      disabled={!!busy || running} onClick={addPreset}>＋</button>
            </div>
            <div id="disc-preset-props" className="props">
              {!selPreset ? <span className="pmeta">{t("프리셋을 선택하세요.")}</span> : (
                <>
                  <div className="line">
                    <input className="pname" defaultValue={selPreset.name} key={selPreset.id + selPreset.name}
                           title={t("이름 수정 (Enter로 저장)")}
                           onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                           onChange={(e) => renamePreset(selPreset, e.target.value)} />
                    <span className="pmeta">
                      {selPreset.points && selPreset.points.length ? t("{n}점", { n: selPreset.points.length }) : t("점 없음")}
                    </span>
                  </div>
                  <div className="line">
                    <button title={t("이 프리셋 구도로 카메라 이동")} disabled={!!busy || running}
                            onClick={() => selectPreset(selPreset.id, true)}>{t("이동")}</button>
                    <button disabled={!!busy || running} onClick={() => deletePreset(selPreset)}>{t("삭제")}</button>
                  </div>
                </>
              )}
            </div>
            <div id="disc-list">
              {!presets.length && <span className="hint">아직 프리셋 없음 — 카메라 구도를 맞춘 뒤 추가하세요.</span>}
              {presets.map((p) => (
                <div key={p.id} className={"spot-row prow" + (p.id === selPresetId ? " sel" : "")}
                     title={t("클릭하면 이 프리셋을 선택하고 그 구도로 이동합니다.")}
                     onClick={() => selectPreset(p.id, true)}>
                  <span className="nm">{p.name}</span>
                  <span className="pz">{p.points && p.points.length ? t("{n}점", { n: p.points.length }) : ""}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 className="tbar">주차면 점 <span id="disc-pt-label" className="hint">{selPreset ? "· " + selPreset.name : ""}</span>
              <span id="disc-home-status" className="tstat hint">
                {homeStatusText !== null ? homeStatusText : (
                  <>{t("호밍 중")} · <b>{home.currentIdx + 1}/{home.total}</b> · {t("점")} '{(c && c.name) || "?"}'</>
                )}
              </span>
            </h2>
            <div className="row" style={{ marginBottom: 8, gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button id="disc-vlm" title="현재 프레임의 주차 차량을 VLM으로 자동 검출해 점으로 추가"
                      disabled={!!busy || running} onClick={vlmAutoDetect}>{busy ? t("계산중…") : "VLM 주차인식"}</button>
              <label className="hint" title="자동 검출 시 기존 점을 지우고 교체" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="checkbox" id="disc-vlm-replace" style={{ width: "auto" }}
                       checked={vlmReplace} onChange={(e) => setVlmReplace(e.target.checked)} /> 교체
              </label>
              <button id="disc-home-start" title="모든 점을 순회하며 번호판까지 줌인 호밍"
                      disabled={running || !!busy} onClick={() => startHoming(null)}>번호판 호밍</button>
              <button id="disc-home-stop" disabled={!running} onClick={stopHoming}>중지</button>
              <button id="disc-clear" title="이 프리셋의 주차면 점 전체 삭제" style={{ marginLeft: "auto" }}
                      disabled={!!busy || running} onClick={clearAllPoints}>전체 삭제</button>
            </div>
            <div id="disc-point-props" className="props">
              {!selPoint ? <span className="pmeta">{t("점을 선택하세요.")}</span> : (() => {
                const { isCur, hstat, hcode, hreason, hpx } = pointHomeStatus(selPoint, homeLive);
                return (
                  <>
                    <div className="line">
                      <input className="pname" defaultValue={selPoint.name} key={selPoint.id + selPoint.name}
                             title={t("이름 수정 (Enter로 저장)")}
                             onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                             onChange={(e) => renamePoint(selPoint, e.target.value)} />
                      <span className="pz" style={{ color: isCur ? CURRENT_COLOR : (hstat ? homeStatusColor(hstat) : "") }}>
                        {isCur ? t("처리중") : hstat ? homeStatusLabel(hstat, hcode, hreason, hpx) : t("미호밍")}
                      </span>
                      <span className="pmeta">({selPoint.x},{selPoint.y})</span>
                    </div>
                    <div className="line">
                      <button title={t("이 점을 화면 중앙으로 조준")} disabled={!!busy || running} onClick={() => aimPoint(selPoint)}>{t("조준")}</button>
                      <button title={selPoint.closeupPtz ? t("이 점만 다시 번호판 호밍") : t("이 점만 번호판 호밍")}
                              disabled={!!busy || running} onClick={() => startHoming([selPoint.id])}>{t("호밍")}</button>
                      {selPoint.closeupPtz && (
                        <button title={t("번호판 확대 보기 (z{z})", { z: selPoint.closeupPtz.zoompos })}
                                disabled={!!busy || running} onClick={() => viewPlate(selPoint)}>{t("번호판")}</button>
                      )}
                      {selPoint.homeSteps && selPoint.homeSteps.length > 0 && (
                        <button title={t("호밍 줌인 과정 다시보기 ({n}스텝)", { n: selPoint.homeSteps.length })}
                                onClick={() => openReplay(selPoint)}>{t("과정")}</button>
                      )}
                      <button disabled={!!busy || running} onClick={() => deletePoint(selPoint.id)}>{t("삭제")}</button>
                    </div>
                  </>
                );
              })()}
            </div>
            <div id="disc-ptlist" style={{ maxHeight: 340, overflowY: "auto" }}
                 title="녹색=호밍 성공 · 파랑=번호판 확인 불가 · 노랑=판정 보류/처리중 · 빨강=실패">
              {!selPresetId && <span className="hint">프리셋을 선택하세요.</span>}
              {selPresetId && !points.length && <span className="hint">아직 점 없음 — 프리셋 구도에서 영상을 클릭하세요.</span>}
              {selPresetId && points.map((q) => {
                const { isCur, hstat, hpx } = pointHomeStatus(q, homeLive);
                const color = isCur ? CURRENT_COLOR : (hstat ? homeStatusColor(hstat) : null);
                return (
                  <div key={q.id} className={"spot-row prow" + (q.id === selPointId ? " sel" : "")}
                       style={color ? { borderLeft: `3px solid ${color}` } : {}}
                       title={!isCur && hstat === "ok" ? `${hpx || "?"}px` : ""}
                       onClick={() => setSelPointId(selPointId === q.id ? null : q.id)}>
                    <span className="nm">{q.name}</span>
                    <span className="pz" style={color ? { color } : {}}>({q.x},{q.y})</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 번호판 호밍 과정 다시보기: 스텝별 프레임 + LPD 후보/선택 박스 + 중앙 십자 */}
      {replay && (
        <div id="home-replay" style={{ display: "flex", position: "fixed", inset: 0, zIndex: 50,
                                       background: "rgba(0,0,0,.78)", alignItems: "center", justifyContent: "center" }}
             onClick={(e) => { if (e.target.id === "home-replay") closeReplay(); }}>
          <div style={{ background: "#11151b", border: "1px solid #2a2f38", borderRadius: 8, padding: 14, width: 820, maxWidth: "96vw" }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <b id="hr-title">{t("점 '{name}' 번호판 호밍 과정 — {n}스텝", { name: replay.name, n: replay.steps.length })}</b>
              <button id="hr-close" onClick={closeReplay}>닫기 ✕</button>
            </div>
            <div id="hr-stage" style={{ position: "relative", lineHeight: 0, background: "#000",
                                        border: "1px solid #2a2f38", borderRadius: 6, overflow: "hidden", aspectRatio: "16/9" }}>
              {(() => {
                const st = replay.steps[replay.i];
                const src = st.frame != null && cameraId
                  ? asset(`/home-frame/${cameraId}/${replay.presetId}/${replay.pointId}/${st.frame}`) : null;
                return (
                  <>
                    <img id="hr-img" alt="step frame" src={src || undefined}
                         style={{ display: "block", width: "100%", height: "100%", objectFit: "contain",
                                  background: "#000", visibility: src ? "visible" : "hidden" }} />
                    <div id="hr-overlay" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                      {replayBoxes(st).map((b, i) => (
                        <div key={i} style={{ position: "absolute", boxSizing: "border-box",
                                              border: `${b.width2}px solid ${b.color}`, boxShadow: "0 0 0 1px rgba(0,0,0,.6)",
                                              left: `${b.left}%`, top: `${b.top}%`, width: `${b.width}%`, height: `${b.height}%` }} />
                      ))}
                    </div>
                    <div id="hr-cross" style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0, pointerEvents: "none" }} />
                  </>
                );
              })()}
            </div>
            <div id="hr-caption" className="hint" style={{ margin: "8px 0", minHeight: 18 }}>
              {replayCaption(replay.steps[replay.i]).map((line, i) => (
                <div key={i} style={line.color ? { color: line.color } : {}}>
                  {line.parts.map((p, j) => (p.strong
                    ? <b key={j}>{p.text}</b>
                    : <span key={j} style={p.color ? { color: p.color } : {}}>{p.text}</span>))}
                </div>
              ))}
            </div>
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <button id="hr-prev" onClick={() => replayNav(-1)}>◀ 이전</button>
              <span id="hr-pos" className="pz">{replay.i + 1} / {replay.steps.length}</span>
              <button id="hr-next" onClick={() => replayNav(1)}>다음 ▶</button>
              <button id="hr-play" onClick={replayPlay}>{replay.playing ? t("⏸ 정지") : t("▶ 자동재생")}</button>
              {/* 문장 안에 색 조각이 박혀 있어 사전이 마크업째 든다 — 조각으로 쪼개 t() 로
                  이으면 어순이 다른 언어에서 문장이 무너진다. */}
              <span className="hint" style={{ marginLeft: "auto" }}
                    dangerouslySetInnerHTML={{ __html: i18nHtml("replay.legend") }} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
