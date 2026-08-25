import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PAGES } from "../src/pages.mjs";

const webUiDir = new URL("../", import.meta.url);

// 앱 목록은 **손으로 베끼지 않는다** — pages.mjs 가 정본이고, 여기서 다시 적으면 그 순간
// 세 번째 미러다. 이렇게 두면 이 단언은 「내가 적은 목록과 맞나」가 아니라 「페이지 표와
// 버전 파일이 서로 맞나」를 묻는 진짜 대조가 된다.
const APPS = PAGES.map((p) => p.versionKey).filter(Boolean).sort();

// 페이지가 공용 크롬을 부르는 자리. 바닐라 페이지는 HTML 인라인이고, React 로 옮긴 페이지는
// HTML 이 마운트만 갖고 호출이 부트 모듈에 있다. **페이지를 옮길 때 이 표에 한 줄 적는 것이
// 그 이관의 기록이다** — 옮길 때마다 테스트 본문을 뜯어고치는 대신.
const CHROME_CALL = {
  calibration: "src/pages/calibration/app.jsx",
};

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

test("페이지는 공용 크롬을 부르고, backend 가 프런트 버전을 대신 읽어 주지 않는다", async () => {
  // 버전 표시는 page-chrome.mjs 로 일원화됐다(2026-08-03 4앱 분리). 각 페이지는
  // initPageChrome({ page: "<id>" }) 를 부르고, 모듈이 app-versions.json 을 읽는다.
  for (const p of PAGES) {
    const html = await readFile(new URL(`public/${p.id}.html`, webUiDir), "utf8");
    const bootRel = CHROME_CALL[p.id];
    const boot = bootRel ? await readFile(new URL(bootRel, webUiDir), "utf8") : html;
    assert.match(boot, new RegExp(`initPageChrome\\(\\{ page: "${p.id}" \\}\\)`), `${p.id} 는 공용 크롬을 불러야 한다`);
    assert.match(html, /data-role="chrome"/, `${p.id} 헤더에 크롬 마운트가 없다`);
    // backend 응답의 프런트 버전 필드에 의존하면 따로 배포한 순간 값이 어긋난다.
    assert.doesNotMatch(boot, /v\.cctvVersion|v\.simulatorVersion|v\.frontendVersion/, `${p.id} 잔여 의존`);
  }
});

test("버전 파일은 「페이지 옆」에서 읽힌다 — 소스 문자열이 아니라 풀린 URL 로 확인한다", async () => {
  // 이 테스트의 앞 판본은 소스에 적힌 식(new URL("../…", import.meta.url))을 정규식으로 박아 뒀다.
  // 그래서 2026-08-22 Vite 전환 때 **초록인 채로** 회귀가 나갔다: 식은 그대로인데 모듈이 서빙되는
  // 자리가 /@fs/<repo>/src/ 로 바뀌어 "../" 가 저장소 루트로 떨어졌고, 6개 페이지 전부 버전 배지가
  // 「v—」가 됐다(dev 한정, dist 는 무사). 표현을 고정하는 대신 **결과**를 본다 — 소스에서 식을
  // 꺼내 실제로 평가하고, 그 URL 이 페이지 옆에 떨어지는지 확인한다.
  const chrome = await readFile(new URL("src/page-chrome.mjs", webUiDir), "utf8");
  const call = "await fetch(", i = chrome.indexOf(call);
  const expr = i < 0 ? "" : chrome.slice(i + call.length, chrome.indexOf(", { cache", i));
  assert.ok(expr.startsWith("new URL("), "fetchOwnVersions 의 fetch 대상을 못 찾았다 — 이 테스트가 낡았다");
  // 소스의 식을 그대로 평가한다. import.meta 로 되돌아가면 Function 이 파싱 단계에서 죽는다.
  const resolve = new Function("document", `return String(${expr})`);
  for (const [pageUrl, want] of [
    ["http://h/simulator.html", "http://h/app-versions.json"],
    ["http://h/simulator", "http://h/app-versions.json"],                              // 확장자 없는 라우트
    ["http://h/", "http://h/app-versions.json"],                                       // 대문
    ["http://h/barocalory/settings.html", "http://h/barocalory/app-versions.json"],     // mount 프리픽스
    ["https://x.github.io/baro_kalory/calibration.html", "https://x.github.io/baro_kalory/app-versions.json"],
  ]) {
    assert.equal(resolve({ baseURI: pageUrl }), want, `${pageUrl} 에서 페이지 옆을 못 가리킨다`);
  }
});

test("home 카드는 모든 앱을 가리키고 각자의 버전 키를 단다", async () => {
  const home = await readFile(new URL("public/home.html", webUiDir), "utf8");
  for (const app of APPS) {
    assert.match(home, new RegExp(`data-version-key="${app}"`), `${app} 버전 배지 누락`);
  }
  for (const p of PAGES) {
    if (!p.slug) continue;   // 대문 자신은 카드가 없다
    assert.match(home, new RegExp(`href="\\./${p.slug}"`), `${p.slug} 카드 링크 누락`);
  }
});
