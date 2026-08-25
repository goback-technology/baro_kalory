// CCTV 제어 화면의 판정·좌표 계산 — DOM 없이 성립하는 부분 전부.
//
// 여기 모인 규칙의 대부분은 「화면이 말하는 것과 화면에 있는 것이 같아야 한다」는 한 가지다:
// 그리는 쪽과 세는 쪽이 갈리면, 화면은 비었는데 「영상 위 박스 3개」라고 말하는 상태가
// 성립한다(적대적 리뷰가 실제로 재현했다). 그래서 **그린 쪽이 센다.**
import { fmtNum, UNREAD, toNum } from "../../format.mjs";
import { t } from "../../i18n.mjs";

// bbox 는 [x1,y1,x2,y2] 이거나 다각형 좌표열이다. 어느 쪽이든 외접 사각형으로 접는다.
export function detectorBoxFrom(bbox) {
  const nums = Array.isArray(bbox) ? bbox.flat(Infinity).map(Number).filter(Number.isFinite) : [];
  if (nums.length < 4) return null;
  if (nums.length === 4) {
    const [x1, y1, x2, y2] = nums;
    return { x1, y1, x2, y2 };
  }
  const xs = [], ys = [];
  for (let i = 0; i < nums.length - 1; i += 2) { xs.push(nums[i]); ys.push(nums[i + 1]); }
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

// 선분이 프레임 안에 조금이라도 걸치는가(Liang–Barsky). 끝점이 둘 다 밖이어도 가로지르면
// 보이므로 끝점 검사만으로는 모자란다.
export function segmentHitsRect(x1, y1, x2, y2, w, h) {
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1, w - x1, y1, h - y1];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 4; i += 1) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;   // 경계와 평행하면서 밖
      continue;
    }
    const r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}

export const DET_COLORS = { vpd: "#5ec26a", lpd: "#ffd24a", lpr: "#6aa6ff", vpd_3d: "#e07be0" };

// 검출 응답 → 영상 위에 얹을 것들. **그리는 판정과 세는 판정이 한 곳에 있다.**
//
// 3D 검출은 사각형이 아니라 **투영된 직육면체**다. 사이드카가 주는 것은 12개 모서리의 픽셀
// 선분이라 사각형으로 접어 그리면 큐보이드의 방향(차가 어느 쪽을 보는가)이 통째로 사라진다 —
// 3D 를 쓰는 이유가 사라진다. 좌표는 자르지 않는다: 사이드카도 자르지 않고(화면 밖은 정상
// 출력이다), 자르면 큐보이드가 프레임 가장자리에서 다른 모양이 된다. 실제로 잘라 보여 주는
// 것은 무대의 overflow:hidden 이다.
export function detectorOverlay(payload) {
  const results = payload.results || {};
  const nw = Number(payload.frame?.width) || 1920;
  const nh = Number(payload.frame?.height) || 1080;
  const boxes = [], svgs = [], labels3d = [];
  let drawn = 0;

  for (const [target, result] of Object.entries(results)) {
    if (target === "vpd_3d") {
      const color = DET_COLORS.vpd_3d;
      for (const [i, det] of (result.boxes3d || []).entries()) {
        const segments = [];
        let visible = false;
        for (const seg of det.segments || []) {
          const n = Array.isArray(seg) ? seg.map(Number) : [];
          if (n.length < 4 || !n.every(Number.isFinite)) continue;
          segments.push(n);
          // **보이는 것만 센다.** 큐보이드가 통째로 프레임 밖이면 선은 그어지되 한 픽셀도
          // 안 보인다 — 그걸 세면 화면이 비었는데 "영상 위 박스 1개"라고 말하게 된다.
          if (!visible && segmentHitsRect(n[0], n[1], n[2], n[3], nw, nh)) visible = true;
        }
        if (segments.length) svgs.push({ segments, color });
        if (visible) drawn += 1;
        const p = Array.isArray(det.label_point) ? det.label_point.map(Number) : [];
        if (p.length !== 2 || !p.every(Number.isFinite)) continue;
        if (p[0] < 0 || p[0] > nw || p[1] < 0 || p[1] > nh) continue;   // 화면 밖 라벨은 달지 않는다
        const conf = Number(det.score);
        labels3d.push({
          leftPct: p[0] / nw * 100, topPct: p[1] / nh * 100, color,
          text: `3D #${i + 1}${det.label ? " " + det.label : ""}` + (Number.isFinite(conf) ? ` ${conf.toFixed(2)}` : ""),
        });
      }
    }
    for (const [i, box] of (result.boxes || []).entries()) {
      const b = detectorBoxFrom(box.bbox);
      if (!b) continue;
      const x1 = Math.max(0, Math.min(nw, Math.min(b.x1, b.x2)));
      const x2 = Math.max(0, Math.min(nw, Math.max(b.x1, b.x2)));
      const y1 = Math.max(0, Math.min(nh, Math.min(b.y1, b.y2)));
      const y2 = Math.max(0, Math.min(nh, Math.max(b.y1, b.y2)));
      if (x2 <= x1 || y2 <= y1) continue;   // 잘라 내고 나서 퇴화한 것은 그리지도 세지도 않는다
      const conf = Number(box.confidence);
      boxes.push({
        leftPct: x1 / nw * 100, topPct: y1 / nh * 100,
        widthPct: (x2 - x1) / nw * 100, heightPct: (y2 - y1) / nh * 100,
        color: DET_COLORS[target] || "#6aa6ff",
        text: `${target.toUpperCase()} #${i + 1}`
          + (box.className ? ` ${box.className}` : "")
          + (Number.isFinite(conf) ? ` ${conf.toFixed(2)}` : ""),
      });
      drawn += 1;
    }
  }
  return { frame: { w: nw, h: nh }, boxes, svgs, labels3d, drawn };
}

// 결과 카드 한 장의 내용. 3D 는 약어가 아니다 — 대문자로 접으면 OBJECT3D 가 되어 다른
// 사이드카 이름처럼 보인다.
export function detectorResultCard(target, result) {
  const title = target === "vpd_3d" ? "3D Box" : target.toUpperCase();
  const meta = result.ok
    ? t("HTTP {s} · {c}개 · {ms}ms", { s: result.status, c: result.count || 0, ms: Math.round(result.latencyMs || 0) })
    : t("실패 · {ms}ms", { ms: Math.round(result.latencyMs || 0) });
  const lines = [];
  if (!result.ok) {
    lines.push(result.error || "unreachable");
  } else if ((result.boxes || []).length) {
    for (const [i, box] of result.boxes.slice(0, 8).entries()) {
      const b = detectorBoxFrom(box.bbox);
      const conf = Number(box.confidence);
      lines.push(`#${i + 1} ${box.className || "object"} `
        + (Number.isFinite(conf) ? `${conf.toFixed(2)} ` : "")
        + (b ? `[${Math.round(b.x1)},${Math.round(b.y1)},${Math.round(b.x2)},${Math.round(b.y2)}]` : ""));
    }
  } else if ((result.boxes3d || []).length) {
    // 3D 가 재는 것은 사각형이 아니라 **미터**다 — 픽셀 좌표를 적어 봐야 이 검출기의 답이
    // 아니다. 거리·크기·방위를 적는다. 이 분기는 "검출 없음" 폴백보다 앞에 있어야 한다.
    for (const [i, det] of result.boxes3d.slice(0, 8).entries()) {
      const conf = Number(det.score);
      const [px, py] = Array.isArray(det.position_m) ? det.position_m.map(Number) : [NaN, NaN];
      const [sl, sw, sh] = Array.isArray(det.size_m) ? det.size_m.map(Number) : [NaN, NaN, NaN];
      lines.push(`#${i + 1} ${det.label || "object"} `
        + (Number.isFinite(conf) ? `${conf.toFixed(2)} ` : "")
        // 값이 없으면 "0" 이 아니라 "?" 다 — 0 m 도 방위 0° 도 측정값처럼 보인다.
        + t("· 앞 {x} m, 옆 {y} m · {l}×{w}×{h} m · 방위 {yaw}°", {
          x: fmtNum(px, 1, UNREAD), y: fmtNum(py, 1, UNREAD),
          l: fmtNum(sl, 2, UNREAD), w: fmtNum(sw, 2, UNREAD), h: fmtNum(sh, 2, UNREAD),
          yaw: fmtNum(det.yaw_deg, 0, UNREAD),
        }));
    }
    // 캘리브레이션이 이 측정의 전제다. 어느 기준으로 잰 값인지 없이 미터만 적으면,
    // 틀린 지면으로 잰 값도 똑같이 그럴듯해 보인다.
    const cal = result.calibration;
    if (cal) {
      lines.push(t("기준 {id} · 설치높이 {h} m · {status}", {
        id: result.cameraId || cal.camera_id || "?",
        h: fmtNum(cal.ground_plane?.mount_height_m ?? cal.model_height_m, 2, UNREAD),
        status: cal.metric_valid === false ? t("미터 아님") : String(cal.status || ""),
      }));
    }
  } else if ((result.texts || []).length) {
    lines.push(...result.texts.slice(0, 8));
  } else {
    lines.push(t("응답은 정상이나 검출 항목은 없습니다."));
  }
  return { title, meta, lines, preview: result.preview || null };
}

// ── PTZ 표시 ────────────────────────────────────────────────────────────────

// 단위는 PTZ 와 같은 결로 원단위(cm)다 — 한 줄 안에서 어떤 값은 원단위, 어떤 값은 m 이면
// 읽는 사람이 매번 어느 쪽인지 되짚어야 한다.
export function fmtWithHeight(fmtPtz, ptz, mountHeightCm) {
  return `${fmtPtz(ptz)}  H ${mountHeightCm === null || mountHeightCm === undefined ? "—" : mountHeightCm}`;
}

// 절대 좌표가 없는 계열(IDIS 등)은 위치를 못 주는 것이 **설계**다 — 그걸 "읽기 실패"로
// 부르면 정상 동작을 고장으로 오인하게 만든다. 능력 부재(501)와 진짜 장애를 구분한다.
export function ptzErrorText(e) {
  return e.status === 501
    ? t("이 기기는 위치를 알려주지 않습니다 (상대 이동 전용)")
    : t("읽기 실패") + ": " + e.message;
}

// 설치 높이의 출처는 둘이고 순서가 있다. 발행된 설치 측량이 먼저(실카메라의 정본), 없으면
// 씬에 묻는다 — 시뮬 카메라의 높이는 추정이 아니라 엔진이 아는 값이라, 발행본이 없다고
// "모른다"고 말하는 것이 오히려 거짓이다. 실카메라에는 씬이라는 출처가 없어 자연히 첫째만 남는다.
export function mountHeightFrom({ profileHeightM, sceneCameras, cameraId }) {
  // toNum 을 쓰는 이유: Number(null) 도 Number("") 도 0 이고, 0 은 유한하다. 그대로 두면
  // 「발행본이 없다」가 「지면에 붙어 있다(0 cm)」가 되어, 3D 큐보이드의 거리와 크기가
  // 통째로 배율만큼 틀린 채 그럴듯하게 그려진다.
  const m = toNum(profileHeightM);
  if (m !== null) return Math.round(m * 100);
  const cam = (sceneCameras || []).find((c) => `sim-cam-${c.hucomsPort}` === cameraId);
  const cm = toNum(cam?.heightAboveReferenceGroundCm);
  return cm === null ? null : Math.round(cm);
}

// 화면 좌표 → 프레임 좌표. 첫 스냅샷이 오기 전에는 Hucoms 기준 프레임으로 떨어진다
// (가짜 모드에서도 클릭이 성립해야 한다).
export function framePoint({ clientX, clientY, rect, naturalWidth, naturalHeight }) {
  const nw = naturalWidth || 1920;
  const nh = naturalHeight || 1080;
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  return { px, py, nw, nh, x: Math.round(px / rect.width * nw), y: Math.round(py / rect.height * nh) };
}

// 클릭인가 끌기인가. 8px 은 손떨림의 여유다 — 없으면 센터링하려던 클릭이 폭 2px 짜리
// 박스줌이 되어 카메라가 최대 배율로 튄다.
export const DRAG_SLOP_PX = 8;
export function isDrag(a, b) {
  return Math.abs(b.px - a.px) > DRAG_SLOP_PX || Math.abs(b.py - a.py) > DRAG_SLOP_PX;
}

// 스테이지 **밖**에서 손을 떼면 좌표가 프레임 밖으로 외삽된다 — 그대로 보내면 서버가 받는
// 상자에 음수·초과 픽셀이 든다. 프레임은 시작점이 들고 있으므로(nw·nh) 여기서 잘라 넣는다.
// 시뮬레이터 화면이 이 검사를 갖고 있었고 제어 화면은 없었다 — 같은 함수를 쓰게 되면서 합친다.
export function boxOf(a, b) {
  const cl = (v, max) => Math.max(0, Number.isFinite(max) ? Math.min(max, v) : v);
  return {
    startX: cl(Math.min(a.x, b.x), a.nw), startY: cl(Math.min(a.y, b.y), a.nh),
    endX: cl(Math.max(a.x, b.x), a.nw), endY: cl(Math.max(a.y, b.y), a.nh),
  };
}

// 스크린샷 파일 이름 — 언제·어느 카메라의 그림인지가 파일명에 있어야 나중에 짝을 맞출 수 있다.
export function snapshotName(cameraId, at, suffix) {
  const d = at, p = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `barocalory-${cameraId || "cam"}-${stamp}${suffix}.jpg`;
}

// ── PTZ 조작 ────────────────────────────────────────────────────────────────

// 속도는 안 보내는 것과 0 이 다르다 — 빈 칸은 「기기 기본값」이고, 0 은 아예 안 움직이라는 말이다.
export function normalizeSpeed(value) {
  if (value === "" || value === null || value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.max(1, Math.min(100, Math.round(n)));
}

// Number("") === 0 — 빈 칸을 그대로 태우면 「줌만 바꾸려던」 이동이 팬·틸트를 실제로 0 위치로
// 돌린다. 세 값이 다 있어야만 절대 이동이다.
export function absoluteMove({ pan, tilt, zoom }) {
  const panpos = toNum(pan), tiltpos = toNum(tilt), zoompos = toNum(zoom);
  if (panpos === null || tiltpos === null || zoompos === null) {
    return { error: t("절대 이동에는 P·T·Z 세 값이 모두 필요합니다 — 빈 칸은 「채우기」로 채우세요.") };
  }
  return { panpos, tiltpos, zoompos };
}
