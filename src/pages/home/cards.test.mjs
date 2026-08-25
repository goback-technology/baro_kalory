import test from "node:test";
import assert from "node:assert/strict";
import { homeCards } from "./cards.mjs";
import { PAGES } from "../../pages.mjs";

// isStaticBuild() 는 브라우저 전역을 읽는다 — 노드에서 그 둘만 흉내 낸다.
function withDom({ pathname = "/", marker = false } = {}, fn) {
  const prevDoc = globalThis.document, prevLoc = globalThis.location;
  globalThis.document = { querySelector: (sel) => (marker && sel.includes("baro-static-build") ? {} : null) };
  globalThis.location = { pathname };
  try { return fn(); } finally {
    if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
    if (prevLoc === undefined) delete globalThis.location; else globalThis.location = prevLoc;
  }
}

test("카드는 PAGES 에서 파생된다 — 페이지를 추가한 날 그 카드만 빠지는 일이 없게", () => {
  const cards = withDom({}, () => homeCards());
  assert.deepEqual(cards.map((c) => c.id), PAGES.filter((p) => p.slug).map((p) => p.id));
  for (const c of cards) {
    assert.ok(c.title, `${c.id}: 제목 없음`);
    assert.ok(c.blurb, `${c.id}: 설명 문구 없음 — 카드가 이름만 남는다`);
    assert.match(c.version, /^[A-Z]+ v/, `${c.id}: 버전 배지 형식`);
  }
});

test("버전은 app-versions.json 에서 오고, 없으면 v— 로 남는다", () => {
  const [cctv] = withDom({}, () => homeCards({ own: { cctv: "0.9.1" } }));
  assert.equal(cctv.version, "CCTV v0.9.1");
  assert.equal(withDom({}, () => homeCards())[0].version, "CCTV v—");
  assert.equal(withDom({}, () => homeCards({ own: {} }))[0].version, "CCTV v—");
});

// 미연결에서 잠기지 **않는** 카드가 설정 하나라는 것이 이 화면의 탈출구다. 설정까지 잠그면
// 백엔드 주소를 넣을 유일한 문이 사라져 첫 방문이 곧 벽돌이 된다(두 번 물린 부류).
test("미연결이면 설정만 열려 있다", () => {
  const cards = withDom({}, () => homeCards({ backendDown: true }));
  const open = cards.filter((c) => !c.locked).map((c) => c.id);
  assert.deepEqual(open, ["settings"]);
  // 연결돼 있으면 아무것도 안 잠근다.
  assert.deepEqual(withDom({}, () => homeCards()).filter((c) => c.locked), []);
});

// 대문은 셸 안에서 그려진다 — SPA 라우트로 가는 링크는 같은 문서의 해시여야 하고, 아직 안
// 옮긴 화면으로 가는 링크는 그 화면의 실제 문서여야 한다. 배포 형태(정적/개발)에 따라
// 후자의 모양이 갈린다.
test("링크는 셸 기준이다 — 옮긴 화면은 해시, 안 옮긴 화면은 그 문서", () => {
  const bySlug = (cards, id) => cards.find((c) => c.id === id).href;
  const dev = withDom({ pathname: "/", marker: false }, () => homeCards());
  const dist = withDom({ pathname: "/baro_kalory/", marker: true }, () => homeCards());
  for (const p of PAGES.filter((x) => x.slug)) {
    if (p.spa) {
      assert.equal(bySlug(dev, p.id), `#/${p.slug}`, `${p.id} dev`);
      assert.equal(bySlug(dist, p.id), `#/${p.slug}`, `${p.id} dist`);
    } else {
      assert.equal(bySlug(dev, p.id), `./${p.slug}`, `${p.id} dev`);
      assert.equal(bySlug(dist, p.id), `./${p.slug}.html`, `${p.id} dist`);
    }
  }
});
