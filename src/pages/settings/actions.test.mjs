import test from "node:test";
import assert from "node:assert/strict";
import {
  putField, numOrBlank, toSaveEntry, deviceFormToEntry, vptzError,
  stageDeviceList, nextDeviceId, moveInList, describeIntrinsics, deviceWhere,
  stageHeight, llmConfigOf, classifyProbeError, probeReportText,
} from "./actions.mjs";
import { t } from "../../i18n.mjs";

// 이 테스트의 본론은 **빈칸의 세 갈래 뜻**이다(plan §0 보존 계약). 인라인 <script> 시절에는
// 이 규칙이 DOM 읽기와 섞여 있어 HTML 정규식으로만 지켰다.

test("putField: 원래 있던 필드만 \"\" 로 지운다 — 화면이 못 본 값을 빈칸이 지우면 안 된다", () => {
  const out = {};
  putField(out, null, "rtspPath", "");              // base 없음(새 기기) — 빈칸은 "없음"
  assert.ok(!("rtspPath" in out));
  putField(out, { rtspPath: "stream1" }, "rtspPath", "");   // 원래 있었다 — "" 는 제거 신호
  assert.equal(out.rtspPath, "");
  putField(out, { rtspPort: 554 }, "rtspPort", 8554);       // 값이 있으면 그대로
  assert.equal(out.rtspPort, 8554);
  // base 에도 "" 로 남아 있던 필드는 다시 지울 것이 없다.
  const out2 = {};
  putField(out2, { scheme: "" }, "scheme", "");
  assert.ok(!("scheme" in out2));
});

test("toSaveEntry: 비밀번호 빈칸은 omit — 백엔드가 기존 비밀번호를 유지한다", () => {
  const e = toSaveEntry({ id: "cam-001", name: "n", type: "hucoms", host: "h", port: 80, username: "u", password: "" }, true);
  assert.ok(!("password" in e));
  const e2 = toSaveEntry({ id: "cam-001", name: "n", type: "hucoms", host: "h", port: 80, username: "u", password: "pw" }, true);
  assert.equal(e2.password, "pw");
  // 기준기(needsHost=false)는 접속 필드를 아예 싣지 않는다.
  const ref = toSaveEntry({ id: "ref", name: "r", type: "reference", host: "x", scheme: "http" }, false);
  assert.ok(!("host" in ref) && !("scheme" in ref));
  // intrinsics "" 는 명시적 제거로 그대로 나간다 — undefined 만 "안 실음"이다.
  assert.equal(toSaveEntry({ id: "a", name: "", type: "hucoms", intrinsics: "" }, false).intrinsics, "");
  assert.ok(!("intrinsics" in toSaveEntry({ id: "a", name: "", type: "hucoms" }, false)));
});

test("deviceFormToEntry: 가상 PTZ 끄기는 원래 있었을 때만 \"\" 제거 신호", () => {
  const on = deviceFormToEntry({ id: "a", type: "hucoms", vptzOn: true, vptzHfov: "90", vptzW: "1920", vptzH: "", vptzMaxMag: "" }, { needsHost: false });
  assert.deepEqual(on.entry.virtualPtz, { hfovDeg: 90, width: 1920 });   // 빈 칸은 싣지 않는다
  const offHad = deviceFormToEntry({ id: "a", type: "hucoms", vptzOn: false }, { base: { virtualPtz: { hfovDeg: 90 } }, needsHost: false });
  assert.equal(offHad.entry.virtualPtz, "");                             // 있던 것을 끔 = 제거
  const offNone = deviceFormToEntry({ id: "a", type: "hucoms", vptzOn: false }, { base: null, needsHost: false });
  assert.ok(!("virtualPtz" in offNone.entry));                           // 없던 것 = 아무 일 없음
});

test("deviceFormToEntry: 캘리브레이션 __keep 은 안 실음, \"\" 는 제거, profile: 은 빌려오기 표시", () => {
  const keep = deviceFormToEntry({ id: "a", type: "hucoms", calib: "__keep" }, { needsHost: false });
  assert.ok(!("intrinsics" in keep.entry) && keep.borrowFrom === null);
  const clear = deviceFormToEntry({ id: "a", type: "hucoms", calib: "" }, { needsHost: false });
  assert.equal(clear.entry.intrinsics, "");
  const borrow = deviceFormToEntry({ id: "a", type: "hucoms", calib: "profile:cam-2" }, { needsHost: false });
  assert.equal(borrow.borrowFrom, "cam-2");
  assert.ok(!("intrinsics" in borrow.entry), "빌려오기는 저장 뒤 창구가 푼다 — 여기서 곡선을 만들면 안 된다");
});

test("vptzError: 빈 화각의 Number(\"\")=0 을 입력한 적 없는 값의 오류로 되돌려주지 않는다", () => {
  assert.ok(vptzError({ hfovDeg: 0 }));            // 0 = 빈칸이 흘러든 값 — 여기서 잡는다
  assert.ok(vptzError({ hfovDeg: 180 }));
  assert.equal(vptzError({ hfovDeg: 90 }), null);
  assert.ok(vptzError({ hfovDeg: 90, maxMag: 1 }));
  assert.ok(vptzError({ hfovDeg: 90, maxMag: 65 }));
  assert.equal(vptzError({ hfovDeg: 90, maxMag: 8 }), null);
  assert.equal(vptzError(null), null);
});

test("stageDeviceList: 수정은 병합이다 — 안 실은 필드는 기존 값이 산다", () => {
  const devices = [{ id: "cam-001", name: "old", type: "hucoms", rtspPath: "stream1", hasPassword: true }];
  const r = stageDeviceList({ devices, selId: "cam-001", draft: false,
    entry: { id: "cam-001", name: "new", type: "hucoms" }, activeId: "cam-001" });
  assert.equal(r.list[0].name, "new");
  assert.equal(r.list[0].rtspPath, "stream1", "안 실은 필드가 지워지면 putField 의 뜻이 무너진다");
  assert.equal(r.list[0].hasPassword, true, "비밀번호를 안 바꿨으면 hasPassword 는 그대로다");
  // 새 기기 중복 id 는 서버 왕복 전에 거절.
  const dup = stageDeviceList({ devices, selId: null, draft: true,
    entry: { id: "cam-001", name: "x", type: "hucoms" }, activeId: "cam-001" });
  assert.ok(dup.error);
});

test("nextDeviceId · moveInList", () => {
  assert.equal(nextDeviceId([]), "cam-001");
  assert.equal(nextDeviceId([{ id: "cam-001" }, { id: "cam-002" }]), "cam-003");
  assert.equal(nextDeviceId([{ id: "cam-002" }]), "cam-003", "있는 번호는 건너뛴다");
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(moveInList(list, "a", "c").map((x) => x.id), ["b", "c", "a"], "from<to 는 대상 뒤");
  assert.deepEqual(moveInList(list, "c", "a").map((x) => x.id), ["c", "a", "b"], "from>to 는 대상 앞");
  assert.equal(moveInList(list, "a", "a"), null, "제자리는 서버 왕복이 없어야 한다");
});

test("describeIntrinsics: 출처를 모르는 값을 「이 카메라 실측」이라 부르지 않는다", () => {
  assert.equal(describeIntrinsics(null), t("씨앗값 없음"));
  assert.equal(describeIntrinsics("hucoms-2mp"), t("내장 프리셋") + ' "hucoms-2mp"');
  assert.equal(describeIntrinsics([{ z: 0 }]), t("조준 곡선만 (구형식)"));
  assert.equal(describeIntrinsics({ profileRevision: 3 }), t("발행본 rev {rev} 적용", { rev: 3 }));
  // label 분기는 없어야 한다 — 리비전 분기가 이겨야 권위 있는 번호가 나온다.
  assert.equal(describeIntrinsics({ profileRevision: 3, label: "cam-1 에서" }), t("발행본 rev {rev} 적용", { rev: 3 }));
  assert.match(describeIntrinsics({ measuredAt: "2026-08-01T00:00:00Z" }), new RegExp("^" + t("실측 객체 · 리비전 표기 없음")));
  assert.equal(describeIntrinsics({ zoomHfov: [] }), t("지정됨"));
});

test("deviceWhere: 접속 없는 타입은 주소 대신 성격", () => {
  assert.equal(deviceWhere({ host: "10.0.0.5", port: 8080 }, true), "10.0.0.5:8080");
  assert.equal(deviceWhere({}, true), "?:80");
  assert.equal(deviceWhere({ host: "x" }, false), t("기준기 (무카메라)"));
});

test("stageHeight: 빈칸은 「지운다」가 아니다 — 발행본은 지울 수 없다", () => {
  assert.equal(stageHeight("", 6).kind, "skip");
  assert.equal(stageHeight("abc", null).kind, "nan");
  assert.equal(stageHeight("6.001", 6.0).kind, "skip", "0.005 미만 차이는 변화가 아니다");
  assert.equal(stageHeight("6.2", 6.0).kind, "publish");
  assert.equal(stageHeight("600", null).kind, "range", "cm 실수는 왕복 전에 잡는다");
  assert.equal(stageHeight("0.5", null).kind, "range");
  assert.equal(stageHeight("6.00", null).kind, "publish");
});

test("llmConfigOf: 타임아웃 빈칸은 0 이 아니라 필드를 통째로 뺀다", () => {
  assert.deepEqual(llmConfigOf({ url: " http://x ", model: " m ", timeoutRaw: "" }), { url: "http://x", model: "m" });
  assert.deepEqual(llmConfigOf({ url: "u", model: "", timeoutRaw: "0" }), { url: "u", model: "" });
  assert.equal(llmConfigOf({ url: "u", model: "", timeoutRaw: "30000" }).timeoutMs, 30000);
});

test("probe 판정: 다섯 갈래의 원인-문구 짝", () => {
  assert.equal(classifyProbeError(new Error("The operation was aborted due to timeout")).kind, "timeout");
  assert.equal(classifyProbeError(new TypeError("Failed to fetch")).kind, "unreachable");
  assert.match(probeReportText("", { ok: true, version: "0.19.0", upstream: "http://b" }), /backend v0\.19\.0.*upstream/);
  assert.match(probeReportText("", { ok: false, kind: "mixed-content" }), new RegExp(t("브라우저가 요청을 막았습니다")));
  assert.match(probeReportText("", { ok: false, kind: "timeout", reason: "r" }), new RegExp(t("응답 없음")));
  assert.match(probeReportText("", { ok: false, kind: "unreachable", reason: "r" }), /CORS/);
  assert.match(probeReportText("http://x", { ok: false, kind: "not-baro", reason: "HTTP 404" }), /http:\/\/x/);
});

test("numOrBlank: 빈칸은 \"\" 그대로 — 제거/모름 판정은 putField 의 몫", () => {
  assert.equal(numOrBlank(""), "");
  assert.equal(numOrBlank("  "), "");
  assert.equal(numOrBlank("554"), 554);
  assert.equal(numOrBlank(undefined), "");
});
