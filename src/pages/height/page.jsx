// 설치 높이 · 측량. 정본은 **시공 때 사람이 잰 값**이고 영상 자동 측정은 보조다.
//
// 이 축은 답을 못 내는 것이 정상 출력이라, 화면의 값어치가 숫자가 아니라 「왜 못 냈는가」에
// 있다 — 판정 문구는 전부 actions.mjs 가 들고 여기서는 그리기와 왕복만 한다.
import { useCallback, useEffect, useRef, useState } from "react";
import { getJson, postJson, api } from "../../api.mjs";
import { t, i18nHtml } from "../../i18n/index.mjs";
import { useCamera } from "../../app/camera-provider.jsx";
import { useCameraPreview } from "../../app/hooks/use-camera-preview.mjs";
import { useJobPoll } from "../../app/hooks/use-job-poll.mjs";
import {
  extrinsicRows, mergeReady, readyText, phaseLine, jobSummary, resultSummary,
  statusErrorText, startErrorText, manualHeightError, JOB_STATE_LABEL,
} from "./actions.mjs";
import "./height.css";

const enc = encodeURIComponent;

const Kv = ({ k, v, big }) => (
  <div className="hgt-kv"><span className="k">{k}</span><span className={"v" + (big ? " big" : "")}>{v}</span></div>
);
const Badge = ({ text, cls }) => <span className={"hgt-badge " + cls}>{text}</span>;

export default function HeightPage() {
  const cam = useCamera();
  const [status, setStatus] = useState("");
  const [extrinsic, setExtrinsic] = useState(null);   // { state, rows, why } | { error }
  // 이 기기에 발행된 캘리브레이션이 있는가. null=아직 모름.
  //
  // **자동 측정에서 이 값이 중요한 이유**: 백엔드는 곡선을 세 순위로 고른다 — 발행된 실측 >
  // 기기가 스스로 보고한 광학 > **내장 기본 곡선**. 마지막 폴백이 있어서 optics.zoomHfov 는
  // 사실상 절대 비지 않고, 그래서 "곡선이 없으면 거절된다"는 말은 참이 아니다. 미보정
  // 기기에서 이 축은 **남의 렌즈 곡선으로** 픽셀을 각으로 바꾸고, 그 초점거리 오차는 높이에
  // 그대로 배율로 곱해진다. 화면이 그 사실을 말하지 않으면 사람은 그 숫자를 실측으로 읽는다.
  const [profilePublished, setProfilePublished] = useState(null);
  const [job, setJob] = useState(null);          // 마지막 status 응답
  const [jobError, setJobError] = useState(null);
  const [ready, setReady] = useState(null);
  const [manual, setManual] = useState({ m: "", source: "manual", operator: "", note: "" });
  const [manualMsg, setManualMsg] = useState("");
  const [pub, setPub] = useState({ operator: "", note: "" });
  const [pubMsg, setPubMsg] = useState(null);    // { text, warn }

  const preview = useCameraPreview({ storageKey: "height", wantedKey: "height:preview-on.v1", log: setStatus });

  const currentCameraId = useCallback(async () => {
    if (cam.activeId) return cam.activeId;
    // 첫 로드에서는 셀렉터가 아직 목록을 받기 전이다 — 그 순간엔 서버에 직접 묻는다.
    try { return ((await getJson(api("/cctv/config"))).devices || {}).active || null; } catch { return null; }
  }, [cam.activeId]);

  // ── 현재 설치 높이 (발행본의 extrinsic) ──────────────────────────────────
  const loadExtrinsic = useCallback(async () => {
    const id = await currentCameraId();
    if (!id) { setExtrinsic({ error: t("활성 기기를 알 수 없습니다.") }); return; }
    try {
      const res = await getJson(api(`/profiles/camera/${enc(id)}`));
      setProfilePublished(true);
      setExtrinsic(extrinsicRows(res.doc || res));
    } catch (e) {
      // 404 는 장애가 아니라 "아직 한 번도 발행하지 않았다"는 정상 상태다 — 그렇게 말한다.
      setProfilePublished(e.status === 404 ? false : null);
      setExtrinsic({ error: e.status === 404
        ? t("{id} 에 발행된 프로파일이 없습니다 — 캘리브레이션을 먼저 발행하세요.", { id })
        : t("읽지 못했습니다") + ": " + (e.message || e) });
    }
  }, [currentCameraId]);

  // ── 자동 측정 잡 ─────────────────────────────────────────────────────────
  const loadJob = useCallback(async () => {
    try {
      const st = await getJson(api("/height/status"));
      setJob(st);
      setReady((prev) => mergeReady(prev, st));
      setJobError(null);
    } catch (e) {
      setJob(null);
      setJobError(statusErrorText(e));
    }
  }, []);

  const running = !!job && job.state === "running";
  // 잡이 도는 동안만 되풀이해 묻는다 — 끝나면 스스로 멈춘다(useJobPoll 의 enabled).
  const poll = useJobPoll(loadJob, { intervalMs: 1500, enabled: running });

  // 첫 로드 + 카메라 전환. 전환은 provider 가 놓아주기를 마친 뒤라, 여기서는 새 기기의
  // 사실만 다시 읽으면 된다.
  useEffect(() => {
    if (!cam.loaded) return;
    loadExtrinsic();
    loadJob();
  }, [cam.loaded, cam.activeId, loadExtrinsic, loadJob]);

  // 잡이 카메라를 모는 동안 카메라 전환을 잠근다 — 잡이 몰고 있는 카메라를 갈아타면
  // 결과가 다른 기기 것으로 섞인다. 프리뷰 조작은 잠그지 않는다: 잡이 도는 동안 카메라가
  // 어디를 보고 있는지 확인하는 것이 이 화면에서 영상을 켜는 유일한 이유다.
  useEffect(() => { cam.setEnabled(!running); }, [cam, running]);

  async function publishManual() {
    const id = await currentCameraId();
    if (!id) { setManualMsg(t("활성 기기를 알 수 없습니다.")); return; }
    const { heightM, error } = manualHeightError(manual.m);
    if (error) { setManualMsg(error); return; }
    // 발행본은 불변이고 정정은 새 리비전이다 — 취소가 아니라 이력이 하나 더 남는다.
    if (!confirm(t("{id} 의 설치 높이를 {v} m 로 발행합니다. 발행본은 불변이라 정정도 새 리비전으로 남습니다.",
                   { id, v: heightM.toFixed(2) }))) return;
    setManualMsg(t("발행 중…"));
    try {
      const res = await postJson(api(`/profiles/camera/${enc(id)}/extrinsic`), {
        heightM, source: manual.source,
        ...(manual.operator.trim() ? { operator: manual.operator.trim() } : {}),
        ...(manual.note.trim() ? { note: manual.note.trim() } : {}),
      });
      const rev = res && res.published ? res.published.revision : (res && res.revision);
      // 조준을 바꾸지 않는 값이라 런타임 적용본을 건드리지 않는다 — 재시작 안내를 붙이지 않는다.
      setManualMsg(t("rev {rev} 로 발행했습니다.", { rev: rev ?? "?" }));
      await loadExtrinsic();
    } catch (e) { setManualMsg(t("발행 실패") + ": " + (e.message || e)); }
  }

  async function startJob() {
    // 수 분간 카메라를 점유하고 그동안 수동 이동이 막힌다 — 누르기 전에 그 사실을 말한다.
    if (!confirm(t("측정이 수 분 동안 이 카메라를 점유합니다. 그동안 수동 조작은 거절됩니다. 시작할까요?"))) return;
    setJobError(null);
    try {
      const st = await postJson(api("/height/start"), {});
      setJob(st);
      setReady((prev) => mergeReady(prev, st));
    } catch (e) { setJobError(startErrorText(e)); }
  }

  async function stopJob() {
    try { setJob(await postJson(api("/height/stop"), {})); poll.refresh(); }
    catch (e) { setJobError(t("중지 실패") + ": " + (e.message || e)); }
  }

  async function publishMeasured() {
    const h = job && job.result ? job.result.heightM : null;
    if (!confirm(t("측정값 {v} m 를 자동 측정(measured)으로 발행합니다. 정본은 시공 실측이며 이 값은 보조 출처로 남습니다.",
                   { v: h === null || h === undefined ? "?" : Number(h).toFixed(2) }))) return;
    setPubMsg({ text: t("발행 중…"), warn: false });
    try {
      const res = await postJson(api("/height/publish"), {
        ...(pub.operator.trim() ? { operator: pub.operator.trim() } : {}),
        ...(pub.note.trim() ? { note: pub.note.trim() } : {}),
      });
      const rev = res && res.published ? res.published.revision : "?";
      setPubMsg({ text: t("rev {rev} 로 발행했습니다.", { rev }), warn: false });
      await loadExtrinsic();
    } catch (e) { setPubMsg({ text: t("발행 실패") + ": " + (e.message || e), warn: true }); }
  }

  const readyLine = readyText(ready);
  const summary = job && job.result ? resultSummary(job.result, job.gates || {}) : null;
  const jobLine = job ? jobSummary(job) : null;
  const setM = (k) => (e) => setManual((f) => ({ ...f, [k]: e.target.value }));

  return (
    <main className="hgt-main">
      <div id="hgt-wrap">
        <div id="hgt-left">
          <div id="hgt-stage" className="preview-stage preview-paused" data-paused-label="정지됨">
            <img id="hgt-view" className="preview-waiting-image" alt="camera preview" ref={preview.imgRef} />
            <div id="hgt-phase" aria-hidden="true">{running ? phaseLine(job) : ""}</div>
          </div>
          <div className="row">
            <button id="hgt-preview-start" title="이 카메라의 라이브 영상을 켭니다"
                    disabled={preview.running} onClick={preview.start}>시작</button>
            <button id="hgt-preview-stop" disabled={!preview.running} onClick={preview.stop}>종료</button>
            <button id="hgt-preview-mode" ref={preview.modeBtnRef}>프리뷰: 스트림</button>
            <span id="hgt-fps" className="hint" ref={preview.fpsRef}>—</span>
            <span id="hgt-status" className="hint" style={{ marginLeft: "auto" }}>{status}</span>
          </div>

          <div className="card" id="hgt-result-card">
            <h2 className="tbar">측정 결과 <span id="hgt-result-state" className="tstat hint">
              {summary
                ? <Badge text={summary.accepted ? t("합격") : t("거부")} cls={summary.accepted ? "ok" : "warn"} />
                : job && job.state === "running" ? t("측정 중 — 결과는 끝나야 나옵니다")
                : job && job.state !== "idle" ? t(JOB_STATE_LABEL[job.state] || job.state || "")
                : t("아직 측정하지 않았습니다")}
            </span></h2>
            <div id="hgt-result-body">
              {/* 새 측정이 시작되면 지난 결과를 지운다 — 안 지우면 "측정 중"이라고 쓰면서
                  이전 잡의 숫자를 그대로 보여 줘, 방금 끝난 측정의 답으로 읽힌다. */}
              {!summary ? (
                /* 문장 안에 <b> 가 박혀 있어 사전이 마크업째 든다 — 조각으로 쪼개 t() 로
                   이으면 어순이 다른 언어에서 문장이 무너진다. */
                <p id="hgt-note" dangerouslySetInnerHTML={{ __html: i18nHtml("height.normalRefusal") }} />
              ) : (
                <>
                  <Kv k={t("측정값")} v={summary.heightText} big />
                  {summary.refusal && <p className="hint" style={{ margin: "0 0 8px" }}>{summary.refusal}</p>}
                  {summary.material && <Kv k={t("격자 재료")} v={summary.material} />}
                  {summary.plateGround && (
                    <Kv k={t("번호판 지상고")}
                        v={<span style={{ color: summary.plateGround.outside ? "var(--color-warn)" : "" }}>{summary.plateGround.text}</span>} />
                  )}
                  {!!summary.reasons.length && (
                    <ul id="hgt-reasons">{summary.reasons.map((why, i) => <li key={i}>{why}</li>)}</ul>
                  )}
                  <table id="hgt-gates">
                    <tbody>
                      <tr>
                        <th>{t("판정 항목")}</th><th className="num">{t("실측")}</th>
                        <th className="num">{t("문턱")}</th><th />
                      </tr>
                      {summary.gates.map((row) => (
                        <tr key={row.name} className={row.fail ? "fail" : ""}>
                          <td>{t(row.name)}</td>
                          <td className="num">{row.got}</td>
                          <td className="num">{row.want}</td>
                          <td>{row.fail ? t(row.why) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {summary.accepted && (
                    <div style={{ marginTop: 10 }}>
                      <div className="row">
                        <input id="hgt-pub-operator" placeholder={t("측정자")} style={{ width: 120 }}
                               value={pub.operator} onChange={(e) => setPub({ ...pub, operator: e.target.value })} />
                        <input id="hgt-pub-note" placeholder={t("메모")} style={{ width: 220 }}
                               value={pub.note} onChange={(e) => setPub({ ...pub, note: e.target.value })} />
                        <button title={t("이 측정을 근거와 함께 발행본의 설치 높이로 올립니다 (source: measured)")}
                                onClick={publishMeasured}>제안 발행</button>
                      </div>
                      <p className="hint" style={{ margin: "6px 0 0" }}>{t("자동 측정은 보조 출처입니다 — 근거(measurement)가 함께 문서에 실립니다.")}</p>
                      <div id="hgt-pub-msg" className="hint" style={{ color: pubMsg && pubMsg.warn ? "var(--color-warn)" : "" }}>
                        {pubMsg && pubMsg.text}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div id="hgt-panel">
          <div className="card">
            <h2 className="tbar">현재 설치 높이 <span id="hgt-extrinsic-state" className="tstat hint">
              {extrinsic ? (extrinsic.error ? "" : <Badge text={extrinsic.state.label} cls={extrinsic.state.cls} />) : t("불러오는 중…")}
            </span></h2>
            <div id="hgt-extrinsic">
              {extrinsic && extrinsic.error && <Kv k={t("프로파일")} v={extrinsic.error} />}
              {extrinsic && !extrinsic.error && (
                <>
                  {extrinsic.rows.map((r) => <Kv key={r.k} k={r.k} v={r.v} big={r.big} />)}
                  {extrinsic.why && <p className="hint" style={{ margin: "6px 0 0" }}>{extrinsic.why}</p>}
                </>
              )}
            </div>
          </div>

          <div className="card">
            <h2>시공 입력 (정본)</h2>
            <p className="hint" style={{ margin: "0 0 8px" }}>설치 때 사람이 잰 값이 이 축의 정본입니다. 카메라를 옮기면 무효가 되고, 다른 카메라로 복사할 수 없습니다.</p>
            <div className="hgt-frow"><label htmlFor="hgt-manual-m">높이</label>
              <input id="hgt-manual-m" className="wide" type="number" step="0.01" min="1" max="30" placeholder="6.50"
                     value={manual.m} onChange={setM("m")} /><span className="unit">m</span></div>
            <div className="hgt-frow"><label htmlFor="hgt-manual-source">출처</label>
              <select id="hgt-manual-source" value={manual.source} onChange={setM("source")}>
                <option value="manual">시공 시 현장 실측</option>
                <option value="spec">도면 · 폴 규격</option>
              </select></div>
            <div className="hgt-frow"><label htmlFor="hgt-manual-operator">측정자</label>
              <input id="hgt-manual-operator" className="wide" type="text" placeholder="이름 또는 팀"
                     value={manual.operator} onChange={setM("operator")} /></div>
            <div className="hgt-frow"><label htmlFor="hgt-manual-note">메모</label>
              <input id="hgt-manual-note" className="wide" type="text" placeholder="줄자 · 폴 도면 등"
                     value={manual.note} onChange={setM("note")} /></div>
            <div className="row"><button id="hgt-manual-publish" disabled={running} onClick={publishManual}>발행</button></div>
            <div id="hgt-manual-msg" className="hint">{manualMsg}</div>
          </div>

          <div className="card">
            <h2 className="tbar">자동 측정 (보조) <span id="hgt-job-state" className="tstat hint">
              {jobError ? "" : t(JOB_STATE_LABEL[job && job.state] || (job && job.state) || "대기 중")}
            </span></h2>
            <div id="hgt-ready" className="hint" style={{ margin: "0 0 8px", color: readyLine.missing ? "var(--color-warn)" : "" }}>
              {readyLine.text}
            </div>
            <div id="hgt-optics-warn" className="hint" style={{ margin: "0 0 8px", color: profilePublished === false ? "var(--color-warn)" : "" }}>
              {profilePublished === false
                ? t("이 기기에는 발행된 캘리브레이션이 없습니다 — 백엔드가 기본 곡선으로 대신 잽니다. 초점거리 오차가 높이에 그대로 배율로 곱해지므로 결과를 실측으로 쓰지 마세요.")
                : ""}
            </div>
            <div className="row" style={{ marginBottom: 8 }}>
              <button id="hgt-start" title="영상에서 설치 높이를 잽니다 — 수 분간 카메라를 점유합니다"
                      disabled={running || !!jobError} onClick={startJob}>측정 시작</button>
              <button id="hgt-stop" disabled={!running} onClick={stopJob}>중지</button>
            </div>
            <p className="hint" style={{ margin: 0 }}>번호판이 미터를 들여오고 도장 격자가 기하를 줍니다. 둘 다 있어야 답이 나옵니다. 픽셀을 각으로 바꾸는 데 이 기기의 줌→화각 곡선을 씁니다.</p>
            <div id="hgt-job-msg" className="hint" style={{ color: jobError || (jobLine && jobLine.warn) ? "var(--color-warn)" : "" }}>
              {jobError || (jobLine && jobLine.text) || ""}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
