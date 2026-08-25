import test from "node:test";
import assert from "node:assert/strict";
import { NONE, UNREAD, toNum, fmtNum, pad2, elapsedMs, splitMinSec, fmtClock, fmtWhen } from "./format.mjs";

// 이 파일의 절반은 **회귀 테스트**다. 아래 값들은 2026-08-22 에 각 페이지의 자체 헬퍼를
// node 로 실제로 돌려서 얻은 출력이고, 전부 화면에 나가던 거짓말이다. 다시 그렇게 되면
// 여기서 걸린다.

test("toNum: 「모른다」가 0 으로 둔갑하지 않는다 (드리프트 1 — 실제 표시 사고였다)", () => {
  // 옛 calibration finiteNum: Number(null)===0 이고 유한해서 0 을 돌려줬다.
  // 그래서 settleMs:null 이 「0.0s」로, residual:null 이 「0.0 px」+ 합격 초록으로 그려졌다.
  assert.equal(toNum(null), null);
  assert.equal(toNum(undefined), null);
  assert.equal(toNum(""), null);
  assert.equal(toNum("   "), null);
  // 옛 cctv fixed: Number([])===0, Number(true)===1 — 배열·불린도 값으로 살아났다.
  assert.equal(toNum([]), null);
  assert.equal(toNum({}), null);
  assert.equal(toNum(true), null, "불린은 측정값이 아니다");
  assert.equal(toNum(false), null);
});

test("toNum: JSON 에서 온 숫자 문자열은 값이다 (드리프트 5)", () => {
  // 옛 calibration num(v,d) 은 Number() 를 안 불러서 "12.5" 를 값 없음으로 그렸다.
  assert.equal(toNum("12.5"), 12.5);
  assert.equal(toNum("0"), 0);
  assert.equal(toNum(" 7 "), 7);
  assert.equal(toNum("-3.25"), -3.25);
  assert.equal(toNum("1e3"), 1000);
});

test("toNum: 숫자가 아닌 것과 유한하지 않은 것은 값이 아니다", () => {
  assert.equal(toNum("abc"), null);
  assert.equal(toNum(NaN), null);
  assert.equal(toNum(Infinity), null);
  assert.equal(toNum(-Infinity), null);
  assert.equal(toNum("Infinity"), null);
  // 0 과 음수는 **값이다** — falsy 라고 버리면 「0px」이 「?px」가 된다.
  assert.equal(toNum(0), 0);
  assert.equal(toNum(-1), -1);
});

test("fmtNum: 값이 없으면 자리표시자, 있으면 toFixed 그대로", () => {
  assert.equal(fmtNum(12.5, 2), "12.50");
  assert.equal(fmtNum("12.5", 2), "12.50", "문자열도 값이다");
  assert.equal(fmtNum(0, 2), "0.00");
  assert.equal(fmtNum(null, 2), NONE);
  assert.equal(fmtNum(undefined, 1), NONE);
  assert.equal(fmtNum("abc", 1), NONE);
});

test("fmtNum: 자리표시자는 인자다 — 「—」와 「?」는 다른 뜻이다", () => {
  // 표의 빈 칸(해당 없음)과 「값을 못 읽었다」는 화면에서 일부러 갈라져 있다.
  // 상수 하나로 강제하면 그 구분이 사라진다.
  assert.equal(fmtNum(null, 1, UNREAD), "?");
  assert.equal(fmtNum(null, 1, ""), "", "<input type=number> 의 value 는 빈 문자열이어야 한다");
  assert.equal(NONE, "—");
  assert.equal(UNREAD, "?");
});

test("fmtNum: 자릿수가 어긋나도 렌더를 죽이지 않는다", () => {
  // 옛 num(v, d) 은 d>100 에서 RangeError 를 던져 화면 전체를 멈췄다.
  assert.equal(fmtNum(1, 101), (1).toFixed(100));
  assert.equal(fmtNum(1, -1), "1");
  assert.equal(fmtNum(1, undefined), "1");
  assert.equal(fmtNum(1.6, 0), "2");
  assert.doesNotThrow(() => fmtNum(1, 1e9));
});

test("fmtNum: 반올림은 toFixed 그대로다 — Math.round 로 바꾸지 않는다", () => {
  // 표시 자릿수가 곧 저장 문턱인 자리가 있다(시뮬레이터: toFixed(2) ↔ 0.005).
  // 반올림 방식을 바꾸면 화면 숫자와 그 문턱이 동시에 어긋난다.
  assert.equal(fmtNum(2.675, 2), (2.675).toFixed(2));   // "2.67" — 이진부동소수 그대로
  assert.equal(fmtNum(1.45, 1), (1.45).toFixed(1));     // "1.4"
  assert.equal(fmtNum(-0.4, 0), (-0.4).toFixed(0));     // "-0"
});

test("pad2: 시계 자릿수", () => {
  assert.equal(pad2(7), "07");
  assert.equal(pad2(0), "00");
  assert.equal(pad2(59), "59");
  assert.equal(pad2(123), "123", "자르지 않는다 — 자르면 시각이 조용히 틀려진다");
  assert.equal(pad2(null), "00");
  assert.equal(pad2("8"), "08");
});

test("elapsedMs: 시계가 어긋나 음수가 나오면 「모른다」다 (드리프트 3)", () => {
  const t0 = "2026-08-22T00:00:00.000Z";
  const base = Date.parse(t0);
  assert.equal(elapsedMs(t0, base + 90_000), 90_000);
  assert.equal(elapsedMs(t0, base), 0);
  // 브라우저 시계가 서버보다 뒤진 경우. 옛 height 은 0 으로 뭉개 「0분 00초 경과」를,
  // 옛 calibration 은 "—" 를 그렸다 — 같은 사실에 두 답이었다. 이제 하나다.
  assert.equal(elapsedMs(t0, base - 1), null);
  assert.equal(elapsedMs(t0, base - 90_000), null);
});

test("elapsedMs: 파싱 불가는 「NaN분 NaN초」가 아니라 「모른다」다", () => {
  const now = Date.parse("2026-08-22T00:00:00.000Z");
  assert.equal(elapsedMs("abc", now), null);
  assert.equal(elapsedMs(undefined, now), null);
  assert.equal(elapsedMs(null, now), null, "옛 height 은 여기서 「29789282분 07초 경과」를 그렸다");
  assert.equal(elapsedMs("", now), null);
  assert.equal(elapsedMs({}, now), null);
  assert.equal(elapsedMs("2026-08-22T00:00:00.000Z", NaN), null);
});

test("splitMinSec / fmtClock: 반올림은 절삭이 아니다", () => {
  assert.deepEqual(splitMinSec(0), { m: 0, s: 0 });
  assert.deepEqual(splitMinSec(90_000), { m: 1, s: 30 });
  assert.deepEqual(splitMinSec(500), { m: 0, s: 1 }, "Math.round — 0.5초가 1초로 올라간다");
  assert.deepEqual(splitMinSec(59_999), { m: 1, s: 0 });
  assert.equal(splitMinSec(-1), null);
  assert.equal(splitMinSec(NaN), null);
  assert.equal(splitMinSec(null), null);

  assert.equal(fmtClock(90_000), "1:30");
  assert.equal(fmtClock(0), "0:00");
  assert.equal(fmtClock(3_660_000), "61:00", "시(h) 자리는 없다 — 분이 계속 자란다");
  assert.equal(fmtClock(-1), NONE);
  assert.equal(fmtClock(NaN), NONE);
  assert.equal(fmtClock(null, UNREAD), "?");
});

test("fmtWhen: 값 없음이 에포크(1970)나 「Invalid Date」로 새지 않는다", () => {
  // 옛 판은 new Date(null).toLocaleString() 이라 null 을 「1970. 1. 1.」로 그렸다.
  // catch 갈래는 죽은 코드였다 — toLocaleString 은 Invalid Date 에도 던지지 않는다.
  assert.equal(fmtWhen(null), NONE);
  assert.equal(fmtWhen(undefined), NONE);
  assert.equal(fmtWhen(""), NONE);
  assert.equal(fmtWhen("abc"), NONE);
  assert.equal(fmtWhen(NaN), NONE);
  assert.equal(fmtWhen(new Date("nope")), NONE);
  // new Date(true)===에포크+1ms — 불린이 1970 으로 그려지는 통로가 남아 있었다(재검증에서 발견).
  assert.equal(fmtWhen(true), NONE);
  assert.equal(fmtWhen(false), NONE);
  assert.equal(fmtWhen(null, UNREAD), "?");
});

test("fmtWhen: 로케일·타임존은 보는 사람 것을 그대로 쓴다", () => {
  // 여기서 Intl 옵션을 못 박으면 모든 화면의 시각 표기가 한꺼번에 바뀐다.
  const iso = "2026-08-22T01:23:45.000Z";
  assert.equal(fmtWhen(iso), new Date(iso).toLocaleString());
  assert.equal(fmtWhen(0), new Date(0).toLocaleString(), "에포크를 **명시적으로** 준 것은 값이다");
  assert.equal(fmtWhen(new Date(iso)), new Date(iso).toLocaleString());
});
