// 시뮬레이터 평면도의 기하 — DOM 도 네트워크도 없이 성립하는 계산 전부.
//
// **여기 있는 것과 없는 것의 경계가 이 모듈의 요점이다.** 화면이 그리는 부채꼴·조준선·
// 틸트 앵커의 *자리* 는 여기서 나오지만, 그 부채꼴이 **어느 방향을 가리키고 얼마나 넓은가**는
// 여기 없다 — 그건 광학 모델이고 백엔드에 한 벌만 둔다(packages/profile). 화면이 raw PTZ 로
// 방위·화각을 지어내기 시작하면 부채꼴과 영상 위의 주차면 핀이 서로 다른 식으로 그려진다.
//
// 좌표 규약(UE): +X 가 북, +Y 가 동, yaw 0 = +X. 화면 위를 북으로 두면 mapX = worldY,
// mapY = -worldX 이고, 그래야 yaw 0 인 카메라가 그림에서 위를 가리킨다.
import { toNum } from "../../lib/format.mjs";

export const toMap = (w) => ({ x: Number(w?.y) || 0, y: -(Number(w?.x) || 0) });
export const toWorld = (m) => ({ x: -m.y, y: m.x });

// 시야콘 길이는 지도 크기에 비례한다 — 평면도와 끄는 중 미리보기가 같은 값을 써야
// 손을 뗀 그림이 끌던 그림과 같다.
export const CONE_LEN_RATIO = 0.22;

/**
 * 시야콘의 경로. 월드 방위 θ 의 평면도 방향은 (sin θ, −cos θ) 다 — toMap 과 같은 규약.
 *
 * sweep-flag=1: 방위가 커지는 쪽이 평면도에서 시계방향이다(θ=0 위 → θ=90 오른쪽).
 * 0 이면 SVG 가 반대쪽 원을 골라 호가 꼭짓점 쪽으로 파여 부채꼴이 오목해진다.
 */
export function conePathD(p, yawDeg, halfDeg, len) {
  const arc = (deg) => {
    const rad = deg * Math.PI / 180;
    return { x: p.x + Math.sin(rad) * len, y: p.y - Math.cos(rad) * len };
  };
  const a = arc(yawDeg - halfDeg), b = arc(yawDeg + halfDeg);
  return `M ${p.x} ${p.y} L ${a.x} ${a.y} A ${len} ${len} 0 0 1 ${b.x} ${b.y} Z`;
}

/** 방위 θ 에서 길이 len 만큼 뻗은 끝점 — 조준선의 끝이자 앵커의 자리. */
export function tipAt(p, yawDeg, len) {
  const rad = yawDeg * Math.PI / 180;
  return { x: p.x + Math.sin(rad) * len, y: p.y - Math.cos(rad) * len };
}

/** 씬이 보고한 것들을 다 담는 사각형. 아무것도 없으면 그릴 것이 없다(null). */
export function computeMapView(slots = [], cameras = []) {
  const points = [];
  for (const s of slots) if (s?.transform?.location) points.push(toMap(s.transform.location));
  for (const c of cameras) if (c?.mount?.location) points.push(toMap(c.mount.location));
  if (!points.length) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = Math.max(300, Math.max(maxX - minX, maxY - minY) * 0.12);
  return {
    minX: minX - pad, minY: minY - pad,
    width: Math.max(1, (maxX - minX) + pad * 2),
    height: Math.max(1, (maxY - minY) + pad * 2),
  };
}

/** 값 목록의 중앙값. 비어 있으면 null — 0 이라고 우기지 않는다. */
export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function cameraHeightM(camera) {
  const cm = toNum(camera?.heightAboveReferenceGroundCm);
  return cm === null ? null : cm / 100;
}

/**
 * 이 씬의 지면 z(cm). 사람이 넣는 높이는 **지면 기준**이라 월드 z 로 옮기려면 이 값이 필요하다.
 *
 * 카메라가 하나라도 있으면 씬이 계산해 준 groundReference 가 정답이다. 없을 때가 문제인데,
 * 하필 그때가 **새 레벨에 첫 카메라를 세우는 순간**이다 — 물어볼 카메라가 없다고 0 으로 두면
 * 지면이 z=0 이 아닌 레벨에서 그 차이가 통째로 높이 오차가 된다(이 레벨은 10cm, 다른 레벨은
 * 얼마든지 될 수 있다). 슬롯 z 의 중앙값으로 대신 구한다 — 씬이 쓰는 방법과 같다
 * (groundReference.method = "parkingSlotPlacementOriginMedian").
 */
export function sceneGroundZcm(cameras = [], slots = []) {
  for (const cam of cameras) {
    const z = toNum(cam?.groundReference?.zCm);
    if (z !== null) return z;
  }
  const zs = slots.map((s) => toNum(s?.transform?.location?.z)).filter((z) => z !== null);
  return median(zs);   // 슬롯도 카메라도 없으면 null — 모르는 것을 0 이라고 우기지 않는다
}

/**
 * 이 레벨의 주차면 간격(cm) — 같은 방향 이웃까지의 거리 중앙값.
 *
 * 씬은 주차면 치수를 주지 않는다(`transform` 은 location·rotation 뿐). 그래서 **레벨 자신에게서**
 * 읽어 낸다. 나란히 놓인 자리 사이 거리가 곧 한 자리의 폭이다. 방향이 다른 자리는 통로
 * 건너편이라 간격이 폭이 아니므로 뺀다.
 */
export function measureSlotPitchCm(slots = []) {
  const items = slots
    .map((s) => ({ loc: s?.transform?.location, yaw: Number(s?.transform?.rotation?.yaw) || 0 }))
    .filter((s) => s.loc && toNum(s.loc.x) !== null && toNum(s.loc.y) !== null);
  if (items.length < 2) return null;
  const gaps = [];
  for (const a of items) {
    let best = Infinity;
    for (const b of items) {
      if (a === b) continue;
      const turn = Math.abs(((a.yaw - b.yaw) % 180 + 180) % 180);
      if (Math.min(turn, 180 - turn) > 10) continue;
      best = Math.min(best, Math.hypot(a.loc.x - b.loc.x, a.loc.y - b.loc.y));
    }
    if (Number.isFinite(best)) gaps.push(best);
  }
  return median(gaps);
}

/**
 * 주차면 하나의 그림 크기(cm). 둘 다 못 구하면 null — 사각형 대신 점을 찍으라는 뜻이다.
 *
 *   길이 = type 문자열 앞의 숫자("5m"→5m). 못 읽으면 폭에서 되돌려 세운다.
 *   폭   = 이 레벨의 주차면 간격. 다만 자리보다 넓을 수는 없다(1m 자리가 5m 자리만큼
 *          넓어지지 않게).
 *
 * 여기에 "2.5×5m" 같은 규격을 박으면 그 레벨에만 맞는 그림이 되고, 버스면·이륜차면이
 * 승용차면으로 그려진다.
 */
export function slotBoxCm(slot, pitchCm) {
  const metres = toNum(String(slot?.type || "").match(/^(\d+(?:\.\d+)?)\s*m/i)?.[1]);
  const fromType = metres !== null && metres > 0 ? metres * 100 : null;
  const pitch = pitchCm ?? null;
  if (fromType === null && pitch === null) return null;
  const width = pitch === null ? fromType * 0.5 : Math.min(pitch, fromType ?? pitch);
  const length = fromType === null ? pitch * 2 : fromType;
  return { length, width };
}

/**
 * 자리와 조준점 두 점이면 설치 자세가 다 나온다: 방위는 두 점을 잇는 각, 하향각은 높이와
 * 수평거리의 아크탄젠트. 사람이 각도를 상상해서 적는 일을 없애는 것이 요점이다.
 *
 * 높이가 없으면 6 m 로 본다(폼의 기본값) — 두 점이 없으면 아직 계산할 것이 없어 기본 자세다.
 */
export function poseFromPlacement({ from, to, heightM } = {}) {
  const h = toNum(heightM);
  const heightCm = (h === null ? 6 : h) * 100;
  if (!from || !to) return { yawDeg: 0, pitchDeg: -20 };
  const dx = to.x - from.x, dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const yawDeg = Math.atan2(dy, dx) * 180 / Math.PI;
  const pitchDeg = dist < 1 ? -89 : -Math.atan2(heightCm, dist) * 180 / Math.PI;
  return { yawDeg, pitchDeg: Math.max(-89, Math.min(-1, pitchDeg)) };
}

/**
 * 카메라에서 커서를 향한 월드 방위. 커서가 카메라 위에 겹쳐 있는 동안은 방향이랄 것이 없어
 * 각이 튄다 — 그때는 아직 방위가 아니라고 보고(null) 직전 값을 지킨다.
 */
export function aimYawTowards(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (Math.hypot(dx, dy) < 10) return null;
  return Math.atan2(dy, dx) * 180 / Math.PI;
}

/**
 * 보고 싶은 월드 방위 → 보내야 할 팬(휴컴스 원단위, 0..35999).
 * 팬 = 방위 − 설치방위(팬 0 일 때 보는 방위). 0..360 으로 감아서 ×100.
 */
export function panposForYaw(yawDeg, mountYawDeg) {
  return Math.round((((yawDeg - mountYawDeg) % 360 + 360) % 360) * 100);
}

/** 두 방위의 차 — 짧은 쪽으로 잰 −180..180. 「얼마나 돌았나」를 말하는 값이다. */
export function turnBetween(toYaw, fromYaw) {
  return ((toYaw - fromYaw) % 360 + 540) % 360 - 180;
}

// ── 틸트 슬라이더 ────────────────────────────────────────────────────────────────
// 막대 한가운데(녹색 기준선)가 틸트 0. 카메라 쪽 절반이 아래(0..+90°), 끝쪽 절반이 위(0..−20°)
// 다 — 양쪽 한계가 기기 규약(휴컴스 틸트 −2000..9000)의 양끝이라, 트랙의 끝 = 기기의 끝이다.

/** 틸트(°) → 트랙 위 자리. tiltSliderDeg 의 역함수다. */
export function tiltSliderPos(tiltDeg, trackLen) {
  const mid = trackLen / 2;
  return tiltDeg >= 0
    ? mid - (Math.min(tiltDeg, 90) / 90) * (mid - trackLen * 0.06)
    : mid + (Math.min(-tiltDeg, 20) / 20) * (mid - trackLen * 0.12);
}

/** 트랙 위 자리 → 틸트(°). 기준선에서 카메라 쪽으로 얼마나 갔나가 곧 각이다. */
export function tiltSliderDeg(s, trackLen) {
  const mid = trackLen / 2;
  return s <= mid
    ? Math.min(((mid - s) / (mid - trackLen * 0.06)) * 90, 90)
    : Math.max(-((s - mid) / (mid - trackLen * 0.12)) * 20, -20);
}

/** 커서를 광축에 투영한 트랙 위 자리 — 앵커는 축 위를 미끄러지는 슬라이더다. */
export function trackOffsetOf(world, from, axisYaw) {
  const rad = axisYaw * Math.PI / 180;
  return (world.x - from.x) * Math.cos(rad) + (world.y - from.y) * Math.sin(rad);
}

/**
 * 부채꼴 모서리를 끈 각 → 화각. 광축에서 벌어진 각이 곧 반각이고, 반대쪽 모서리를 끌어도
 * 같은 값이라 절댓값으로 본다. 렌즈의 한계까지만 — 그 너머로 끌어도 부채꼴은 끝에서 멈춘다.
 */
export function hfovFromDrag(towardYaw, axisYaw, limits) {
  if (!limits) return null;
  const halfDeg = Math.abs(turnBetween(towardYaw, axisYaw));
  return Math.min(Math.max(halfDeg * 2, limits.min), limits.max);
}

/**
 * 한 폴에 여러 대가 붙으면 위에서 본 그림에서는 **같은 한 점**이다(높이만 다르다). 그대로
 * 그리면 마커도 라벨도 뭉쳐서 넷 중 아무것도 못 고른다 — 같은 자리끼리 작은 원으로 벌린다.
 *
 * "같은 자리"의 기준은 실거리가 아니라 **화면에서 겹치는가**다. 마커 반지름(dot)이 이미
 * span 에서 나오므로 그보다 가까우면 어느 레벨에서든 겹친다. 여기에 "30cm" 같은 실거리를
 * 박으면 넓은 주차장에서는 겹치는 것들을 못 묶고, 좁은 곳에서는 남남을 묶는다.
 */
export function spreadClusters(cameras = [], dot) {
  const radius = dot * 2;
  const keyOf = (loc) => `${Math.round(loc.x / radius)}:${Math.round(loc.y / radius)}`;
  const groups = new Map();
  for (const cam of cameras) {
    const loc = cam?.mount?.location;
    if (!loc) continue;
    const key = keyOf(loc);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(cam.id);
  }
  const at = new Map();
  for (const cam of cameras) {
    const loc = cam?.mount?.location;
    if (!loc) continue;
    const p = toMap(loc);
    const peers = groups.get(keyOf(loc)) || [cam.id];
    if (peers.length > 1) {
      const turn = (peers.indexOf(cam.id) / peers.length) * Math.PI * 2;
      p.x += Math.cos(turn) * dot * 2.1;
      p.y += Math.sin(turn) * dot * 2.1;
    }
    at.set(cam.id, p);
  }
  return at;
}
