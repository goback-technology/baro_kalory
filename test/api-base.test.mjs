// API base 주입 체인 계약 — 우선순위: ?api= 쿼리 > localStorage > meta > 이 앱의 마운트.
// 이 체인이 무너지면 정적 호스트에 올린 UI 가 backend 를 못 찾거나(기본값 소실), 잘못 저장된
// 주소에서 못 빠져나온다(?api=reset 탈출구).
import assert from "node:assert/strict";
import test from "node:test";
import { resolveApiBaseFrom } from "../src/lib/api.mjs";

test("우선순위: 쿼리 > localStorage > meta > 미설정", () => {
  assert.equal(resolveApiBaseFrom({}), "");
  assert.equal(resolveApiBaseFrom({ meta: "http://m:80" }), "http://m:80");
  assert.equal(resolveApiBaseFrom({ stored: "http://s", meta: "http://m" }), "http://s");
  assert.equal(resolveApiBaseFrom({ search: "?api=http://q", stored: "http://s", meta: "http://m" }), "http://q");
});

test("?api=reset 은 저장값을 무시하고 meta/동일출처로 낙하한다", () => {
  assert.equal(resolveApiBaseFrom({ search: "?api=reset", stored: "http://잘못된주소" }), "");
  assert.equal(resolveApiBaseFrom({ search: "?api=reset", stored: "http://bad", meta: "http://m" }), "http://m");
});

test("끝 슬래시는 정규화 — api() 결합 시 이중 슬래시 방지", () => {
  assert.equal(resolveApiBaseFrom({ meta: "http://h:8080///" }), "http://h:8080");
  assert.equal(resolveApiBaseFrom({ search: "?api=http://q/" }), "http://q");
});

test("http(s) 오리진만 채택 — 스킴 생략·이상 스킴은 무효(벽돌·주입 차단)", () => {
  // 스킴 없는 호스트: fetch 가 상대경로로 해석해 전 API 404 → 채택하면 안 됨
  assert.equal(resolveApiBaseFrom({ search: "?api=192.0.2.10" }), "");
  assert.equal(resolveApiBaseFrom({ stored: "192.0.2.10" }), "");
  assert.equal(resolveApiBaseFrom({ search: "?api=javascript:alert(1)" }), "");
  // 무효한 쿼리는 다음 순위(유효 저장값)로 낙하해야 한다
  assert.equal(resolveApiBaseFrom({ search: "?api=쓰레기", stored: "http://s" }), "http://s");
});

// 마운트 프리픽스는 앱의 상수가 아니라 배포 결정이다. 예전에는 여기서 "/barocalory" 접미사를
// 떼어냈는데(앱이 다시 붙인다는 전제), 그 전제 자체가 틀렸다 — backend 가 프리픽스 아래
// 마운트된 배포가 정상이므로 경로를 보존해야 한다.
test("base 의 경로는 보존한다 — backend 가 마운트 아래 있는 배포가 정상", () => {
  assert.equal(resolveApiBaseFrom({ stored: "http://h/barocalory" }), "http://h/barocalory");
  assert.equal(resolveApiBaseFrom({ stored: "http://h/barocalory/" }), "http://h/barocalory");
  assert.equal(resolveApiBaseFrom({ meta: "https://api.example.com/baro/" }), "https://api.example.com/baro");
});



// 출처 구분 — 분리 배포에서 "설정된 주소"와 "같은 마운트에 있겠거니 한 추측"은 다른 사실이다.
// 화면이 둘을 구분하지 못하면 "연결 안 됨"의 원인(미설정인가, 백엔드가 죽었나)을 말할 수 없다.
test("base 의 출처를 함께 돌려준다", async () => {
  const { resolveApiBaseInfoFrom } = await import("../src/lib/api.mjs");
  assert.deepEqual(resolveApiBaseInfoFrom({ search: "?api=http://q" }), { base: "http://q", source: "query" });
  assert.deepEqual(resolveApiBaseInfoFrom({ stored: "http://s" }), { base: "http://s", source: "stored" });
  assert.deepEqual(resolveApiBaseInfoFrom({ meta: "http://m" }), { base: "http://m", source: "meta" });
  assert.deepEqual(resolveApiBaseInfoFrom({}), { base: "", source: "none" });
  // 미설정은 빈 값 — 추측으로 메우지 않는다. 메우면 「초기화」가 화면상 무의미해진다.
  assert.deepEqual(resolveApiBaseInfoFrom({ search: "?api=reset", stored: "http://s" }), { base: "", source: "none" });
});


// 혼합 콘텐츠 — https 페이지에서 http base 는 **요청이 발사되지 않는다**. 이 실패만은 부르기
// 전에 확정적으로 알 수 있어서 따로 가른다. 나머지(네트워크·CORS·DNS)는 브라우저가 전부 같은
// TypeError 로 뭉개므로 추측이지만, 이것은 추측이 아니다.
// 화면이 이걸 CORS 로 안내하던 동안 멀쩡히 200 을 내는 백엔드를 두고 cors.origins 를 고치며
// 시간을 버렸다(2026-08-13). 그래서 계약으로 못 박는다.
test("혼합 콘텐츠 판정 — https 페이지 + http base 만 참", async () => {
  const { mixedContentBlocked } = await import("../src/lib/api.mjs");
  assert.equal(mixedContentBlocked("http://h:22038/calory", "https:"), true);
  assert.equal(mixedContentBlocked("https://h/calory", "https:"), false);  // 둘 다 https
  assert.equal(mixedContentBlocked("http://h:22038/calory", "http:"), false); // 페이지도 http
  assert.equal(mixedContentBlocked("https://h/calory", "http:"), false);
});

test("혼합 콘텐츠 판정 — 빈 값·대문자 스킴에서 오탐하지 않는다", async () => {
  const { mixedContentBlocked } = await import("../src/lib/api.mjs");
  assert.equal(mixedContentBlocked("", "https:"), false);         // 미설정은 이 문제가 아니다
  assert.equal(mixedContentBlocked(null, "https:"), false);
  assert.equal(mixedContentBlocked("http://h", undefined), false); // 브라우저 밖(node)
  assert.equal(mixedContentBlocked("HTTP://h", "https:"), true);   // 스킴 대소문자 무관
  // https 로 시작하는 문자열이 http 로 오인되지 않아야 한다(접두사 검사의 함정).
  assert.equal(mixedContentBlocked("https://h", "https:"), false);
});
