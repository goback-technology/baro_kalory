import test from "node:test";
import assert from "node:assert/strict";
import { homeCards } from "./cards.mjs";
import { PAGES } from "../../pages.mjs";

test("카드는 PAGES 에서 파생된다 — 화면을 추가한 날 그 카드만 빠지는 일이 없게", () => {
  const cards = homeCards();
  assert.deepEqual(cards.map((c) => c.id), PAGES.filter((p) => p.slug).map((p) => p.id));
  for (const c of cards) {
    assert.ok(c.title, `${c.id}: 제목 없음`);
    assert.ok(c.blurb, `${c.id}: 설명 문구 없음 — 카드가 이름만 남는다`);
    assert.match(c.version, /^[A-Z]+ v/, `${c.id}: 버전 배지 형식`);
  }
});

test("버전은 app-versions.json 에서 오고, 없으면 v— 로 남는다", () => {
  const [cctv] = homeCards({ own: { cctv: "0.9.1" } });
  assert.equal(cctv.version, "CCTV v0.9.1");
  assert.equal(homeCards()[0].version, "CCTV v—");
  assert.equal(homeCards({ own: {} })[0].version, "CCTV v—");
});

// 미연결에서 잠기지 **않는** 카드가 설정 하나라는 것이 이 화면의 탈출구다. 설정까지 잠그면
// 백엔드 주소를 넣을 유일한 문이 사라져 첫 방문이 곧 벽돌이 된다(두 번 물린 부류).
test("미연결이면 설정만 열려 있다", () => {
  const open = homeCards({ backendDown: true }).filter((c) => !c.locked).map((c) => c.id);
  assert.deepEqual(open, ["settings"]);
  // 연결돼 있으면 아무것도 안 잠근다.
  assert.deepEqual(homeCards().filter((c) => c.locked), []);
});

// 대문도 셸 안이고 갈 곳도 전부 같은 문서의 라우트다 — 링크는 **언제나 해시**다.
// 예전에는 배포 형태(정적/개발)에 따라 `./cctv` 와 `./cctv.html` 로 갈렸고, 그 판정이
// 대문에서만 빗나가 미연결 게이트가 설정 카드까지 잠갔다(첫 방문이 벽돌이 되던 부류).
// 문서가 하나뿐이므로 판정할 것 자체가 없어졌다.
test("링크는 언제나 같은 문서의 해시다", () => {
  const cards = homeCards();
  for (const p of PAGES.filter((x) => x.slug)) {
    assert.equal(cards.find((c) => c.id === p.id).href, `#/${p.slug}`, p.id);
  }
});
