// 설치 높이 화면의 판정·문구 — DOM 없이 성립하는 부분 전부.
//
// 이 축은 **답을 못 내는 것이 정상 출력**이다. 그래서 화면의 값어치가 숫자가 아니라
// 「왜 못 냈는가」에 있고, 그 판정들이 여기 모인다.
import { toNum, fmtWhen, elapsedMs, splitMinSec, pad2 } from "../../lib/format.mjs";
import { t } from "../../i18n/index.mjs";

// 빈 값은 0 이 아니라 **없음**이다 — 그 규칙은 format.mjs 의 toNum 이 갖는다.
export const pct = (v) => (toNum(v) === null ? "—" : `${(Number(v) * 100).toFixed(1)}%`);

// 백엔드는 값을 extrinsic.mount 에 싣지만 status/source 는 바깥에도 실린다. 어느 쪽이
// 채워져 있든 같은 사실이므로 둘 다 본다 — 한쪽만 읽고 "없다"고 그리면 거짓말이 된다.
export const EXTRINSIC_STATE = {
  unsurveyed: { label: "미측량", cls: "no", why: "빈칸은 결함이 아니라 정상 상태입니다. 높이를 모르면 월드 좌표를 광고하지 않습니다." },
  height: { label: "설치 높이 있음", cls: "ok", why: "지면까지의 거리를 줄 수 있습니다. 월드 좌표(위치·방위)는 아직 모릅니다." },
  surveyed: { label: "측량됨", cls: "ok", why: "월드 자세까지 압니다." },
};
export const SOURCE_LABEL = {
  manual: "시공 시 현장 실측",
  spec: "도면 · 폴 규격",
  measured: "영상 자동 측정 (보조)",
};
// 두 사이드카가 다 있어야 이 축이 선다(imgproc = 픽셀 연산, detector = 번호판·차량 상자).
export const SIDECAR_LABEL = { imgproc: "영상 처리", detector: "검출기" };
export const JOB_STATE_LABEL = {
  idle: "대기 중", running: "측정 중", done: "완료", stopped: "중지됨", failed: "실패",
};

// 발행본 문서 → 화면에 쓸 줄들. 값이 없으면 그 줄을 아예 안 만든다 — 「—」 로 채운 줄이
// 늘어서면 모르는 것과 없는 것이 구분되지 않는다.
export function extrinsicRows(doc) {
  const ex = doc.extrinsic || {};
  const mount = ex.mount || {};
  const state = EXTRINSIC_STATE[ex.status] || { label: ex.status || "—", cls: "no", why: "" };
  const heightM = toNum(mount.heightM ?? ex.heightM);
  const source = mount.source || ex.source || null;
  const at = mount.publishedAt || mount.measuredAt || ex.measuredAt || null;
  const operator = mount.operator || ex.operator || null;
  const note = mount.note || ex.note || null;
  const rows = [
    { k: t("높이"), v: heightM === null ? "—" : `${heightM.toFixed(2)} m`, big: true },
    { k: t("출처"), v: source ? t(SOURCE_LABEL[source] || source) : "—" },
  ];
  if (at) rows.push({ k: t("시각"), v: fmtWhen(at) });
  if (operator) rows.push({ k: t("측정자"), v: operator });
  rows.push({ k: t("리비전"), v: `rev ${doc.revision}` });
  if (note) rows.push({ k: t("메모"), v: note });
  return { state: { label: t(state.label), cls: state.cls }, rows, why: state.why ? t(state.why) : "" };
}

// 사이드카 준비 상태는 **잡이 도는 동안 응답에서 빠진다**(백엔드가 idle 일 때만 싣는다).
// 그때마다 "알 수 없습니다"로 뒤집으면, 방금까지 준비됐다고 말하던 화면이 측정을 시작한
// 순간 모른다고 말한다 — 아는 사실을 잊는 화면은 고장으로 읽힌다. 마지막으로 들은 값을 든다.
export function mergeReady(prev, st) {
  const seen = ["imgproc", "detector"].filter((k) => k in st);
  return seen.length ? Object.fromEntries(seen.map((k) => [k, st[k]])) : prev;
}

export function readyText(ready) {
  if (!ready) {
    // status 가 200 을 준 이상 이 배포에 축은 있다(없으면 422 axis_unavailable 이다).
    // 모르는 것은 사이드카 상태뿐이고, 그건 백엔드가 대기 중에만 싣는다 — 그렇게 말한다.
    return { text: t("사이드카 상태는 대기 중일 때만 보고됩니다."), missing: false };
  }
  let missing = false;
  const parts = Object.entries(ready).map(([key, value]) => {
    const okay = value === "configured";
    if (!okay) missing = true;
    return `${t(SIDECAR_LABEL[key])} ${okay ? t("준비됨") : t("미설정")}`;
  });
  // 판정은 boolean 으로 남긴다 — 번역된 문자열을 다시 검사하면 언어가 바뀌는 순간 조용히 틀린다.
  return { text: parts.join(" · "), missing };
}

// 백엔드 message 는 대개 단계 이름으로 시작한다("격자 4/6: …") — 앞에 phase 를 또 붙이면
// "격자 · 격자 4/6" 이 된다. 이미 말하고 있으면 되풀이하지 않는다.
export function phaseLine(st) {
  const line = String(st.message || "").trim();
  const name = String(st.phase || "").trim();
  if (name && line.startsWith(name)) return line;
  return [name, line].filter(Boolean).join(" · ");
}

// 잡 한 줄 요약. 경과를 못 구하면(시계 어긋남·startedAt 파싱 불가) 그 조각을 아예 안 붙인다 —
// 「0분 00초」나 「NaN분 NaN초」로 모르는 것을 아는 척하느니 말하지 않는 쪽이 옳다.
export function jobSummary(st) {
  const bits = [];
  const phase = phaseLine(st);
  if (st.state === "running" && st.startedAt) {
    const elapsed = splitMinSec(elapsedMs(st.startedAt));
    if (elapsed) bits.push(t("{m}분 {s}초 경과", { m: elapsed.m, s: pad2(elapsed.s) }));
    if (phase) bits.push(phase);
  }
  if (st.error) bits.push(st.error);
  // 카메라가 원위치로 못 돌아갔으면 그 사실이 화면에 남아야 한다 — 다음 사람이 고배율로
  // 어딘가를 보고 있는 카메라를 보고 "고장났나" 하게 두면 안 된다.
  if (st.cameraStranded) bits.push(t("카메라가 원위치로 돌아가지 못했습니다 — 수동 확인이 필요합니다."));
  return { text: bits.join(" · "), warn: !!(st.error || st.cameraStranded) };
}

// 게이트 표 — 실측을 문턱과 나란히. 문턱은 응답의 status.gates 가 준다(화면이 베끼지 않는다).
// 거부 사유만 주면 "얼마나 모자랐나"를 알 수 없다.
export function gateRows(result, gates) {
  const g = result.grid || null;
  const c = result.cluster || null;
  const grid = gates.grid || {};
  const plate = gates.plate || {};
  return [
    {
      name: "방향 퍼짐", got: g ? `${Number(g.spreadDeg).toFixed(0)}°` : "—",
      want: `≥ ${grid.minSpreadDeg}°`,
      fail: !g || Number(g.spreadDeg) < grid.minSpreadDeg,
      why: "자들이 다 같은 방향이면 높이와 자세가 상쇄돼 어떤 높이든 맞아 보입니다.",
    },
    {
      name: "격자 잔차", got: g ? pct(g.residualMad) : "—",
      want: `≤ ${pct(grid.maxResidualMad)}`,
      fail: !g || Number(g.residualMad) > grid.maxResidualMad,
      why: "도장선을 잘못 읽은 것입니다. 판을 더 모아도 이건 못 고칩니다 — 기하가 틀리면 모든 판이 같이 틀리고 자기들끼리는 사이좋게 일치합니다.",
    },
    {
      name: "번호판 수", got: c ? String(c.nPlates) : "—",
      want: `≥ ${plate.minPlates}`,
      fail: !c || Number(c.nPlates) < plate.minPlates,
      why: "군집 투표가 성립하지 않습니다.",
    },
    {
      name: "군집 지지율", got: c ? pct(c.frac) : "—",
      want: `> ${pct(plate.minClusterFrac)}`,
      fail: !c || Number(c.frac) <= plate.minClusterFrac,
      why: "판들이 서로 다른 답을 말하고 있습니다.",
    },
    {
      name: "군집 산포", got: c ? pct(c.mad) : "—",
      want: `≤ ${pct(plate.maxClusterMad)}`,
      fail: !c || Number(c.mad) > plate.maxClusterMad,
      why: "군집 안에서도 값이 벌어져 있습니다.",
    },
  ];
}

// 결과 요약. **값은 거부돼도 보여 준다** — 무엇이 거부됐는지 볼 수 없으면 판정을 읽을 수 없다.
// 값이 아예 안 나온 것(계량 채널이 통째로 실패)과 값은 나왔는데 게이트가 막은 것은 다른
// 사실이다: 숫자가 없는데 "거부된 값"이라고 쓰면 화면이 없는 값을 있는 척한다.
export function resultSummary(r, gates) {
  const h = toNum(r.heightM);
  const rulers = toNum(r.grid?.rulers);
  const groundLines = toNum(r.grid?.groundLines);
  const material = (rulers === null && groundLines === null) ? null : [
    rulers === null ? null : t("자 {n}", { n: rulers }),
    groundLines === null ? null : t("지면선 {n}", { n: groundLines }),
  ].filter(Boolean).join(" · ");
  // 번호판 지상고는 부산물이자 자기 검산이다. 물리 대역 밖이면 선을 잘못 배정한 것이다.
  const gh = toNum(r.plateGroundHeightCm);
  const band = (gates && gates.plate && gates.plate.plateHeightBandCm) || null;
  const plateGround = gh === null ? null : {
    text: `${gh.toFixed(0)} cm` + (band ? t(" (물리 대역 {lo}~{hi})", { lo: band[0], hi: band[1] }) : ""),
    outside: !!(band && (gh < band[0] || gh > band[1])),
  };
  return {
    heightText: h === null ? "—" : `${h.toFixed(2)} m`,
    accepted: !!r.accepted,
    refusal: r.accepted ? null : (h === null
      ? t("값이 나오지 않았습니다 — 발행할 것이 없습니다.")
      : t("게이트가 거부한 값입니다 — 발행할 수 없습니다.")),
    material,
    plateGround,
    reasons: Array.isArray(r.reasons) ? r.reasons : [],
    gates: gateRows(r, gates || {}),
  };
}

// 상태 조회 실패의 두 갈래 — 이 배포에 축이 없는 것(422)과 진짜 장애. 재시도해도 소용없는
// 쪽을 그렇게 말한다(그리고 시작 버튼을 잠근다).
export function statusErrorText(e) {
  const code = (e.body || {}).code;
  return code === "axis_unavailable"
    ? t("이 백엔드에는 높이 측정 축이 구성돼 있지 않습니다 — 시공 입력은 그대로 쓸 수 있습니다.")
    : t("상태 조회 실패") + ": " + (e.message || e);
}

// no_optics 는 순서의 문제다 — 광학이 먼저, 높이가 나중. 그 순서를 화면이 말해 준다.
export function startErrorText(e) {
  const code = e.body && e.body.code;
  return code === "no_optics"
    ? t("이 기기의 줌→화각 곡선이 없습니다 — 캘리브레이션을 먼저 발행하세요. (픽셀을 각으로 바꾸려면 초점거리가 필요합니다)")
    : (e.message || String(e));
}

// 시공 입력 검증. 백엔드도 1~30m 밖을 거절하지만, cm 를 넣는 실수가 가장 흔하므로
// 왕복 전에 말해 준다.
export function manualHeightError(raw) {
  const heightM = toNum(raw);
  if (heightM === null) return { error: t("높이를 미터로 입력하세요.") };
  if (heightM < 1 || heightM > 30) {
    return { error: t("{v} 는 1~30 m 밖입니다 — cm 를 넣으신 건 아닌가요?", { v: heightM }) };
  }
  return { heightM };
}
