import test from "node:test";
import assert from "node:assert/strict";
import {
  pct, extrinsicRows, mergeReady, readyText, phaseLine, jobSummary,
  gateRows, resultSummary, statusErrorText, startErrorText, manualHeightError,
} from "./actions.mjs";
import { t } from "../../i18n/index.mjs";

// 이 축은 **답을 못 내는 것이 정상 출력**이다. 그래서 여기서 지키는 것은 대부분 「모르는
// 것을 아는 척하지 않는다」는 규칙이고, 인라인 <script> 시절에는 HTML 정규식으로만 물렸다.
//
// **문구는 t() 로 양쪽을 맞춘다.** 한쪽에만 한국어 리터럴을 쓰면 그 단언은 기계의 로케일에
// 걸린다 — node 24 의 navigator.language 가 개발기에서는 ko-KR, CI 러너에서는 en-US 라
// 같은 코드가 다른 답을 낸다(2026-08-25 로컬 초록·CI 빨강). i18n 이 노드에서 ko 로
// 고정되도록 고쳤지만, 단언 자체도 언어에 기대지 않는 편이 옳다.

test("pct: 빈 값은 0%가 아니라 —", () => {
  assert.equal(pct(0.123), "12.3%");
  assert.equal(pct(0), "0.0%", "0 은 값이다 — 없음과 다르다");
  assert.equal(pct(null), "—");
  assert.equal(pct(undefined), "—");
  assert.equal(pct(""), "—");
});

test("extrinsicRows: 값을 mount 와 바깥 어느 쪽에서든 읽는다", () => {
  const inner = extrinsicRows({ revision: 3, extrinsic: { status: "height", mount: { heightM: 6.5, source: "manual" } } });
  assert.equal(inner.rows[0].v, "6.50 m");
  assert.equal(inner.rows[1].v, t("시공 시 현장 실측"));
  // 같은 사실이 바깥에 실린 옛 응답도 똑같이 읽어야 한다 — 한쪽만 보고 "없다"고 그리면 거짓말이다.
  const outer = extrinsicRows({ revision: 3, extrinsic: { status: "height", heightM: 6.5, source: "manual" } });
  assert.equal(outer.rows[0].v, "6.50 m");
  assert.equal(outer.rows[1].v, t("시공 시 현장 실측"));
  // 미측량은 결함이 아니라 정상 상태다.
  const none = extrinsicRows({ revision: 1, extrinsic: { status: "unsurveyed" } });
  assert.equal(none.state.label, t("미측량"));
  assert.equal(none.state.cls, "no");
  assert.equal(none.rows[0].v, "—");
  assert.ok(none.why, "왜 비어 있는지를 말해야 한다");
  // 없는 값은 줄을 만들지 않는다 — 「—」 로 채운 줄이 늘어서면 모름과 없음이 뭉개진다.
  assert.deepEqual(none.rows.map((r) => r.k), [t("높이"), t("출처"), t("리비전")]);
  // 모르는 상태 이름이 와도 그 이름을 그대로 보여 준다(숨기지 않는다).
  assert.equal(extrinsicRows({ revision: 1, extrinsic: { status: "weird" } }).state.label, "weird");
});

test("mergeReady: 잡이 도는 동안 빠진 사이드카 상태를 잊지 않는다", () => {
  const idle = mergeReady(null, { imgproc: "configured", detector: "missing" });
  assert.deepEqual(idle, { imgproc: "configured", detector: "missing" });
  // 도는 중에는 백엔드가 이 키를 안 싣는다 — 그때 "모른다"로 뒤집으면 아는 사실을 잊는 화면이 된다.
  assert.deepEqual(mergeReady(idle, { state: "running" }), idle);
  // 새 값이 오면 그것으로 갈아탄다.
  assert.deepEqual(mergeReady(idle, { imgproc: "configured", detector: "configured" }),
    { imgproc: "configured", detector: "configured" });
});

test("readyText: 판정은 boolean 이다 — 번역된 문자열을 다시 검사하지 않는다", () => {
  assert.equal(readyText({ imgproc: "configured", detector: "configured" }).missing, false);
  assert.equal(readyText({ imgproc: "configured", detector: "missing" }).missing, true);
  assert.match(readyText({ imgproc: "configured" }).text, new RegExp(t("준비됨")));
  // 한 번도 못 들었으면 「모른다」가 아니라 「대기 중에만 보고된다」다 — 200 을 받은 이상
  // 이 배포에 축은 있다(없으면 422 axis_unavailable).
  assert.equal(readyText(null).missing, false);
  assert.equal(readyText(null).text, t("사이드카 상태는 대기 중일 때만 보고됩니다."));
});

test("phaseLine: 단계 이름을 두 번 말하지 않는다", () => {
  assert.equal(phaseLine({ phase: "격자", message: "격자 4/6: 자를 모으는 중" }), "격자 4/6: 자를 모으는 중");
  assert.equal(phaseLine({ phase: "격자", message: "자를 모으는 중" }), "격자 · 자를 모으는 중");
  assert.equal(phaseLine({ phase: "격자" }), "격자");
  assert.equal(phaseLine({ message: "자를 모으는 중" }), "자를 모으는 중");
  assert.equal(phaseLine({}), "");
});

test("jobSummary: 경과를 못 구하면 그 조각을 아예 안 붙인다", () => {
  const now = new Date();
  const started = new Date(now.getTime() - 125000).toISOString();
  const ok = jobSummary({ state: "running", startedAt: started, phase: "격자", message: "자 수집" });
  // 초는 실제 시각에서 나오므로 한 칸 흔들린다 — 후보를 t() 로 만들어 그중 하나와 맞춘다.
  const elapsed = ["04", "05"].map((s) => t("{m}분 {s}초 경과", { m: 2, s }));
  assert.ok(elapsed.some((e) => ok.text.startsWith(e)), `경과 조각이 없다: ${ok.text}`);
  assert.equal(ok.warn, false);
  // 파싱 불가·미래 시각이면 「0분 00초」나 「NaN분」으로 아는 척하지 않는다.
  const bad = jobSummary({ state: "running", startedAt: "언젠가", phase: "격자", message: "자 수집" });
  assert.equal(bad.text, "격자 · 자 수집", "경과를 못 구하면 그 조각만 빠지고 나머지는 그대로다");
  // 오류와 카메라 미복귀는 경고다 — 다음 사람이 고배율로 어딘가 보는 카메라를 보고
  // "고장났나" 하게 두면 안 된다.
  const stranded = jobSummary({ state: "failed", error: "grid failed", cameraStranded: true });
  assert.equal(stranded.warn, true);
  assert.match(stranded.text, /grid failed/);
  assert.match(stranded.text, new RegExp(t("카메라가 원위치로 돌아가지 못했습니다 — 수동 확인이 필요합니다.")));
});

test("gateRows: 문턱은 응답이 준다 — 화면이 베끼지 않는다", () => {
  const gates = { grid: { minSpreadDeg: 25, maxResidualMad: 0.04 },
                  plate: { minPlates: 8, minClusterFrac: 0.6, maxClusterMad: 0.05 } };
  const rows = gateRows({ grid: { spreadDeg: 31.4, residualMad: 0.02 },
                          cluster: { nPlates: 12, frac: 0.75, mad: 0.03 } }, gates);
  assert.deepEqual(rows.map((r) => r.fail), [false, false, false, false, false]);
  assert.equal(rows[0].got, "31°");
  assert.equal(rows[0].want, "≥ 25°");
  assert.equal(rows[1].want, "≤ 4.0%");
  // 재료가 통째로 없으면 전부 실패다 — 「—」 를 통과로 읽으면 안 된다.
  const empty = gateRows({}, gates);
  assert.deepEqual(empty.map((r) => r.fail), [true, true, true, true, true]);
  assert.deepEqual(empty.map((r) => r.got), ["—", "—", "—", "—", "—"]);
  // 경계: 지지율은 초과여야 하고(>) 산포는 이하여야 한다(≤).
  const edge = gateRows({ grid: { spreadDeg: 25, residualMad: 0.04 },
                          cluster: { nPlates: 8, frac: 0.6, mad: 0.05 } }, gates);
  assert.deepEqual(edge.map((r) => r.fail), [false, false, false, true, false]);
});

test("resultSummary: 값이 없는 것과 거부된 것은 다른 사실이다", () => {
  const gates = { plate: { plateHeightBandCm: [30, 120] } };
  const refused = resultSummary({ accepted: false, heightM: 7.2, plateGroundHeightCm: 55 }, gates);
  assert.equal(refused.heightText, "7.20 m", "값은 거부돼도 보여 준다");
  assert.match(refused.refusal, new RegExp(t("게이트가 거부한 값입니다 — 발행할 수 없습니다.")));
  assert.equal(refused.plateGround.outside, false);
  // 숫자가 없는데 "거부된 값"이라고 쓰면 화면이 없는 값을 있는 척한다.
  const nothing = resultSummary({ accepted: false }, gates);
  assert.equal(nothing.heightText, "—");
  assert.match(nothing.refusal, new RegExp(t("값이 나오지 않았습니다 — 발행할 것이 없습니다.")));
  assert.equal(nothing.plateGround, null);
  // 지상고가 물리 대역 밖이면 선을 잘못 배정한 것이다 — 그 사실을 표시한다.
  assert.equal(resultSummary({ accepted: true, heightM: 6, plateGroundHeightCm: 200 }, gates).plateGround.outside, true);
  // 격자 재료: 자 74개인데 잔차가 큰 것과 자가 3개라 큰 것은 전혀 다른 사실이다.
  assert.match(resultSummary({ accepted: true, heightM: 6, grid: { rulers: 74, groundLines: 5 } }, gates).material, /74/);
  assert.equal(resultSummary({ accepted: true, heightM: 6 }, gates).material, null);
});

test("오류 문구: 재시도해도 소용없는 쪽을 그렇게 말한다", () => {
  assert.match(statusErrorText({ body: { code: "axis_unavailable" } }),
    new RegExp(t("이 백엔드에는 높이 측정 축이 구성돼 있지 않습니다 — 시공 입력은 그대로 쓸 수 있습니다.")));
  assert.match(statusErrorText({ message: "boom" }), /boom/);
  // no_optics 는 순서의 문제다 — 광학이 먼저, 높이가 나중.
  assert.equal(startErrorText({ body: { code: "no_optics" } }),
    t("이 기기의 줌→화각 곡선이 없습니다 — 캘리브레이션을 먼저 발행하세요. (픽셀을 각으로 바꾸려면 초점거리가 필요합니다)"));
  assert.match(startErrorText({ message: "409 busy" }), /409 busy/);
});

test("manualHeightError: cm 를 넣는 실수를 왕복 전에 잡는다", () => {
  assert.equal(manualHeightError("6.5").heightM, 6.5);
  assert.ok(manualHeightError("").error, "빈칸은 0 이 아니라 없음이다");
  assert.ok(manualHeightError("높이").error);
  const outside = (v) => t("{v} 는 1~30 m 밖입니다 — cm 를 넣으신 건 아닌가요?", { v });
  assert.equal(manualHeightError("650").error, outside(650));
  assert.equal(manualHeightError("0.5").error, outside(0.5));
  assert.equal(manualHeightError("30").heightM, 30, "경계는 통과한다");
  assert.equal(manualHeightError("1").heightM, 1);
});
