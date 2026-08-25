// 주차면 탐색 화면의 판정·좌표 계산 — DOM 없이 성립하는 부분 전부.
//
// 이 화면의 값어치는 「그 점이 어떻게 됐는가」를 정확히 말하는 데 있다. 성공·확인 불가·
// 보류·실패는 네 가지 다른 사실이고, 뭉치면 다음에 무엇을 해야 할지가 사라진다.
import { t } from "../../i18n/index.mjs";

// 프레임은 1920×1080 고정이다 — 프리셋 구도의 좌표계이고, 스트림이 축소돼 와도 비율은 같다.
export const FRAME_W = 1920;
export const FRAME_H = 1080;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 화면 좌표 → 프레임 좌표. 밖으로 나간 클릭은 잘라 넣는다 — 프레임 밖 점은 저장해도
// 조준할 수 없다.
export function framePoint({ clientX, clientY, rect }) {
  return {
    x: Math.round(clamp((clientX - rect.left) / rect.width * FRAME_W, 0, FRAME_W)),
    y: Math.round(clamp((clientY - rect.top) / rect.height * FRAME_H, 0, FRAME_H)),
  };
}

// 지금 카메라가 그 프리셋 구도에 서 있는가. 팬은 0/36000 을 넘어 이어지므로 짧은 쪽으로 잰다 —
// 359.9° 와 0.1° 는 0.2° 차이지 359.8° 차이가 아니다.
export function ptzNear(a, b, tolPT = 150, tolZ = 1500) {
  if (!a || !b) return false;
  const raw = Math.abs(a.panpos - b.panpos);
  const pan = Math.min(raw, 36000 - raw);
  return pan <= tolPT && Math.abs(a.tiltpos - b.tiltpos) <= tolPT
    && Math.abs((a.zoompos || 0) - (b.zoompos || 0)) <= tolZ;
}

// 네 가지 결과는 네 가지 색이다. 뭉치면 「안 됐다」만 남고 무엇을 해야 하는지가 사라진다.
export const HOME_STATUS_COLORS = { ok: "#16d05a", unavailable: "#68c8ff", uncertain: "#e8c33a", failed: "#e0556b" };
export const CURRENT_COLOR = "#e8c33a";
export function homeStatusColor(status) { return HOME_STATUS_COLORS[status] || "#8a9099"; }

// 저장된 lprStatus 는 "ok" 또는 "<status>:<code>" 다. 모르는 값은 실패로 접는다 —
// 성공으로 접으면 안 된 것이 된 것처럼 보인다.
export function parseStoredHomeStatus(value) {
  const raw = String(value || "");
  if (!raw) return { status: null, code: null };
  if (raw.startsWith("ok")) return { status: "ok", code: null };
  const split = raw.indexOf(":");
  const status = split >= 0 ? raw.slice(0, split) : "failed";
  const code = split >= 0 ? raw.slice(split + 1) : null;
  return { status: HOME_STATUS_COLORS[status] ? status : "failed", code };
}

export function homeStatusLabel(status, code, reason, platePx) {
  if (status === "ok") return t("성공") + (platePx ? ` ${platePx}px` : "");
  if (status === "unavailable") return t("번호판 확인 불가");
  if (status === "uncertain") return code === "target_ambiguous" ? t("타깃 판정 보류") : t("판정 보류");
  if (status === "failed" && code === "detector_miss") return t("검출기 누락");
  if (status === "failed" && code === "detector_error") return t("검출기 오류");
  if (status === "failed" && code === "target_lost") return t("타깃 추적 상실");
  return reason || t("실패");
}

// 점 하나의 상태 판정: **진행 중(live)이 저장값을 이긴다.** 방금 다시 호밍한 점이 옛
// 결과로 보이면 화면이 지난 일을 말하게 된다.
export function pointHomeStatus(q, homeLive) {
  const live = homeLive && homeLive.results[q.id];
  const stored = parseStoredHomeStatus(q.lprStatus);
  return {
    isCur: !!(homeLive && homeLive.currentId === q.id),
    hstat: live ? live.status : stored.status,
    hcode: live ? live.code : stored.code,
    hreason: live ? live.reason : null,
    hpx: live ? live.platePx : q.platePx,
  };
}

// 점을 어디에 찍을 것인가. **성공한 호밍만** 재투영 위치로 그린다 — 실패한 호밍의 픽셀은
// 카메라가 엉뚱한 데를 보고 잰 값이라, 그걸로 그리면 점이 있지도 않은 자리로 옮겨 간다.
export function dotPosition(q) {
  const px = String(q.lprStatus || "").startsWith("ok") && q.homedPixel ? q.homedPixel : { x: q.x, y: q.y };
  return { leftPct: px.x / FRAME_W * 100, topPct: px.y / FRAME_H * 100, x: px.x, y: px.y };
}

// 번호판 상자 → 백분율. 퇴화한 상자(뒤집힌 좌표)는 그리지 않는다.
export function plateRect(plate) {
  if (!(Array.isArray(plate) && plate.length === 4)) return null;
  if (plate[2] <= plate[0] || plate[3] <= plate[1]) return null;
  const cl = (v, hi) => clamp(v / hi * 100, 0, 100);
  const left = cl(plate[0], FRAME_W), top = cl(plate[1], FRAME_H);
  return { left, top, width: cl(plate[2], FRAME_W) - left, height: cl(plate[3], FRAME_H) - top };
}

// 마스크 오버레이 — 운영 화면에는 **확정 타깃 또는 모호 후보만** 표시한다. 추적을 잃은
// 상태에서 옛 마스크를 남기면 화면이 없는 차를 붙잡고 있다고 말한다.
export function maskPolygons(overlay) {
  const { targetMask, candidateMasks, maskState } = overlay || {};
  const ok = (poly) => Array.isArray(poly) && poly.length >= 3;
  const pts = (poly) => poly.map((p) => `${p[0]},${p[1]}`).join(" ");
  if (maskState === "track_lost") return [];
  if (maskState === "target_acquire" || maskState === "plate_locked") {
    return ok(targetMask) ? [{ points: pts(targetMask), cls: "target" }] : [];
  }
  if (maskState === "target_ambiguous") {
    return (candidateMasks || []).filter(ok).map((poly) => ({ points: pts(poly), cls: "candidate" }));
  }
  return [];
}

// 호밍 종료 요약 — 네 갈래를 각각 센다.
export function homeSummary(results) {
  const counts = Object.fromEntries(["ok", "unavailable", "uncertain", "failed"]
    .map((key) => [key, (results || []).filter((r) => r.status === key).length]));
  return {
    counts,
    text: `${t("성공")} ${counts.ok} · ${t("확인 불가")} ${counts.unavailable} · ${t("보류")} ${counts.uncertain} · ${t("실패")} ${counts.failed}`,
  };
}

// 리플레이 자막. **조각 배열로 돌려준다** — 인라인 시절 이 자막은 innerHTML 로 붙었고,
// 상류(VLM 의 reason·evidence)에서 온 문자열을 escapeHtml 로 손수 막아야 했다. 그 방어를
// 한 번 빠뜨리면 그대로 주입이다. React 의 텍스트 렌더가 그 규칙이고, 우회로를 만들지 않는다.
export function replayCaption(st) {
  const lines = [];
  lines.push(st.found
    ? { color: null, parts: [
        { text: t("스텝 ") }, { text: String(st.step), strong: true },
        { text: ` · z${st.zoom} · ` + t("판폭 ") }, { text: `${st.plateW}px`, strong: true }] }
    : { color: null, parts: [
        { text: t("스텝 ") }, { text: String(st.step), strong: true },
        { text: ` · z${st.zoom} · ` },
        { text: t("번호판 없음(후보 {n})", { n: (st.boxes || []).length }), color: "#e0556b" }] });

  if (st.vlm) {
    const v = st.vlm;
    let verdict;
    if (v.index === null || v.index === undefined) verdict = v.reason || t("기하 폴백");
    else if (v.index >= 0) verdict = t("내 차 판 선택(#{i})", { i: v.index }) + " — " + (v.reason || "");
    else if (st.approach) verdict = t("접근 시도(부분/소형 판 — 더 가까이)") + " — " + (v.reason || "");
    else verdict = t("내 차 판 없음(드리프트 차단)") + " — " + (v.reason || "");
    lines.push({ color: "#e8c33a", parts: [{ text: t("선비(VLM):") + " " + verdict }] });
  }

  if (st.segment) {
    const s = st.segment;
    const verdict = s.vpdSkipped
      ? (st.found ? t("번호판 잠금 후 LPD 추적 재확인") : t("번호판 추적 재확인 실패"))
      : (st.found ? t("타깃 차량 마스크 내부 번호판 1개") : t("차량 마스크/번호판 소속 미확정"));
    const detail = s.vpdSkipped
      ? t("VPD 생략 · LPD 후보 {p}", { p: s.plateCandidates })
      : t("중앙 마스크 {m} · 내부 판 {p}", { m: s.centerMasks, p: s.plateCandidates });
    lines.push({ color: "#68c8ff", parts: [{ text: `${t("차량 세그멘테이션:")} ${verdict} · ${detail}` }] });
  }

  if (st.visibility) {
    const v = st.visibility;
    const verdict = {
      plate_visible: t("번호판 면이 보임"),
      plate_occluded: t("번호판 영역이 가려짐"),
      plate_side_not_visible: t("번호판이 있는 면이 보이지 않음"),
      uncertain: t("판정 보류"),
    }[v.verdict] || t("판정 보류");
    const evidence = v.evidence || "";
    lines.push({ color: "#b7a4ff", parts: [{
      text: `${t("최종 가시성 판정:")} ${verdict} · ${v.confidence || "-"}${evidence ? ` — ${evidence}` : ""}`,
    }] });
  }
  return lines;
}

// 리플레이 한 스텝의 상자들 — 선택된 것과 후보를 가른다.
export function replayBoxes(st) {
  const pct = (v, hi) => clamp(v / hi * 100, 0, 100);
  const rect = (b) => ({
    left: pct(b[0], FRAME_W), top: pct(b[1], FRAME_H),
    width: pct(b[2], FRAME_W) - pct(b[0], FRAME_W), height: pct(b[3], FRAME_H) - pct(b[1], FRAME_H),
  });
  const isPick = (b) => st.pick && b[0] === st.pick[0] && b[1] === st.pick[1] && b[2] === st.pick[2] && b[3] === st.pick[3];
  const out = (st.boxes || []).filter((b) => !isPick(b)).map((b) => ({ ...rect(b), color: "rgba(255,255,255,.6)", width2: 1 }));
  if (st.pick) out.push({ ...rect(st.pick), color: "#16d05a", width2: 2 });
  return out;
}

// 에이전트 독백 — 같은 단계가 되풀이될 때 같은 줄을 쌓지 않는다. 최근 다섯 줄만 든다.
export function pushThought(prev, text, key) {
  if (!text) return prev;
  const k = key != null ? String(key) : text;
  if (k === prev.lastKey) return prev;
  return { lastKey: k, lines: [...prev.lines, text].slice(-5) };
}
export const EMPTY_THOUGHTS = { lastKey: null, lines: [] };
