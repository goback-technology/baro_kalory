// 서버에서 도는 잡의 상태를 되풀이해 묻는 훅.
//
// 이 저장소에는 같은 루프가 여섯 벌 있었고, 지킬 것을 각자 다르게 지켰다 — 어떤 것은
// document.hidden 을 보고 어떤 것은 안 보고, 어떤 것은 겹침을 막고 어떤 것은 안 막았다.
// 그중 한 벌(시뮬레이터 pollRig)이 네 가지를 다 갖고 있었고, 그것이 이 훅의 사양이다.
//
//   ① **겹치지 않는다** — 응답이 늦으면 다음 요청이 그 위에 얹힌다. 느린 백엔드에서
//      요청이 배로 늘고, 늦게 온 옛 응답이 새 응답을 덮어써 화면이 뒤로 간다.
//   ② **숨겨진 탭에서는 쉰다** — 방치된 탭이 종일 폴링하면 그 자체가 부하다(하루 10만 건
//      폴링 사고가 이 가드가 없어서 났다).
//   ③ **사람이 조작 중이면 건너뛴다** — 끌고 있는 중에 서버 상태로 다시 그리면 손에서
//      물건이 튀어나간다.
//   ④ **enabled 가 꺼지면 스스로 멈춘다** — 잡이 끝났는데 계속 묻지 않는다.
import { useCallback, useEffect, useRef } from "react";

// 지금 이 틱을 건너뛸 것인가. 순수 함수로 떼어 둔 이유는 이 판정이 곧 위 네 규칙이고,
// 훅 안에 묻혀 있으면 테스트가 「돌더라」밖에 못 묻기 때문이다.
export function shouldSkipTick({ hidden = false, inFlight = false, paused = false } = {}) {
  return !!(hidden || inFlight || paused);
}

export function useJobPoll(tick, { intervalMs = 1500, enabled = true, pauseWhen } = {}) {
  const tickRef = useRef(tick);
  const pauseRef = useRef(pauseWhen);
  const inFlight = useRef(false);
  const timer = useRef(0);
  const alive = useRef(true);
  tickRef.current = tick;
  pauseRef.current = pauseWhen;

  const run = useCallback(async () => {
    const hidden = (() => { try { return document.hidden; } catch { return false; } })();
    const paused = pauseRef.current ? !!pauseRef.current() : false;
    if (shouldSkipTick({ hidden, inFlight: inFlight.current, paused })) return;
    inFlight.current = true;
    try { await tickRef.current(); } finally { inFlight.current = false; }
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!enabled) return () => { alive.current = false; };
    // 켜지는 순간 한 번 묻는다 — 첫 답을 간격만큼 기다리면 화면이 그동안 낡은 값을 든다.
    run();
    const loop = () => {
      timer.current = setTimeout(async () => {
        if (!alive.current) return;
        await run();
        if (alive.current) loop();
      }, intervalMs);
    };
    loop();
    return () => { alive.current = false; clearTimeout(timer.current); timer.current = 0; };
  }, [enabled, intervalMs, run]);

  // 조작 직후처럼 간격을 기다릴 이유가 없을 때 즉시 한 번.
  return { refresh: run };
}
