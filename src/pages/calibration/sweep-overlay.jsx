// ── 스윕 오버레이 ────────────────────────────────────────────────────────────
// 스윕은 실기를 20분 독점한다. 그동안 화면이 퍼센트만 세면 "도는 중"과 "굳음"을 구분할 수
// 없다. status 의 recent[](마지막 6표본)에 이미 답이 있다 — 어디를 눌렀고(dx,dy), 옮기고
// 나서 얼마나 빗나갔는지(residualX,Y), 그 표본이 쓸 만했는지(usable·peak·margin).
//
// 좌표계는 언제나 1920x1080 논리 프레임이다(저장소 계약) — 프리뷰가 1280 이든 640 이든
// 화각이 같으므로 viewBox 하나로 정확히 겹친다. naturalWidth 를 읽지 않는다.
import React from "react";
import { t } from "../../i18n/index.mjs";
import { toNum, fmtClock, elapsedMs } from "../../format.mjs";

export const FRAME_W = 1920, FRAME_H = 1080;
const CX = FRAME_W / 2, CY = FRAME_H / 2;
// 검증의 합격선(화면 안내와 같은 값). 허용 원을 이 반지름으로 그려 합·불을 눈으로 가른다.
export const PASS_PX = 10;
// 잔차는 합격선이 10px 언저리라 실척으로 그리면 화면에서 1~3px 이 되어 보이지 않는다.
// 확대해 그리되 **배율과 허용 원을 함께** 표시한다 — 말없이 부풀린 그림은 거짓말이다.
export const RESIDUAL_ZOOM = 8;

// 프레임 가구 — 논리 프레임의 경계·삼분할. 영상만 보면 "어디가 중앙인지"조차 모른다.
function FrameFurniture() {
  const T = 54;
  return (
    <g opacity=".28">
      {[1, 2].map((i) => (
        <React.Fragment key={i}>
          <line x1={(FRAME_W / 3) * i} y1={0} x2={(FRAME_W / 3) * i} y2={FRAME_H}
            stroke="var(--color-border2, #585)" strokeWidth={2} strokeDasharray="14 18" />
          <line x1={0} y1={(FRAME_H / 3) * i} x2={FRAME_W} y2={(FRAME_H / 3) * i}
            stroke="var(--color-border2, #585)" strokeWidth={2} strokeDasharray="14 18" />
        </React.Fragment>
      ))}
      {[[0, 0, 1, 1], [FRAME_W, 0, -1, 1], [0, FRAME_H, 1, -1], [FRAME_W, FRAME_H, -1, -1]].map(([x, y, sx, sy]) => (
        <path key={`${x},${y}`} d={`M ${x} ${y + sy * T} L ${x} ${y} L ${x + sx * T} ${y}`}
          stroke="var(--color-accent, #4a4)" strokeWidth={5} fill="none" opacity=".8" />
      ))}
    </g>
  );
}

// 줌 앵커 사다리 — 20분짜리 작업에서 "몇 번째 앵커인가"가 곧 남은 시간이다.
function ZoomLadder({ done, total }) {
  if (!Number.isFinite(total) || total <= 0) return null;
  const x = FRAME_W - 54, top = 150, bottom = FRAME_H - 150, span = bottom - top;
  const n = Math.min(total, 40);                     // 촘촘하면 눈금이 뭉갠다 — 40개로 자른다
  const cy = top + span * Math.min(Math.max(done / total, 0), 1);
  return (
    <g>
      <line x1={x} y1={top} x2={x} y2={bottom}
        stroke="var(--color-border2, #585)" strokeWidth={3} opacity=".6" />
      {Array.from({ length: n }, (_, i) => {
        const y = top + (span * i) / Math.max(n - 1, 1);
        const passed = (i / Math.max(n - 1, 1)) * total <= done;
        return <line key={i} x1={x - (passed ? 18 : 10)} y1={y} x2={x + (passed ? 18 : 10)} y2={y}
          stroke={passed ? "var(--color-accent, #4a4)" : "var(--color-border2, #585)"}
          strokeWidth={passed ? 5 : 3} opacity={passed ? ".95" : ".5"} />;
      })}
      <circle cx={x} cy={cy} r={13} fill="var(--color-accent, #4a4)" />
      <text x={x - 26} y={cy + 7} textAnchor="end" fill="var(--color-bright, #cfc)"
        fontSize={30} fontFamily="monospace">{`${done}/${total}`}</text>
    </g>
  );
}

// 표본 좌표 — 오버레이와 자취 폴리라인이 같은 계산을 써야 하므로 밖으로 뺐다.
function samplePos(s) {
  const dx = toNum(s.dx), dy = toNum(s.dy);
  if (dx === null || dy === null) return null;        // 모양이 다르면 조용히 건너뛴다
  return { tx: CX + dx, ty: CY + dy };
}

// 표본 하나 — 눌러 준 지점, 허용 원, 남은 오차 벡터. 기호가 곧 설명이 되도록 그린다.
function Sample({ s, newest, fade }) {
  const pos = samplePos(s);
  if (!pos) return null;
  const { tx, ty } = pos;
  // usable===false 만 실패로 친다 — 필드가 없으면(모양 변경) 성공으로 단정하지 않고 중립.
  const bad = s.usable === false;
  const color = bad ? "var(--color-warn, #ca4)" : "var(--color-accent, #4a4)";
  const rx = toNum(s.residualX), ry = toNum(s.residualY);
  const mag = rx !== null && ry !== null ? Math.hypot(rx, ry) : null;
  const ex = tx + (rx ?? 0) * RESIDUAL_ZOOM, ey = ty + (ry ?? 0) * RESIDUAL_ZOOM;
  const rcol = bad ? "var(--color-warn, #ca4)"
    : mag !== null && mag > PASS_PX ? "var(--color-danger, #e66)" : "var(--color-bright, #cfc)";
  const z = toNum(s.zoom);
  return (
    <g opacity={fade.toFixed(2)}>
      {/* (1) 명령 벡터: 중앙에서 이 지점까지 — "이번에 카메라에게 가운데로 옮기라고 시킨 거리". */}
      <line x1={CX} y1={CY} x2={tx} y2={ty} stroke={color}
        strokeWidth={newest ? 3 : 2} strokeDasharray="12 12" opacity=".55" />
      {/* (2) 허용 원: 합격선을 잔차와 **같은 배율**로 그린다. 벡터 끝이 이 안이면 합격이다. */}
      <circle cx={tx} cy={ty} r={PASS_PX * RESIDUAL_ZOOM} fill="none"
        stroke="var(--color-border2, #585)" strokeWidth={2} strokeDasharray="8 10" opacity=".8" />
      {/* (3) 표적 레티클: 십자 + 원. 못 쓴 표본은 파선으로 갈라 보인다. */}
      <circle cx={tx} cy={ty} r={newest ? 17 : 12} fill="none" stroke={color}
        strokeWidth={newest ? 4 : 3} strokeDasharray={bad ? "6 6" : "none"} />
      {[[tx - 30, ty, tx - 12, ty], [tx + 12, ty, tx + 30, ty],
        [tx, ty - 30, tx, ty - 12], [tx, ty + 12, tx, ty + 30]].map(([a, b, c, d], i) => (
        <line key={i} x1={a} y1={b} x2={c} y2={d} stroke={color} strokeWidth={3} />
      ))}
      {newest && (
        <circle cx={tx} cy={ty} r={17} fill="none" stroke={color} strokeWidth={3}>
          <animate attributeName="r" values="17;58;17" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values=".9;0;.9" dur="1.8s" repeatCount="indefinite" />
        </circle>
      )}
      {/* (4) 잔차 벡터: 옮기고 나서 남은 오차. 확대 배율은 HUD 와 범례가 말한다. */}
      {rx !== null && ry !== null && (
        <>
          <line x1={tx} y1={ty} x2={ex} y2={ey} stroke={rcol}
            strokeWidth={newest ? 6 : 4} strokeLinecap="round" />
          <circle cx={ex} cy={ey} r={newest ? 8 : 6} fill={rcol} />
          {newest && (
            <text x={ex + 16} y={ey - 12} fill={rcol} fontSize={30}
              fontFamily="monospace">{`${mag.toFixed(1)}px`}</text>
          )}
        </>
      )}
      {/* (5) 줌 앵커 번호 — 어느 배율에서 잰 표본인지. */}
      {z !== null && (
        <text x={tx + 22} y={ty + 40} fill={color} fontSize={28}
          fontFamily="monospace" opacity=".9">{`z${z}`}</text>
      )}
    </g>
  );
}

function HudRow({ k, v, cls }) {
  return (
    <div className={"hud-row" + (cls ? " " + cls : "")}>
      <span>{k}</span>
      <span>{v}</span>{/* 서버 값 — React 는 텍스트로만 그린다 */}
    </div>
  );
}

// 스윕 오버레이 전체 — SVG·HUD·범례·캡션. running 이 아니면 아무것도 그리지 않는다.
export function SweepOverlay({ st }) {
  const running = st && st.state === "running";
  const recent = running && Array.isArray(st.recent) ? st.recent : [];
  const last = recent.length ? recent[recent.length - 1] : null;
  const prog = (running && st.progress) || {};
  const done = toNum(prog.done) ?? 0, total = toNum(prog.total) ?? 0;
  const pct = toNum(prog.percent) ?? 0;

  // 경과는 서버의 startedAt 과 이쪽 시계의 차다 — 시계가 어긋나면 음수가 나온다.
  // 그때 0 으로 뭉개면 「방금 시작함」이라는 틀린 사실이 뜬다. 모르면 모른다고 한다.
  const elapsed = running ? elapsedMs(st.startedAt) : null;
  // 남은 시간은 지금까지의 평균 속도로 민 추정이다 — 정확한 값인 척하지 않는다(≈).
  const eta = elapsed !== null && done > 0 && total > 0 ? (elapsed / done) * (total - done) : null;

  const lastZoom = last ? toNum(last.zoom) : null;
  const rx = last ? toNum(last.residualX) : null, ry = last ? toNum(last.residualY) : null;
  const mag = rx !== null && ry !== null ? Math.hypot(rx, ry) : null;
  // 0.17.1 부터 표본마다 진동 안정화 대기가 실린다(보드 #92) — 이 표본이 멈춘 화면에서
  // 측정됐는지가 잔차의 신뢰도를 말한다. 필드가 없는 옛 백엔드에서는 줄 자체가 안 뜬다.
  const settle = last ? toNum(last.settleMs) : null;
  const warnText = last ? ({
    timeout: t("정지 못 함 — 가장 조용한 순간 사용"),
    unmeasurable: t("패턴 부족 — 추적 불가"),
    undecodable: t("프레임 손상"),
  })[last.settleWarn] || null : null;
  const usable = recent.filter((s) => s.usable !== false).length;

  // 지나온 표적을 잇는 자취 — 스윕이 프레임을 어떻게 훑고 있는지가 한눈에 보인다.
  const trail = recent.map(samplePos).filter(Boolean);

  return (
    <>
      <svg id="calib-overlay" viewBox={`0 0 ${FRAME_W} ${FRAME_H}`} preserveAspectRatio="none" aria-hidden="true">
        {running && (
          <>
            <FrameFurniture />
            <ZoomLadder done={done} total={total} />
            {recent.map((s, i) => (
              <Sample key={i} s={s} newest={i === recent.length - 1}
                fade={0.3 + 0.7 * ((i + 1) / recent.length)} />
            ))}
            {trail.length > 1 && (
              <polyline points={trail.map((p) => `${p.tx},${p.ty}`).join(" ")} fill="none"
                stroke="var(--color-accent, #4a4)" strokeWidth={2} strokeDasharray="4 14" opacity=".45" />
            )}
          </>
        )}
      </svg>
      <div id="calib-hud" hidden={!running}>
        {running && (
          <>
            <div className="hud-title">{st.mode === "verify" ? t("검증 스윕 진행 중") : t("전체 캘리브레이션 진행 중")}</div>
            <div className="hud-bar"><i style={{ width: Math.max(0, Math.min(100, pct)) + "%" }} /></div>
            <HudRow k={t("진행")} v={`${pct}%  (${done}/${total})`} />
            <HudRow k={t("경과 · 남음")} v={`${fmtClock(elapsed)} · ≈${fmtClock(eta)}`} />
            <HudRow k={t("기기")} v={st.deviceId || "—"} />
            <HudRow k={t("줌 앵커")} v={lastZoom !== null ? `z${lastZoom}` : "—"} />
            {last && (
              <>
                <HudRow k={t("잔차")} v={mag === null ? "—" : `${mag.toFixed(1)} px / ${PASS_PX} px`}
                  cls={mag === null ? "" : mag > PASS_PX ? "bad" : "good"} />
                <HudRow k={t("정합 peak · margin")} v={`${toNum(last.peak) ?? "—"} · ${toNum(last.margin) ?? "—"}`} />
                {(settle !== null || last.settleWarn) && (
                  // timeout 은 설치 환경의 속성이다(고배율에서 바람·구조물 — 화면이 영원히
                  // 1px 안으로 안 멈춘다, 보드 #92 실측). 고장 색을 칠하면 정상 동작이
                  // 사고처럼 보인다.
                  <HudRow k={t("진동 안정화")}
                    v={(settle !== null ? (settle / 1000).toFixed(1) + "s" : "—") + (warnText ? " · " + warnText : "")}
                    cls={last.settleWarn === "unmeasurable" || last.settleWarn === "undecodable" ? "bad" : ""} />
                )}
                <HudRow k={t("쓸 만한 표본")} v={`${usable}/${recent.length} ${t("최근")}`} />
              </>
            )}
          </>
        )}
      </div>
      {/* 범례 — 기호가 무슨 뜻인지 화면이 스스로 답한다. */}
      <div id="calib-legend" hidden={!running}>
        {running && [
          ["+", t("눌러 준 지점 — 중앙으로 옮기라고 시킨 자리")],
          ["o", t("허용 원 = {n}px 합격선", { n: PASS_PX })],
          ["→", t("남은 오차 ×{n} 확대", { n: RESIDUAL_ZOOM })],
          ["--", t("파선 원 = 못 쓴 표본 (무늬 부족·역광)")],
        ].map(([sym, text]) => (
          <div className="lg-row" key={sym}>
            <span className="lg-sym">{sym}</span>
            <span>{text}</span>
          </div>
        ))}
      </div>
      {/* 캡션: 서버가 하는 말 그대로 — 사람이 적은 값이 섞일 수 있으므로 텍스트로만. */}
      <div id="calib-caption" hidden={!running}>
        {running && (
          <>
            <span className="cap-spin">◐</span>
            <span>{st.message || t("진행 중…")}</span>
          </>
        )}
      </div>
    </>
  );
}
