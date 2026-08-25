// 해시 라우터. **경로가 아니라 해시인 이유**는 배포 형태다 — 이 앱은 GitHub Pages 같은
// 정적 호스트에 dist 를 그대로 올린다. 경로 라우팅(`/baro_kalory/cctv`)은 그 호스트가
// 모든 깊은 경로에 index.html 을 돌려주도록 재작성을 해 줘야 성립하는데, 우리는 그런
// 서버를 전제하지 않기로 결정돼 있다(리버스 프록시·마운트 프리픽스는 배포 쪽 결정이다).
//
// 해시는 그 문제를 통째로 없앤다. 문서 URL 은 언제나 index.html 하나라서
//   · document.baseURI 가 항상 페이지 옆을 가리킨다(버전 배지가 「v—」가 되던 부류가 소멸),
//   · ./app.css·./web/… 같은 상대 참조가 깊이에 따라 어긋나지 않고,
//   · 404 폴백도, base 프리픽스 설정도 필요 없다.
//
// **쿼리는 해시 앞에만 둔다**(`index.html?api=reset#/settings`). api.mjs 가 API base 를
// location.search 에서 읽기 때문이다 — `#/settings?api=reset` 은 그 파서에 닿지 않아
// 「벽돌 탈출구가 정확히 필요한 순간에 조용히 사라지는」 모양이 된다. 그래서 이 라우터는
// 해시 안의 `?` 를 못 본 척하지 않고 **모르는 라우트로 떨군다** — 조용한 실패보다 낫다.
import { useSyncExternalStore, useCallback } from "react";
import { PAGES } from "./routes.mjs";

const HOME = "home";

// hash → { pageId, sub }. sub 는 페이지 안의 두 번째 칸(설정의 탭 같은 것)이고 없으면 null.
// 모르는 slug 는 대문으로 떨어진다 — 빈 화면을 그리는 것보다 갈 곳이 있는 편이 낫다.
export function parseHash(hash, pages = PAGES) {
  const raw = String(hash || "").replace(/^#/, "").replace(/^\//, "");
  const [slug = "", sub = ""] = raw.split("/");
  if (!slug) return { pageId: HOME, sub: null };
  const page = pages.find((p) => p.slug === slug);
  if (!page) return { pageId: HOME, sub: null };
  return { pageId: page.id, sub: sub || null };
}

// pageId → 해시. 대문은 "#/" 다(빈 문자열이면 <a href=""> 가 페이지 새로고침이 된다).
export function hrefFor(pageId, sub = null, pages = PAGES) {
  const page = pages.find((p) => p.id === pageId);
  if (!page || !page.slug) return "#/";
  return sub ? `#/${page.slug}/${sub}` : `#/${page.slug}`;
}

// --- React 바인딩 -----------------------------------------------------------
// useSyncExternalStore 를 쓰는 이유: 해시는 React 밖의 값이고, 이 훅이 구독·해제·초기값을
// 한 벌로 묶어 준다(직접 useState+useEffect 로 짜면 첫 렌더와 이벤트 사이의 틈이 생긴다).
function subscribe(onChange) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const getHash = () => location.hash;

export function useHashRoute() {
  const hash = useSyncExternalStore(subscribe, getHash, () => "");
  const navigate = useCallback((pageId, sub) => { location.hash = hrefFor(pageId, sub); }, []);
  return { ...parseHash(hash), navigate };
}
