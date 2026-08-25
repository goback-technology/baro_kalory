// 활성 카메라. 헤더의 <select> 는 camera-select.mjs 위젯이 소유하고, 이 provider 가 그
// 위젯을 하나만 만들어 라우트들에게 나눠 준다.
//
// **놓아주기 레지스트리가 이 파일의 본론이다.** 활성 카메라를 바꾸기 전에 이전 카메라로
// 열린 스트림을 반드시 먼저 닫아야 한다 — 순서를 바꾸면 유령 시청자가 남아 그 카메라가
// 유휴로 풀리지 않고, 캡처 예산을 나눠 써 프레임이 급감한다(2026-08-04 실측). 지금까지는
// 페이지마다 beforeChange 를 손으로 배선했고, 배선을 빠뜨린 화면은 조용히 그 결함을 가졌다.
// 여기서는 프리뷰가 마운트될 때 스스로 등록하므로 화면이 신경 쓸 것이 없다.
//
// 라우트 전환도 같은 레지스트리를 쓴다. 페이지 이동이 곧 문서 로드이던 시절에는 pagehide
// 가 안전망이었지만, SPA 에는 그 이벤트가 오지 않는다.
import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createCameraSelect } from "../camera-select.mjs";

const Ctx = createContext(null);

export function useCamera() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCamera 는 CameraProvider 안에서만 쓴다");
  return ctx;
}

export function CameraProvider({ children, log = () => {} }) {
  const selectRef = useRef(null);
  const widgetRef = useRef(null);
  const releases = useRef(new Set());
  const [activeId, setActiveId] = useState(null);
  const [list, setList] = useState([]);
  const [switching, setSwitching] = useState(false);
  // 첫 목록이 오기 전과 「0대」는 다른 사실이다. 라우트가 그 둘을 구분하지 못하면 로드 전에
  // 초기화를 한 번, 로드 후에 또 한 번 돌려 모든 GET 이 2벌 나간다(실측).
  const [loaded, setLoaded] = useState(false);

  // 놓아주기 등록. 프리뷰 훅이 마운트 때 부르고 언마운트 때 되돌린다.
  const registerRelease = useCallback((fn) => {
    releases.current.add(fn);
    return () => releases.current.delete(fn);
  }, []);
  const releaseAll = useCallback(async () => {
    // 하나가 실패해도 나머지는 놓아준다 — 점유를 유지하는 쪽이 언제나 더 나쁘다.
    await Promise.allSettled([...releases.current].map((fn) => fn()));
  }, []);

  useEffect(() => {
    const el = selectRef.current;
    if (!el) return undefined;
    const widget = createCameraSelect({
      select: el,
      log,
      refreshOnVisible: true,
      beforeChange: releaseAll,
      onChange: (id) => { setActiveId(id); setList(widget.list()); },
      onSettled: () => setSwitching(false),
    });
    widgetRef.current = widget;
    // 목록을 못 받아도 loaded 는 세운다 — 미연결에서도 화면이 「아무 일도 안 일어나는」
    // 상태로 굳지 않고, 자기 방식으로 그 사실을 말할 수 있어야 한다.
    widget.load().finally(() => { setActiveId(widget.activeId()); setList(widget.list()); setLoaded(true); });
    el.addEventListener("change", () => setSwitching(true));
    return () => { widget.destroy(); widgetRef.current = null; };
  }, [releaseAll, log]);

  // 진행 중인 작업이 카메라를 바꾸지 못하게 잠근다(캘리브레이션 스윕 같은 것).
  const setEnabled = useCallback((on) => widgetRef.current?.setEnabled(on), []);
  const refresh = useCallback(() => widgetRef.current?.load(), []);

  // **값을 고정한다.** 매 렌더 새 객체를 내면 이 컨텍스트를 쓰는 화면의 이펙트가 전부
  // 매번 다시 돈다 — cam 을 의존성에 적은 곳(카메라 잠금·프리뷰 재시작)이 그렇고, 그중
  // 하나라도 부수효과가 있으면 렌더마다 그 일이 일어난다.
  const value = useMemo(() => ({
    activeId, list, switching, loaded, registerRelease, releaseAll, setEnabled, refresh,
    // 헤더가 이 요소를 렌더하고 위젯이 그 안을 소유한다 — React 는 children 을 넣지 않는다.
    selectRef,
  }), [activeId, list, switching, loaded, registerRelease, releaseAll, setEnabled, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// 헤더에 세우는 셀렉터. 위젯이 <option> 을 직접 그리므로 React 는 빈 <select> 만 낸다 —
// 양쪽이 같은 자식을 그리면 재조정이 위젯의 DOM 을 지운다.
export function CameraSelect() {
  const { selectRef } = useCamera();
  return (
    <span className="header-camera" style={{ marginLeft: 10, fontWeight: 400 }}>
      <select ref={selectRef} data-i18n-skip style={{ width: "auto", padding: "4px 6px", fontSize: 12 }} />
    </span>
  );
}
