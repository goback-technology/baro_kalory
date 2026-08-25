// 테마 교체의 계약. 이 파일에는 그물이 없었다(2026-08-25 전수 조사에서 드러났다) —
// 「새 테마 = tailwind 블록 하나 + THEMES 한 줄」이라는 규칙만 문서에 있고, 그 규칙을
// 지키는지 확인하는 것이 아무것도 없었다.
//
// 값으로 문는다. setTheme 이 <html> 을 만지므로 document 를 최소로 심는다 — 여기서 확인할
// 것은 「어떤 이름을 받아 무엇을 세우는가」이고, 그건 브라우저 없이도 답이 정해져 있다.
import assert from "node:assert/strict";
import test from "node:test";

function withDom(fn) {
  const hadDoc = "document" in globalThis;
  const prevDoc = globalThis.document;
  const el = { dataset: {} };
  globalThis.document = { documentElement: el };
  try { return fn(el); } finally {
    if (hadDoc) globalThis.document = prevDoc;
    else delete globalThis.document;
  }
}

// 저장소를 갈아 끼운다 — 테마는 브라우저에 남는 선호라, 저장값이 판정에 들어온다.
function withStore(map, fn) {
  const had = "localStorage" in globalThis;
  const prev = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  try { return fn(); } finally {
    if (had) globalThis.localStorage = prev;
    else delete globalThis.localStorage;
  }
}

const { THEMES, getTheme, setTheme } = await import("./theme.mjs");

test("THEMES 는 id 와 표시 이름을 갖는다 — 셀렉터가 그것으로 선다", () => {
  assert.ok(THEMES.length >= 2, "고를 것이 하나뿐이면 셀렉터가 있을 이유가 없다");
  for (const th of THEMES) {
    assert.equal(typeof th.id, "string");
    assert.ok(th.id, "id 없는 테마");
    assert.equal(typeof th.label, "string");
    assert.ok(th.label, `${th.id}: 표시 이름이 없다`);
  }
  const ids = THEMES.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, "id 가 겹치면 나중 것이 조용히 이긴다");
});

test("setTheme 은 <html data-theme> 을 세우고 그 id 를 돌려준다", () => {
  withStore(new Map(), () => withDom((el) => {
    const id = setTheme(THEMES[1].id);
    assert.equal(id, THEMES[1].id);
    assert.equal(el.dataset.theme, THEMES[1].id, "토큰 오버라이드는 이 속성 하나로 걸린다");
  }));
});

// 저장값은 **오래 산다.** 테마를 지우거나 이름을 바꾸면 옛 이름을 든 브라우저가 남는데,
// 그때 그 값을 그대로 세우면 어느 토큰 블록에도 안 걸려 화면이 색을 잃는다.
test("모르는 이름은 기본 테마로 떨어진다 — 저장값이 화면을 망가뜨리지 않게", () => {
  withStore(new Map(), () => withDom((el) => {
    const id = setTheme("사라진-테마");
    assert.equal(id, THEMES[0].id, "기본은 목록의 첫 번째다");
    assert.equal(el.dataset.theme, THEMES[0].id);
  }));
  // null·undefined 도 같은 길로 간다 — 저장소가 막힌 브라우저에서 읽기가 null 을 준다.
  for (const bad of [null, undefined, "", 0]) {
    withStore(new Map(), () => withDom((el) => {
      setTheme(bad);
      assert.equal(el.dataset.theme, THEMES[0].id, `${JSON.stringify(bad)} 가 기본으로 안 떨어졌다`);
    }));
  }
});

test("고른 테마는 저장되고, 다음 getTheme 이 그것을 준다", () => {
  const store = new Map();
  withStore(store, () => withDom(() => {
    setTheme(THEMES[1].id);
    assert.equal(getTheme(), THEMES[1].id);
  }));
  // 저장 키는 하나여야 한다 — 여러 키에 나눠 쓰면 한쪽만 지워진 상태가 생긴다.
  assert.equal(store.size, 1, `테마가 키 ${store.size}개에 저장됐다`);
});

test("저장된 적 없으면 기본 테마다 — 첫 방문이 무테마로 뜨지 않게", () => {
  withStore(new Map(), () => {
    assert.equal(getTheme(), THEMES[0].id);
  });
});

// 저장소가 던지는 브라우저(사생활 모드·사이트 데이터 차단)에서도 테마는 서야 한다.
// 여기서 던지면 부트가 통째로 멈춘다 — main.jsx 가 render 전에 setTheme 을 부르기 때문이다.
test("저장소가 던져도 테마는 선다", () => {
  const had = "localStorage" in globalThis;
  const prev = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() { throw new Error("SecurityError"); },
    setItem() { throw new Error("SecurityError"); },
    removeItem() { throw new Error("SecurityError"); },
  };
  try {
    withDom((el) => {
      assert.doesNotThrow(() => setTheme(THEMES[1].id));
      assert.equal(el.dataset.theme, THEMES[1].id, "저장에 실패해도 화면에는 걸려야 한다");
      assert.equal(getTheme(), THEMES[0].id, "못 읽으면 기본이다");
    });
  } finally {
    if (had) globalThis.localStorage = prev;
    else delete globalThis.localStorage;
  }
});
