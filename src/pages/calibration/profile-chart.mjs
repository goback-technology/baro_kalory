// 발행된 캘리브레이션 프로파일을 읽기 위한 최소 차트 — 단일 시리즈 하나를 그린다.
//
// 라이브러리를 들이지 않는 이유는 두 가지다. 이 저장소가 무번들 바닐라이고(빌드는 Tailwind
// 하나), 여기서 필요한 것이 "한 곡선 + 축 + 눈금"뿐이기 때문이다. 색·글꼴은 하드코딩하지
// 않고 테마 토큰(var(--color-*))을 그대로 쓴다 — 테마를 바꾸면 차트도 함께 바뀐다.
//
// **축은 하나다.** 화각(도)과 조준 게인(배율)은 단위가 다르므로 한 그림에 두 축으로 겹쳐
// 그리지 않고 차트를 따로 만든다. 겹쳐 그리면 두 곡선의 교차점이 아무 의미도 없는데 의미가
// 있는 것처럼 읽힌다.

const NS = "http://www.w3.org/2000/svg";

const PAD = { top: 10, right: 12, bottom: 26, left: 48 };
const W = 480, H = 180;

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

// 눈금 값 — 최소/최대를 n등분한다. 데이터가 한 점뿐이면 그 값 하나만.
function ticks(min, max, n) {
  if (!(max > min)) return [min];
  return Array.from({ length: n + 1 }, (_, i) => min + (max - min) * (i / n));
}

function niceNum(v) {
  const a = Math.abs(v);
  if (a >= 1000) return String(Math.round(v));
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

/**
 * points: [{ x, y, note? }] — 하나의 시리즈. 비어 있으면 null 을 돌려준다(호출부가 안내를 쓴다).
 * kind: "line"(추이) | "bar"(크기 비교). 잔차처럼 "얼마나 큰가"를 묻는 값은 막대가 맞다.
 */
export function miniChart({ points, kind = "line", yLabel = "", xLabel = "", yZero = false, fmtY = niceNum, fmtX = niceNum }) {
  const pts = (points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!pts.length) return null;

  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  // 크기를 비교하는 그림(막대)은 0 에서 시작해야 길이 비율이 곧 값 비율이 된다.
  const yMin = yZero ? Math.min(0, ...ys) : Math.min(...ys);
  const yMax = Math.max(...ys);
  const spanX = xMax - xMin || 1;
  const spanY = yMax - yMin || Math.abs(yMax) || 1;

  // 막대는 **범주 비교**다 — "어느 줌 구간이 나쁜가"를 묻지 "줌 값에 비례해서"를 묻지 않는다.
  // 그래서 x 를 값이 아니라 차례로 균등 배치한다. 값 간격대로 놓으면 촘촘한 구간(16100·16384)
  // 에서 막대가 서로 겹쳐 계단처럼 읽힌다.
  const isBar = kind === "bar";
  const slot = (W - PAD.left - PAD.right) / pts.length;
  const px = isBar
    ? (_x, i) => PAD.left + slot * (i + 0.5)
    : (x) => PAD.left + ((x - xMin) / spanX) * (W - PAD.left - PAD.right);
  const py = (y) => H - PAD.bottom - ((y - yMin) / spanY) * (H - PAD.top - PAD.bottom);

  const svg = el("svg", {
    viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img",
    style: "height:auto; display:block; overflow:visible;",
    "aria-label": `${yLabel || "값"} — ${xLabel || "x"}별`,
  });

  // 격자·축은 뒤로 물러나 있어야 한다 — 읽는 것은 데이터지 눈금이 아니다.
  const gridColor = "var(--color-border, #333)";
  const inkMuted = "var(--color-muted, #888)";
  const accent = "var(--color-accent, #4a4)";

  for (const t of ticks(yMin, yMax, 4)) {
    const y = py(t);
    svg.appendChild(el("line", { x1: PAD.left, y1: y, x2: W - PAD.right, y2: y, stroke: gridColor, "stroke-width": 1, opacity: 0.45 }));
    const label = el("text", { x: PAD.left - 6, y: y + 3.5, "text-anchor": "end", fill: inkMuted, "font-size": 10, "font-family": "var(--font-mono)" });
    label.textContent = fmtY(t);
    svg.appendChild(label);
  }
  // 막대는 차례로 놓이므로 눈금도 값이 아니라 몇 번째 막대인지로 잡는다. 14개를 전부 쓰면
  // 라벨이 겹치므로 고르게 5개만 남긴다.
  const xTicks = isBar
    ? Array.from(new Set([0, ...[1, 2, 3].map((k) => Math.round((pts.length - 1) * k / 4)), pts.length - 1]))
        .map((i) => ({ x: px(0, i), text: fmtX(pts[i].x) }))
    : ticks(xMin, xMax, 4).map((t) => ({ x: px(t), text: fmtX(t) }));
  for (const t of xTicks) {
    const label = el("text", { x: t.x, y: H - PAD.bottom + 14, "text-anchor": "middle", fill: inkMuted, "font-size": 10, "font-family": "var(--font-mono)" });
    label.textContent = t.text;
    svg.appendChild(label);
  }
  if (xLabel) {
    const cap = el("text", { x: W - PAD.right, y: H - 2, "text-anchor": "end", fill: inkMuted, "font-size": 10, "font-family": "var(--font-mono)" });
    cap.textContent = xLabel;
    svg.appendChild(cap);
  }

  if (isBar) {
    // 막대 사이에 표면색 간격을 둔다 — 붙어 있으면 경계가 사라져 하나의 덩어리로 읽힌다.
    const bw = Math.max(3, slot - 3);
    const base = py(Math.max(0, yMin));
    pts.forEach((p, i) => {
      const y = py(p.y);
      const rect = el("rect", {
        x: px(p.x, i) - bw / 2, y: Math.min(y, base), width: bw, height: Math.max(1, Math.abs(base - y)),
        fill: accent, rx: 2,
      });
      const title = el("title");
      title.textContent = `${fmtX(p.x)} → ${fmtY(p.y)}${p.note ? ` (${p.note})` : ""}`;
      rect.appendChild(title);
      svg.appendChild(rect);
    });
  } else {
    const d = pts.map((p, i) => `${i ? "L" : "M"}${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join(" ");
    svg.appendChild(el("path", { d, fill: "none", stroke: accent, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    for (const p of pts) {
      svg.appendChild(el("circle", { cx: px(p.x), cy: py(p.y), r: 4, fill: accent }));
      // 히트 영역은 마커보다 커야 짚을 수 있다. 투명 원이 네이티브 툴팁을 물고 있다.
      const hit = el("circle", { cx: px(p.x), cy: py(p.y), r: 10, fill: "transparent" });
      const title = el("title");
      title.textContent = `${fmtX(p.x)} → ${fmtY(p.y)}${p.note ? ` (${p.note})` : ""}`;
      hit.appendChild(title);
      svg.appendChild(hit);
    }
  }

  // 점마다 숫자를 붙이지 않는다. 양 끝만 직접 표시하는 방법도 썼다가 걷어냈는데, y 축 눈금이
  // 이미 데이터의 최소·최대를 그 자리에 쓰고 있어서 같은 숫자가 겹쳐 찍혔다. 개별 값은
  // 마커에 얹힌 툴팁과 아래 표가 답한다.
  return svg;
}

// 차트 한 장 = 제목 + 그림. 시리즈가 하나뿐이라 범례를 두지 않는다 — 제목이 곧 그 이름이다.
export function chartFigure({ title, ...opts }) {
  const fig = document.createElement("figure");
  fig.style.cssText = "margin:0 0 14px;";
  const cap = document.createElement("figcaption");
  cap.className = "hint";
  cap.style.cssText = "margin-bottom:4px;";
  cap.textContent = title;
  fig.appendChild(cap);
  const svg = miniChart(opts);
  if (!svg) return null;
  fig.appendChild(svg);
  return fig;
}
