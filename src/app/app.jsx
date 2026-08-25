// 라우트 스위치 + 프로바이더 조립.
//
// 라우트는 lazy import 다. 화면 하나가 통째로 들어 있는 시뮬레이터(3,800줄)까지 한 번들에
// 넣으면 대문을 여는 데 그 코드를 전부 내려받게 된다 — 커미셔닝 현장의 첫 화면이 그만큼 늦다.
import { Suspense, lazy, useState } from "react";
import { getLang, setLang } from "../i18n.mjs";
import { getPage } from "../pages.mjs";
import { useHashRoute } from "./router.mjs";
import { AppShell } from "./shell.jsx";
import { BackendProvider, BackendGate } from "./backend-gate.jsx";
import { BusyProvider } from "./busy-provider.jsx";
import { CameraProvider, CameraSelect } from "./camera-provider.jsx";

// 라우트 표 — **PAGES 를 전부 덮어야 한다**(app-versions.test 가 그것을 문다). 여기에 없는
// 화면은 대문으로 떨어져 조용히 사라지고, 헤더는 그 화면 이름인데 본문만 대문인 어긋난
// 화면이 된다.
const ROUTES = {
  home: lazy(() => import("../pages/home/page.jsx")),
  calibration: lazy(() => import("../pages/calibration/page.jsx")),
  settings: lazy(() => import("../pages/settings/page.jsx")),
  height: lazy(() => import("../pages/height/page.jsx")),
  cctv: lazy(() => import("../pages/cctv/page.jsx")),
  discovery: lazy(() => import("../pages/discovery/page.jsx")),
  simulator: lazy(() => import("../pages/simulator/page.jsx")),
};

function Loading() {
  return <main><p className="hint">…</p></main>;
}

export function App() {
  const { pageId, sub, navigate } = useHashRoute();
  const [lang, setLangState] = useState(getLang);
  const page = getPage(pageId);
  const Route = ROUTES[pageId];

  // 언어는 상태로 든다 — 예전에는 DOM 워커(applyI18n)가 텍스트 노드를 직접 고쳤는데,
  // React 가 그리는 화면에서는 다음 렌더가 그것을 되돌린다. 값이 바뀌면 다시 그린다.
  const onLang = (l) => { setLang(l); setLangState(l); };

  return (
    <BusyProvider>
      <BackendProvider>
        <CameraProvider>
          <AppShell
            pageId={pageId}
            lang={lang}
            onLang={onLang}
            headerExtra={page?.camera ? <CameraSelect /> : null}
          >
            <BackendGate pageId={pageId}>
              <Suspense fallback={<Loading />}>
                {Route ? <Route sub={sub} navigate={navigate} /> : <Loading />}
              </Suspense>
            </BackendGate>
          </AppShell>
        </CameraProvider>
      </BackendProvider>
    </BusyProvider>
  );
}
