// 재작성 규칙 없는 정적 호스트(GitHub Pages·S3·CDN) 배포 계약.
//
// dist 는 이제 **문서 하나**(index.html)와 옛 주소를 받는 리다이렉트 셸들이다. 그래서 이
// 파일이 지키는 것도 하나로 줄었다 — **옛 주소를 잃지 않는 것**.
//
// 사라진 것: 확장자 재작성·정적 빌드 표식·isStaticBuild. 그 기계는 링크가 배포 형태에 따라
// `./cctv` 와 `./cctv.html` 로 갈리던 시절의 것이었고, 정적 호스트가 index.html 을 디렉터리
// URL(`/<repo>/`)로 서빙하는 탓에 **대문에서만** 오판이 났다. 그 오판은 링크 404 로 끝나지
// 않았다 — 미연결 게이트가 "설정 카드인지"를 href 비교로 가려서 설정 카드까지 잠갔고, 백엔드
// 주소를 넣을 유일한 문이 닫혀 첫 방문이 곧 벽돌이 됐다(두 번 물렸다). 링크가 언제나 해시가
// 되면서 판정할 것 자체가 없어졌다.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PAGES, pageFileOf, pageHref } from "../src/pages.mjs";
import { redirectShell, SPA_REDIRECTS, hashOf } from "../build/vite-kalory.mjs";

const repo = new URL("../", import.meta.url);

test("public/ 에 남은 문서는 셸 하나뿐이다", async () => {
  // 화면의 실파일이 남아 있으면 리다이렉트 셸이 그것을 덮어써 버린다(또는 반대로, 옛 화면이
  // 새 라우트를 가린다). 어느 쪽이든 두 벌이 공존하는 순간 어느 것이 도는지 알 수 없다.
  for (const p of PAGES) {
    await assert.rejects(readFile(new URL(`public/${pageFileOf(p)}`, repo)),
      `public/${pageFileOf(p)} 가 남아 있다 — 옮긴 화면의 실파일은 지워야 한다`);
  }
  await readFile(new URL("public/index.html", repo));   // 없으면 여기서 던진다
});

// 옛 주소를 잃지 않는 것이 이 전환의 최소 조건이다. 작업자의 북마크는 <slug>.html 형태로
// 존재하고, 그 주소가 404 가 되는 것은 「화면이 사라졌다」로 읽힌다.
test("옛 주소는 전부 리다이렉트 셸이 받는다", () => {
  for (const p of PAGES) {
    assert.ok(SPA_REDIRECTS[`/${pageFileOf(p)}`], `${pageFileOf(p)} 옛 주소가 표에 없다`);
    if (p.slug) assert.ok(SPA_REDIRECTS[`/${p.slug}`], `/${p.slug} 가 표에 없다`);
  }
  // "/v0" 은 cctv 의 옛 별칭이라 PAGES 에 없다 — 표가 그것도 알아야 한다.
  assert.equal(SPA_REDIRECTS["/v0"], "#/cctv");

  const shell = redirectShell("#/settings", "설정");
  // 쿼리를 넘기는 것이 이 셸의 본론이다 — ?api=reset 은 잘못 저장한 API base 로 벽돌이 된
  // 화면의 탈출구라, 리다이렉트에서 증발하면 정확히 필요한 순간에 실패한다.
  assert.match(shell, /location\.replace\("\.\/index\.html" \+ location\.search \+ "#\/settings"\)/);
  assert.match(shell, /<noscript><meta http-equiv="refresh"/, "JS 가 꺼져 있어도 넘어가야 한다");
  assert.match(shell, /<a href="\.\/index\.html#\/settings">/, "그마저 막히면 손으로 누를 링크");
});

// 링크가 배포 형태를 가리지 않는다는 것이 위 기계를 없앤 근거다 — 값으로 못 박아 둔다.
test("화면 링크는 언제나 같은 문서의 해시다", () => {
  assert.equal(pageHref("home"), "#/");
  assert.equal(pageHref("settings"), "#/settings");
  assert.equal(pageHref("simulator"), "#/simulator");
  // 모르는 id 는 대문이다 — 빈 문자열을 돌려주면 href="" 가 되어 **지금 문서를 다시 연다**.
  assert.equal(pageHref("없는화면"), "#/");
  for (const p of PAGES) assert.equal(pageHref(p.id), hashOf(p), p.id);
});
