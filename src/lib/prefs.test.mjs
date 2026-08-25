// 이 모듈의 계약은 값이 아니라 **버티는 것**이다. localStorage 는 읽기만 해도 던질 수 있고
// (사생활 모드·사이트 데이터 차단), 선호 하나를 못 읽었다고 화면이 멈추면 그게 훨씬 나쁘다.
import assert from "node:assert/strict";
import test from "node:test";

import { readPref, writePref, removePref, readFlag, writeFlag } from "./prefs.mjs";

// 저장소를 심고 원상복구한다. 심지 않은 상태(노드 기본)도 하나의 시험 대상이라 지운다.
function withStore(store, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, "localStorage");
  const prev = had ? globalThis.localStorage : undefined;
  if (store === null) delete globalThis.localStorage;
  else globalThis.localStorage = store;
  try { fn(); } finally {
    if (had) globalThis.localStorage = prev;
    else delete globalThis.localStorage;
  }
}

function fakeStore() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

// 「사이트 데이터 차단」 설정의 브라우저가 실제로 하는 일 — 접근 자체가 SecurityError 다.
const throwingStore = {
  getItem() { throw new Error("SecurityError"); },
  setItem() { throw new Error("SecurityError"); },
  removeItem() { throw new Error("SecurityError"); },
};

test("정상 저장소에서는 값이 그대로 왕복한다", () => {
  withStore(fakeStore(), () => {
    writePref("k", "v");
    assert.equal(readPref("k"), "v");
    removePref("k");
    assert.equal(readPref("k"), null);
  });
});

test("없는 키는 기본값을 준다 — 기본값을 안 주면 null", () => {
  withStore(fakeStore(), () => {
    assert.equal(readPref("없음", "dflt"), "dflt");
    assert.equal(readPref("없음"), null);
  });
});

// 빈 문자열은 **저장된 값**이지 없는 값이 아니다. `??` 가 아니라 `||` 로 썼다면 여기서
// 기본값이 튀어나오고, 「지웠는데 다시 살아난다」로 보인다.
test("빈 문자열은 기본값으로 대체되지 않는다", () => {
  withStore(fakeStore(), () => {
    writePref("k", "");
    assert.equal(readPref("k", "dflt"), "");
  });
});

test("숫자를 넣어도 문자열로 나온다 — 저장소의 타입은 문자열뿐이다", () => {
  withStore(fakeStore(), () => {
    writePref("n", 200);
    assert.equal(readPref("n"), "200");
  });
});

// 여기가 이 모듈이 존재하는 이유다.
test("저장소가 던져도 읽기는 기본값을, 쓰기는 조용함을 준다", () => {
  withStore(throwingStore, () => {
    assert.equal(readPref("k", "dflt"), "dflt");
    assert.doesNotThrow(() => writePref("k", "v"));
    assert.doesNotThrow(() => removePref("k"));
    assert.equal(readFlag("k", true), true);
    assert.doesNotThrow(() => writeFlag("k", true));
  });
});

test("저장소가 아예 없어도(노드·SSR) 같은 답을 준다", () => {
  withStore(null, () => {
    assert.equal(readPref("k", "dflt"), "dflt");
    assert.doesNotThrow(() => writePref("k", "v"));
  });
});

// 켬/끔은 "on"/"off" 문자열 규약이다. 한 화면이 true/false 를 쓰기 시작하면 저장된 선택이
// 조용히 무시되고, 사용자는 「켜 뒀는데 매번 꺼져 있다」를 겪는다.
test("플래그는 on/off 문자열로 오간다", () => {
  const store = fakeStore();
  withStore(store, () => {
    writeFlag("f", true);
    assert.equal(store._map.get("f"), "on");
    assert.equal(readFlag("f"), true);
    writeFlag("f", false);
    assert.equal(store._map.get("f"), "off");
    assert.equal(readFlag("f"), false);
  });
});

test("저장된 적 없는 플래그는 기본값이다 — 켜 둔 적 없는 프리뷰가 켜지면 안 된다", () => {
  withStore(fakeStore(), () => {
    assert.equal(readFlag("처음"), false);
    assert.equal(readFlag("처음", true), true);
  });
});

// 키가 없는 호출(wantedKey 를 안 준 화면)은 저장할 곳이 없다는 뜻이지 오류가 아니다.
test("키가 없으면 기본값을 주고 아무것도 쓰지 않는다", () => {
  const store = fakeStore();
  withStore(store, () => {
    assert.equal(readFlag(null, true), true);
    writeFlag(null, true);
    assert.equal(store._map.size, 0);
  });
});
