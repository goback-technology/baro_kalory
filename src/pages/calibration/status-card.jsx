// 캘리브레이션 카드 — 검증·전체 스윕의 시작/중지, 진행, 결과(판정·저장·게이트 거절).
import React, { useState } from "react";
import { postJson, api } from "../../lib/api.mjs";
import { fmtNum, toNum, UNREAD } from "../../lib/format.mjs";
import { applyPublishedToRuntime, appliedSuffix } from "./actions.mjs";

const cell = { textAlign: "right", padding: "2px 8px" };

// 어느 줌이 스윕을 흐렸는가. 이것이 없으면 남은 선택지는 20분 전체 재측정뿐이다.
function NoisyAnchorNote({ anchors }) {
  if (!anchors || !anchors.length) return null;
  return (
    <div className="hint" style={{ marginTop: 6 }}>
      {"초점 적합이 튄 줌: " + anchors.map((a) => `${a.zoom} (${a.fitRmsPx}px)`).join(" · ")
        + " — 그 구간에 무늬가 있는 쪽을 향하게 두고 다시 재면 곡선이 좋아집니다."}
    </div>
  );
}

// 검증 결과 — 합격 = 이 카메라에 지금 걸린 보정이 실제로 맞다는 뜻. 불합격이면 '필요한 게인'이
// 곧 이 개체가 원하는 값이므로, 전체 캘리브레이션을 돌려 그 값을 실측해 저장하면 된다.
// '측정 불가'는 합격이 아니다 — 못 본 줌을 통과시켰다고 말하는 게 가장 나쁜 결과다.
//
// 0.19.0(보드 #95)부터 판정은 **구간 대 문턱**이다 — 줌마다 자기 게이트(thresholdPx =
// max(10px, 각도 페데스털))와 신뢰구간(ciAbsPx)이 오고, 구간이 게이트에 걸치면 fail 이
// 아니라 **inconclusive** 다. 노이즈가 정한 판정을 불합격이라 부르지 않는다. 논리 분기는
// certified 불린만 쓴다 — verdict !== "fail" 은 판정 보류를 성공으로 삼키는 버그다.
// 옛 백엔드에는 새 필드가 없으므로 종전 표기가 그대로 나온다 — 없는 값을 지어내지 않는다.
function VerifyResult({ r, verifyOnly }) {
  const verdictText = { pass: "합격", fail: "불합격", incomplete: "측정 불가 구간 있음",
    inconclusive: "판정 보류 — 측정 한계", unknown: "판정 불가" }[r.verdict] || r.verdict;
  const color = r.verdict === "pass" ? "var(--color-accent,#4a4)"
    : r.verdict === "fail" ? "var(--color-danger,#e66)" : "var(--color-warn,#ca4)";
  // 남는 오차 칸: 새 계약의 signedPx 가 먼저고, 없으면 옛 residualPx 다. 둘 다 없으면
  // 「못 읽음」이라고 말한다 — 예전엔 여기서 화면에 "undefinedpx" 가 찍혔다.
  const signedCell = (c) => {
    const s = toNum(c.signedPx);
    if (s !== null) return (s > 0 ? "+" : "") + fmtNum(s, 1);
    const r0 = toNum(c.residualPx);
    return r0 !== null ? String(r0) : UNREAD;
  };
  const overGate = toNum(r.worstOverGate);
  const headNum = overGate !== null
    ? ` — 최악 잔차가 자기 줌 기준의 ${fmtNum(overGate, 1)}×`
    : (r.worstPx !== null && r.worstPx !== undefined ? ` — 잰 구간의 최악 잔차 ${r.worstPx}px (기준 10px)` : "");
  // 보정이 하나도 안 걸린 채 잰 검증의 fail 은 「카메라 불량」이 아니라 「보정 전 기록」이다.
  // 비교 시연의 before 절반이 빨간 경고로 뒤덮이면 안 된다(보드 #95 렌더링 노트).
  const uncorrected = r.calibration === "none";
  const hasNew = Array.isArray(r.checks) && r.checks.some((c) => c && c.verdict);
  const ckVerdict = (c) => {
    const t2 = c.verdict === "pass" ? "합격" : c.verdict === "fail" ? "불합격"
      : c.reason === "few_samples" ? "보류 · 표본 부족" : "보류 · 측정 한계";
    const col = c.verdict === "pass" ? "var(--color-accent,#4a4)"
      : c.verdict === "fail" ? "var(--color-danger,#e66)" : "var(--color-warn,#ca4)";
    return <td style={{ ...cell, color: col }}>{t2}</td>;
  };
  return (
    <>
      <div style={{ color, marginBottom: 6 }}>검증 {verdictText}{headNum}</div>
      {uncorrected && (
        <div className="hint" style={{ marginBottom: 6, color: "var(--color-warn,#ca4)" }}>
          <b>미보정 상태 측정</b> — 지금 이 카메라에는 보정이 걸려 있지 않습니다(게인 1.0).
          이 결과는 「보정 전」 기록이지 카메라 불량이 아닙니다.
        </div>
      )}
      {r.checks.length > 0 && (
        <table style={{ fontSize: 12, borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <th style={cell}>zoom</th>
              <th style={cell}>남는 오차</th>
              {hasNew && (<><th style={cell}>신뢰구간</th><th style={cell}>기준</th><th style={cell}>판정</th></>)}
              <th style={cell}>적용 중</th>
              <th style={cell}>이 카메라에 필요</th>
            </tr>
            {r.checks.map((c, i) => (
              <tr key={i}>
                <td style={cell}>{c.zoom}</td>
                <td style={cell}>{signedCell(c)}px</td>
                {hasNew && (
                  <>
                    <td style={cell}>{c.ciAbsPx ? `${fmtNum(c.ciAbsPx.lo, 1, UNREAD)}–${fmtNum(c.ciAbsPx.hi, 1, UNREAD)}px` : "—"}</td>
                    <td style={cell}>{c.thresholdPx != null ? fmtNum(c.thresholdPx, 1, UNREAD) + "px" : "—"}</td>
                    {c.verdict ? ckVerdict(c) : <td style={cell}>—</td>}
                  </>
                )}
                <td style={cell}>{c.gainApplied}</td>
                <td style={cell}>{c.gainNeeded}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hasNew && (
        <div className="hint" style={{ marginTop: 4 }}>
          남는 오차의 부호: + 는 못 미침(undershoot), − 는 지나침(overshoot). 「보류 · 측정 한계」는
          이 설치 환경(바람·구조물)의 산포가 기준보다 커서 판정할 수 없다는 뜻입니다 — 다시 재도
          같습니다. 표본을 늘리면 좁아질 수 있습니다.
        </div>
      )}
      {Array.isArray(r.unmeasured) && r.unmeasured.length > 0 && (
        <div className="hint" style={{ marginTop: 6, color: "var(--color-warn,#ca4)" }}>
          {r.unmeasured.map((u, i) => (
            <div key={i}>{`줌 ${u.zoom}: ${u.why || u.reason || "측정하지 못했습니다"} — 장면 문제라 판정에서 뺐습니다`}</div>
          ))}
        </div>
      )}
      {r.hint && <div className="hint" style={{ marginTop: 6, color: "var(--color-warn,#ca4)" }}>{r.hint}</div>}
      {r.verdict === "fail" && (
        <div className="hint" style={{ marginTop: 6, ...(verifyOnly ? { color: "var(--color-danger,#e66)" } : {}) }}>
          {verifyOnly
            ? "시뮬레이터 조준이 렌더와 어긋납니다 — 플러그인(HucomsProtocol) 기하가 회귀했을 수 있습니다."
            : (uncorrected
              ? "보정이 없는 상태의 측정입니다 — 전체 캘리브레이션을 돌려 이 카메라의 실측값을 발행하면 위 「필요」 값이 걸립니다."
              : "이 개체는 지금 걸린 값과 다릅니다 — 전체 캘리브레이션을 돌려 이 카메라의 실측값을 저장하세요.")}
        </div>
      )}
      <div className="hint" style={{ marginTop: 6 }}>
        {`샘플 ${r.usable}/${r.of} 사용 (나머지는 장면에 특징이 없거나 반복 무늬라 버림)`}
      </div>
    </>
  );
}

// 전체 캘리브레이션 완료 — 결과 표 + 저장. 발행 게이트에 걸리면 **화면 안에서** 우회할 수
// 있어야 한다: 게이트를 만들면서 우회로(force)를 백엔드에만 두고 화면에는 안 만들었더니,
// 20분짜리 실측이 막다른 길에 섰다(2026-08-05 cam-real-002). 거절은 정보여야지 벽이면 안 된다.
function FullResult({ r, onSaved }) {
  const [note, setNote] = useState("");
  // idle → saved(성공 문구) / gate(거절 — 메모를 건져 다시 받는다. 리비전은 발행 후 불변이라
  // 우회한 이유는 지금 적지 않으면 영영 남지 않는다).
  const [save, setSave] = useState({ phase: "idle" });

  async function saveSweep(force) {
    try {
      // 발행의 정식 이름은 mint 다. /save 는 하위호환 별칭이라 언제 사라져도 이상하지 않다.
      const res = await postJson(api("/calibration/mint"), {
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(force ? { force: true } : {}),
      });
      // 발행 직후 적재까지 확인한다 — 여기서 멈추면 20분을 들인 곡선이 문서로만 남고, 조준은
      // 계속 옛 값으로 돈다(증상이 없어서 사람은 그 사실을 모른다).
      const applied = await applyPublishedToRuntime(await onSaved.cameraId(), res);
      setSave({ phase: "saved", res, applied });
      onSaved.refresh();
    } catch (e) {
      if (e.status === 422 && e.body && e.body.code === "quality_gate") {
        // 비었으면 미달 사유로 채워 둔다 — 우회 발행이 메모 없이 나가는 사고의 재발 방지.
        if (!note.trim()) setNote("발행 기준 미달을 알고 발행: " + (e.body.failures || []).join(" "));
        setSave({ phase: "gate", body: e.body });
        return;
      }
      alert("저장 실패: " + e.message);
    }
  }

  if (save.phase === "saved") {
    const { res, applied } = save;
    const rev = res && res.minted ? ` (rev ${res.minted.revision} 발행)` : "";
    return (
      <>
        <div style={{ color: applied.applied ? "var(--color-accent,#4a4)" : "var(--color-warn,#ca4)" }}>
          {`저장했습니다${rev}.` + appliedSuffix(applied)}
        </div>
        {res && res.forced && res.forced.length > 0 && (
          <div className="hint" style={{ marginTop: 6, color: "var(--color-warn,#ca4)" }}>
            {"발행 기준을 우회했습니다 — 그 사유가 문서에 남습니다: " + res.forced.join(" ")}
          </div>
        )}
        {/* 통과했더라도 시끄러운 앵커는 알려 준다 — 그 구간만 다시 재면 곡선이 좋아진다. */}
        <NoisyAnchorNote anchors={res && res.noisyAnchors} />
      </>
    );
  }

  if (save.phase === "gate") {
    const body = save.body;
    return (
      <>
        <div style={{ color: "var(--color-warn,#ca4)", marginBottom: 6 }}>이 스윕은 발행 기준에 미달합니다.</div>
        {/* failures 가 비어 오면 error 문장이라도 띄운다 — 안 그러면 "미달합니다"라는 제목만
            남고 **왜** 가 사라져, 사람에게 남는 선택지가 20분 재측정뿐이 된다. */}
        {(body.failures && body.failures.length ? body.failures : [String(body.error || "")]).filter(Boolean)
          .map((line, i) => <div className="hint" key={i}>{line}</div>)}
        <NoisyAnchorNote anchors={body.noisyAnchors} />
        <div className="hint" style={{ marginTop: 8 }}>
          재측정이 정석입니다. 그래도 발행하면 미달 사유가 발행 문서에 함께 박혀, 나중에 이 리비전을
          읽는 사람이 그 사실을 알게 됩니다.
        </div>
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <input style={{ width: 360 }} placeholder="이 측정에 붙일 이름·메모"
            value={note} onChange={(e) => setNote(e.target.value)} />
          <button onClick={() => saveSweep(true)}>그래도 발행</button>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ marginBottom: 6 }}>
        캘리브레이션 완료 — 이 카메라는 최대 <b>{r.residual.beforePx}px</b> 빗나가고 있었습니다.
        {` (초점 적합 — 대표 앵커 ${r.residual.fitRmsMedianPx ?? "?"}px · 최악 ${r.residual.fitRmsPx}px · 샘플 ${r.usable}/${r.of})`}
      </div>
      {r.skipped && r.skipped.length > 0 && (
        <div className="hint" style={{ marginBottom: 6, color: "var(--color-warn,#ca4)" }}>
          {r.skipped.map((s, i) => <div key={i}>{`줌 ${s.zoom}: ${s.why || "측정하지 못했습니다"}`}</div>)}
          <div>그 구간의 곡선은 이웃 값에서 보간됩니다 — 조건을 갖춰 다시 돌리면 더 정확해집니다.</div>
        </div>
      )}
      <table style={{ fontSize: 12, borderCollapse: "collapse", marginBottom: 8 }}>
        <tbody>
          <tr>
            <th style={cell}>zoom</th><th style={cell}>실측 화각</th>
            <th style={cell}>조준 게인</th><th style={cell}>보정 전 오차</th>
          </tr>
          {r.zoomHfov.map((h, i) => (
            <tr key={h.z}>
              <td style={cell}>{h.z}</td>
              <td style={cell}>{h.h}°</td>
              <td style={cell}>{r.centeringGain[i].k}</td>
              <td style={cell}>{r.residual.byZoom[h.z]}px</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ gap: 8 }}>
        {/* 메모는 발행 문서(quality.note)에 남는다. 리비전은 발행 후 불변이라 나중에 고칠 수
            없다 — 지금 적어 두지 않으면 그 측정이 무엇이었는지 영영 알 수 없다. */}
        <input style={{ width: 300 }} placeholder="이 측정에 붙일 이름·메모 (선택)"
          value={note} onChange={(e) => setNote(e.target.value)} />
        <button onClick={() => saveSweep(false)}>이 기기에 저장</button>
      </div>
      <div className="hint" style={{ marginTop: 6 }}>
        저장하면 리비전 문서로 발행됩니다 — 메모는 그 문서에 함께 남아 나중에 "어떤 조건에서 잰
        값인지"를 구분해 줍니다. 적용됐는지는 발행 직후 결과 문구가 말해 줍니다.
      </div>
    </>
  );
}

// 카드 본체. 시작·중지의 confirm 문구와 잠금 규칙은 인라인 시절 그대로다.
export function StatusCard({ st, verifyOnly, installed, onPollStart, refresh, cameraId }) {
  const running = !!st && st.state === "running";
  // 새 스윕이 시작되면 지난 결과(저장 문구 포함)를 접는다 — key 로 FullResult 를 리셋한다.
  const runKey = st ? `${st.startedAt || ""}:${st.mode || ""}` : "";

  async function start(mode) {
    if (mode === "full" && !confirm("전체 캘리브레이션을 시작합니다.\n\n약 20분간 카메라가 자동으로 움직이며 그동안 다른 조작은 막힙니다.\n끝나면 원래 위치로 돌아갑니다. 계속할까요?")) return;
    try { await postJson(api("/calibration/start"), { mode }); onPollStart(); }
    catch (e) { alert("시작 실패: " + e.message); }
  }
  async function stop() {
    try { await postJson(api("/calibration/stop"), {}); }
    catch (e) { alert("중지 실패: " + e.message); }
  }

  return (
    <>
      <div id="calib-desc" className="hint" style={{ marginBottom: 8, lineHeight: 1.5 }}>
        {verifyOnly ? (
          // 기하학적으로 정확한 카메라(UE 시뮬레이터)는 보정할 상수가 없다 — 카드 문구를
          // 바꿔 아무도 시뮬을 "캘리브레이션"하려 들지 않게 한다.
          <>시뮬레이터는 렌더와 <b>같은 표로 조준</b>하므로 기하학적으로 정확합니다 — 보정할 상수가
            없습니다. <b>정합 검증</b>은 클릭 조준이 화면과 어긋나지 않는지 실기와 동일한 방식으로
            확인하는 회귀 테스트입니다 (저장 없음).</>
        ) : (
          <>이 카메라의 렌즈가 줌마다 실제로 얼마나 보는지(표시용)와, 펌웨어가 클릭 지점에서 얼마나
            빗나가는지(조준용)를 실측해 <b>이 기기에만</b> 저장합니다. 카메라 개체마다 다를 수 있으므로,
            다른 카메라를 설치했다면 <b>검증</b>부터 돌려 기본값으로 충분한지 확인하세요.</>
        )}
      </div>
      <div id="calib-installed" className="hint" style={{ marginBottom: 8 }}>
        {verifyOnly ? (
          <>이 카메라는 <b>시뮬레이터</b>입니다 — 기하학적으로 정확하여 <b>보정이 필요 없습니다</b>.
            클릭 조준이 화면 렌더와 일치하는지 <b>정합 검증</b>으로 확인할 수 있습니다 (저장 없음).</>
        ) : installed ? (
          installed.parts.map((p, i) => (p.strong ? <b key={i}>{p.text}</b> : <span key={i}>{p.text}</span>))
        ) : ""}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button id="calib-verify" disabled={running} onClick={() => start("verify")}>
          {verifyOnly ? "정합 검증" : "검증 (약 3분)"}
        </button>
        {!verifyOnly && (
          <button id="calib-start" disabled={running} onClick={() => start("full")}>전체 캘리브레이션 (약 20분)</button>
        )}
        <button id="calib-stop" disabled={!running} onClick={stop}>중지</button>
      </div>
      <div id="calib-advice" className="hint" style={{ marginTop: 6 }}>
        {verifyOnly ? (
          <>정합 검증 중에는 시뮬 카메라가 자동으로 움직이며, 끝나면 원래 위치로 돌아갑니다.</>
        ) : (
          <>캘리브레이션 중에는 카메라가 자동으로 움직이며, 다른 이동 명령은 차단됩니다. 끝나면 원래
            위치로 돌아갑니다.<br />
            <b>밝을 때, 차량·주차선처럼 무늬가 있는 쪽을 향한 상태</b>에서 돌리세요 — 화면에서 지점을
            찾아내는 방식이라 야간·역광이거나 민무늬면 특히 고배율 구간을 측정하지 못합니다.</>
        )}
      </div>
      {running && (
        <div id="calib-progress" style={{ marginTop: 10 }}>
          <div style={{ height: 6, background: "var(--color-surface-2, #222)", borderRadius: 3, overflow: "hidden" }}>
            <div id="calib-bar" style={{ height: "100%", width: (st.progress ? st.progress.percent : 0) + "%",
              background: "var(--color-accent, #4a4)", transition: "width .3s" }} />
          </div>
          <div id="calib-msg" className="hint" style={{ marginTop: 6 }}>
            {`${st.mode === "verify" ? "검증" : "캘리브레이션"} ${st.progress ? st.progress.percent : 0}% (${st.progress ? st.progress.done : 0}/${st.progress ? st.progress.total : 0}) · ${st.message || ""}`}
          </div>
        </div>
      )}
      {!running && st && st.state === "failed" && (
        <div id="calib-result" style={{ marginTop: 10 }}>
          <div style={{ color: "var(--color-danger,#e66)" }}>{`실패: ${st.error || "알 수 없는 오류"}`}</div>
        </div>
      )}
      {!running && st && st.state === "done" && st.result && (
        <div id="calib-result" style={{ marginTop: 10 }}>
          {st.result.mode === "verify"
            ? <VerifyResult r={st.result} verifyOnly={verifyOnly} />
            : <FullResult key={runKey} r={st.result} onSaved={{ cameraId, refresh }} />}
        </div>
      )}
    </>
  );
}
