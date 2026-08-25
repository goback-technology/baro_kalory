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
// dist 의 URL 공간: 아직 안 옮긴 페이지는 루트의 <slug>.html, SPA 로 옮긴 페이지는 같은
// 이름의 **리다이렉트 셸**, index.html 은 SPA 셸. .nojekyll·app-versions.json·favicon·test/.

import { cpSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PAGES, MPA_PAGES, pageFileOf } from "../src/pages.mjs";
import { rewriteForStaticHost } from "../pack.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(repo, "src");
const publicDir = join(repo, "public");

const SPA_PAGES = PAGES.filter((p) => p.spa);
const CCTV = PAGES.find((p) => p.id === "cctv");
export const hashOf = (p) => (p.slug ? `#/${p.slug}` : "#/");

// 확장자 없는 페이지 주소의 표 — pages.mjs 에서 파생한다(손으로 베낀 미러가 아니다).
// "/v0" 은 cctv 의 옛 주소라 pages.mjs 에 없다(페이지가 아니라 별칭이다). 여기만 안다.
const ROUTES = { "/": "/index.html" };
for (const p of MPA_PAGES) if (p.slug) ROUTES[`/${p.slug}`] = `/${p.slug}.html`;
if (!CCTV.spa) ROUTES["/v0"] = "/cctv.html";

// SPA 로 옮긴 페이지의 옛 주소 → 셸의 해시. dev 에서는 302 가, dist 에서는 리다이렉트 셸이
// 같은 일을 한다. **쿼리는 반드시 넘긴다** — ?api=reset 은 잘못 저장한 API base 로 벽돌이
// 된 화면의 탈출구라, 리다이렉트에서 증발하면 정확히 필요한 순간에 실패한다.
export const SPA_REDIRECTS = {};
for (const p of SPA_PAGES) {
  if (p.slug) SPA_REDIRECTS[`/${p.slug}`] = hashOf(p);
  SPA_REDIRECTS[`/${pageFileOf(p)}`] = hashOf(p);
}
if (CCTV.spa) SPA_REDIRECTS["/v0"] = hashOf(CCTV);

// 옛 URL 을 잃지 않기 위한 한 장짜리 문서. 작업자의 북마크는 <slug>.html 형태로 존재하고,
// 그 주소가 404 가 되는 것은 「화면이 사라졌다」로 읽힌다. JS 가 꺼져 있어도 넘어가도록
// noscript refresh 를, 그마저 막히면 손으로 누를 링크를 둔다.
export function redirectShell(hash, label = "") {
  const target = `./index.html${hash}`;
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${label || "baro"}</title>
<script>location.replace("./index.html" + location.search + ${JSON.stringify(hash)});</script>
<noscript><meta http-equiv="refresh" content="0; url=${target}" /></noscript>
</head><body style="font:14px system-ui; padding:24px">
<p>이 주소는 <a href="${target}">${target}</a> 로 옮겨졌습니다.</p>
</body></html>
`;
}

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

    // dev 전용: 확장자 없는 페이지 주소, 뒤끝 슬래시 별칭, SPA 로 옮긴 페이지의 옛 주소.
    // 리다이렉트는 **쿼리를 보존한다**(위 SPA_REDIRECTS 주석의 ?api=reset 탈출구).
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url, "http://x");
        const p = url.pathname;
        const bare = p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : null;
        if (bare && (ROUTES[bare] || SPA_REDIRECTS[bare])) {
          res.writeHead(301, { location: bare + url.search });
          res.end();
          return;
        }
        if (SPA_REDIRECTS[p]) {
          // 해시는 서버에 오지 않으므로 브라우저가 볼 Location 에 직접 붙인다.
          res.writeHead(302, { location: "/" + url.search + SPA_REDIRECTS[p] });
          res.end();
          return;
        }
        if (ROUTES[p]) req.url = ROUTES[p] + url.search;
        next();
      });
    },

    // build 전용: 확장자 없는 링크 → 실파일 + 정적 표식.
    // dev 에는 적용하지 않는다 — 위 라우팅이 확장자 없는 주소를 서빙하므로 원형을 유지한다.
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!ctx.server) return rewriteForStaticHost(html);
        return html;
      },
    },

    // 빌드가 모듈 그래프로 못 보는 것들 — 런타임 fetch 자산, 자립형 정적 파일, 옛 주소 셸.
    closeBundle() {
      const dist = join(repo, "dist");
      if (!existsSync(dist)) return;
      // app-versions.json: 크롬이 fetch 로 읽는다(참조가 코드라 번들러가 모른다).
      cpSync(join(publicDir, "app-versions.json"), join(dist, "app-versions.json"));
      // favicon: HTML 참조분은 Vite 가 자산으로 옮기지만, 브라우저의 /favicon.ico 직접
      // 요청도 있으므로 원 이름으로도 둔다. svg 는 참조가 없어도 pack 산출물과 동일하게.
      cpSync(join(publicDir, "favicon.ico"), join(dist, "favicon.ico"));
      cpSync(join(publicDir, "favicon.svg"), join(dist, "favicon.svg"));
      // test/: 자립형 심플 뷰(모듈 import 없음) — 처리 대상이 아니라 복사 대상이다.
      cpSync(join(publicDir, "test"), join(dist, "test"), { recursive: true });
      // SPA 로 옮긴 페이지의 옛 주소 — 북마크가 404 가 되지 않게 셸을 발행한다.
      for (const p of SPA_PAGES) {
        writeFileSync(join(dist, pageFileOf(p)), redirectShell(hashOf(p), p.label));
      }
      if (CCTV.spa) writeFileSync(join(dist, "v0.html"), redirectShell(hashOf(CCTV), CCTV.label));
      // Pages 가 밑줄 경로를 빼지 않게 — dist 만 올리는 배포에는 루트 .nojekyll 이 안 따라간다.
      writeFileSync(join(dist, ".nojekyll"), "");
    },
  };
}
