// 프리뷰 하나를 화면에 붙이는 훅. ./preview.mjs 는 <img>·모드버튼·fps 라벨을 소유하는
// **명령형 위젯**이고 이 훅은 그 위젯의 수명과 React 의 수명을 잇는다 — 위젯을 다시 쓰지
// 않는다(그 안에는 501 폴백·재연결·백그라운드 자동정지처럼 값비싸게 얻은 규칙이 들어 있다).
//
// 이 훅이 없앤 복붙: 화면 다섯이 같은 일을 각자 배선했다 — 생성·저장된 선택 복원·시작/종료
// 상태 렌더·카메라 전환 시 놓아주기·pagehide. 그중 마지막 둘은 배선을 빠뜨린 화면이 조용히
// 결함을 갖는 종류였다(유령 시청자가 카메라를 점유한다).
import { useCallback, useEffect, useRef, useState } from "react";
import { createCameraPreview } from "./preview.mjs";
import { useCamera } from "./provider.jsx";

// 프리뷰를 여는 것은 **사용자 선택**이고 그 선택만 기억한다 — 페이지를 여는 행위가 카메라
// 점유가 되면 안 된다(저장소 계약, 기본 꺼짐). 한 번 켜 둔 사람이 화면을 옮길 때마다 다시
// 켜야 하면 그건 그것대로 기본값이 틀린 것이다.
function readWanted(key) {
  if (!key) return false;
  try { return localStorage.getItem(key) === "on"; } catch { return false; }
}
function writeWanted(key, on) {
  if (!key) return;
  try { localStorage.setItem(key, on ? "on" : "off"); } catch { /* 저장소 사용 불가 */ }
}

// alwaysOn — 프리뷰가 곧 작업면인 화면을 위한 것이다(주차면 탐색: 영상 위에 점을 찍는 것이
// 본업이라 꺼져 있으면 화면이 성립하지 않는다). 그 화면에는 켬/끔 버튼도 없고 기억할 선택도
// 없다. 나머지 화면의 기본은 여전히 **꺼짐**이다 — 페이지를 여는 행위가 카메라 점유가 되면 안 된다.
export function useCameraPreview({ storageKey, wantedKey, alwaysOn = false, log, ...opts } = {}) {
  const imgRef = useRef(null);
  const modeBtnRef = useRef(null);
  const fpsRef = useRef(null);
  const intervalRef = useRef(null);   // 스냅샷 폴링 간격 입력 — 위젯이 값과 저장을 소유한다
  const previewRef = useRef(null);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const { registerRelease, activeId, loaded } = useCamera();

  useEffect(() => {
    const preview = createCameraPreview({
      img: imgRef.current,
      modeButton: modeBtnRef.current,
      fpsLabel: fpsRef.current,
      storageKey,
      log,
      ...opts,
    });
    previewRef.current = preview;
    // 스트림을 놓아 줄 세 갈래를 전부 건다. 안 하면 유령 시청자로 남아 카메라를 점유한다.
    //   1) 카메라 전환 전    — provider 가 활성을 바꾸기 **전에** 이 함수를 await 한다.
    //   2) 라우트 이탈·언마운트 — SPA 에는 pagehide 가 오지 않는다. cleanup 이 그 자리다.
    //   3) 진짜 문서 이탈    — 탭을 닫거나 다른 사이트로 갈 때(bfcache 포함).
    const unregister = registerRelease(async () => {
      await preview.stop();
      // 폴백은 "직전 기기가 스트림을 못 준다"는 사실이었을 뿐, 새 기기에 대한 판정이 아니다.
      preview.resetFallbackForNewDevice();
    });
    const bye = () => { preview.stop(); };
    window.addEventListener("pagehide", bye);
    return () => {
      unregister();
      window.removeEventListener("pagehide", bye);
      preview.destroy();   // stop() 과 달리 document 리스너까지 거둔다(왕복 누수 방지)
    };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback(() => {
    runningRef.current = true;
    setRunning(true);
    writeWanted(wantedKey, true);
    previewRef.current?.start();
  }, [wantedKey]);

  const stop = useCallback(async () => {
    runningRef.current = false;
    setRunning(false);
    writeWanted(wantedKey, false);
    // 전환은 이전 stop 을 await 한 뒤 — 안 하면 연결이 누적돼 스트림이 저하된다.
    await previewRef.current?.stop();
  }, [wantedKey]);

  // 기억한 선택을 복원한다. **카메라 목록을 받은 뒤에** 켜는 이유는, 그 전에는 어느 기기를
  // 보게 될지 서버도 화면도 확정하지 않은 상태이기 때문이다.
  const restored = useRef(false);
  useEffect(() => {
    if (!loaded || restored.current) return;
    restored.current = true;
    if (alwaysOn || readWanted(wantedKey)) start();
  }, [loaded, wantedKey, alwaysOn, start]);

  // 카메라가 바뀌었는데 켜 둔 상태였으면 새 기기로 다시 켠다 — 전환이 사용자의
  // "보고 있겠다"는 선택을 지우면 안 된다. 끄는 일은 provider 의 놓아주기가 이미 했다.
  const lastCam = useRef(null);
  useEffect(() => {
    if (lastCam.current !== null && lastCam.current !== activeId && runningRef.current) {
      previewRef.current?.start();
    }
    lastCam.current = activeId;
  }, [activeId]);

  return { imgRef, modeBtnRef, fpsRef, intervalRef, running, start, stop, preview: () => previewRef.current };
}
