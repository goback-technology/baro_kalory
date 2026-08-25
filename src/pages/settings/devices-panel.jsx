// 기기 탭 — 목록(선택·순서)과 편집 폼. 이 화면의 조작은 전부 **즉시 서버에 반영**된다.
//
// 예전에는 편집기가 브라우저 배열만 고치고 카드 밖 맨 아래의 '저장'을 따로 눌러야 반영됐다 —
// 바로 옆 활성 기기 드롭다운은 즉시 반영이라 한 카드 안에 두 규칙이 섞였고, 확정 버튼 이름이
// '적용'이라 눌렀으면 저장된 줄 알았다. 지금은 추가·저장·삭제·순서가 각자 서버를 두드리고,
// 실패하면 서버가 진실이므로 로컬 상태도 바꾸지 않는다.
import { useEffect, useRef, useState } from "react";
import { getJson, postJson, api } from "../../lib/api.mjs";
import { t } from "../../i18n/index.mjs";
import {
  toSaveEntry, deviceFormToEntry, vptzError, stageDeviceList, nextDeviceId, moveInList,
  deviceWhere, stageHeight, needsHostOf, modeHintText, calibHintText, calibOptions,
  heightHintText, probeCameraText,
} from "./actions.mjs";

const enc = encodeURIComponent;

// 편집 폼의 빈 상태. 폼 값은 전부 문자열이다 — 숫자로 들고 있으면 "지운다"(빈칸)와 0 을
// 구분할 수 없고, 그 구분이 이 화면의 계약이다(putField 의 세 갈래).
const EMPTY_FORM = {
  id: "", name: "", type: "", mode: "real",
  host: "", port: "80", scheme: "", username: "", password: "",
  rtspPath: "", rtspPort: "", streamFps: "", mjpegPort: "", timeoutMs: "", insecureTls: false,
  fwModId: "", portId: "", ptzPortId: "", streamIndex: "",
  vptzOn: false, vptzHfov: "", vptzMaxMag: "", vptzW: "", vptzH: "",
  calib: "", height: "",
};

const str = (v) => (v === undefined || v === null ? "" : String(v));

function formFromDevice(d, devTypes) {
  const vp = d.virtualPtz && typeof d.virtualPtz === "object" ? d.virtualPtz : null;
  return {
    id: d.id || "",
    name: d.name || "",
    type: d.type || (devTypes[0] && devTypes[0].type) || "hucoms",
    // 새 기기의 기본 용도는 타입이 정한다 — 백엔드의 재파생 규칙과 같은 값이라야 화면이
    // 보여 주는 것과 저장되는 것이 어긋나지 않는다(기준기는 sim, 그 외는 real).
    mode: d.mode || (needsHostOf(devTypes, d.type) ? "real" : "sim"),
    host: d.host || "",
    port: str(d.port || 80),
    scheme: d.scheme === "http" || d.scheme === "https" ? d.scheme : "",
    username: d.username || "",
    password: "",
    rtspPath: str(d.rtspPath), rtspPort: str(d.rtspPort), streamFps: str(d.streamFps),
    mjpegPort: str(d.mjpegPort), timeoutMs: str(d.timeoutMs), insecureTls: d.insecureTls === true,
    fwModId: str(d.fwModId), portId: str(d.portId), ptzPortId: str(d.ptzPortId), streamIndex: str(d.streamIndex),
    vptzOn: !!vp,
    vptzHfov: str(vp && vp.hfovDeg), vptzMaxMag: str(vp && vp.maxMag),
    vptzW: str(vp && vp.width), vptzH: str(vp && vp.height),
    calib: d.intrinsics ? "__keep" : "",
    height: "",
  };
}

export function DevicesPanel({ cfg, reload }) {
  const { devTypes, devices, activeId, profiles } = cfg;
  const [selId, setSelId] = useState(null);
  const [draft, setDraft] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [msg, setMsg] = useState("");
  const [probeOut, setProbeOut] = useState(null);
  const [height, setHeight] = useState({ heightM: null, revision: null, ready: false, hint: "" });
  const [dragFrom, setDragFrom] = useState(null);
  const [dropInto, setDropInto] = useState(null);
  const listRef = useRef(null);
  const idRef = useRef(null);
  const heightReq = useRef(0);

  const open = draft || !!selId;
  const needsHost = needsHostOf(devTypes, form.type);
  const selected = devices.find((x) => x.id === selId) || null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  // 목록이 서버에서 다시 오면 편집 대상도 그 사본을 따라야 한다. 활성 기기를 기본 선택으로
  // 두는 것은 「지금 무엇을 보고 있나」와 「무엇이 실제로 도는가」를 붙여 놓기 위해서다.
  useEffect(() => {
    if (draft) return;
    const next = (selId && devices.some((x) => x.id === selId)) ? selId : (activeId || null);
    setSelId(next);
    setForm(next ? formFromDevice(devices.find((x) => x.id === next), devTypes)
                 : formFromDevice({ type: (devTypes[0] && devTypes[0].type), port: 80 }, devTypes));
  }, [devices, activeId, devTypes]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── 설치 높이 — 기기 config 왕복에 없는 값이다 ─────────────────────────────
  // 프로파일은 발행 후 불변이라 이 칸의 저장은 덮어쓰기가 아니라 **새 리비전 발행**이고,
  // 그래서 읽기도 config 가 아니라 프로파일에서 한다.
  useEffect(() => {
    const id = draft ? null : selId;
    const seq = ++heightReq.current;
    setHeight({ heightM: null, revision: null, ready: false, hint: "" });
    if (!id) { setHeight({ heightM: null, revision: null, ready: false, hint: heightHintText({ notSaved: true }) }); return; }
    setHeight((h) => ({ ...h, hint: t("읽는 중…") }));
    (async () => {
      try {
        const doc = await getJson(api(`/profiles/camera/${enc(id)}`));
        // 읽는 사이에 다른 기기를 골랐으면 그 화면에 남의 값을 쓰지 않는다.
        if (seq !== heightReq.current) return;
        const ex = doc.extrinsic || {}, mount = ex.mount || {};
        const h = Number(mount.heightM ?? ex.heightM);
        const known = Number.isFinite(h);
        setHeight({ heightM: known ? h : null, revision: doc.revision, ready: true,
                    hint: heightHintText({ known, revision: doc.revision, source: mount.source || ex.source || null }) });
        setForm((f) => ({ ...f, height: known ? h.toFixed(2) : "" }));
      } catch (e) {
        if (seq !== heightReq.current) return;
        setHeight({ heightM: null, revision: null, ready: false, hint: heightHintText({ error: e }) });
      }
    })();
  }, [selId, draft]);

  // ── 서버 왕복 ──────────────────────────────────────────────────────────────
  // 백엔드의 config 저장은 항목별 부분 갱신이라(body.devices 만 보내면 검출기·LPR·키는 그대로)
  // 기기만 따로 보낼 수 있다. 실패하면 서버가 진실이므로 로컬 상태도 바꾸지 않는다.
  async function commitDevices(nextList, nextActive, { rebuildActive = false } = {}) {
    await postJson(api("/cctv/config"), {
      devices: { active: nextActive, list: nextList.map((x) => toSaveEntry(x, needsHostOf(devTypes, x.type))) },
    });
    if (!rebuildActive) return "";
    // 활성 기기의 접속 정보가 바뀌었으면 서버가 클라이언트를 다시 만들어야 실제로 반영된다.
    try { await postJson(api("/cctv/active"), { id: nextActive, force: true }); return ""; }
    catch (e) { return " — " + t("활성 적용 실패:") + " " + (e.message || e); }
  }

  // 기기 저장 자체는 이미 끝난 뒤라 실패해도 되돌리지 않고 무엇이 안 됐는지만 말한다 —
  // 캘리브레이션 빌려오기와 같은 규칙이다.
  async function publishHeightIfChanged(id) {
    if (!height.ready) return "";
    const st = stageHeight(form.height, height.heightM);
    if (st.kind === "skip") return "";
    if (st.kind === "nan") return " — " + t("설치 높이가 숫자가 아닙니다 — 발행하지 않았습니다");
    if (st.kind === "range") return " — " + t("{v} 는 1~30 m 밖입니다 — cm 를 넣으신 건 아닌가요?", { v: st.heightM });
    if (!confirm(t("{id} 의 설치 높이를 {v} m 로 발행합니다. 발행본은 불변이라 정정도 새 리비전으로 남습니다.",
                   { id, v: st.heightM.toFixed(2) }))) {
      return " — " + t("설치 높이는 발행하지 않았습니다");
    }
    try {
      // 이 창구로 넣는 값은 사람이 잰 것이다. 영상 자동 측정(measured)은 근거를 달고 높이
      // 화면에서 들어온다 — 출처가 섞이면 다음 사람이 전부 실측으로 읽는다.
      const res = await postJson(api(`/profiles/camera/${enc(id)}/extrinsic`), { heightM: st.heightM, source: "manual" });
      const rev = res && res.published ? res.published.revision : null;
      return " — " + (rev === null
        ? t("설치 높이 {v} m 발행", { v: st.heightM.toFixed(2) })
        : t("설치 높이 {v} m · rev {rev} 발행", { v: st.heightM.toFixed(2), rev }));
    } catch (e) {
      return " — " + t("설치 높이 발행 실패") + ": " + ((e.body && e.body.error) || e.message || e);
    }
  }

  // 추가와 수정이 같은 버튼이다 — 둘 다 "이 폼의 내용을 그 기기의 값으로 만든다"는 한 가지
  // 일이고, 새 기기인지는 폼이 이미 제목으로 말하고 있다.
  async function save() {
    const base = (!draft && selected) || null;
    const { entry, borrowFrom } = deviceFormToEntry(form, { base, needsHost });
    if (!entry.id) { setMsg(t("ID를 입력하세요")); return; }
    if (needsHost && !entry.host) { setMsg(t("host를 입력하세요")); return; }
    const vErr = vptzError(entry.virtualPtz);
    if (vErr) { setMsg(vErr); return; }
    const staged = stageDeviceList({ devices, selId, draft, entry, activeId });
    if (staged.error) { setMsg(staged.error); return; }

    setMsg(t("저장 중…"));
    try {
      // 캘리브레이션이 바뀌면 활성 기기는 반드시 다시 만들어야 한다 — 조준 곡선은 드라이버가
      // 생성 시점에 들고 가는 값이라, 재빌드 없이는 저장만 되고 조준은 옛 곡선으로 남는다.
      let warn = await commitDevices(staged.list, staged.active, { rebuildActive: staged.id === staged.active });
      // 빌려오기는 기기가 등록된 뒤에야 성립한다(새 기기는 422 unknown_device). 실패해도 기기
      // 저장 자체는 끝났으므로 되돌리지 않고 무엇이 안 됐는지만 말한다 — 조용히 삼키면
      // "빌렸다고 생각하는" 상태가 남는다.
      if (borrowFrom) {
        setMsg(t("프로파일 복사 중…"));
        try {
          const res = await postJson(api(`/profiles/camera/${enc(staged.id)}/copy`), { from: borrowFrom });
          // published 가 없는 응답에서 무방비로 .revision 을 읽으면 TypeError 가 아래 catch 로
          // 떨어져 **성공한 복사가 "복사 실패"로 표시된다.** 번호를 모르면 번호만 뺀다.
          const rev = res && res.published ? res.published.revision : null;
          warn += " — " + (rev === null
            ? t("{from} 에서 복사 발행", { from: borrowFrom })
            : t("{from} 에서 복사해 rev {rev} 발행", { from: borrowFrom, rev }));
        } catch (e) {
          warn += " — " + t("프로파일 복사 실패") + ": " + ((e.body && e.body.error) || e.message || e);
        }
      }
      // 높이는 빌려오기 **다음**이다 — 빌려온 그 리비전 위에 얹혀야 한다.
      warn += await publishHeightIfChanged(staged.id);
      setDraft(false);
      setSelId(staged.id);
      await reload();
      setMsg(t("저장됨") + warn);
    } catch (e) { setMsg(t("저장 실패") + ": " + (e.message || e)); }
  }

  function addDevice() {
    setDraft(true);
    setSelId(null);
    setForm({ ...formFromDevice({ type: (devTypes[0] && devTypes[0].type), port: 80 }, devTypes), id: nextDeviceId(devices) });
    setMsg("");
    setProbeOut(null);
    // 제안한 id 는 대개 그대로 쓰지 않는다 — 커서를 그 칸에 둬야 다음 동작이 이어진다.
    setTimeout(() => idRef.current?.focus(), 0);
  }

  // 작성 취소 / 편집 되돌리기. 예전에는 이 일을 '삭제' 버튼이 겸했다 — 새 기기를 만들다
  // 그만두려는 사람에게 누를 수 있는 것이 '삭제'뿐인 화면이었다.
  function cancelEditor() {
    const back = selId || activeId;
    setDraft(false);
    if (back && devices.some((x) => x.id === back)) selectDevice(back);
    else { setSelId(null); setForm(formFromDevice({ type: (devTypes[0] && devTypes[0].type), port: 80 }, devTypes)); }
    setMsg(t("취소됨"));
  }

  async function deleteDevice() {
    if (!selId) { setMsg(t("삭제할 기기를 먼저 선택하세요")); return; }
    if (devices.length <= 1) { setMsg(t("최소 1개 기기는 있어야 합니다")); return; }
    // 삭제는 즉시 서버에 반영되고 되돌릴 수 없다 — 목록에서 사라지는 것만으로는 그 사실이
    // 전달되지 않으므로 확인을 받는다.
    if (!confirm(t("기기 '{id}' 를 삭제합니다. 되돌릴 수 없습니다.", { id: selId }))) return;
    const gone = selId;
    const list = devices.filter((x) => x.id !== gone);
    const nextActive = activeId === gone ? list[0].id : activeId;
    setMsg(t("삭제 중…"));
    try {
      const warn = await commitDevices(list, nextActive, { rebuildActive: activeId === gone });
      setSelId(nextActive);
      await reload();
      setMsg(t("삭제됨: {id}", { id: gone }) + warn);
    } catch (e) { setMsg(t("삭제 실패") + ": " + (e.message || e)); }
  }

  function selectDevice(id) {
    const d = devices.find((x) => x.id === id);
    if (!d) return;
    setSelId(id);
    setDraft(false);
    setForm(formFromDevice(d, devTypes));
    setMsg("");
    setProbeOut(null);   // 이전 기기의 테스트 결과다
  }

  // 순서는 사용자가 정한다. 백엔드는 기기 배열을 정렬하지 않고 받은 차례 그대로 저장한다.
  async function moveDevice(fromId, toId) {
    const list = moveInList(devices, fromId, toId);
    if (!list) return;
    setMsg(t("순서 저장 중…"));
    try {
      // 순서만 바뀌었다 — 접속 정보는 그대로이므로 활성 기기를 다시 만들 필요가 없다.
      await commitDevices(list, activeId);
      await reload();
      setMsg(t("순서 저장됨"));
    } catch (e) { setMsg(t("순서 저장 실패") + ": " + (e.message || e)); }
  }

  // 활성 기기 드롭다운 = 즉시 무중단 라이브 전환 (서버가 ctx 를 교체, 재시작 불필요).
  async function switchActive(id) {
    if (id === activeId) return;
    setMsg(t("'{id}'(으)로 전환 중…", { id }));
    try {
      await postJson(api("/cctv/active"), { id });
      selectDevice(id);   // 편집 폼·목록 하이라이트도 활성 기기에 동기화
      await reload();
      setMsg(t("✅ '{id}'(으)로 전환됨 (무중단)", { id }));
    } catch (err) {
      // 실패하면 드롭다운은 서버 값(activeId)으로 되돌아간다 — controlled 라 저절로.
      setMsg(t("전환 실패") + ": " + (err.message || err));
    }
  }

  async function probe() {
    setProbeOut({ parts: [{ text: t("프로브 중…") }], note: null });
    try {
      const r = await postJson(api("/cctv/probe"), {
        host: form.host.trim(), port: Number(form.port) || 80,
        username: form.username.trim(), password: form.password,
      });
      setProbeOut(probeCameraText(r));
    } catch (e) { setProbeOut({ parts: [{ text: t("프로브 실패") + ": " + e.message }], note: null }); }
  }

  // 선택된 기기가 목록의 보이는 범위 밖이면 끌어온다. 목록이 스크롤되는 이상 선택 표시가
  // 화면 밖에 남을 수 있고, 그러면 "골랐는데 아무 반응이 없다"로 보인다. scrollIntoView 는
  // 조건이 맞으면 페이지까지 함께 굴리므로 컨테이너의 scrollTop 을 직접 조정한다.
  useEffect(() => {
    const list = listRef.current;
    const row = list && list.querySelector(".dev-row.sel");
    if (!row) return;
    const box = list.getBoundingClientRect(), r = row.getBoundingClientRect();
    if (r.top < box.top) list.scrollTop += r.top - box.top;
    else if (r.bottom > box.bottom) list.scrollTop += r.bottom - box.bottom;
  }, [selId, devices]);

  const act = devices.find((x) => x.id === activeId) || null;
  const calibHint = calibHintText(form.calib, selected ? selected.intrinsics : null);
  // 손댈 값이 들어 있는 서랍은 열어 둔다 — 접힌 채로는 "왜 이 기기만 다르게 도나"의 답이
  // 화면에 있으면서 안 보인다.
  const advOpen = ["rtspPath", "rtspPort", "streamFps", "mjpegPort", "timeoutMs",
                   "fwModId", "portId", "ptzPortId", "streamIndex"].some((k) => str(form[k]) !== "") || form.insecureTls;

  return (
    <section data-panel="devices">
      <div className="dev-col dev-col-list">
        <div className="card">
          <h2>현재 연결</h2>
          <div id="set-current" className="hint">
            {act ? (
              <>
                {t("활성")} <b>{act.name || act.id}</b> <span className="hint">({act.id})</span> · {t("타입")} <b>{act.type}</b>
                {" · "}{deviceWhere(act, needsHostOf(devTypes, act.type))}{" "}
                <span className="hint">{t("— '연결 테스트'로 실물/시뮬·모델 확인")}</span>
              </>
            ) : <span className="hint">{t("등록된 기기가 없습니다 — '＋ 추가'로 등록하세요.")}</span>}
          </div>
        </div>
        <div className="card dev-card-list">
          <h2>기기 (장치)</h2>
          <div className="row" style={{ marginBottom: 8 }}>
            <label>활성 기기</label>
            <select id="dev-active" title="활성 기기" style={{ width: "auto", padding: 5, minWidth: 150 }}
                    value={activeId || ""} onChange={(e) => switchActive(e.target.value)}>
              {devices.map((x) => <option key={x.id} value={x.id}>{(x.name || x.id)} ({x.type})</option>)}
            </select>
          </div>
          <div id="dev-list" ref={listRef}>
            {!devices.length && <span className="hint">기기 없음</span>}
            {devices.map((x) => (
              <button key={x.id} type="button" draggable
                      className={"dev-row" + (x.id === selId ? " sel" : "")
                                 + (x.id === dragFrom ? " dragging" : "")
                                 + (x.id === dropInto && x.id !== dragFrom ? " drop-into" : "")}
                      data-id={x.id}
                      onClick={() => selectDevice(x.id)}
                      onDragStart={(e) => {
                        setDragFrom(x.id);
                        e.dataTransfer.effectAllowed = "move";
                        // Firefox 는 setData 가 없으면 드래그를 시작조차 하지 않는다.
                        try { e.dataTransfer.setData("text/plain", x.id); } catch { /* 무시 */ }
                      }}
                      onDragOver={(e) => {
                        if (!dragFrom) return;
                        e.preventDefault();          // 이게 없으면 drop 이 아예 발생하지 않는다
                        e.dataTransfer.dropEffect = "move";
                        setDropInto(x.id);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = dragFrom;
                        setDragFrom(null); setDropInto(null);
                        if (from && from !== x.id) moveDevice(from, x.id);
                      }}
                      onDragEnd={() => { setDragFrom(null); setDropInto(null); }}>
                {/* 행 하나가 곧 선택 버튼이다. 이름 / 식별자·타입 / 주소를 세 줄로 나눈다 —
                    한 줄에 몰아 넣던 때는 이름이 길면 줄바꿈이 나면서 행마다 높이가 달라졌다. */}
                <span className="dev-name">{x.name || x.id}</span>
                <span className="dev-meta">{x.id} · {x.type}{x.id === activeId ? ` · ${t("활성")}` : ""}</span>
                <span className="dev-meta">{deviceWhere(x, needsHostOf(devTypes, x.type))}</span>
              </button>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 6 }}>행을 눌러 오른쪽에서 편집하고, 끌어서 순서를 바꿉니다.</div>
        </div>
      </div>

      <div className="dev-col dev-col-edit">
        <div className="card">
          <h2>기기 속성</h2>
          {/* 기기를 다루는 조작은 전부 이 한 줄에 모은다. 예전에는 '추가'가 카드 맨 위,
              '삭제'가 폼 아래에 흩어져 있어 무엇이 목록을 바꾸는 조작인지 보이지 않았다.
              지금 할 수 있는 일이 버튼 자체로 보여야 한다 — 고른 것도 없는데 '삭제'가
              눌리면 누른 뒤에야 "먼저 선택하세요"를 읽게 된다. */}
          <div className="row" style={{ margin: "0 0 10px" }}>
            <button id="dev-add" onClick={addDevice}>＋ 추가</button>
            <button id="dev-save" disabled={!open} onClick={save}>저장</button>
            <button id="dev-del" disabled={!selId || devices.length <= 1} onClick={deleteDevice}>삭제</button>
            <button id="dev-cancel" disabled={!open} onClick={cancelEditor}>취소</button>
            <button id="set-probe" disabled={!open} style={{ marginLeft: "auto" }} onClick={probe}>연결 테스트</button>
          </div>
          {open && (
            <div id="dev-editor">
              <div className="hint" id="dev-edit-title" style={{ marginBottom: 6 }}>
                {draft ? t("새 기기") : selId ? t("기기 편집: {id}", { id: selId }) : t("기기 편집")}
              </div>
              <div className="row" style={{ marginBottom: 6 }}>
                <label>ID</label>
                {/* id 는 수정 대상이 아니다 — rename 은 기기별 저장 데이터를 고아로 만든다. */}
                <input id="set-cam-id" ref={idRef} style={{ width: 110 }} placeholder="cam-001"
                       readOnly={!draft} value={form.id} onChange={set("id")} />
                <label>이름</label>
                <input id="dev-name" style={{ width: 130 }} placeholder="정문 CCTV" value={form.name} onChange={set("name")} />
                <label>타입</label>
                <select id="dev-type" style={{ width: "auto", padding: 5 }} value={form.type} onChange={set("type")}>
                  {devTypes.map((dt) => <option key={dt.type} value={dt.type}>{t(dt.label)}</option>)}
                </select>
              </div>
              {/* 용도는 타입과 다른 축이다. 타입은 "어느 규약으로 말하나"(hucoms·idis…)이고
                  용도는 "실제 카메라인가 시뮬레이터인가"다 — 시뮬은 hucoms 규약을 그대로
                  쓰므로 타입만으로는 구분되지 않는다. 시뮬레이터 페이지가 이 값으로 기기를
                  고르므로, 여기서 정하지 못하면 새로 등록한 시뮬 카메라가 그 화면에 안 뜬다. */}
              <div className="row" style={{ marginBottom: 6 }}>
                <label>용도</label>
                <select id="dev-mode" title="용도" style={{ width: "auto", padding: 5 }} value={form.mode} onChange={set("mode")}>
                  <option value="real">실기 — 실제 카메라</option>
                  <option value="sim">시뮬레이터</option>
                </select>
                <span className="hint" id="dev-mode-hint">{modeHintText(form.mode)}</span>
              </div>
              {/* 캘리브레이션은 카메라 **개체**의 성질이지 모델의 성질이 아니다. 그래서 남의
                  값을 빌려 쓰는 것은 임시 방편이고, 반드시 검증으로 확인해야 한다. */}
              <div className="row" style={{ marginBottom: 6 }}>
                <label>광학 씨앗값</label>
                <select id="dev-calib" title="캘리브레이션" style={{ width: "auto", padding: 5, minWidth: 260 }}
                        value={form.calib} onChange={set("calib")}>
                  {calibOptions(profiles, selected && selected.intrinsics, selId)
                    .map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="hint" id="dev-calib-hint" style={{ marginBottom: 8, color: calibHint.warn ? "var(--color-warn, #ca4)" : "" }}>
                {calibHint.text}
              </div>
              {/* 설치 높이는 기기 config 의 필드가 아니라 **발행본(프로파일)의 값**이다. 그래서
                  저장이 config 왕복과 별개로 발행 창구를 한 번 더 두드린다 — 캘리브레이션
                  빌려오기와 같은 자리, 같은 규칙(실패해도 기기 저장은 되돌리지 않는다). */}
              <div className="row" style={{ marginBottom: 6 }}>
                <label>설치 높이</label>
                <input id="dev-height" type="number" min="1" max="30" step="0.01" style={{ width: 90 }}
                       placeholder="예: 6.00" disabled={!height.ready} value={form.height} onChange={set("height")} />
                <span className="hint">m</span>
              </div>
              <div className="hint" id="dev-height-hint" style={{ marginBottom: 8 }}>{height.hint}</div>

              {needsHost && (
                <div id="dev-host-fields">
                  <div className="row" style={{ marginBottom: 6 }}>
                    <label>호스트</label>
                    <input id="set-cam-host" style={{ width: 150 }} placeholder="192.0.2.50" value={form.host} onChange={set("host")} />
                    <label>포트</label>
                    <input id="set-cam-port" type="number" style={{ width: 70 }} placeholder="80" value={form.port} onChange={set("port")} />
                    {/* 스킴은 기기가 정한다. 드라이버마다 기본값이 달라(IDIS 는 https) 평문
                        HTTP 만 여는 기기는 설정이 그렇게 말해 줘야 하고, 아니면 TLS 핸드셰이크가
                        평문 포트에 부딪혀 스냅샷이 통째로 실패한다. */}
                    <label>스킴</label>
                    <select id="dev-scheme" title="스킴" style={{ width: "auto", padding: 5 }} value={form.scheme} onChange={set("scheme")}>
                      <option value="">자동 (드라이버 기본)</option>
                      <option value="http">http</option>
                      <option value="https">https</option>
                    </select>
                  </div>
                  <div className="row" style={{ marginBottom: 8 }}>
                    <label>계정</label>
                    <input id="set-cam-user" style={{ width: 100 }} placeholder="admin" value={form.username} onChange={set("username")} />
                    <label>비밀번호</label>
                    <input id="set-cam-pass" type="password" style={{ width: 170 }}
                           placeholder={selected && selected.hasPassword ? t("(저장됨 · 변경 시에만 입력)") : t("비밀번호")}
                           value={form.password} onChange={set("password")} />
                  </div>
                  {/* 접었다 펴는 이유: 이 값들은 기기를 처음 등록할 때가 아니라 "붙긴 붙는데
                      화면이 안 나온다"를 풀 때 쓴다. 늘 펴 두면 등록 화면이 그만큼 길어진다. */}
                  <details id="dev-advanced" style={{ marginBottom: 8 }} open={advOpen}>
                    <summary style={{ cursor: "pointer" }}>프리뷰·전송 상세</summary>
                    <div style={{ padding: "8px 0 0 4px" }}>
                      <div className="row" style={{ marginBottom: 6 }}>
                        <label>RTSP 경로</label>
                        <input id="dev-rtsp-path" style={{ width: 140 }} placeholder="stream1 · trackID=1" value={form.rtspPath} onChange={set("rtspPath")} />
                        <label>RTSP 포트</label>
                        <input id="dev-rtsp-port" type="number" style={{ width: 70 }} placeholder="554" value={form.rtspPort} onChange={set("rtspPort")} />
                        <label>프리뷰 fps</label>
                        <input id="dev-stream-fps" type="number" style={{ width: 85 }} placeholder="상한 없음" value={form.streamFps} onChange={set("streamFps")} />
                      </div>
                      <div className="hint" style={{ marginBottom: 8 }}>비우면 스냅샷 폴링으로 내려갑니다. 경로는 벤더 규약이고 번호가 무슨 코덱인지는 기기 설정이 정합니다 — ffprobe 로 확인한 값을 넣으세요. fps 는 기기 실제 fps 를 넣으면 중복 프레임이 사라집니다.</div>
                      <div className="row" style={{ marginBottom: 6 }}>
                        <label>MJPEG 포트</label>
                        <input id="dev-mjpeg-port" type="number" style={{ width: 70 }} placeholder="없음" value={form.mjpegPort} onChange={set("mjpegPort")} />
                        <label>타임아웃</label>
                        <input id="dev-timeout" type="number" style={{ width: 70 }} placeholder="ms" value={form.timeoutMs} onChange={set("timeoutMs")} />
                      </div>
                      <div className="hint" style={{ marginBottom: 8 }}>MJPEG 포트가 있으면 RTSP 대신 그 포트를 그대로 중계합니다. 시뮬레이터 주소는 기기가 아니라 시뮬레이터 화면의 「시뮬레이터 주소」에서 정합니다 — 월드 하나의 값이라 카메라와 함께 지워지면 안 됩니다.</div>
                      <div className="row" style={{ marginBottom: 6 }}>
                        <label style={{ width: "auto" }}>
                          <input id="dev-insecure-tls" type="checkbox" checked={form.insecureTls} onChange={set("insecureTls")} /> TLS 인증서 검증 안 함
                        </label>
                      </div>
                      <div className="hint" style={{ marginBottom: 8 }}>공장 자체서명 인증서를 쓰는 HTTPS 기기에만. 이 기기 하나에만 적용됩니다.</div>
                      {/* 채널 지정. 타입으로 가리지 않는다 — 백엔드도 이 네 필드를 host 기기
                          전체에 대해 똑같이 정규화한다. */}
                      <div className="row" style={{ marginBottom: 6 }}>
                        <label>모듈</label><input id="dev-fwmodid" type="number" style={{ width: 60 }} placeholder="fwModId" value={form.fwModId} onChange={set("fwModId")} />
                        <label>영상 채널</label><input id="dev-portid" type="number" style={{ width: 60 }} placeholder="portId" value={form.portId} onChange={set("portId")} />
                        <label>PTZ 채널</label><input id="dev-ptzportid" type="number" style={{ width: 60 }} placeholder="ptzPortId" value={form.ptzPortId} onChange={set("ptzPortId")} />
                        <label>스트림</label><input id="dev-streamindex" type="number" style={{ width: 60 }} placeholder="streamIndex" value={form.streamIndex} onChange={set("streamIndex")} />
                      </div>
                      <div className="hint">한 서버가 여러 카메라를 무는 기기에서 몇 번 채널인지. 비우면 0번으로 붙습니다 — 3번 카메라를 등록했는데 1번 화면이 나오면 이 값입니다.</div>
                    </div>
                  </details>
                </div>
              )}
              {/* 가상 PTZ: 스냅샷만 내는 고정형 카메라 위에 소프트웨어 팬틸트줌을 씌운다.
                  host 필드 바깥에 있는 이유는 백엔드가 이 값을 **타입과 무관하게** 읽기
                  때문이다. host 필드 안에 두면 접속 대상이 없는 타입에서 통째로 숨는다. */}
              <details id="dev-vptz" style={{ marginBottom: 8 }} open={form.vptzOn}>
                <summary style={{ cursor: "pointer" }}>가상 PTZ (고정형 카메라)</summary>
                <div style={{ padding: "8px 0 0 4px" }}>
                  <div className="row" style={{ marginBottom: 6 }}>
                    <label style={{ width: "auto" }}>
                      <input id="dev-vptz-on" type="checkbox" checked={form.vptzOn} onChange={set("vptzOn")} /> 사용
                    </label>
                    <label>소스 화각</label>
                    <input id="dev-vptz-hfov" type="number" step="0.1" style={{ width: 70 }} placeholder="90" value={form.vptzHfov} onChange={set("vptzHfov")} />
                    <label>최대 배율</label>
                    <input id="dev-vptz-maxmag" type="number" step="0.1" style={{ width: 70 }} placeholder="8" value={form.vptzMaxMag} onChange={set("vptzMaxMag")} />
                  </div>
                  <div className="row" style={{ marginBottom: 6 }}>
                    <label>소스 폭</label>
                    <input id="dev-vptz-w" type="number" style={{ width: 80 }} placeholder="1920" value={form.vptzW} onChange={set("vptzW")} />
                    <label>소스 높이</label>
                    <input id="dev-vptz-h" type="number" style={{ width: 80 }} placeholder="1080" value={form.vptzH} onChange={set("vptzH")} />
                  </div>
                  <div className="hint" style={{ marginBottom: 4 }}>소스 화각(수평, 0~180)만 있으면 켜집니다. 해상도는 첫 스냅샷의 실측값으로 자동 갱신되고, 최대 배율은 1 초과 64 이하입니다.</div>
                </div>
              </details>
            </div>
          )}
          {/* 기기 조작 결과와 연결 테스트 결과는 서로 다른 사실이다. 한 칸을 공유하던 때는
              연결 테스트 결과를 읽는 중에 저장을 누르면 그 결과가 지워졌다. */}
          <div className="row" style={{ marginTop: 6 }}><span id="dev-msg" className="hint">{msg}</span></div>
          <div className="row" style={{ marginTop: 4 }}>
            <span id="set-probe-out" className="hint">
              {probeOut && probeOut.parts.map((p, i) => (
                p.strong ? <b key={i}>{p.text}</b> : <span key={i}>{p.text}</span>
              ))}
              {probeOut && probeOut.note && <><br /><span className="hint">{probeOut.note}</span></>}
            </span>
          </div>
        </div>
        <div className="card">
          <h2>카메라 캘리브레이션</h2>
          <div className="hint">
            기기별 광학·조준 실측은 <a href="#/calibration" data-i18n-skip className="navlink">캘리브레이션</a> 페이지로 분리되었습니다.
          </div>
        </div>
      </div>
    </section>
  );
}
