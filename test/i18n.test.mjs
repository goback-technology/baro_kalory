// 사전은 **객체 리터럴**이라 같은 키를 두 번 적으면 오류가 나지 않는다 — 나중 것이 조용히
// 이긴다. 값이 같으면 아무 일도 안 일어나지만, 한쪽만 고치는 순간 그 수정이 사라진 것처럼
// 보이고 원인이 사전 안에 있어서 화면 쪽을 아무리 봐도 안 나온다. 실제로 넷이 그렇게 쌓여
// 있었다(2026-08-05 제거). 재발을 여기서 막는다.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";

const SRC = new URL("../src/i18n.mjs", import.meta.url);

// 사전 항목은 두 칸 들여쓴 `"키":` 한 줄로 시작한다. 값이 다음 줄로 이어지는 항목도 있으므로
// 키 줄만 센다(파서를 들이지 않는 이유: 이 파일은 브라우저 ESM 이고 노드에서 import 하면
// document 를 건드린다).
const KEY_LINE = /^ {2}"((?:[^"\\]|\\.)*)":/gm;

// 사전을 [키, 값문자열] 로 쪼갠다. 값은 다음 키 줄(또는 사전 끝) 직전까지다.
function dictEntries(src) {
  const lines = src.slice(src.indexOf("const DICT = {")).split("\n");
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^ {2}"((?:[^"\\]|\\.)*)":/.exec(lines[i]);
    if (m) starts.push({ key: m[1], i });
    else if (/^\};/.test(lines[i])) { starts.push({ key: null, i }); break; }
  }
  const out = [];
  for (let n = 0; n < starts.length - 1; n++) {
    if (starts[n].key === null) break;
    out.push([starts[n].key, lines.slice(starts[n].i, starts[n + 1].i).join("\n")]);
  }
  return out;
}

test("i18n 사전에 중복 키가 없다", async () => {
  const src = await readFile(SRC, "utf8");
  const seen = new Map();
  const dups = [];
  for (const m of src.matchAll(KEY_LINE)) {
    const key = m[1];
    const line = src.slice(0, m.index).split("\n").length;
    if (seen.has(key)) dups.push(`"${key}" (${seen.get(key)}행, ${line}행)`);
    else seen.set(key, line);
  }
  assert.deepEqual(dups, [], `중복 키 — 나중 것이 조용히 이긴다:\n  ${dups.join("\n  ")}`);
  assert.ok(seen.size > 100, "키를 세지 못했다 — 사전 형식이 바뀌었으면 이 정규식을 고쳐야 한다");
});

// 키가 두 종류다. 대부분은 **한국어 원문 자체**가 키라 값에 ko 를 두지 않는다(두면 원문이
// 두 벌이 되어 한쪽만 고쳐진다). 인라인 마크업이 든 항목만 `data-i18n-html="id"` 로 가리키는
// 식별자 키를 쓰고, 그때는 한국어도 값에 있어야 한다 — 키가 원문이 아니기 때문이다.
const ID_KEY = /^[a-z][A-Za-z0-9]*\.[A-Za-z0-9]+$/;

test("번역 항목은 두 규약 중 하나를 정확히 지킨다", async () => {
  // 한 언어만 채우면 그 언어에서만 한국어가 새어 나오고, 화면을 그 언어로 열어 보기 전에는
  // 아무도 모른다.
  const src = await readFile(SRC, "utf8");
  const wrong = [];
  // 값은 한 줄일 수도, 여러 줄일 수도 있다. 정규식으로 괄호를 세려 들면 다음 항목까지 삼킨다
  // (실제로 그렇게 오탐이 났다) — 다음 키 줄 전까지를 값으로 본다.
  for (const [key, value] of dictEntries(src)) {
    if (!/\ben:/.test(value)) wrong.push(`"${key}" — en 없음`);
    if (!/\bvi:/.test(value)) wrong.push(`"${key}" — vi 없음`);
    const hasKo = /(^|[{\s])ko:/.test(value);
    if (ID_KEY.test(key) && !hasKo) wrong.push(`"${key}" — 식별자 키인데 ko 없음 (키가 원문이 아니다)`);
    if (!ID_KEY.test(key) && hasKo) wrong.push(`"${key}" — 한국어 원문 키인데 값에도 ko 가 있다 (원문이 두 벌)`);
  }
  assert.deepEqual(wrong, [], `\n  ${wrong.join("\n  ")}`);
});

// 이 파일은 사전을 **문자열로** 읽어 형식을 검사한다(i18n.mjs 는 브라우저 ESM 이라 노드에서
// import 하면 document 를 건드린다). 그래서 i18nHtml 의 동작만 사전 원문에서 되짚어 본다 —
// 이 함수가 빈 문자열을 돌려주면 그 문단이 화면에서 통째로 사라지고, 아무도 오류를 안 본다.
test("i18nHtml 은 마크업째 돌려주고, 모르는 키에는 빈 문자열을 준다", async () => {
  const src = await readFile(SRC, "utf8");
  const fn = src.slice(src.indexOf("export function i18nHtml("), src.indexOf("\n}", src.indexOf("export function i18nHtml(")));
  assert.match(fn, /const e = HTML\[key\];/);
  assert.match(fn, /if \(!e\) return "";/, "모르는 키에 undefined 를 흘리면 화면에 그대로 찍힌다");
  assert.match(fn, /e\[lang\] != null \? e\[lang\] : e\.ko/, "번역이 없는 언어는 한국어로 떨어져야 한다");
  // 사전의 그 항목들은 실제로 마크업을 들고 있어야 한다 — 아니라면 t() 로 충분한 문자열이다.
  const html = src.slice(src.indexOf("const HTML = {"), src.indexOf("\n};", src.indexOf("const HTML = {")));
  assert.match(html, /<b>|<span/, "마크업이 없으면 이 사전에 있을 이유가 없다");
});

test("식별자 키는 실제로 i18nHtml() 이 부른다", async () => {
  // 식별자 키는 한국어 원문으로 찾을 수 없다 — 화면에서 그 이름으로 부르지 않으면 영영 죽은
  // 항목이 되고, 한국어 값까지 들고 있어서 살아 있는 것처럼 보인다.
  //
  // 옛 판은 `data-i18n-html="<키>"` 표시를 찾았다. 그 표시는 DOM 워커(applyI18n)가 훑어
  // 가라는 신호였고, 워커가 사라지면서 **부르는 쪽이 곧 참조**가 됐다.
  const src = await readFile(SRC, "utf8");
  // 화면을 **전수로** 훑는다 — 목록을 손으로 적어 두면 화면 하나가 목록에서 빠지는 순간
  // 그 화면이 부르던 키가 전부 고아로 보고된다(또는 반대로, 죽은 키를 살아 있다고 봐 준다).
  const html = (await Promise.all([
    ...(await readdir(new URL("../public/", import.meta.url)))
      .filter((f) => f.endsWith(".html"))
      .map((f) => readFile(new URL(`../public/${f}`, import.meta.url), "utf8")),
    ...(await readdir(new URL("../src/", import.meta.url), { recursive: true }))
      .map((f) => f.replaceAll("\\", "/"))
      .filter((f) => f.endsWith(".jsx") || f.endsWith(".mjs"))
      .map((f) => readFile(new URL(`../src/${f}`, import.meta.url), "utf8")),
  ])).join("\n");
  const orphans = [...src.matchAll(/^ {2}"([a-z][A-Za-z0-9]*\.[A-Za-z0-9]+)":/gm)]
    .map((m) => m[1])
    .filter((id) => !html.includes(`i18nHtml("${id}")`));
  assert.deepEqual(orphans, [], `화면이 부르지 않는 식별자 키: ${orphans.join(", ")}`);
});
