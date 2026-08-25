import test from "node:test";
import assert from "node:assert/strict";
import { appliedSuffix, opticsSig, retireEffect, provText, installedLine } from "./actions.mjs";
import { t } from "../../i18n/index.mjs";

// 이 테스트가 존재할 수 있다는 것 자체가 React 전환의 산물이다 — 인라인 <script> 시절에는
// 이 판정 로직을 node 로 물 수 없어서, 회귀 그물이 HTML 정규식뿐이었다.

const flat = (line) => line.parts.map((p) => p.text).join("");

test("appliedSuffix: 「적용했다」「할 일이 없었다」「안 됐다」는 다른 말이다", () => {
  assert.match(appliedSuffix({ applied: true, how: "read-time" }), /발행 즉시 적용/);
  assert.match(appliedSuffix({ applied: true, how: "reselect" }), /지금 이 카메라에 적용/);
  // 발행은 됐는데 조준이 안 바뀐 경우 — 이유는 백엔드만 안다. note 가 있으면 그대로 옮긴다.
  assert.match(appliedSuffix({ applied: false, how: "read-time", note: "핀 고정 중" }), /아직 이 곡선으로 바뀌지 않았습니다.*핀 고정 중/);
  assert.match(appliedSuffix({ applied: false, how: "failed" }), /카메라를 다시 고르면 적용됩니다/);
  // 하위호환: 불린도 받는다.
  assert.match(appliedSuffix(true), /지금 이 카메라에 적용/);
  assert.match(appliedSuffix(false), /적재에 실패/);
});

test("retireEffect: source 가 있으면 백엔드의 답이 이기고, 없으면 전후 비교가 답한다", () => {
  // 0.18.0+ — 런타임이 출처를 스스로 말한다. 추론은 그 앞에서 물러난다.
  assert.match(retireEffect(null, { source: "seed" }), /씨앗값으로 조준/);
  assert.match(retireEffect(null, { source: "none" }), /보정 없이 조준.*씨앗값도 없습니다/);
  assert.match(retireEffect(null, { source: "published" }), /아직 발행 곡선을 씁니다/);
  // 옛 백엔드 — declared 한 칸이 아니라 **변화**를 본다(2026-08-19 ref-ptz 의 거짓말 재발 방지).
  const before = { declared: true, points: 13, hfovRangeDeg: [1.66, 57.41] };
  const seedAfter = { declared: true, points: 13, hfovRangeDeg: [2.0, 55.0] };
  assert.match(retireEffect(before, seedAfter), /씨앗값으로 조준/, "광학이 달라졌으면 내려앉은 것이다");
  assert.match(retireEffect(before, { ...before }), /아직 지금 곡선을 씁니다/, "그대로면 옛 곡선이 남은 것이다");
  assert.match(retireEffect(before, { declared: false }), /보정 없이 조준/);
  assert.match(retireEffect(before, null), /다시 읽지는 못했습니다/, "모르면 모른다고 한다");
});

test("opticsSig: 서명은 declared·points·hfovRange 세 축이다", () => {
  assert.equal(opticsSig(null), null);
  assert.notEqual(opticsSig({ declared: true, points: 13 }), opticsSig({ declared: true, points: 12 }));
  assert.equal(
    opticsSig({ declared: true, points: 13, hfovRangeDeg: [1, 2] }),
    opticsSig({ declared: true, points: 13, hfovRangeDeg: [1, 2] }),
  );
});

test("provText: 출처를 모르는 문서를 「실측」이라 부르지 않는다", () => {
  // 기대값도 t() 를 통과시킨다 — 라벨이 번역 층을 지나는 것이 계약이고, node 의 로케일
  // (navigator.language)이 en 인 CI 에서도 같은 검증이 성립해야 한다(실제로 CI 에서 걸렸다).
  assert.equal(provText({ method: "sweep" }), t("실측"));
  assert.equal(provText({ method: "import" }), t("수입"));
  assert.equal(provText({ method: "copy", from: { profileId: "cam-1", revision: 3 } }), `${t("복사")} ← cam-1 rev 3`);
  assert.equal(provText(null), t("출처 미상"));
  assert.equal(provText({}), t("출처 미상"));
  assert.equal(provText({ method: "weird" }), "weird", "모르는 코드는 지어내지 않고 원문 그대로 — 번역도 안 탄다");
});

test("installedLine: 0.18.0 의 source 축 — 존재와 적용이 다른 축으로 그려진다", () => {
  const l1 = installedLine({ optics: { source: "published", revision: 2, following: true, points: 13, hfovRangeDeg: [1.66, 57.41] }, hasProfile: true, ins: {} });
  assert.equal(l1.kind, "published");
  assert.match(flat(l1), /발행본 rev 2/);
  assert.match(flat(l1), /13점 · 화각 1\.66°~57\.41°/);
  assert.match(flat(l1), /최신 따름/);

  const pinned = installedLine({ optics: { source: "published", revision: 1, following: false }, hasProfile: true, ins: {} });
  assert.match(flat(pinned), /고정됨\(새 발행이 실리지 않습니다\)/);

  const det = installedLine({ optics: { detached: true, source: "seed" }, hasProfile: true, ins: {} });
  assert.equal(det.kind, "detached");
  assert.match(flat(det), /적용 해제됨.*씨앗값으로 조준 중/, "일부러 뗀 상태는 고장이 아니라 시연 상태다");

  const seed = installedLine({ optics: { source: "seed", points: 13 }, hasProfile: false, ins: {} });
  assert.equal(seed.kind, "seed");
  assert.match(flat(seed), /발행본이 없습니다 — config 씨앗값으로 조준합니다/);
});

test("installedLine: source 없는 옛 백엔드 — 추론 갈래가 그대로 산다", () => {
  // declared + 발행본 존재 확인 → 발행본 적용.
  const pub = installedLine({ optics: { declared: true, points: 13 }, hasProfile: true, ins: {} });
  assert.equal(pub.kind, "legacy-published");
  // declared 인데 발행본이 **확실히** 없다(404) → 출처를 단정하지 않는다.
  const amb = installedLine({ optics: { declared: true, points: 13 }, hasProfile: false, ins: {} });
  assert.equal(amb.kind, "legacy-ambiguous");
  assert.match(flat(amb), /씨앗값이거나, 방금 삭제한 곡선/);
  // 설정에 값은 있는데 런타임이 광학을 모른다 = 씨앗값 — 「지우지 마세요」가 반드시 나간다
  // (지우면 스윕 앵커가 남의 눈금으로 넘어간다 — 보드 #99 사고의 예방 문구).
  const seedOnly = installedLine({ optics: { declared: false }, hasProfile: false, ins: { zoomHfov: [] } });
  assert.equal(seedOnly.kind, "seed-only-config");
  assert.match(flat(seedOnly), /씨앗값.*지우지 마세요/);
  // intrinsics 문자열 = 내장 프리셋.
  const preset = installedLine({ optics: null, hasProfile: null, ins: "hucoms-2mp" });
  assert.equal(preset.kind, "preset");
  assert.match(flat(preset), /내장 프리셋 “hucoms-2mp”를 쓰고/);
  // label = 빌려온 값 — "이 카메라에서 실측" 이라고 말하면 거짓말이다.
  const borrowed = installedLine({ optics: null, hasProfile: null, ins: { label: "cam-1 에서" } });
  assert.equal(borrowed.kind, "borrowed");
  assert.match(flat(borrowed), /다른 카메라의 실측값/);
  // profileRevision = 창구를 지나 깔린 값 — 아는 사실(리비전 번호)만 말한다.
  const rev = installedLine({ optics: null, hasProfile: null, ins: { profileRevision: 3 } });
  assert.equal(rev.kind, "config-revision");
  assert.match(flat(rev), /발행본 rev 3/);
  // 아무것도 없음.
  const none = installedLine({ optics: null, hasProfile: null, ins: undefined });
  assert.equal(none.kind, "none");
  assert.match(flat(none), /캘리브레이션이 없습니다/);
});

test("installedLine: 파리티 검증이 짚은 커버 공백 — measured-here·assigned·detached 비-seed", () => {
  // measured-here: 조사는 붙는다 — 「값을」이지 「값 을」이 아니다(파리티 검증에서 실제로 걸렸다).
  const mh = installedLine({ optics: null, hasProfile: null, ins: { measuredAt: "2026-08-01T00:00:00Z" } });
  assert.equal(mh.kind, "measured-here");
  assert.match(flat(mh), /실측한 값을 쓰고 있습니다 \(/, "조사 앞에 공백이 끼면 안 된다");
  // assigned: 정보가 하나도 없으면 지정 사실만 말한다.
  const asg = installedLine({ optics: null, hasProfile: null, ins: { something: 1 } });
  assert.equal(asg.kind, "assigned");
  // detached 인데 source 가 seed 가 아니면 「보정 없이」다 — 씨앗값이라 단정하지 않는다.
  const det = installedLine({ optics: { detached: true, source: "none" }, hasProfile: true, ins: {} });
  assert.match(flat(det), /보정 없이 조준 중/);
});

test("provText: from 없는 copy 는 맨 「복사」다 — 출처를 지어내지 않는다", () => {
  assert.equal(provText({ method: "copy" }), t("복사"));
});
test("installedLine: 서버 문자열은 조각(text)으로만 나간다 — 마크업 해석 여지가 없다", () => {
  const evil = installedLine({ optics: null, hasProfile: null, ins: { label: "<img onerror=x>" } });
  // 조각 목록이므로 뷰(React)가 텍스트로 그린다 — 문자열 안에 태그가 있어도 값일 뿐이다.
  assert.ok(evil.parts.every((p) => typeof p.text === "string"));
  assert.match(flat(evil), /<img onerror=x>/);
});
