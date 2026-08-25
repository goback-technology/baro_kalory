// 재작성 규칙 없는 정적 호스트(GitHub Pages·S3·CDN) 배포 계약.
//
// 이 파일이 지키는 것은 두 가지다.
//   (1) 페이지 목록 미러가 갈라지지 않는 것 — 정적 호스트에서 미러 하나는 곧 404 다.
//   (2) 정적 빌드 판정이 **디렉터리 URL 에서도** 맞는 것. Pages 는 index.html 을 `/<repo>/`
//       로 서빙해서 pathname 이 ".html" 로 끝나지 않는다. 대문에서만 나는 그 오판은 링크
//       404 로 끝나지 않고, 미연결 게이트가 href 비교로 설정 카드를 가리므로 설정 카드까지
//       잠근다 — 백엔드 주소를 넣을 유일한 문이 잠겨 첫 방문이 벽돌이 된다.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PAGE_FILES, STATIC_MARKER, rewriteForStaticHost } from "../pack.mjs";
import { PAGES, MPA_PAGES, pageFileOf, pageHref, isStaticBuild } from "../src/pages.mjs";
import { redirectShell, SPA_REDIRECTS } from "../build/vite-kalory.mjs";

const repo = new URL("../", import.meta.url);

// isStaticBuild() 는 브라우저 전역을 읽는다. 노드에서 그 두 값만 흉내 내 판정을 검사한다.
function withDom({ pathname, marker }, fn) {
  const prevDoc = globalThis.document;
  const prevLoc = globalThis.location;
  globalThis.document = { querySelector: (sel) => (marker && sel.includes("baro-static-build") ? {} : null) };
  globalThis.location = { pathname };
  try { return fn(); } finally {
    if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
    if (prevLoc === undefined) delete globalThis.location; else globalThis.location = prevLoc;
  }
}

test("dist 페이지 목록은 pages.mjs 에서 파생된다 — 손으로 베낀 미러가 아니다", async () => {
  assert.deepEqual(PAGE_FILES, MPA_PAGES.map(pageFileOf));
  for (const f of PAGE_FILES) {
    await readFile(new URL(`public/${f}`, repo)); // 없으면 여기서 던진다
  }
  // SPA 로 옮긴 페이지는 반대다 — 실파일이 있으면 리다이렉트 셸이 그것을 덮어써 버린다.
  for (const p of PAGES.filter((x) => x.spa)) {
    await assert.rejects(readFile(new URL(`public/${pageFileOf(p)}`, repo)),
      `public/${pageFileOf(p)} 가 남아 있다 — 옮긴 페이지의 실파일은 지워야 한다`);
  }
});

// 옛 주소를 잃지 않는 것이 이 전환의 최소 조건이다. 작업자의 북마크는 <slug>.html 형태로
// 존재하고, 그 주소가 404 가 되는 것은 「화면이 사라졌다」로 읽힌다.
test("SPA 로 옮긴 페이지의 옛 주소는 리다이렉트 셸이 받는다", () => {
  for (const p of PAGES.filter((x) => x.spa)) {
    assert.ok(SPA_REDIRECTS[`/${pageFileOf(p)}`], `${pageFileOf(p)} 옛 주소가 표에 없다`);
    if (p.slug) assert.ok(SPA_REDIRECTS[`/${p.slug}`], `/${p.slug} 가 표에 없다`);
  }
  const shell = redirectShell("#/settings", "설정");
  // 쿼리를 넘기는 것이 이 셸의 본론이다 — ?api=reset 은 잘못 저장한 API base 로 벽돌이 된
  // 화면의 탈출구라, 리다이렉트에서 증발하면 정확히 필요한 순간에 실패한다.
  assert.match(shell, /location\.replace\("\.\/index\.html" \+ location\.search \+ "#\/settings"\)/);
  assert.match(shell, /<noscript><meta http-equiv="refresh"/, "JS 가 꺼져 있어도 넘어가야 한다");
  assert.match(shell, /<a href="\.\/index\.html#\/settings">/, "그마저 막히면 손으로 누를 링크");
});

test("정적 호스트 재작성: 확장자 없는 링크와 / 진입을 실파일로 바꾼다", () => {
  // 재작성 대상은 **아직 SPA 로 안 옮긴** 페이지의 링크뿐이다. 옮긴 페이지의 링크는
  // 해시라 재작성이 손댈 것이 없다(그 자리는 리다이렉트 셸이 받는다).
  const html = '<head></head><a href="./">홈</a><a href="./cctv">CCTV</a><a href="./discovery">탐색</a>';
  const out = rewriteForStaticHost(html);
  assert.match(out, /href="\.\/index\.html"/);
  assert.match(out, /href="\.\/cctv\.html"/);
  assert.match(out, /href="\.\/discovery\.html"/);
  assert.doesNotMatch(out, /href="\.\/(cctv|discovery)"/);
});

test("재작성은 정적 빌드 표식을 심고, 두 번 돌려도 하나뿐이다", () => {
  const once = rewriteForStaticHost("<head></head><body></body>");
  assert.ok(once.includes(STATIC_MARKER));
  const twice = rewriteForStaticHost(once);
  assert.equal(twice.match(/name="baro-static-build"/g).length, 1);
});

test("표식을 심을 자리가 없으면 조용히 넘기지 않고 던진다", () => {
  // 표식 없이 배포되면 대문이 벽돌이 된다 — 실패는 빌드에서 나야지 브라우저에서 나면 안 된다.
  assert.throws(() => rewriteForStaticHost("<body>머리 없는 페이지</body>"), /baro-static-build|head/i);
});

test("정적 빌드 판정: 표식이 있으면 디렉터리 URL(`/<repo>/`)에서도 정적이다", () => {
  assert.equal(withDom({ pathname: "/baro_kalory/", marker: true }, isStaticBuild), true);
  assert.equal(withDom({ pathname: "/", marker: true }, isStaticBuild), true);
  // 표식이 없으면 개발 서버(라우팅 있음)다 — 확장자 없는 정규형 링크를 쓴다.
  assert.equal(withDom({ pathname: "/baro_kalory/", marker: false }, isStaticBuild), false);
  assert.equal(withDom({ pathname: "/cctv", marker: false }, isStaticBuild), false);
  // 소스 트리를 그대로 연 경우는 표식이 없어도 실파일 링크여야 한다.
  assert.equal(withDom({ pathname: "/public/cctv.html", marker: false }, isStaticBuild), true);
});

// 옛 대문은 카드의 href 문자열과 게이트의 판정이 **문자열로** 맞아야 했고, 대문에서만 그
// 둘이 어긋나 설정 카드까지 잠기는 사고가 두 번 났다. 이제 잠금은 페이지 id 로 판정하므로
// (cards.test.mjs 가 값으로 문다) 그 부류가 구조적으로 사라졌다. 여기 남는 계약은 하나 —
// **대문에서 설정으로 가는 링크가 실제로 열리는 주소인가.**
test("대문에서 설정으로 가는 링크는 배포 형태를 가리지 않고 실주소다", () => {
  // 미연결에서 유일하게 열린 문이다. 이 링크가 404 면 백엔드 주소를 넣을 길이 사라져
  // 첫 방문이 곧 벽돌이 된다(두 번 물린 부류).
  const shell = (pathname, marker) => withDom({ pathname, marker }, () => pageHref("settings", { fromShell: true }));
  assert.equal(shell("/baro_kalory/", true), "#/settings", "셸 안에서는 같은 문서의 해시다");
  assert.equal(shell("/", false), "#/settings");
  // 셸 밖(아직 안 옮긴 페이지의 헤더·게이트)에서는 셸 문서까지 가야 한다. 정적 배포에서
  // "./" 로 가리키면 디렉터리 URL 에서 404 이므로 index.html 을 명시한다.
  assert.equal(withDom({ pathname: "/baro_kalory/cctv.html", marker: true }, () => pageHref("settings")), "./index.html#/settings");
  assert.equal(withDom({ pathname: "/cctv", marker: false }, () => pageHref("settings")), "./#/settings");
});

// 홈은 SPA 라우트다. 아직 안 옮긴 페이지에서는 셸 문서로 가야 하고(문서 로드), 셸 안에서는
// 해시만 바꾸면 된다(같은 문서). 정적 빌드에서 셸 문서를 "./" 로 가리키면 디렉터리 URL 에서
// 404 가 나므로 index.html 을 명시한다.
test("홈 링크: 레거시 페이지에서는 셸 문서로, 셸 안에서는 해시로", () => {
  assert.equal(withDom({ pathname: "/baro_kalory/cctv.html", marker: true }, () => pageHref("home")), "./index.html#/");
  assert.equal(withDom({ pathname: "/cctv", marker: false }, () => pageHref("home")), "./#/");
  assert.equal(withDom({ pathname: "/baro_kalory/", marker: true }, () => pageHref("home", { fromShell: true })), "#/");
  assert.equal(withDom({ pathname: "/", marker: false }, () => pageHref("home", { fromShell: true })), "#/");
});
