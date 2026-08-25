#!/usr/bin/env node
// CDN/정적 호스팅용 팩 — dist/ 한 폴더에 UI 전체를 모은다 (번들링 없음, 파일 배치만).
//
//   pnpm build:dist   # build:css 후 dist/ 생성 (pack 은 pnpm 예약어)
//
// dist/ 를 GitHub Pages·CDN·아무 정적 서버에나 올리면 된다. 페이지가 전부 상대경로라
// 마운트 프리픽스(/repo/, /barocalory/, /)가 무엇이든 동작하고, backend 는 설정 탭
// 또는 <meta name="baro-api-base"> 주입으로 지정한다(동일 출처에 backend 가 없으므로
// CDN 배포에서는 지정이 필수 — backend 쪽 config.cors.origins 도 열어야 한다).
//
// 배치 규약(웹 URL 공간과 동일):
//   dist/            = public/*  (페이지 HTML·app.css·favicon·test)
//   dist/web/        = src/*.mjs (테스트 제외 — 브라우저 모듈)

import { cpSync, rmSync, mkdirSync, readdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MPA_PAGES, pageFileOf } from "./src/pages.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// 페이지 목록은 pages.mjs 에서 파생시킨다 — 여기 파일명을 손으로 베껴 두면 페이지를 추가한
// 날 그 경로만 조용히 404 가 된다(재작성 규칙 없는 호스트에서는 미러 하나가 곧 404다).
// SPA 로 옮긴 페이지는 실파일이 없다 — 그 자리에는 리다이렉트 셸이 발행된다(vite-kalory).
export const PAGE_FILES = MPA_PAGES.map(pageFileOf);
const SLUGS = MPA_PAGES.map((p) => p.slug).filter(Boolean);

// 정적 빌드 표식 — pages.mjs 의 isStaticBuild() 가 링크 형태를 이 표식으로 정한다.
// URL 로 추측하면 안 되는 이유: 정적 호스트는 index.html 을 **디렉터리 URL**(`/<repo>/`)로
// 서빙해서 pathname 이 ".html" 로 끝나지 않는다. 대문에서만 오판이 나고, 그 오판은 링크
// 404 로 끝나지 않는다 — 미연결 게이트가 "설정 카드인지"를 href 비교로 가리므로, 카드는
// ./settings.html 인데 판정은 ./settings 가 되어 **설정 카드까지 잠긴다.** 백엔드 주소를
// 넣으러 갈 수 있는 유일한 문이 잠기므로 첫 방문이 곧 벽돌이다.
export const STATIC_MARKER = '<meta name="baro-static-build" content="1" />';

// 재작성 규칙 없는 정적 호스트 호환 재작성 — I/O 없는 순수 함수(테스트가 이것을 문다).
// 소스의 페이지 링크(./ ·./cctv)와 진입점(home.html)은 개발 서버의 페이지 라우팅이 있어야
// 성립한다. Pages·S3·python http.server 같은 호스트에선 확장자 없는 URL 도, index 없는 /
// 진입도 404 다. dist 에서만 .html 실파일로 재작성한다 — 소스의 URL 정규형은 무변경.
export function rewriteForStaticHost(html) {
  let s = html;
  s = s.replace(/href="\.\/"(?=[ >])/g, 'href="./index.html"');
  s = s.replace(new RegExp(`href="\\./(${SLUGS.join("|")})"`, "g"), 'href="./$1.html"');
  if (!/name="baro-static-build"/.test(s)) {
    if (!/<head>/i.test(s)) throw new Error("<head> 가 없어 정적 빌드 표식을 심을 수 없습니다");
    s = s.replace(/<head>/i, `<head>\n${STATIC_MARKER}`);
  }
  return s;
}

function main() {
  const dist = join(here, "dist");

  if (!existsSync(join(here, "public", "app.css"))) {
    console.error("public/app.css 가 없습니다 — 먼저 build:css (pnpm build)");
    process.exit(1);
  }

  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });

  cpSync(join(here, "public"), dist, { recursive: true });

  for (const page of PAGE_FILES) {
    const p = join(dist, page);
    writeFileSync(p, rewriteForStaticHost(readFileSync(p, "utf8")));
  }
  writeFileSync(join(dist, "index.html"), readFileSync(join(dist, "home.html")));

  // Pages 가 밑줄로 시작하는 경로를 산출물에서 빼지 않게 한다. 저장소 루트의 .nojekyll 은
  // **dist 만 올리는 배포에는 따라가지 않으므로** 산출물 안에도 있어야 한다.
  writeFileSync(join(dist, ".nojekyll"), "");

  mkdirSync(join(dist, "web"), { recursive: true });
  for (const f of readdirSync(join(here, "src"))) {
    if (!f.endsWith(".mjs") || f.endsWith(".test.mjs")) continue;
    cpSync(join(here, "src", f), join(dist, "web", f));
  }

  const count = (d) => readdirSync(d, { recursive: true }).length;
  console.log(`dist/ 생성: ${count(dist)}개 항목 (web ${readdirSync(join(dist, "web")).length})`);
}

// 테스트가 순수 함수만 가져다 쓸 수 있게, 직접 실행일 때만 빌드한다.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
