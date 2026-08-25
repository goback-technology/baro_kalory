// Vite 호환 플러그인 — 무빌드 시절의 정적 서버·패커가 하던 일 중 Vite 내장이 안 덮는 몫.
//
// 정본은 셋이고 전부 재사용이다 — 여기서 목록·규칙을 다시 쓰면 그 순간 미러 드리프트다:
//   페이지 목록      → src/pages.mjs 의 PAGES
//   정적 호스트 재작성 → pack.mjs 의 rewriteForStaticHost (I/O 없는 순수 함수, 테스트가 문다)
//   /web/ 규약       → 페이지 HTML 이 "./web/*.mjs" 를 import 하는데 public/ 에 web/ 폴더가
//                      없다. 옛 정적 서버가 /web/ → src/ 로 매핑하던 것을 resolveId 가 잇는다.
//                      페이지 소스는 한 글자도 안 바꾼다 — 바닐라 페이지와 React 페이지가
//                      같은 규약으로 공존하는 것이 파일럿의 전제다.
//
// 빌드 산출물(dist)은 pack.mjs 산출물과 같은 URL 공간을 유지한다: 페이지는 루트의
// <slug>.html, index.html 은 home 의 복사본, .nojekyll, app-versions.json·favicon·test/.

import { cpSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PAGES } from "../src/pages.mjs";
import { rewriteForStaticHost } from "../pack.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(repo, "src");
const publicDir = join(repo, "public");

// 확장자 없는 페이지 주소의 표 — pages.mjs 에서 파생한다(손으로 베낀 미러가 아니다).
// "/v0" 은 cctv 의 옛 주소라 pages.mjs 에 없다(페이지가 아니라 별칭이다). 여기만 안다.
const ROUTES = { "/": "/home.html", "/v0": "/cctv.html" };
for (const p of PAGES) if (p.slug) ROUTES[`/${p.slug}`] = `/${p.slug}.html`;

export function kaloryCompat() {
  return {
    name: "kalory-compat",

    // "./web/…" (페이지의 모듈 참조) → src/…. dev 와 build 가 같은 훅을 탄다 — dev 서버는
    // 이 훅이 돌려준 절대경로의 파일을 그대로 변환·서빙한다(별도 미들웨어가 필요 없다).
    // React 파일럿부터 하위 경로와 .jsx 도 이 규약을 쓴다(src/pages/calibration/…).
    resolveId(source) {
      const m = source.match(/^(?:\.\/|\/)?web\/((?:[\w.-]+\/)*[\w.-]+\.(?:mjs|jsx))$/);
      if (m) return join(srcDir, m[1]);
      return null;
    },

    // dev 전용: 확장자 없는 페이지 주소와 뒤끝 슬래시 별칭.
    // 301 은 **쿼리를 보존한다** — ?api=reset 은 잘못 저장한 API base 로 벽돌이 된 화면의
    // 탈출구라, 리다이렉트에서 증발하면 정확히 필요한 순간에 실패한다.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url, "http://x");
        const p = url.pathname;
        if (p.length > 1 && p.endsWith("/") && ROUTES[p.slice(0, -1)]) {
          res.writeHead(301, { location: p.slice(0, -1) + url.search });
          res.end();
          return;
        }
        if (ROUTES[p]) req.url = ROUTES[p] + url.search;
        next();
      });
    },

    // build 전용: pack.mjs 가 dist 에 하던 재작성을 그대로 — 정적 표식 + ./<slug> → .html.
    // dev 에는 적용하지 않는다 — 위 라우팅이 확장자 없는 주소를 서빙하므로 원형을 유지한다.
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!ctx.server) return rewriteForStaticHost(html);
        return html;
      },
    },

    // 빌드가 모듈 그래프로 못 보는 것들 — 런타임 fetch 자산과 자립형 정적 파일.
    closeBundle() {
      const dist = join(repo, "dist");
      if (!existsSync(dist)) return;
      // app-versions.json: page-chrome.mjs 가 fetch 로 읽는다(참조가 코드라 번들러가 모른다).
      cpSync(join(publicDir, "app-versions.json"), join(dist, "app-versions.json"));
      // favicon: HTML 참조분은 Vite 가 자산으로 옮기지만, 브라우저의 /favicon.ico 직접
      // 요청도 있으므로 원 이름으로도 둔다. svg 는 참조가 없어도 pack 산출물과 동일하게.
      cpSync(join(publicDir, "favicon.ico"), join(dist, "favicon.ico"));
      cpSync(join(publicDir, "favicon.svg"), join(dist, "favicon.svg"));
      // test/: 자립형 심플 뷰(모듈 import 없음) — 처리 대상이 아니라 복사 대상이다.
      cpSync(join(publicDir, "test"), join(dist, "test"), { recursive: true });
      // index.html = home 의 복사본 (pack.mjs 와 동일 — 디렉터리 URL 진입).
      writeFileSync(join(dist, "index.html"), readFileSync(join(dist, "home.html")));
      // Pages 가 밑줄 경로를 빼지 않게 — dist 만 올리는 배포에는 루트 .nojekyll 이 안 따라간다.
      writeFileSync(join(dist, ".nojekyll"), "");
    },
  };
}
