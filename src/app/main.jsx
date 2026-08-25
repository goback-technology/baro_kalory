// SPA 부트. 루트는 **하나뿐**이다 — 페이지마다 createRoot 를 부르던 시절의 멱등 가드
// (window.__calBoot)는 그 방식의 부작용이었고, 여기서는 필요가 없다.
//
// 다만 dev 의 이중 평가는 남아 있다: 같은 파일이 `/web/…` 별칭과 `/@fs/<repo>/src/…`
// 두 URL 로 평가될 수 있어 모듈 스코프가 두 벌이 된다. createRoot 를 두 번 부르면 React 가
// 경고를 내므로 루트만 전역에 한 번 만들어 재사용한다.
import { createRoot } from "react-dom/client";
import { initI18n } from "../i18n/index.mjs";
import { setTheme, getTheme } from "./theme.mjs";
import { App } from "./app.jsx";

initI18n();
setTheme(getTheme());

const BOOT = (window.__baroBoot ||= {});
if (!BOOT.root) BOOT.root = createRoot(document.getElementById("app-root"));
BOOT.root.render(<App />);

if (import.meta.hot) import.meta.hot.accept(() => location.reload());
