import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PAGES } from "../src/pages.mjs";

const webUiDir = new URL("../", import.meta.url);

// 앱 목록은 **손으로 베끼지 않는다** — pages.mjs 가 정본이고, 여기서 다시 적으면 그 순간
// 세 번째 미러다. 이렇게 두면 이 단언은 「내가 적은 목록과 맞나」가 아니라 「페이지 표와
// 버전 파일이 서로 맞나」를 묻는 진짜 대조가 된다.
const APPS = PAGES.map((p) => p.versionKey).filter(Boolean).sort();

const read = (rel) => readFile(new URL(rel, webUiDir), "utf8");

test("각 프런트 앱은 자기 버전을 독립적으로 든다", async () => {
  // public/ 에 있는 이유: 이 파일은 페이지와 **함께 배포**되어야 한다(2026-07-28). 페이지가
  // 자기 버전을 여기서 읽으므로, 프런트를 CDN 등에 따로 올려도 표시가 실제와 일치한다.
  const versions = JSON.parse(await readFile(new URL("public/app-versions.json", webUiDir), "utf8"));
  // The point is that each front-end carries its OWN version — not what those versions
  // happen to be today. Pinning the literals here would fail on every legitimate bump, which
  // trains everyone to update the test without reading it.
  assert.deepEqual(Object.keys(versions).sort(), APPS);
  for (const [app, v] of Object.entries(versions)) {
    assert.match(v, /^\d+\.\d+\.\d+$/, `${app} must carry a semver`);
  }
});

test("버전 파일은 「문서 옆」에서 읽힌다 — 소스 문자열이 아니라 풀린 URL 로 확인한다", async () => {
  // 이 테스트의 앞 판본은 소스에 적힌 식(new URL("../…", import.meta.url))을 정규식으로 박아 뒀다.
  // 그래서 2026-08-22 Vite 전환 때 **초록인 채로** 회귀가 나갔다: 식은 그대로인데 모듈이 서빙되는
  // 자리가 /@fs/<repo>/src/ 로 바뀌어 "../" 가 저장소 루트로 떨어졌고, 6개 페이지 전부 버전 배지가
  // 「v—」가 됐다(dev 한정, dist 는 무사). 표현을 고정하는 대신 **결과**를 본다 — 소스에서 식을
  // 꺼내 실제로 평가하고, 그 URL 이 문서 옆에 떨어지는지 확인한다.
  const chrome = await read("src/app/shell.jsx");
  const call = "await fetch(", i = chrome.indexOf(call);
  const expr = i < 0 ? "" : chrome.slice(i + call.length, chrome.indexOf(", { cache", i));
  assert.ok(expr.startsWith("new URL("), "fetchOwnVersions 의 fetch 대상을 못 찾았다 — 이 테스트가 낡았다");
  // 소스의 식을 그대로 평가한다. import.meta 로 되돌아가면 Function 이 파싱 단계에서 죽는다.
  const resolve = new Function("document", `return String(${expr})`);
  // 해시 라우트에서는 문서 URL 이 언제나 셸(index.html)이다. 옛 주소(`<slug>.html`)로 들어와도
  // 리다이렉트 셸이 같은 자리로 보내므로, 두 경우 다 같은 곳을 가리켜야 한다.
  for (const [pageUrl, want] of [
    ["http://h/index.html", "http://h/app-versions.json"],
    ["http://h/simulator.html", "http://h/app-versions.json"],                         // 옛 주소(리다이렉트 셸)
    ["http://h/", "http://h/app-versions.json"],                                       // 디렉터리 URL
    ["http://h/barocalory/index.html", "http://h/barocalory/app-versions.json"],        // mount 프리픽스
    ["https://x.github.io/baro_kalory/", "https://x.github.io/baro_kalory/app-versions.json"],
  ]) {
    assert.equal(resolve({ baseURI: pageUrl }), want, `${pageUrl} 에서 문서 옆을 못 가리킨다`);
  }
});

// 크롬은 셸이 한 번 그리고 라우트가 그 안에 들어온다. 그래서 계약은 「셸이 주는가 + 라우트
// 표가 **PAGES 를 전부 덮는가**」다. 덮지 못한 화면은 대문으로 떨어져 조용히 사라진다.
test("셸이 크롬을 주고, 라우트 표가 화면을 전부 덮는다", async () => {
  const shell = await read("src/app/shell.jsx");
  const app = await read("src/app/app.jsx");
  assert.match(shell, /data-role="chrome"/, "셸에 크롬 자리가 없다");
  assert.match(shell, /id="version"/, "셸에 버전 배지가 없다");
  // backend 응답의 프런트 버전 필드에 의존하면 따로 배포한 순간 값이 어긋난다.
  assert.doesNotMatch(shell, /v\.cctvVersion|v\.simulatorVersion|v\.frontendVersion/, "셸 잔여 의존");
  for (const p of PAGES) {
    assert.match(app, new RegExp(`\\b${p.id}:\\s*lazy\\(`), `${p.id} 라우트가 표에 없다 — 대문으로 떨어진다`);
  }
});

test("대문 카드는 모든 앱을 가리키고 각자의 버전 키를 단다", async () => {
  // 카드 목록의 계약은 src/pages/home/cards.test.mjs 가 값으로 문다(PAGES 파생·잠금·링크).
  // 여기서는 **버전 축**만 본다: app-versions.json 의 키가 전부 카드에 실리는가.
  const cards = await read("src/pages/home/page.jsx");
  assert.match(cards, /data-version-key=\{card\.versionKey\}/, "카드가 버전 키를 달지 않는다");
  const blurbs = await read("src/pages/home/cards.mjs");
  for (const app of APPS) {
    assert.match(blurbs, new RegExp(`^\\s*${app}: \\[`, "m"), `${app} 카드 문구 누락 — 이름만 남는다`);
  }
});
