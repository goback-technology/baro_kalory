// 표시용 숫자·시각 포맷. **화면에 찍을 문자열을 만드는 일만** 한다.
//
// 왜 따로 두는가 — 같은 일을 하는 헬퍼가 페이지마다 제각기 있었고, 그것들이 **갈라져서**
// 이미 화면이 거짓말을 하고 있었다(2026-08-22 실측):
//   finiteNum(null) === 0      → 캘리브레이션 HUD 가 settleMs:null 을 「0.0s」로,
//                                 residual:null 을 「0.0 px / 10 px」+ 합격 초록으로 그렸다.
//   fixed(null, 2) === "0.00"  → CCTV 가 설치높이 미상을 「0.00 m」로 그렸다. 바로 위 주석이
//                                 "값이 없으면 0 이 아니라 ? 다" 라고 적어 놓은 자리다.
//   num("12.5", 2) === "—"     → 백엔드가 숫자를 문자열로 실어 보내면 값이 있는데 없다고 그렸다.
// 셋 다 「모르는 값을 아는 값처럼 그린다」는 한 가지 실패의 다른 얼굴이다. 이 축에서 그게 가장
// 나쁜 실패라서, 여기서 한 번에 막는다.
//
// ── 이 모듈이 **일부러 하지 않는** 것 (지어내지 말 것) ─────────────────────────────────
// 1. **단위를 붙이지 않는다.** `°`·`m`·`px`·`%` 는 i18n 사전 키 문자열 안에 박혀 있다
//    (예: t("설치 하향각 {d}°")). 단위까지 붙이는 헬퍼를 쓰면 "12.3°°" 가 되고, 그걸 피하려고
//    사전 키를 고치면 i18n 이 **원문을 키로 쓰므로** 그 항목의 번역이 통째로 끊긴다.
// 2. **null 을 돌려주지 않는다** — fmt* 는 언제나 문자열이다. i18n 의 t() 는 params[k] != null
//    일 때만 치환하므로, 포맷터가 null 을 넘기면 화면에 리터럴 `{d}` 가 남는다.
// 3. **clamp·퍼센트 좌표·SVG 좌표는 여기 없다.** 그건 포맷이 아니라 기하다. CCTV 의 clamp 은
//    「세는 쪽과 그리는 쪽이 같은 값을 봐야 한다」는 짝이 있고(짝을 흩으면 화면은 비었는데
//    "박스 n개"가 된다), discovery 의 점 위치는 **일부러** 클램프하지 않아 프레임 밖으로
//    나간 사실을 보여 준다. 기계적으로 묶으면 그 뜻이 사라진다.
// 4. **반올림을 Math.round 로 바꾸지 않는다.** 표시 자릿수가 곧 저장 문턱인 자리가 있다
//    (시뮬레이터: toFixed(2) ↔ 0.005). toFixed 의 이진부동소수 성질까지 그대로 유지한다.

/** 표의 빈 칸 — 「해당 없음」. 값이 없는 자리를 비워 두는 표기다. */
export const NONE = "—";
/** 「값을 못 읽었다」 — 값이 **있어야 하는데** 읽히지 않은 자리. 검증표·식별자가 쓴다. */
export const UNREAD = "?";

/**
 * 값 게이트 — 표시가 아니라 **판단**에 쓴다. 숫자면 숫자, 아니면 `null`.
 *
 * `Number()` 에 그냥 맡기지 않는 이유가 전부다: `Number(null)`·`Number("")`·`Number([])`
 * 는 **0 이고 유한하다**. 그래서 「모른다」가 「0」으로 통과한다. 여기서는 숫자와 문자열만
 * 값으로 인정하고, 나머지(null·undefined·boolean·배열·객체)는 전부 값 없음이다.
 * `true` 를 1 로 세지 않는 것도 같은 이유다 — 불린은 측정값이 아니다.
 */
export function toNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * 표시용 숫자 문자열. 값이 없으면 `none` 을 그대로 돌려준다 — `none` 은 화면에 그대로
 * 나가는 **문자열**이어야 한다(null 을 넘기면 null 이 그대로 나가 t() 에 `{d}` 가 남는다).
 *
 * `digits` 를 0~100 으로 접는다 — `toFixed` 는 범위 밖에서 **RangeError 를 던지고**, 그러면
 * 그 화면 전체가 죽는다. 자릿수 하나 어긋나는 것보다 렌더가 멎는 쪽이 훨씬 나쁘다.
 */
export function fmtNum(v, digits = 0, none = NONE) {
  const n = toNum(v);
  if (n === null) return none;
  const d = toNum(digits);
  return n.toFixed(Math.min(100, Math.max(0, Math.trunc(d === null ? 0 : d))));
}

/** 시계 자릿수 — 분·초 조립 전용. 값이 없으면 "00". */
export function pad2(v) {
  const n = toNum(v);
  return n === null ? "00" : String(Math.trunc(n)).padStart(2, "0");
}

/**
 * 시작 시각으로부터 지금까지. **음수와 파싱 불가는 「모른다」(`null`)** 다.
 *
 * 서버가 준 startedAt 과 브라우저의 Date.now() 를 빼는 자리라, 시계가 어긋나면 음수가 나온다.
 * 그때 0 으로 뭉개면(`Math.max(0, …)`) 「방금 시작함」이라는 **틀린 사실**이 화면에 뜨고,
 * NaN 은 그마저 못 막아 「NaN분 NaN초 경과」가 그려진다(실측). 모르면 모른다고 말한다.
 */
export function elapsedMs(startedAt, now = Date.now()) {
  const t0 = startedAt instanceof Date ? startedAt.getTime()
    : typeof startedAt === "number" ? startedAt
    : typeof startedAt === "string" ? Date.parse(startedAt)
    : NaN;
  if (!Number.isFinite(t0)) return null;
  const t1 = toNum(now);
  if (t1 === null) return null;
  const d = t1 - t0;
  return d >= 0 ? d : null;
}

/**
 * 밀리초를 분·초로 나눈다. 문장 틀이 페이지마다 달라서(HUD 는 "m:ss", 높이 화면은
 * t("{m}분 {s}초 경과")) **조립은 각자 하고 분해만 공유한다.**
 * 반올림은 `Math.round` — 절삭이 아니다. 20분짜리 작업에서 경과가 살짝 앞서 보이는 건 의도다.
 */
export function splitMinSec(ms) {
  const n = toNum(ms);
  if (n === null || n < 0) return null;
  const s = Math.round(n / 1000);
  return { m: Math.floor(s / 60), s: s % 60 };
}

/** "m:ss". 시(h) 자리는 없다 — 60분을 넘으면 분이 계속 자란다("61:00"). */
export function fmtClock(ms, none = NONE) {
  const p = splitMinSec(ms);
  return p === null ? none : `${p.m}:${pad2(p.s)}`;
}

/**
 * 시각 표기. **로케일·타임존은 일부러 보는 사람에게 맡긴다** — 지금 화면이 그렇고,
 * 여기서 Intl 옵션을 못 박으면 모든 화면의 시각 표기가 한꺼번에 바뀐다.
 *
 * 막는 것은 두 가지 새는 값뿐이다: `null` 이 **에포크(1970)** 로 그려지던 것과,
 * 파싱 실패가 문자열 "Invalid Date" 로 화면에 나가던 것. (기존 판의 try/catch 는 죽은
 * 코드였다 — `toLocaleString()` 은 Invalid Date 에도 던지지 않는다.)
 */
export function fmtWhen(v, none = NONE) {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return none;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? none : d.toLocaleString();
}
