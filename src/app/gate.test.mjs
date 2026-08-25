import test from "node:test";
import assert from "node:assert/strict";
import { gateKind, gateText, backendVersionOf, openWithoutBackend } from "./gate.mjs";
import { t } from "../i18n/index.mjs";

// 이 테스트는 page-chrome.mjs 를 정규식으로 읽던 두 블록의 승격판이다. 소스에 그 문자열이
// 있는지가 아니라, 값을 넣었을 때 어떤 판정이 나오는지를 묻는다.

test("셋을 가른다 — 미설정 / 부를 수 없음 / 응답 없음", () => {
  assert.equal(gateKind({ explicit: false, base: "", protocol: "http:", failed: true }), "unset");
  // https 페이지 + http 백엔드: 요청이 **나가지도 않는다**. 이걸 "응답 없음" 으로 뭉개면
  // 멀쩡히 200 을 내는 백엔드를 두고 주소·포트를 의심하게 된다.
  assert.equal(gateKind({ explicit: true, base: "http://x:8080", protocol: "https:", failed: false }), "blocked");
  assert.equal(gateKind({ explicit: true, base: "http://x:8080", protocol: "http:", failed: true }), "down");
  assert.equal(gateKind({ explicit: true, base: "https://x", protocol: "https:", failed: false }), "ok");
});

test("판정마다 다른 말을 한다 — 같은 문구로 뭉개면 원인을 못 찾는다", () => {
  const kinds = ["unset", "blocked", "down"];
  const heads = kinds.map((k) => gateText(k).headline);
  assert.equal(new Set(heads).size, 3, "세 판정의 제목이 겹친다");
  for (const k of kinds) {
    const { headline, guide } = gateText(k);
    assert.ok(headline && guide, `${k}: 제목과 안내가 모두 있어야 한다`);
  }
  assert.match(gateText("blocked").guide, new RegExp(t("혼합 콘텐츠")));
  assert.match(gateText("unset").guide, new RegExp(t("설정")));
});

test("버전 필드 없는 200 은 연결이 아니다 — 엉뚱한 서버의 캐치올을 받아 주지 않는다", () => {
  assert.equal(backendVersionOf({ backendVersion: "0.19.0" }), "0.19.0");
  assert.equal(backendVersionOf({ version: "0.19.0" }), "0.19.0");
  assert.equal(backendVersionOf({ ok: true }), null, "버전이 없으면 baro 백엔드가 아니다");
  assert.equal(backendVersionOf({ version: "" }), null);
  assert.equal(backendVersionOf({ version: 19 }), null, "숫자를 버전 문자열로 받아 주지 않는다");
  assert.equal(backendVersionOf(null), null);
  assert.equal(backendVersionOf("0.19.0"), null, "문자열 본문은 JSON 객체가 아니다");
});

// 잠금의 예외가 설정 하나뿐이라는 것이 이 화면의 탈출구다. 예전에는 대문 카드의 href
// 문자열을 설정의 href 와 비교해 걸렀는데, 링크 체계가 바뀌면 그 비교가 조용히 빗나갔다.
// 이제 페이지 id 로 묻는다 — 링크가 어떤 모양이든 판정이 흔들리지 않는다.
test("백엔드 없이 열리는 화면은 대문과 설정뿐 — 설정을 빼면 벗어날 길이 사라진다", () => {
  assert.equal(openWithoutBackend("home"), true);
  assert.equal(openWithoutBackend("settings"), true);
  for (const id of ["cctv", "discovery", "simulator", "calibration", "height"]) {
    assert.equal(openWithoutBackend(id), false, id);
  }
});
