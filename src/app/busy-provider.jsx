// 전면 잠금. 화면마다 `querySelectorAll("button")` 을 돌며 disabled 를 세우던 것이 네 벌
// 있었고, 그 방식은 **잠금 중에도 눌려야 하는 버튼**(중지·취소)을 함께 잠가서 페이지마다
// 우회로가 생겼다(면제 목록, 잠금 뒤 되살리기, 손수 disabled). 우회로가 세 갈래로 갈린
// 시점에서 이건 규칙이 아니라 관행이었다.
//
// 여기서는 버튼을 건드리지 않는다. 투명한 덮개 한 장으로 입력을 막고, 잠금 중에도 살아야
// 하는 것만 그 덮개보다 위에 세운다(<BusyExempt>). 겹쳐 도는 작업은 세어서, 먼저 끝난
// 작업이 남의 잠금을 푸는 일이 없게 한다.
import { createContext, useContext, useState, useCallback, useMemo, useRef } from "react";

const Ctx = createContext(null);

export function useBusy() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBusy 는 BusyProvider 안에서만 쓴다");
  return ctx;
}

export function BusyProvider({ children }) {
  const [label, setLabel] = useState(null);
  const depth = useRef(0);

  const run = useCallback(async (text, fn) => {
    depth.current += 1;
    setLabel(text || "");
    try {
      return await fn();
    } finally {
      depth.current -= 1;
      if (depth.current <= 0) { depth.current = 0; setLabel(null); }
    }
  }, []);

  const value = useMemo(() => ({ run, busy: label !== null, label }), [run, label]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {label !== null && <BusyCover label={label} />}
    </Ctx.Provider>
  );
}

// 덮개의 생김새는 이 한 벌뿐이다. 프로바이더 밖에서 자기 잠금 상태를 따로 드는 화면
// (시뮬레이터 — 폴링 일시정지와 한 몸인 로컬 busyLabel)도 **이 컴포넌트로** 그린다.
// 화면마다 덮개를 복붙하면 언젠가 한쪽만 고쳐져 다른 잠금처럼 보인다.
export function BusyCover({ label }) {
  return (
    <div data-role="busy" style={{
      position: "fixed", inset: 0, zIndex: 40, cursor: "progress",
      background: "color-mix(in srgb, var(--color-bg) 45%, transparent)",
      display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 24,
    }}>
      {label && (
        <span style={{
          font: "13px var(--font-mono)", color: "var(--color-fg)",
          background: "var(--color-panel, var(--color-bg))",
          border: "1px solid var(--color-line, #444)", borderRadius: 4, padding: "6px 12px",
        }}>{label}</span>
      )}
    </div>
  );
}

// 잠금 중에도 살아야 하는 것 — 중지 버튼처럼, 그것을 잠그면 사용자가 작업을 끝낼 방법이
// 사라지는 종류. 덮개보다 위에 세우고 포인터를 되살린다.
export function BusyExempt({ children, style }) {
  return <span style={{ position: "relative", zIndex: 41, ...style }}>{children}</span>;
}
