import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { parseSync } from "vite";
import { PAGES } from "../src/pages.mjs";

const root = new URL("../", import.meta.url);

// 왜 이 테스트가 있는가 — 2026-08-11 6630082 이 설정 탭의 카메라 목록을 걷어내면서
// `const simSetStatus = ...` 선언만 지우고 읽는 곳 두 군데를 남겼다. 페이지 본문은
// <script type="module"> = strict mode 라, 미선언 식별자는 **읽는 순간** ReferenceError 다.
// 남아 있던 코드가 `if (!silent && simSetStatus) ...` 였다는 것이 이 병의 핵심이다 —
// 방어처럼 생겼지만 `&& simSetStatus` 가 바로 그 throw 다. 그래서 리뷰를 통과했고,
// 11일 뒤 「시뮬레이터가 연결되지 않습니다」로 보고됐다(실제로는 백엔드가 붙어 있었다).
//
// 문자열 검색으로는 못 잡는다(`X && X.foo` 는 어디에나 있는 정상 관용구다). 그래서 진짜
// AST 로 바인딩과 참조를 갈라 본다. 파서는 vite 가 다시 내보내는 oxc 의 parseSync 라
// 새 의존성이 없다 — 어차피 빌드가 같은 파서로 이 파일들을 읽는다.
//
// **파서를 parseAst(rollup)에서 parseSync(oxc)로 바꾼 이유는 .jsx 다.** parseAst 는 JSX
// 문법에서 던지므로 React 로 옮긴 페이지가 그물 밖으로 빠졌다 — 전환이 진행될수록 그물이
// 조용히 비어 가는 구조였다. 교체 전 대조로 판정 동일성을 확인했다: src 모듈 14개 + 페이지
// 인라인 모듈 6개에서 두 파서의 결과가 한 건도 갈리지 않았다.

// 바인딩 수집은 **평면(flat)** 이다: 블록 스코프를 재현하지 않고, 모듈 안 어디서든 선언된
// 이름이면 선언된 것으로 친다. 일부러 그렇게 뒀다 — 오탐이 하나라도 나면 이 테스트는
// 「고치는 대신 예외를 추가하는」 테스트가 되어 버린다. 이 그물이 잡는 것은 **선언이 통째로
// 사라진** 경우이고, 그것이 실제로 우리를 문 부류다. TDZ·섀도잉까지는 보지 않는다.
function bindingsOf(node, add) {
  if (!node) return;
  switch (node.type) {
    case "Identifier": add(node.name); break;
    case "ObjectPattern":
      for (const p of node.properties) bindingsOf(p.type === "RestElement" ? p.argument : p.value, add);
      break;
    case "ArrayPattern": for (const e of node.elements) bindingsOf(e, add); break;
    case "AssignmentPattern": bindingsOf(node.left, add); break;
    case "RestElement": bindingsOf(node.argument, add); break;
  }
}

// 식별자 노드가 **참조가 아닌** 자리들. 여기를 빼먹으면 `obj.foo` 의 foo, `{ foo: 1 }` 의
// 키, `import { fmtPtz as fmt }` 의 fmtPtz 가 전부 미선언 참조로 잡힌다(실제로 겪었다).
function isReference(n, parent) {
  if (!parent) return true;
  if (parent.type === "MemberExpression" && parent.property === n && !parent.computed) return false;
  if (parent.type === "Property" && parent.key === n && !parent.computed) return false;
  if (parent.type === "MethodDefinition" && parent.key === n && !parent.computed) return false;
  if (parent.type === "PropertyDefinition" && parent.key === n && !parent.computed) return false;
  if (parent.type === "ImportSpecifier" && parent.imported === n) return false;
  if (parent.type === "ExportSpecifier") return false;
  if (parent.type === "LabeledStatement" || parent.type === "BreakStatement" || parent.type === "ContinueStatement") return false;
  // import.meta — `import` 도 `meta` 도 이름이 아니라 문법이다.
  if (parent.type === "MetaProperty") return false;
  return true;
}

// JSX 태그 이름 중 **바인딩을 읽는 것**만 골라낸다. 이것이 JSX 에서 새로 생기는 미선언
// 부류다: `<StatusCard/>` 의 import 를 지우면 그 태그가 곧 ReferenceError 다.
//   <div>        호스트 태그 — 문자열로 컴파일된다. 참조가 아니다.
//   <StatusCard> 대문자 = 값 참조.
//   <ns.Thing>   점이 있으면 대소문자와 무관하게 값 참조이고, 읽는 것은 **뿌리**뿐이다.
function jsxTagRef(name) {
  if (!name) return null;
  if (name.type === "JSXMemberExpression") return jsxTagRef(name.object);
  if (name.type !== "JSXIdentifier") return null;   // JSXNamespacedName 등
  return /^[A-Z]/.test(name.name) ? name.name : null;
}

// 표준 내장(Array·Math·JSON·fetch·NaN·undefined…)은 node 의 전역에서 그대로 얻는다 —
// 손으로 베끼면 그 목록이 먼저 낡는다. 브라우저에만 있는 것만 명시한다. 페이지가 새 DOM
// 전역을 쓰기 시작하면 이 목록에 한 줄 늘리면 되고, **그 한 줄을 늘리는 행위 자체가**
// 「이건 전역이 맞다」는 판단을 남긴다.
const DOM_GLOBALS = [
  "window", "document", "location", "localStorage", "sessionStorage", "navigator", "history",
  "Event", "CustomEvent", "Node", "NodeFilter", "Option", "Image", "DOMPoint", "HTMLElement",
  "requestAnimationFrame", "cancelAnimationFrame", "createImageBitmap",
  "alert", "confirm", "prompt", "getComputedStyle", "matchMedia",
];
const ALLOWED = new Set([...Object.getOwnPropertyNames(globalThis), ...DOM_GLOBALS]);

// filename 은 파서에게 문법을 알려 준다(.jsx 면 JSX 를 켠다) — 인라인 모듈은 .mjs 로 준다.
function undeclaredIn(src, filename) {
  const parsed = parseSync(filename, src);
  assert.deepEqual(parsed.errors.map((e) => e.message ?? String(e)), [],
    `${filename}: 파싱 실패 — 그물 이전에 문법이 깨졌다`);
  const ast = parsed.program;
  const binds = new Set(), refs = new Set();
  const walk = (n, parent) => {
    switch (n.type) {
      case "VariableDeclarator": bindingsOf(n.id, (x) => binds.add(x)); break;
      case "FunctionDeclaration": case "ClassDeclaration":
      case "FunctionExpression": case "ArrowFunctionExpression":
        if (n.id) binds.add(n.id.name); break;
      case "CatchClause": bindingsOf(n.param, (x) => binds.add(x)); break;
      case "ImportDefaultSpecifier": case "ImportNamespaceSpecifier": case "ImportSpecifier":
        binds.add(n.local.name); break;
      case "JSXOpeningElement": case "JSXClosingElement": {
        const tag = jsxTagRef(n.name);
        if (tag) refs.add(tag);
        break;
      }
    }
    if (n.params) for (const p of n.params) bindingsOf(p, (x) => binds.add(x));
    if (n.type === "Identifier" && isReference(n, parent)) refs.add(n.name);
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === "string") walk(c, n); }
      else if (v && typeof v.type === "string") walk(v, n);
    }
  };
  walk(ast, null);
  return [...refs].filter((r) => !binds.has(r) && !ALLOWED.has(r));
}

async function pageModules() {
  const out = [];
  for (const f of (await readdir(new URL("public/", root))).filter((f) => f.endsWith(".html"))) {
    const html = await readFile(new URL(`public/${f}`, root), "utf8");
    let i = 0;
    for (const m of html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)) {
      out.push([`public/${f}#${i}`, m[1], `${f}.${i++}.mjs`]);
    }
  }
  return out;
}

async function srcModules() {
  const files = (await readdir(new URL("src/", root), { recursive: true }))
    .map((f) => f.replaceAll("\\", "/"))
    .filter((f) => (f.endsWith(".mjs") || f.endsWith(".jsx")) && !f.endsWith(".test.mjs"));
  const out = [];
  for (const f of files) out.push([`src/${f}`, await readFile(new URL(`src/${f}`, root), "utf8"), f]);
  return out;
}

// 인라인 모듈은 이제 하나도 없어야 한다 — 화면이 전부 라우트로 옮겨 갔고, 셸은 모듈을
// **src 로만** 참조한다. 인라인 코드가 다시 생기면 번들러의 모듈 그래프 밖에 서게 되고,
// 그러면 위 그물(src 전수)도 다음 그물(커버리지 불변식)도 그 코드를 못 본다.
// (그래도 파서는 남겨 둔다 — 하나라도 생기면 그때는 같은 그물에 걸린다.)
test("페이지에 인라인 모듈이 남아 있지 않다", async () => {
  const mods = await pageModules();
  assert.deepEqual(mods.map(([where]) => where), [],
    "인라인 <script type=\"module\"> 은 모듈 그래프 밖이라 그물이 못 본다");
  for (const [where, src, name] of mods) {
    assert.deepEqual(undeclaredIn(src, name), [], `${where}: strict mode 에서 읽는 즉시 ReferenceError 다`);
  }
});

test("src 모듈(.mjs·.jsx)에도 같은 그물을 친다", async () => {
  for (const [where, src, name] of await srcModules()) {
    assert.deepEqual(undeclaredIn(src, name), [], `${where}: 선언 없이 읽는 식별자`);
  }
});

// 개수 가드(`mods.length >= 5`)를 이것으로 갈았다. 개수는 **SPA 전환 중에 반드시 줄어들었다** —
// 화면이 라우트로 옮겨 가면 인라인 모듈이 사라지기 때문이다. 그때 가드를 낮추는 손질을
// 하게 되면 그물이 비어 가는 것을 가드가 승인해 주는 꼴이 된다. 그래서 세는 대신 **화면마다
// 그물에 걸린 코드가 하나라도 있는지**를 묻는다. 전환이 끝난 지금은 전부 src/pages/<id>/ 다.
test("화면마다 그물에 걸린 모듈이 하나는 있다 — 화면이 그물 밖으로 빠지지 않는다", async () => {
  const src = (await srcModules()).map(([where]) => where);
  for (const p of PAGES) {
    assert.ok(src.some((f) => f.startsWith(`src/pages/${p.id}/`)),
      `${p.id}: 이 화면의 코드가 그물에 하나도 안 걸렸다 — src/pages/${p.id}/ 에 파일이 없다`);
  }
});
