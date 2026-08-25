// 캘리브레이션 화면의 조립부 — 데이터 로딩·폴링·쓰기 동작을 전부 여기가 소유하고,
// 카드 컴포넌트들은 그린다. React 파일럿(plan §2, 2026-08-22)의 첫 페이지였고,
// 2026-08-25 SPA 셸의 첫 라우트가 됐다 — 자기 문서·자기 루트·자기 크롬을 내려놓고
// 셸이 주는 것을 쓴다. 헤더 셀렉터도 이제 CameraProvider 소유다.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { getJson, postJson, reqJson, api } from "../../lib/api.mjs";
import { useCamera } from "../../camera/provider.jsx";
import { createCameraPreview } from "../../camera/preview.mjs";
import { t } from "../../i18n/index.mjs";
import "./calibration.css";
import { SweepOverlay } from "./sweep-overlay.jsx";
import { StatusCard } from "./status-card.jsx";
import { ProfileCard } from "./profile-card.jsx";
import { ProfileList } from "./profile-list.jsx";
import { applyPublishedToRuntime, appliedSuffix, opticsSnapshot, retireEffect, installedLine } from "./actions.mjs";

const enc = encodeURIComponent;

// ── 라이브 뷰 ────────────────────────────────────────────────────────────────
// 스윕은 20분간 실기를 독점한다. 그동안 화면이 퍼센트만 세고 있으면 "도는 중"과 "굳음"을
// 구분할 수 없고, 시작 전에는 카메라가 어디를 보는지도 모른 채 시작하게 된다.
// status 의 recent[] 가 이미 그 답을 들고 온다(마지막 6표본).
//
// createCameraPreview 는 DOM 위젯이다 — img·모드버튼·fps 라벨을 ref 로 넘기고, 그 요소들의
// 내용은 위젯이 소유한다(React 는 다시 그리지 않는다).
function LiveStage({ st, registerRelease }) {
  const imgRef = useRef(null);
  const modeBtnRef = useRef(null);
  const fpsRef = useRef(null);
  const previewRef = useRef(null);
  // 프리뷰를 여는 것은 **사용자 선택**이고 그 선택만 기억한다 — 페이지를 여는 행위가 카메라
  // 점유가 되면 안 된다(저장소 계약, 기본 꺼짐).
  const KEY = "calib:preview-on.v1";
  const [running, setRunning] = useState(false);
  const [label, setLabel] = useState(null);

  useEffect(() => {
    const preview = createCameraPreview({
      img: imgRef.current,
      modeButton: modeBtnRef.current,
      fpsLabel: fpsRef.current,
      storageKey: "calib",
    });
    previewRef.current = preview;
    let on = false;
    try { on = localStorage.getItem(KEY) === "on"; } catch { /* 저장소 사용 불가 */ }
    if (on) { preview.start(); setRunning(true); setLabel(t("실행 중")); }
    // 스트림을 놓아 줄 세 갈래를 전부 건다. 안 하면 유령 시청자로 남아 카메라를 점유한다.
    //   1) 카메라 전환 전    — provider 가 활성을 바꾸기 **전에** 이 함수를 await 한다.
    //   2) 라우트 이탈·언마운트 — SPA 에는 pagehide 가 오지 않는다. cleanup 이 그 자리다.
    //   3) 진짜 문서 이탈    — 탭을 닫거나 다른 사이트로 갈 때.
    const unregister = registerRelease(() => preview.stop());
    const bye = () => { preview.stop(); };
    window.addEventListener("pagehide", bye);
    return () => {
      unregister();
      window.removeEventListener("pagehide", bye);
      preview.destroy();   // stop() 과 달리 document 리스너까지 거둔다(왕복 누수 방지)
    };
  }, [registerRelease]);

  const start = () => {
    try { localStorage.setItem(KEY, "on"); } catch { /* 저장소 사용 불가 */ }
    previewRef.current.start();
    setRunning(true); setLabel(t("실행 중"));
  };
  const stop = async () => {
    try { localStorage.setItem(KEY, "off"); } catch { /* 저장소 사용 불가 */ }
    // 전환은 이전 stop 을 await 한 뒤 — 안 하면 연결이 누적돼 스트림이 저하된다(저장소 계약).
    await previewRef.current.stop();
    setRunning(false); setLabel(t("중지됨"));
  };

  return (
    <>
      {/* 라이브 뷰. 스윕 **전에도** 필요하다 — "밝을 때, 무늬가 있는 쪽을 향한 상태"라는
          전제를 눈으로 확인하지 않으면 20분을 버리고 나서야 알게 된다. */}
      <div id="calib-stage" className="preview-stage preview-paused" data-paused-label="정지됨">
        <img id="calib-view" className="preview-waiting-image" alt="camera preview" ref={imgRef} />
        <div className="view-crosshair" aria-hidden="true" />
        <SweepOverlay st={st} />
      </div>
      <div id="calib-viewbar">
        <span id="calib-preview-led" className={"led" + (running ? " on" : "")} />
        <span id="calib-preview-status" className="hint">{label || (running ? t("실행 중") : t("준비됨"))}</span>
        <button id="calib-preview-start" disabled={running} onClick={start}>프리뷰 시작</button>
        <button id="calib-preview-stop" disabled={!running} onClick={stop}>종료</button>
        <button id="calib-preview-mode" ref={modeBtnRef}>프리뷰: 스트림(MJPEG)</button>
        <span id="calib-fps" className="hint" ref={fpsRef} />
      </div>
    </>
  );
}

export default function CalibrationPage() {
  const cam = useCamera();
  // 카메라 전환 → 카드 재구성 (실기 ↔ 시뮬 검증전용). undefined = 셀렉터 로드 전 —
  // 그때 initCard 를 부르면 load 완료 때 또 불려 모든 GET 이 2벌 나간다(실측).
  const [cameraId, setCameraId] = useState(undefined);
  const [st, setSt] = useState(null);                  // /calibration/status
  const [cardVisible, setCardVisible] = useState(true); // 캘리브레이션 API 자체가 없는 기기 (예외적)
  const [verifyOnly, setVerifyOnly] = useState(false);
  const [installed, setInstalled] = useState(null);    // installedLine 조각
  const [profile, setProfile] = useState(null);        // {doc} | {error, status} | null
  // 기본 활성 — 원본 마크업에 disabled 가 없던 것과 같은 이유다: 읽기 실패(404 아님)로
  // 버튼이 죽으면 그게 더 나쁘다. 404(확실히 없음)만 잠근다.
  const [hasProfile, setHasProfile] = useState(true);
  const [revs, setRevs] = useState([]);
  const [appliedPtr, setAppliedPtr] = useState(null);  // 0.18.0 적용 포인터 — 옛 백엔드엔 null
  const [appliedRevMark, setAppliedRevMark] = useState(null); // 이력표의 「적용중」 (config 근거)
  const [driftLines, setDriftLines] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [catalogError, setCatalogError] = useState(null);
  const [panel, setPanel] = useState(null);
  const [msg, setMsgState] = useState({ text: "", kind: "" });
  const pollRef = useRef(null);

  const setMsg = (text, kind) => setMsgState({ text: text || "", kind: kind || "" });

  async function currentCameraId() {
    const id = cam.activeId;
    if (id) return id;
    // 첫 로드에서는 셀렉터가 아직 목록을 받기 전이다 — 그 순간엔 서버에 직접 묻는다.
    try { return ((await getJson(api("/cctv/config"))).devices || {}).active || null; } catch { return null; }
  }

  // ── 읽기 다섯 — 원본 refreshProfileCard 와 같은 병렬 패턴 ──
  const loadProfile = useCallback(async () => {
    const id = await currentCameraId();
    if (!id) { setProfile({ plain: "활성 기기를 알 수 없습니다." }); return; }
    setProfile(null);
    try {
      const doc = await getJson(api(`/profiles/camera/${enc(id)}`));
      setProfile({ doc });
      setHasProfile(true);
      // 0.18.0(보드 #73)부터 revisions 응답이 적용 포인터를 실어 준다 — 없으면(옛 백엔드) null.
      try { setAppliedPtr((await getJson(api(`/profiles/camera/${enc(id)}/revisions`))).applied ?? null); }
      catch { setAppliedPtr(null); /* 옛 백엔드 */ }
    } catch (e) {
      setProfile({ error: e.message || String(e), status: e.status });
      // 읽기 실패(404 아님)까지 잠그지는 않는다 — 일시 장애로 버튼이 죽으면 그게 더 나쁘다.
      if (e.status === 404) setHasProfile(false);
      setAppliedPtr(null);
    }
  }, [cam]);

  const loadRevisions = useCallback(async () => {
    const id = await currentCameraId();
    if (!id) return;
    try { setRevs((await getJson(api(`/profiles/camera/${enc(id)}/revisions`))).revisions || []); }
    catch { setRevs([]); return; }
    // 지금 런타임이 어느 리비전을 물고 있는가. apply/mint 가 config 에 적어 둔 값이 유일한
    // 근거다 — 없으면(그 이전에 저장된 기기) 모른다고 두고 아무 표시도 하지 않는다.
    try {
      const cfg = await getJson(api("/cctv/config"));
      const dev = ((cfg.devices || {}).list || []).find((x) => x.id === id);
      const rev = dev && dev.intrinsics && dev.intrinsics.profileRevision;
      setAppliedRevMark(Number.isFinite(rev) ? rev : null);
    } catch { setAppliedRevMark(null); /* 모르면 표시하지 않는다 */ }
  }, [cam]);

  const loadDrift = useCallback(async () => {
    // 대조 실패가 카드를 못 열게 만들면 안 된다.
    try { setDriftLines((await getJson(api("/help?format=json"))).live?.profileDrift || []); }
    catch { setDriftLines([]); }
  }, []);

  const loadInstalled = useCallback(async () => {
    try {
      const cfg = await getJson(api("/cctv/config"));
      const d = cfg.devices || { active: null, list: [] };
      const dev = (d.list || []).find((x) => x.id === d.active);
      if (!dev) { setInstalled(null); return; }
      // declared 하나로는 발행본과 씨앗값을 구분할 수 없다 — 발행본의 **존재**는 문서 저장소에
      // 직접 묻는다. 못 읽으면 null — 모르는 것을 아는 척하지 않는다.
      const [live, hasProf] = await Promise.all([
        getJson(api("/help?format=json")).then((h) => h.live || {}).catch(() => ({})),
        getJson(api(`/profiles/camera/${enc(dev.id)}/revisions`))
          .then((r) => (r.revisions || []).length > 0)
          // 404 는 장애가 아니라 답이다 — 「발행본이 확실히 없다」. 그 외 실패만 모름(null)이다.
          .catch((e) => (e && e.status === 404 ? false : null)),
      ]);
      setInstalled(installedLine({
        optics: live.optics || null,
        hasProfile: hasProf,
        ins: dev.intrinsics ?? dev.centeringGain,
      }));
    } catch { setInstalled(null); }
  }, []);

  const loadProfileList = useCallback(async () => {
    try { setCatalog((await getJson(api("/profiles"))).camera || []); setCatalogError(null); }
    catch (e) { setCatalogError(e.message || String(e)); }
  }, []);

  // 왼쪽 카탈로그도 함께 다시 읽는다 — 발행·복사·퇴역은 저장소의 목록을 바꾸므로, 빠뜨리면
  // 방금 만든 리비전이 왼쪽에만 안 보이고 두 단이 다른 말을 한다.
  const refresh = useCallback(async () => {
    await Promise.all([loadProfile(), loadRevisions(), loadDrift(), loadInstalled(), loadProfileList()]);
  }, [loadProfile, loadRevisions, loadDrift, loadInstalled, loadProfileList]);

  // ── 상태 폴링 — 1.5초, running 이 아니게 되면 스스로 멈춘다 ──
  const pollOnce = useCallback(async () => {
    try {
      const s = await getJson(api("/calibration/status"));
      setSt(s);
      if (s.state !== "running" && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    } catch { /* 기기가 캘리브레이션을 지원하지 않으면 조용히 무시 */ }
  }, []);
  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(pollOnce, 1500);
    pollOnce();
  }, [pollOnce]);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);
  // 페이지 이탈 시 폴링 누수 방지 — 잡 자체는 서버에서 계속 돈다(다시 열면 이어서 표시).
  useEffect(() => {
    const bye = () => { if (pollRef.current) clearInterval(pollRef.current); };
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, []);

  // 진행 중 카메라 전환 잠금 — 잡이 몰고 있는 카메라를 갈아타면 실기 오동작 + 결과가 엉뚱한
  // 기기에 저장된다.
  const running = !!st && st.state === "running";
  useEffect(() => { cam.setEnabled(!running); }, [cam, running]);

  // 카드 초기화 — 카메라 전환 때마다 다시 (실기 ↔ 시뮬은 카드의 문구·버튼이 다르다).
  const initCard = useCallback(async () => {
    try {
      const s = await getJson(api("/calibration/status"));
      setVerifyOnly(!!s.verifyOnly);
      setCardVisible(true);
      setSt(s);
      if (s.state === "running") startPolling();
    } catch {
      setCardVisible(false);   // 캘리브레이션 API 자체가 없는 기기 (예외적)
      // 카드는 숨어도 왼쪽 카탈로그는 산다 — 카탈로그는 카메라와 무관한 저장소 목록이라
      // status 실패가 그것까지 굶기면 「발행된 프로파일이 없습니다」라는 거짓말이 뜬다.
      loadProfileList();
      return;
    }
    refresh();
  }, [refresh, startPolling, loadProfileList]);

  useEffect(() => { if (cameraId !== undefined) initCard(); /* 첫 로드 + 카메라 전환 */ }, [cameraId, initCard]);

  // 헤더 셀렉터는 CameraProvider 가 소유한다 — 여기서는 그 값의 변화만 본다.
  // 미연결로 목록을 못 받아도 null 로 한 번은 흘려보낸다: 원본도 그 상태에서 카드
  // 초기화를 시도했고(실패하면 카드가 숨고 카탈로그 오류가 말한다), 그래야 「아무 일도
  // 안 일어나는 화면」이 되지 않는다. provider 의 첫 로드가 끝나기 전 undefined 로
  // 두는 것이 그 신호다 — 그때 initCard 를 부르면 로드 완료 때 또 불려 GET 이 2벌 나간다.
  useEffect(() => {
    if (!cam.loaded) return;
    setPanel(null); setMsg("");
    setCameraId(cam.activeId ?? null);
  }, [cam.loaded, cam.activeId]);

  // ── 쓰기 — 백엔드는 실패를 코드로 말한다. 그 문장을 그대로 옮긴다. ──
  async function profileWrite(run, okText) {
    setMsg(t("처리 중…"));
    try {
      const res = await run();
      setPanel(null);
      await refresh();
      setMsg(okText(res), "good");
    } catch (e) {
      // hint 는 "그래서 뭘 해야 하나"라 버리면 안 된다 — 게이트 미달·미등록 기기가 그렇다.
      const hint = e.body && e.body.hint ? " " + e.body.hint : "";
      setMsg((e.message || String(e)) + hint, "bad");
    }
  }

  async function writeAndApply(run) {
    const res = await run();
    return { res, applied: await applyPublishedToRuntime(await currentCameraId(), res) };
  }

  // 발행이 곧 적용이다(백엔드 help 「Publishing is applying」). apply 는 쓰기가 아니라
  // **확인**이고, 백엔드가 더 할 일이 있다고 답할 때만(옛 계약) 재선택으로 적재한다.
  async function applyLatestToRuntime() {
    const id = await currentCameraId();
    if (!id) return;
    await profileWrite(
      () => writeAndApply(() => postJson(api(`/profiles/camera/${enc(id)}/apply`), {})),
      ({ res, applied }) => {
        // 응답 모양을 단정하지 않는다 — 키 하나 어긋났다고 성공이 빨간 줄로 보이면 안 된다.
        const rev = res?.applied?.revision ?? res?.latest?.revision ?? res?.revision;
        const what = rev == null ? t("최신 발행본") : `rev ${rev}`;
        return applied.applied
          ? t("{what} 을 이 카메라가 쓰고 있습니다.", { what })
          : t("{what} 이 읽힐 예정입니다", { what }) + appliedSuffix(applied);
      },
    );
  }

  async function rollbackToRevision(revision) {
    const id = await currentCameraId();
    if (!id) return;
    await profileWrite(
      () => writeAndApply(() => postJson(api(`/profiles/camera/${enc(id)}/copy`), {
        from: id,
        fromRevision: revision,
        note: `rollback to rev ${revision}`,   // 서버 문서에 남는 데이터 — 영어 고정
      })),
      ({ res, applied }) => {
        const rev = res?.published?.revision ?? res?.revision;
        const head = rev == null
          ? t("rev {old} 을 다시 발행했습니다", { old: revision })
          : t("rev {old} 을 rev {rev} 로 다시 발행했습니다", { old: revision, rev });
        return head + appliedSuffix(applied);
      },
    );
  }

  async function pinToRevision(revision) {
    const id = await currentCameraId();
    if (!id) return;
    await profileWrite(
      () => postJson(api(`/profiles/camera/${enc(id)}/apply`), { revision }),
      () => t("rev {rev} 에 고정했습니다 — 고정을 풀기 전까지 새 발행이 조준에 실리지 않습니다.", { rev: revision }),
    );
  }

  async function detachProfile() {
    const id = await currentCameraId();
    if (!id) return;
    if (!confirm(`${id} 의 발행본 적용을 해제합니다.\n\n다음 조준부터 config 씨앗값(없으면 무보정)으로 동작합니다 — 적용 전/후를 비교해 보여줄 때 쓰는 상태입니다.\n발행본은 그대로 남고, 「다시 적용」 한 번으로 복귀합니다. 계속할까요?`)) return;
    await profileWrite(
      () => postJson(api(`/profiles/camera/${enc(id)}/apply`), { revision: null }),
      () => t("적용을 해제했습니다 — 지금부터 씨앗값(없으면 무보정)으로 조준합니다. 발행본은 그대로 있습니다."),
    );
  }

  async function refollowProfile() {
    const id = await currentCameraId();
    if (!id) return;
    await profileWrite(
      () => postJson(api(`/profiles/camera/${enc(id)}/apply`), { follow: true }),
      (res) => t("다시 적용했습니다 — rev {rev} · 최신 따름.", { rev: res?.applied?.revision ?? "?" }),
    );
  }

  async function retireProfile() {
    const id = await currentCameraId();
    if (!id) return;
    // 잠금을 뚫고 들어온 경우(경합·키보드)의 안전망 — 실패하더라도 어느 카메라 얘기인지 말한다.
    try { await getJson(api(`/profiles/camera/${enc(id)}/revisions`)); }
    catch (e) {
      if (e.status === 404) {
        setMsg(t("{id} 에는 삭제할 발행본이 없습니다 — 왼쪽 목록의 발행본은 다른 카메라의 것입니다. 헤더에서 그 카메라를 고른 뒤 삭제하세요.", { id }), "bad");
        return;
      }
      // 그 외 실패는 그대로 진행한다 — DELETE 가 실제 답을 갖고 온다.
    }
    // 화면 표기는 **「삭제」**다. 백엔드 용어는 retire(.trash 이동, 바이트 보존)지만 그건 서버
    // 관리자의 사정이고, 작업자에게는 목록에서 사라지고 화면으로 못 되돌리면 그게 삭제다.
    // 삭제는 **그 카메라의 발행본 전체**를 한 번에 치운다(라우트에 revision 인자가 없다).
    if (!confirm(`${id} 의 발행본 전체를 삭제합니다.\n\n목록과 조회에서 사라지고 API 로 되돌릴 방법이 없습니다(파일 자체는 서버의 .trash 폴더로 옮겨져 서버 관리자만 손댈 수 있습니다).\n이 카메라는 발행본을 잃고 config 씨앗값으로 조준하게 됩니다. 계속할까요?`)) return;
    // 판정 기준점은 퇴역 **전**에 찍는다 — 끝나고 나서는 무엇이 달라졌는지 알 길이 없다.
    const before = await opticsSnapshot();
    await profileWrite(
      async () => ({
        res: await reqJson("DELETE", api(`/profiles/camera/${enc(id)}`)),
        after: await opticsSnapshot(),
      }),
      ({ res, after }) =>
        t("발행본(rev {revs})을 삭제했습니다", { revs: res.revisions.join(", ") }) + " — " + retireEffect(before, after),
    );
  }

  // ── 패널 열기 — 원본과 같이 열 때 서버에 다시 묻는다(열려 있던 사이의 변화 반영) ──
  async function openCopyPanel(preselect) {
    const id = await currentCameraId();
    if (!id) return;
    let others = [];
    try { others = ((await getJson(api("/profiles"))).camera || []).filter((p) => p.profileId !== id); }
    catch { /* 목록을 못 읽으면 패널이 안내한다 */ }
    setMsg("");
    setPanel({ kind: "copy", others, preselect });
  }
  function openImportPanel() { setMsg(""); setPanel({ kind: "import" }); }
  async function openRevisionPanel() {
    const id = await currentCameraId();
    if (!id) return;
    let panelRevs = [], panelApplied = null;
    try {
      const res = await getJson(api(`/profiles/camera/${enc(id)}/revisions`));
      panelRevs = res.revisions || [];
      panelApplied = res.applied ?? null;   // 0.18.0(보드 #73)의 적용 포인터 — 옛 백엔드엔 없다
    } catch { /* 패널이 안내한다 */ }
    setMsg("");
    setPanel({ kind: "revision", revs: panelRevs, applied: panelApplied });
  }

  const id = cameraId || "";
  return (
    <main className="cal-main"><div id="cal-split">
      <div className="cal-col cal-col-list">
        {/* 저장소에 발행돼 있는 것 전량. 줄을 누르면 오른쪽 속성창이 그 줄에 맞춰 열린다 —
            남의 것이면 복사, 이 카메라 것이면 적용. */}
        <div className="card cal-card-list">
          <h2>프로파일 목록</h2>
          <div id="profile-list">
            <ProfileList catalog={catalog} error={catalogError} mine={cam.activeId}
              onPickMine={openRevisionPanel} onPickOther={(pid) => openCopyPanel(pid)} />
          </div>
          <div className="hint" style={{ marginTop: 6 }}>줄을 누르면 오른쪽에 그 작업 창이 열립니다.</div>
        </div>
      </div>
      <div className="cal-col cal-col-detail">
        {cardVisible && (
          <div className="card" id="calib-card">
            <h2>카메라 캘리브레이션</h2>
            <LiveStage st={st} registerRelease={cam.registerRelease} />
            <StatusCard st={st} verifyOnly={verifyOnly} installed={installed}
              onPollStart={startPolling} refresh={refresh} cameraId={currentCameraId} />
          </div>
        )}
        <ProfileCard id={id} profile={profile} hasProfile={hasProfile}
          revs={revs} appliedPtr={appliedPtr} appliedRevMark={appliedRevMark}
          driftLines={driftLines} msg={msg} panel={panel}
          openCopyPanel={openCopyPanel} openImportPanel={openImportPanel}
          openRevisionPanel={openRevisionPanel} closePanel={() => { setPanel(null); setMsg(""); }}
          retireProfile={retireProfile} detachProfile={detachProfile}
          refollowProfile={refollowProfile} applyLatestToRuntime={applyLatestToRuntime}
          profileWrite={profileWrite} writeAndApply={writeAndApply} setMsg={setMsg}
          panelActions={{ pinToRevision, refollowProfile, applyLatestToRuntime, rollbackToRevision }} />
      </div>
    </div></main>
  );
}
