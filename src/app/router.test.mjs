import test from "node:test";
import assert from "node:assert/strict";
import { parseHash, hrefFor } from "./router.mjs";
import { PAGES } from "../pages.mjs";

test("해시는 PAGES 의 slug 로 푼다 — 라우트 표를 따로 적지 않는다", () => {
  for (const p of PAGES) {
    if (!p.slug) continue;
    assert.equal(parseHash(`#/${p.slug}`).pageId, p.id, p.slug);
    assert.equal(hrefFor(p.id), `#/${p.slug}`, p.id);
  }
});

test("대문은 여러 모양의 빈 해시를 전부 받는다", () => {
  for (const h of ["", "#", "#/", "#//"]) {
    assert.deepEqual({ ...parseHash(h) }, { pageId: "home", sub: null }, JSON.stringify(h));
  }
  // 빈 문자열이 아니라 "#/" 여야 한다 — href="" 는 이동이 아니라 페이지 새로고침이다.
  assert.equal(hrefFor("home"), "#/");
});

test("두 번째 칸은 sub 다 — 설정의 탭이 링크로 공유될 수 있어야 한다", () => {
  assert.deepEqual({ ...parseHash("#/settings/server") }, { pageId: "settings", sub: "server" });
  assert.deepEqual({ ...parseHash("#/settings") }, { pageId: "settings", sub: null });
  assert.deepEqual({ ...parseHash("#/settings/") }, { pageId: "settings", sub: null });
  assert.equal(hrefFor("settings", "server"), "#/settings/server");
  assert.equal(hrefFor("settings", null), "#/settings");
});

test("모르는 slug 는 대문으로 — 빈 화면을 그리지 않는다", () => {
  assert.equal(parseHash("#/nope").pageId, "home");
  assert.equal(parseHash("#/CCTV").pageId, "home", "slug 는 소문자다");
  assert.equal(hrefFor("nope"), "#/");
});

// ?api=<주소> 는 공유 링크, ?api=reset 은 잘못 저장한 base 로 벽돌이 된 화면의 탈출구다.
// api.mjs 는 그것을 location.search 에서 읽는다 — 해시 **안**에 쿼리를 쓰면 그 파서에
// 닿지 않아 탈출구가 정확히 필요한 순간에 조용히 사라진다. 조용히 무시하는 대신 모르는
// 라우트로 떨궈, 잘못 만든 링크가 눈에 보이게 한다.
test("해시 안의 쿼리는 라우트가 아니다 — 쿼리는 # 앞에만 둔다", () => {
  assert.equal(parseHash("#/cctv?api=reset").pageId, "home");
  assert.equal(parseHash("#/settings?api=http://x").pageId, "home");
  // 그리고 이 라우터는 그런 링크를 **만들지 않는다**.
  for (const p of PAGES) assert.doesNotMatch(hrefFor(p.id, "tab"), /\?/, p.id);
});

test("hrefFor 와 parseHash 는 서로의 역이다", () => {
  for (const p of PAGES) {
    assert.equal(parseHash(hrefFor(p.id)).pageId, p.id, p.id);
    const round = parseHash(hrefFor(p.id, "x"));
    assert.equal(round.pageId, p.id);
    assert.equal(round.sub, p.slug ? "x" : null, `${p.id}: 대문에는 sub 가 없다`);
  }
});
