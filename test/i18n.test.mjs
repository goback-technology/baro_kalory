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

test("식별자 키는 실제로 data-i18n-html 이 가리킨다", async () => {
  // 식별자 키는 한국어 원문으로 찾을 수 없다 — 화면에서 그 id 로 부르지 않으면 영영 죽은
  // 항목이 되고, 한국어 값까지 들고 있어서 살아 있는 것처럼 보인다.
  const src = await readFile(SRC, "utf8");
  // 화면을 **전수로** 훑는다 — 페이지 목록을 손으로 적어 두면 React 로 옮긴 화면이 목록에서
  // 빠지는 순간 그 화면이 부르던 키가 전부 고아로 보고된다(또는 반대로, 죽은 키를 살아 있다고
  // 봐 준다). 대상은 페이지 HTML 과 src 의 모듈·컴포넌트 전부다.
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
    .filter((id) => !html.includes(`data-i18n-html="${id}"`));
  assert.deepEqual(orphans, [], `화면이 부르지 않는 식별자 키: ${orphans.join(", ")}`);
});
