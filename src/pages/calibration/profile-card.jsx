// 발행된 프로파일 카드 — 캘리브레이션의 산출물은 config 안의 필드가 아니라 발행 후 불변인
// 문서다. 그 문서가 무엇을 담고 있는지 화면으로 볼 수 있어야 "지금 이 카메라가 어떤
// 곡선으로 조준하는가"를 파일을 열지 않고도 답할 수 있다.
//
// 관리 창구: 백엔드가 두 곳(불변 문서 + 런타임 적용본)을 함께 쓴다. 브라우저는 곡선을 만지지
// 않고 라우트만 부른다 — 복사·수입·적용·퇴역이 전부 한 창구를 지나야 어긋남이 생기지 않는다.
import React, { useEffect, useRef, useState } from "react";
import { postJson, api } from "../../lib/api.mjs";
import { t } from "../../i18n/index.mjs";
import { fmtNum, fmtWhen } from "../../lib/format.mjs";
import { chartFigure } from "./profile-chart.mjs";
import { provText, appliedSuffix } from "./actions.mjs";

const cellR = { textAlign: "right", padding: "2px 8px" };
const cellL = { padding: "2px 10px 2px 0", whiteSpace: "nowrap" };

// 서버가 준 값은 전부 텍스트로 넣는다 — 이름·메모는 사람이 적은 문자열이라 마크업으로
// 해석되면 안 된다(React 의 기본 동작이 곧 그 규칙이다).
function MetaRow({ label, value, strong }) {
  return (
    <div>
      <span style={{ opacity: 0.7 }}>{label ? label + " " : ""}</span>
      {strong ? <b>{value}</b> : <span>{value}</span>}
    </div>
  );
}

// chartFigure 는 DOM 노드를 돌려주는 기존 위젯이다 — 뷰 계층과 무관하게 그대로 쓴다.
function Charts({ doc }) {
  const ref = useRef(null);
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    box.replaceChildren();
    if (!doc) return;
    const optics = doc.optics || {};
    const byZoom = (doc.quality && doc.quality.residual && doc.quality.residual.byZoom) || {};
    const figs = [
      chartFigure({
        title: "줌 → 실측 화각 (가로, 도)",
        points: (optics.zoomHfov || []).map((p) => ({ x: p.z, y: p.h })),
        xLabel: "zoom", fmtX: (v) => String(Math.round(v)), fmtY: (v) => v.toFixed(1) + "°",
      }),
      chartFigure({
        title: "줌 → 조준 게인 (배율) — 1 보다 작으면 펌웨어가 과하게 돈다",
        points: (optics.centeringGain || []).map((p) => ({ x: p.z, y: p.k })),
        xLabel: "zoom", fmtX: (v) => String(Math.round(v)), fmtY: (v) => v.toFixed(3),
      }),
      chartFigure({
        title: "줌별 보정 전 오차 (px) — 클수록 이 카메라가 많이 빗나가던 구간",
        kind: "bar", yZero: true,
        points: Object.entries(byZoom).map(([z, px]) => ({ x: Number(z), y: Number(px) })),
        xLabel: "zoom", fmtX: (v) => String(Math.round(v)), fmtY: (v) => v.toFixed(0),
      }),
    ].filter(Boolean);
    for (const f of figs) box.appendChild(f);
  }, [doc]);
  return <div id="profile-charts" style={{ marginTop: 10 }} ref={ref} />;
}

function ProfileMeta({ doc }) {
  const q = doc.quality || {};
  const res = q.residual || {};
  const issuer = doc.issuer || {};
  const samples = q.samples || {};
  return (
    <div id="profile-meta" className="hint">
      <MetaRow label="" strong
        value={`${doc.profileId} · rev ${doc.revision}${doc.supersedes ? ` (이전 rev ${doc.supersedes})` : ""}`} />
      <MetaRow label="발행" value={`${fmtWhen(doc.issuedAt)} · ${issuer.tool || "?"}@${issuer.version || "?"}`} />
      <MetaRow label="메모" value={q.note || "— (없음)"} strong={!!q.note} />
      <MetaRow label="측정" value={`${fmtWhen(q.measuredAt)} · ${q.method || "?"} · 샘플 ${samples.usable ?? "?"}/${samples.of ?? "?"}`} />
      {res.beforePx !== undefined && (
        // fitRmsPx 는 앵커별 **최댓값**이다 — "피팅 67.3px" 로만 적으면 스윕 전체가 그런 줄
        // 읽힌다. 대표값(중앙값)과 최악값을 나란히 둬야 "한 앵커가 시끄러운 것"과 "스윕이
        // 설명 안 된 것"이 구분된다. 중앙값이 없는 옛 문서는 최악값만 적는다.
        <MetaRow label="오차" value={res.fitRmsMedianPx !== undefined
          ? `보정 전 최악 ${res.beforePx}px · 초점 적합 대표 ${res.fitRmsMedianPx}px / 최악 ${res.fitRmsPx}px`
          : `보정 전 최악 ${res.beforePx}px · 초점 적합 최악 ${res.fitRmsPx}px`} />
      )}
      <MetaRow label="용도" value={(doc.capabilities || []).join(", ") || "—"} />
      {/* 문서 무결성은 파일 옆 .sha256 사이드카가 기준이다. 앞 12자리만 보여도 눈으로 대조된다. */}
      <MetaRow label="무결성" value={String(doc._hash || "—").slice(0, 19) + "…"} />
    </div>
  );
}

function PointsTable({ doc }) {
  const rows = (doc.diagnostics && doc.diagnostics.byZoom) || [];
  if (!rows.length) return <div id="profile-points" />;
  return (
    <div id="profile-points">
      <details>
        <summary className="hint" style={{ cursor: "pointer" }}>{`측정점 ${rows.length}개 — 표로 보기`}</summary>
        <table style={{ fontSize: 12, borderCollapse: "collapse", marginTop: 6 }}>
          <tbody>
            <tr>{["zoom", "화각", "게인", "잔차", "피팅오차", "샘플"].map((h) => (
              <th key={h} style={cellR}>{h}</th>
            ))}</tr>
            {rows.map((p, i) => (
              <tr key={i}>
                {[p.zoom, fmtNum(p.hfov, 2) + "°", fmtNum(p.gain, 3), fmtNum(p.residualPx, 1) + "px",
                  fmtNum(p.fitRmsPx, 1) + "px", `${p.samples ?? "?"}/${p.of ?? "?"}`].map((c, j) => (
                  <td key={j} style={cellR}>{String(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

// 리비전 이력 — 목록은 상태만 말한다: 무엇이 언제 어디서 왔는가. 손대는 일은 전부 위 속성창에.
function RevisionsTable({ revs, appliedRevMark }) {
  if (!revs.length) return <div id="profile-revisions" style={{ marginTop: 12 }} />;
  return (
    <div id="profile-revisions" style={{ marginTop: 12 }}>
      <details open>
        <summary style={{ cursor: "pointer" }}>{t("리비전 {n}개", { n: revs.length })}</summary>
        <table style={{ fontSize: 12, borderCollapse: "collapse", marginTop: 6 }}>
          <tbody>
            <tr>{["rev", t("발행"), t("출처"), t("앵커"), t("메모"), ""].map((h, i) => (
              <th key={i} style={{ ...cellL, textAlign: "left", opacity: 0.7, fontWeight: "normal" }}>{h}</th>
            ))}</tr>
            {revs.slice().reverse().map((r) => (
              <tr key={r.revision} style={r.revision === appliedRevMark ? { color: "var(--color-accent,#4a4)" } : undefined}>
                <td style={cellL}>{String(r.revision)}</td>
                <td style={cellL}>{fmtWhen(r.issuedAt)}</td>
                <td style={cellL} title={r.provenance && r.provenance.measuredOn
                  ? t("최초 실측 기기: {id}", { id: r.provenance.measuredOn }) : ""}>{provText(r.provenance)}</td>
                <td style={cellL} title={r.hasGain ? t("조준 게인 곡선 포함") : t("화각 곡선만 — 조준 보정 없음")}>
                  {`${r.anchors}${r.hasGain ? " +k" : ""}`}</td>
                <td style={cellL}>{r.note || "—"}</td>
                {/* 게이트를 우회해 발행한 리비전은 그 사실이 목록에서 보여야 한다. */}
                <td style={cellL} title={r.forced ? String(r.forced.join(" ")) : ""}>
                  {r.revision === appliedRevMark ? t("적용중") : (r.forced ? t("게이트 우회") : "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function PanelRow({ label, children }) {
  return (
    <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 6 }}>
      <label style={{ minWidth: 84, opacity: 0.7 }}>{label}</label>
      {children}
    </div>
  );
}

function PanelFrame({ title, onClose, children }) {
  return (
    <div id="profile-panel" style={{ display: "block", marginBottom: 10, padding: 10,
      borderRadius: 4, border: "1px solid var(--color-border,#333)" }}>
      <div style={{ marginBottom: 8, opacity: 0.8 }}>{title}</div>
      {children}
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button onClick={onClose}>{t("닫기")}</button>
      </div>
    </div>
  );
}

function CopyPanel({ id, others, preselect, onClose, profileWrite, writeAndApply }) {
  const valid = others.some((p) => p.profileId === preselect);
  const [from, setFrom] = useState(valid ? preselect : (others[0] && others[0].profileId));
  const [note, setNote] = useState("");
  return (
    <PanelFrame title={t("다른 카메라의 발행본을 이 카메라의 새 리비전으로 복사합니다.")} onClose={onClose}>
      {!others.length ? (
        <div className="hint">{t("복사할 수 있는 다른 카메라의 발행본이 없습니다.")}</div>
      ) : (
        <>
          <PanelRow label={t("원본")}>
            <select value={from} onChange={(e) => setFrom(e.target.value)}>
              {others.map((p) => (
                <option key={p.profileId} value={p.profileId}>
                  {`${p.profileId} rev ${p.revision} (${provText(p.provenance)})`}
                </option>
              ))}
            </select>
          </PanelRow>
          <PanelRow label={t("메모")}>
            <input style={{ width: 300 }} placeholder={t("메모 (선택)")}
              value={note} onChange={(e) => setNote(e.target.value)} />
          </PanelRow>
          <div className="hint" style={{ marginTop: 4 }}>
            {t("캘리브레이션은 카메라 개체마다 다릅니다 — 복사한 뒤 검증을 돌려 이 개체에 맞는지 확인하세요. 곡선만 옮겨지고 기기 규격(줌 눈금·배선)은 이 카메라 것으로 다시 기록됩니다.")}
          </div>
          <button onClick={() => {
            // 사람이 **본** 리비전을 못 박아 보낸다(fromRevision). from 만 보내면 서버가 그때의
            // 최신을 집는데, 화면을 열어 둔 사이 원본이 새로 발행되면 보지도 않은 곡선이 복사된다.
            const src = others.find((p) => p.profileId === from);
            return profileWrite(
              () => writeAndApply(() => postJson(api(`/profiles/camera/${encodeURIComponent(id)}/copy`), {
                from,
                ...(src ? { fromRevision: src.revision } : {}),
                ...(note.trim() ? { note: note.trim() } : {}),
              })),
              ({ res, applied }) => t("{from} 에서 복사해 rev {rev} 로 발행했습니다",
                { from, rev: res?.published?.revision ?? "?" }) + appliedSuffix(applied),
            );
          }}>{t("복사")}</button>
        </>
      )}
    </PanelFrame>
  );
}

function ImportPanel({ id, onClose, profileWrite, writeAndApply, setMsg }) {
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  return (
    <PanelFrame title={t("곡선을 직접 넣어 발행합니다. 스윕을 돌릴 수 없는 기기를 위한 문입니다.")} onClose={onClose}>
      <textarea style={{ width: "100%", height: 130, fontFamily: "monospace", fontSize: 12 }}
        placeholder={'{\n  "zoomHfov": [{"z": 0, "h": 57.14}, {"z": 16384, "h": 2.39}],\n  "centeringGain": [{"z": 0, "k": 0.99}]\n}'}
        value={text} onChange={(e) => setText(e.target.value)} />
      <PanelRow label={t("메모")}>
        <input style={{ width: 300 }} placeholder={t("이 값의 출처 (예: 제조사 매뉴얼) — 권장")}
          value={note} onChange={(e) => setNote(e.target.value)} />
      </PanelRow>
      <div className="hint" style={{ marginTop: 4 }}>
        {/* 이 문장은 {z, h} 같은 중괄호를 담고 있어 t() 의 자리표시자 치환과 충돌한다 —
            값 인자를 주지 않으므로 치환은 일어나지 않지만, 사전 키도 원문 그대로여야 한다. */}
        {t("zoomHfov 는 {z, h}(줌 눈금, 수평화각°) 를 z 오름차순으로 최소 2개. centeringGain 은 {z, k} 이며 없으면 조준 보정 없이 화각만 답합니다. 재지 않은 값이므로 문서에 '수입'으로 남고 잔차는 비어 있습니다.")}
      </div>
      <button onClick={() => {
        let body;
        // JSON 파싱 실패는 서버까지 갈 일이 아니다 — 어디가 틀렸는지는 여기가 더 잘 안다.
        try { body = JSON.parse(text); }
        catch (e) { setMsg(t("JSON 을 읽지 못했습니다") + ": " + e.message, "bad"); return; }
        profileWrite(
          () => writeAndApply(() => postJson(api(`/profiles/camera/${encodeURIComponent(id)}`),
            { ...body, ...(note.trim() ? { note: note.trim() } : {}) })),
          ({ res, applied }) =>
            t("rev {rev} 로 발행했습니다", { rev: res?.published?.revision ?? "?" }) + appliedSuffix(applied),
        );
      }}>{t("발행")}</button>
    </PanelFrame>
  );
}

// 이름이 사실을 들어야 한다 — 이 창은 더 이상 "적용"하지 않는다. 런타임은 최신 발행본을
// 스스로 읽으므로, 여기서 할 수 있는 일은 확인과 재발행(되돌리기)/고정 둘뿐이다.
//
// 0.18.0 부터 런타임은 **적용 포인터**를 따른다(기본: 최신 따름). 옛 리비전으로 돌아가는
// 일은 재발행이 아니라 **고정**이다 — 이력에 사본이 늘지 않고, "rev 3 을 다시 쓴다"가
// 그대로 남는다. 포인터가 없는 옛 백엔드에서만 재발행(copy)으로 되돌린다.
function RevisionPanel({ revs, applied, onClose, actions }) {
  const [picked, setPicked] = useState(() => {
    const list = revs.slice().reverse();
    return list.length ? String(list[0].revision) : "";
  });
  if (!revs.length) {
    // 제목은 창의 성격(원본 head)이고, 「없다」는 본문이 말한다 — 같은 문장을 두 번 찍지 않는다.
    return (
      <PanelFrame onClose={onClose} title={t("런타임은 언제나 최신 발행본을 읽습니다. 옛 리비전을 고르면 그것을 새 리비전으로 다시 발행해 되돌립니다.")}>
        <div className="hint">{t("이 카메라에는 아직 발행본이 없습니다.")}</div>
      </PanelFrame>
    );
  }
  // 순서를 가정하지 않고 최대값으로 최신을 정한다(목록 정렬은 표시용 규약일 뿐이다).
  const latest = revs.reduce((m, r) => (Number(r.revision) > m ? Number(r.revision) : m), -Infinity);
  const pickedN = Number(picked);
  // 버튼이 무슨 일이 일어날지 말한다 — 포인터가 있으면 고정/따름, 없으면 재발행이다.
  const goText = applied
    ? (pickedN !== latest ? t("이 리비전에 고정")
      : (applied.following === false ? t("최신 따름으로") : t("지금 적용")))
    : (pickedN === latest ? t("지금 적용") : t("이 리비전으로 되돌리기"));
  const go = () => {
    if (applied) {
      if (pickedN !== latest) return actions.pinToRevision(pickedN);
      return applied.following === false ? actions.refollowProfile() : actions.applyLatestToRuntime();
    }
    return pickedN === latest ? actions.applyLatestToRuntime() : actions.rollbackToRevision(pickedN);
  };
  return (
    <PanelFrame onClose={onClose} title={applied
      ? t("런타임은 적용 포인터를 따릅니다(기본: 최신 따름). 옛 리비전을 고르면 재발행 없이 그 리비전에 고정합니다.")
      : t("런타임은 언제나 최신 발행본을 읽습니다. 옛 리비전을 고르면 그것을 새 리비전으로 다시 발행해 되돌립니다.")}>
      <PanelRow label={t("리비전")}>
        <select value={picked} onChange={(e) => setPicked(e.target.value)}>
          {revs.slice().reverse().map((r) => {
            // 어느 리비전이 지금 조준에 실려 있는지 목록이 스스로 말한다.
            const mark = applied && Number(applied.revision) === Number(r.revision)
              ? (applied.following === false ? t(" · 적용 중(고정)") : t(" · 적용 중")) : "";
            return (
              <option key={r.revision} value={String(r.revision)}>
                {`rev ${r.revision} · ${fmtWhen(r.issuedAt)} · ${provText(r.provenance)}${mark}`}
              </option>
            );
          })}
        </select>
      </PanelRow>
      <button onClick={go}>{goText}</button>
    </PanelFrame>
  );
}

// 카드 본체 — 데이터와 쓰기 동작은 전부 App 이 소유하고, 이 컴포넌트는 그린다.
export function ProfileCard(props) {
  const { id, profile, hasProfile, revs, appliedPtr, appliedRevMark, driftLines, msg,
          panel, openCopyPanel, openImportPanel, openRevisionPanel, closePanel,
          retireProfile, detachProfile, refollowProfile, applyLatestToRuntime,
          profileWrite, writeAndApply, setMsg, panelActions } = props;

  // 「적용 해제」 축 — 존재와 적용은 다른 축이다(0.18.0, 보드 #73). 포인터가 없는 옛 백엔드
  // 에서는 이 축 자체를 그리지 않는다(없는 상태를 있는 척하지 않는다).
  const ptrVisible = appliedPtr && !(appliedPtr.following !== false && appliedPtr.revision == null);

  // 삭제·되돌리기는 **활성 카메라의 발행본**에만 작용한다. 발행본이 없으면 성공할 수 없는
  // 버튼이므로 누르지 못하게 잠근다 — 눌리게 두면 옆 목록(다른 카메라의 카탈로그)을 보고
  // 누른 사람이 "지웠는데 남아 있다"를 겪는다(2026-08-19 실제로 그랬다).
  const lockWhy = `${id} 에는 발행본이 없어 대상이 없습니다. 왼쪽 목록은 모든 카메라의 카탈로그입니다 — 다른 카메라의 발행본을 지우려면 헤더에서 그 카메라를 먼저 고르세요.`;

  return (
    <div className="card" id="profile-card">
      <h2>발행된 프로파일</h2>
      {/* 발행본과 런타임이 갈렸을 때만 나타난다. 늘 떠 있는 경고는 아무도 안 읽는다.
          이 상태는 증상이 없다 — 조준도 되고 화각도 답한다, 틀린 숫자로. 판정은 백엔드가
          한다(profile-drift.mjs) — 브라우저가 곡선을 다시 비교하면 두 번째 구현이 생긴다. */}
      {driftLines.length > 0 && (
        <div id="profile-drift" className="hint" style={{ marginBottom: 10, padding: "8px 10px",
          borderRadius: 4, border: "1px solid var(--color-warn,#ca4)", color: "var(--color-warn,#ca4)",
          lineHeight: 1.5 }}>
          <div>{t("발행본과 지금 쓰는 값이 다릅니다 — 조준과 화각이 발행본 기준으로 틀립니다.")}</div>
          {driftLines.map((line, i) => <div key={i} style={{ marginTop: 4 }}>{line}</div>)}
          <div style={{ marginTop: 8 }}>
            <button onClick={applyLatestToRuntime}
              title={t("최신 발행본이 이 카메라에 실려 있는지 확인하고, 아직 아니면 적재합니다 — 재시작도 재측정도 필요 없습니다.")}>
              {t("지금 적용")}
            </button>
          </div>
        </div>
      )}
      {/* 액션은 목록 위 속성창에 모은다 — 목록은 상태만 보여 준다. */}
      <div className="row" id="profile-actions" style={{ gap: 8, marginBottom: 8 }}>
        <button id="prof-act-copy" onClick={() => openCopyPanel()}
          title="다른 카메라의 발행본을 이 카메라의 새 리비전으로 복사합니다. 같은 모델을 여러 대 들일 때 20분 스윕을 매번 돌리지 않아도 됩니다.">복사</button>
        <button id="prof-act-import" onClick={openImportPanel}
          title="곡선을 직접 넣어 발행합니다. 스윕을 돌릴 수 없는 기기(클릭 센터링이 없거나 실기 시간을 못 얻은 기기)를 위한 문입니다.">수입</button>
        <button id="prof-act-apply" onClick={openRevisionPanel} disabled={!hasProfile}
          title={hasProfile
            ? "지금 실려 있는 발행본을 확인하고, 옛 리비전으로 되돌립니다 — 적용 포인터가 있는 백엔드에서는 그 리비전에 고정하고(이력에 사본이 늘지 않습니다), 없으면 새 리비전으로 다시 발행합니다."
            : lockWhy}>되돌리기</button>
        {ptrVisible && (
          appliedPtr.detached ? (
            <button id="prof-act-detach" onClick={refollowProfile}
              title={t("발행본을 다시 적용합니다 — 최신 따름으로 복귀합니다.")}>{t("다시 적용")}</button>
          ) : (
            <button id="prof-act-detach" onClick={detachProfile}
              title={t("발행본을 지우지 않고 조준만 보정 전 상태(씨앗값)로 되돌립니다 — 적용 전/후 비교 시연용입니다.")}>{t("적용 해제")}</button>
          )
        )}
        <button id="prof-act-retire" onClick={retireProfile} disabled={!hasProfile}
          title={hasProfile
            ? "이 카메라의 발행본 전체를 삭제합니다. 목록과 조회에서 사라지고 화면에서는 되돌릴 수 없습니다 — 이 카메라는 config 씨앗값으로 조준하게 됩니다."
            : lockWhy}>삭제</button>
      </div>
      {panel && panel.kind === "copy" && (
        <CopyPanel id={id} others={panel.others} preselect={panel.preselect} onClose={closePanel}
          profileWrite={profileWrite} writeAndApply={writeAndApply} />
      )}
      {panel && panel.kind === "import" && (
        <ImportPanel id={id} onClose={closePanel} profileWrite={profileWrite}
          writeAndApply={writeAndApply} setMsg={setMsg} />
      )}
      {panel && panel.kind === "revision" && (
        <RevisionPanel revs={panel.revs} applied={panel.applied} onClose={closePanel} actions={panelActions} />
      )}
      {/* 적용 상태 줄 — 일부러 뗀 상태는 경고가 아니라 시연 상태다. 색은 주의(호박)까지만. */}
      {ptrVisible && (
        <div id="profile-applied" className="hint" style={{ marginBottom: 8,
          color: appliedPtr.detached || appliedPtr.following === false ? "var(--color-warn, #ca4)" : "" }}>
          {appliedPtr.detached
            ? t("적용 해제됨 — 씨앗값(없으면 무보정)으로 조준 중입니다. 발행본은 그대로 있습니다.")
            : appliedPtr.following === false
              ? t("적용 상태: rev {rev} 에 고정 — 새로 발행해도 조준에 실리지 않습니다. 「되돌리기」 창에서 최신 따름으로 풀 수 있습니다.", { rev: appliedPtr.revision })
              : t("적용 상태: rev {rev} · 최신 따름", { rev: appliedPtr.revision })}
        </div>
      )}
      {msg.text && (
        <div id="profile-msg" className="hint" style={{ marginBottom: 8,
          color: msg.kind === "bad" ? "var(--color-danger,#e66)"
            : msg.kind === "good" ? "var(--color-accent,#4a4)" : "" }}>{msg.text}</div>
      )}
      {profile === null ? (
        <div id="profile-meta" className="hint">불러오는 중…</div>
      ) : profile.plain ? (
        <div id="profile-meta" className="hint"><MetaRow label="" value={profile.plain} /></div>
      ) : profile.error ? (
        // 404 는 장애가 아니라 "아직 한 번도 발행하지 않았다"는 정상 상태다 — 그렇게 말한다.
        <div id="profile-meta" className="hint">
          <MetaRow label="" value={profile.status === 404
            ? `${id} 에 발행된 프로파일이 없습니다 — 전체 캘리브레이션을 완료하고 저장하면 rev 1 이 발행됩니다.`
            : "프로파일을 읽지 못했습니다: " + profile.error} />
        </div>
      ) : (
        <>
          <ProfileMeta doc={profile.doc} />
          <Charts doc={profile.doc} />
          <PointsTable doc={profile.doc} />
        </>
      )}
      <RevisionsTable revs={revs} appliedRevMark={appliedRevMark} />
    </div>
  );
}
