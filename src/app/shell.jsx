// 앱 셸 — 헤더와 그 안의 크롬(홈·이름·설정·카메라 슬롯·테마·언어·버전).
//
// page-chrome.mjs 의 **이식**이다(아직 안 옮긴 페이지가 그 모듈을 쓰므로 원본은 남아 있다).
// 바뀐 것은 방향이다: 예전에는 바닐라 크롬이 페이지 DOM 에 자기 요소를 끼워 넣었고, 이제는
// 셸이 화면을 소유하고 라우트가 그 안에 들어온다. 그래서 링크를 문자열로 비교해 잠그던
// 코드(a.home-card 의 href 대조)가 통째로 사라졌다 — 카드가 상태를 직접 읽는다.
import { useEffect, useState } from "react";
import { getPage, pageHref } from "../pages.mjs";
import { languages } from "../i18n.mjs";
import { getTheme, setTheme, THEMES } from "../theme.mjs";
import { useBackend } from "./backend-gate.jsx";

// 아이콘은 인라인 SVG — currentColor 를 쓰므로 테마와 링크 색을 그대로 따라간다.
function HomeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor"
         strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.2 7.2 8 2.4l5.8 4.8V14H2.2z" />
    </svg>
  );
}

const Sep = () => (
  <span style={{ margin: "0 8px", color: "var(--color-muted)", fontWeight: 400 }}>|</span>
);

// 프런트 버전의 출처는 페이지와 함께 배포되는 app-versions.json 이다(backend 가 아니라 —
// 프런트만 따로 배포하면 backend 가 아는 값은 브라우저가 실제로 도는 버전과 어긋난다).
// 기준은 **문서**다: document.baseURI 는 mount 프리픽스·Pages base·해시 라우트 어디서도
// 페이지 옆을 가리킨다. import.meta.url 기준으로 풀면 번들러가 소스 위치를 바꾸는 순간
// 깨진다 — 2026-08-22 Vite 전환에서 실제로 깨져 6개 페이지의 배지가 전부 「v—」였다.
//
// 캐시는 매번 서버에 되묻는다(no-cache). 정적 호스팅의 CDN TTL 동안 옛 사본이 걸리면 배포
// 직후 배지가 이전 버전을 우긴다 — 배포됐는지 확인하는 데 쓰는 표시가 그때 가장 못 믿을 값이 된다.
export async function fetchOwnVersions() {
  try {
    const r = await fetch(new URL("./app-versions.json", document.baseURI), { cache: "no-cache" });
    return await r.json();
  } catch { return {}; }
}

export function useOwnVersions() {
  const [own, setOwn] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchOwnVersions().then((v) => { if (alive) setOwn(v); });
    return () => { alive = false; };
  }, []);
  return own;
}

// 언어 목록의 정본은 i18n.mjs 다 — 여기서는 표시 이름만 붙인다. 사전에 없는 언어가
// 셀렉터에 서면 고르는 순간 전 화면이 원문으로 되돌아간다.
const LANG_LABEL = { ko: "한국어", en: "English", vi: "Tiếng Việt" };

function Selects({ lang, onLang }) {
  const [theme, setThemeState] = useState(getTheme);
  // 저장된 값이 지금 없는 테마일 수 있다(테마를 지운 배포). setTheme 이 정규화해 준다 —
  // 첫 페인트의 인라인 스크립트는 그 검사를 못 하므로 여기서 한 번 맞춘다.
  useEffect(() => { setThemeState(setTheme(getTheme())); }, []);
  const style = { width: "auto", padding: "4px 6px", fontSize: 12 };
  return (
    <>
      <select data-role="theme" title="Theme" style={style} value={theme}
              onChange={(e) => setThemeState(setTheme(e.target.value))}>
        {THEMES.map((th) => <option key={th.id} value={th.id}>{th.label}</option>)}
      </select>
      <select id="lang-select" title="Language" style={style} value={lang}
              onChange={(e) => onLang(e.target.value)}>
        {languages().map((v) => <option key={v} value={v}>{LANG_LABEL[v] || v}</option>)}
      </select>
    </>
  );
}

// 헤더 좌측은 홈과 설정 **둘뿐**이다. 전 페이지를 늘어놓으면 화면마다 링크가 대여섯 개씩
// 붙어 정작 그 페이지의 것(카메라 셀렉터·버전)을 밀어낸다. 나머지로 가는 길은 대문이 맡는다.
export function AppShell({ pageId, lang, onLang, headerExtra, children }) {
  const page = getPage(pageId);
  const own = useOwnVersions();
  const backend = useBackend();

  // 버전 배지: 「이 화면의 프런트 버전 · 백엔드 버전」. 백엔드가 안 붙으면 배지를 비운다 —
  // 게이트 배너가 이미 이유를 말하고 있어서, 반쪽짜리 숫자를 더 띄우면 오히려 헷갈린다.
  let badge = "";
  if (backend.status === "ok" && own) {
    const mine = page?.versionKey ? `${page.badge} v${own[page.versionKey] || "—"} · ` : "";
    badge = `${mine}BE v${backend.version}`;
  }

  return (
    <>
      <header>
        <h1>
          {pageId !== "home" && (
            <>
              <a className="navlink" href={pageHref("home")} title="홈" aria-label="홈"
                 style={{ fontWeight: 400, display: "inline-flex", alignItems: "center", verticalAlign: -2 }}>
                <HomeIcon />
              </a>
              <Sep />
            </>
          )}
          Baro Calory
          {page && pageId !== "home" && <> · {page.label}</>}
          {/* 대문에는 설정 링크를 두지 않는다 — 화면 안의 카드가 이미 그 자리로 데려간다. */}
          {pageId !== "settings" && pageId !== "home" && (
            <>
              <Sep />
              <a className="navlink" href={pageHref("settings")} style={{ fontWeight: 400 }}>설정</a>
            </>
          )}
          {headerExtra}
        </h1>
        <span data-role="chrome" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Selects lang={lang} onLang={onLang} />
          <span id="version" className="ver">{badge}</span>
        </span>
      </header>
      {children}
    </>
  );
}
