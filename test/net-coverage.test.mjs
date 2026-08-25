// **그물 없는 소스 파일을 막는 그물.**
//
// 이미 커버리지 불변식이 하나 있다(`page-scripts.test.mjs`) — 그런데 그것은 **화면 단위**라
// `src/pages/<id>/` 에 파일이 하나라도 걸리면 통과한다. 그래서 파일 하나가 통째로 빠져도
// 아무 일이 없었고, 실제로 시뮬레이터의 오른쪽 단 200줄이 **아무 테스트에도 안 걸린 채**
// 오래 있었다(2026-08-25 발견 — 그 코드를 다른 파일로 통째로 옮겼는데 274건 중 하나도
// 실패하지 않아 드러났다). 셸 넷(main·backend-gate·busy-provider·theme)도 같은 상태였다.
//
// 그래서 여기서는 **파일 단위**로 묻는다: 이 소스를 가리키는 테스트가 하나라도 있는가.
//
// **예외 목록을 두지 않는다.** 두는 순간 「고치는 대신 목록에 추가하는」 테스트가 되고,
// 그 목록은 반드시 늘어난다. 새 파일에 그물을 걸기 싫으면 그 파일이 필요한지를 먼저 묻는 게 맞다.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function filesUnder(dir, keep) {
  const out = [];
  for (const f of await readdir(new URL(dir, root), { recursive: true })) {
    const rel = String(f).replaceAll("\\", "/");
    if (keep(rel)) out.push(dir + rel);
  }
  return out;
}

const isSource = (f) => (f.endsWith(".mjs") || f.endsWith(".jsx")) && !f.endsWith(".test.mjs");
const isTest = (f) => f.endsWith(".test.mjs");

// 한 소스를 가리키는 방법은 여러 가지다 — 상대 import(`./preview.mjs`), 저장소 경로
// (`../src/pages/cctv/page.jsx`), 디렉터리 상수 + 파일명(`read("setup-panel.jsx")`).
// **넓게 잡는다**: 조금이라도 가리키면 걸린 것으로 본다. 오탐(없는데 있다고 하는 것)이
// 미탐보다 훨씬 나쁘다 — 오탐은 이 테스트를 「예외를 추가하는 테스트」로 만든다.
function pointsAt(srcPath, tests) {
  const rel = srcPath.replace(/^src\//, "");              // pages/cctv/page.jsx
  const name = rel.split("/").pop();                       // page.jsx
  const dir = rel.split("/").slice(0, -1).join("/");        // pages/cctv
  return tests.filter(({ body, file }) =>
    body.includes(rel)                                       // 저장소 경로가 그대로
    || (body.includes(`"${name}"`) && (!dir || body.includes(dir)))  // 디렉터리 상수 + 파일명
    || (file.startsWith("src/") && body.includes(`"./${name}"`)));   // 소스 옆 테스트의 상대 import
}

test("모든 소스 파일에 그물이 하나는 걸려 있다", async () => {
  const sources = await filesUnder("src/", isSource);
  const testFiles = [...await filesUnder("test/", isTest), ...await filesUnder("src/", isTest)];
  const tests = await Promise.all(testFiles.map(async (file) => ({
    file, body: await readFile(new URL(file, root), "utf8"),
  })));

  assert.ok(sources.length > 30, "소스를 못 읽었다 — 이 검사가 조용히 비었다");
  assert.ok(tests.length > 20, "테스트를 못 읽었다 — 이 검사가 조용히 비었다");

  const naked = sources.filter((f) => pointsAt(f, tests).length === 0);
  assert.deepEqual(naked, [],
    `이 파일들을 문는 테스트가 하나도 없다. 값으로 물 수 있으면 대상 옆에\n`
    + `  <이름>.test.mjs 를, 뷰(JSX)라면 test/ 에 구조 그물을 둔다:\n  ${naked.join("\n  ")}`);
});

// 위 검사는 「가리키는가」만 본다 — 가리키기만 하고 아무것도 안 무는 테스트도 통과한다.
// 그래서 화면(page.jsx)만큼은 **단언이 실제로 여럿 붙어 있는지**까지 본다. 화면은 이 저장소에서
// 가장 크고 가장 자주 바뀌는 파일이라, 그물이 이름만 걸쳐 있으면 사실상 없는 것과 같다.
test("화면 파일에는 단언이 여럿 붙어 있다 — 이름만 걸친 그물을 막는다", async () => {
  const pageFiles = await filesUnder("src/pages/", (f) => f.endsWith("page.jsx"));
  const testFiles = [...await filesUnder("test/", isTest), ...await filesUnder("src/", isTest)];
  const tests = await Promise.all(testFiles.map(async (file) => ({
    file, body: await readFile(new URL(file, root), "utf8"),
  })));

  const thin = [];
  for (const f of pageFiles.map((x) => "src/pages/" + x.replace(/^src\/pages\//, ""))) {
    const hits = pointsAt(f, tests);
    const asserts = hits.reduce((n, t) => n + (t.body.match(/assert\./g) || []).length, 0);
    if (asserts < 5) thin.push(`${f} (단언 ${asserts}개)`);
  }
  assert.deepEqual(thin, [], `화면을 문는 단언이 너무 적다:\n  ${thin.join("\n  ")}`);
});
