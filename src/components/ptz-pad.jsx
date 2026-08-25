// PTZ 조작 — 수동 이동 패드와 절대 위치 이동.
//
// ptz-controls.mjs(innerHTML 템플릿 + querySelector 배선)의 재작성이다. 옛 위젯은 오버레이
// 모드에서 절대 이동 카드를 **DOM 째로 무대 안으로 옮겼다** — 재조정과 정면으로 부딪히는
// 방식이고, React 에서는 그 카드를 무대 안에 그리면 그만이라 옮길 일 자체가 없다.
import { useCallback, useState } from "react";
import { postJson, fmtPtz, api } from "../api.mjs";
import { t } from "../i18n/index.mjs";
import { normalizeSpeed, absoluteMove } from "../pages/cctv/actions.mjs";

// 조작의 상태와 동작. 두 카드가 같은 step·speed 를 쓰므로 훅이 그것을 든다.
export function usePtzControls({ onPtz = () => {}, onBusy = () => {}, log = () => {}, lastPtz = null } = {}) {
  const [step, setStep] = useState("500");
  const [speed, setSpeed] = useState("50");
  const [abs, setAbs] = useState({ pan: "", tilt: "", zoom: "" });

  const speedOf = useCallback(() => normalizeSpeed(speed), [speed]);

  const nudge = useCallback(async (dPan, dTilt, dZoom) => {
    onBusy(true);
    try {
      const j = await postJson(api("/ptz/nudge"), { dPan, dTilt, dZoom, speed: normalizeSpeed(speed) });
      // 상대 이동만 되는 계열은 돌려줄 자세가 없다(ptz: null) — 없는 좌표를 지어내지 않고
      // 무엇을 보냈는지만 남긴다. 결과는 화면으로 확인하는 것이 이 계열의 정상 동작이다.
      if (j.relative) { log(t("상대 이동") + " → " + (j.sent || []).join(", ")); return; }
      onPtz(j.ptz);
      log(t("이동 → {p}", { p: fmtPtz(j.ptz) }));
    } catch (e) { log(t("이동 실패") + ": " + e.message); }
    finally { onBusy(false); }
  }, [speed, onPtz, onBusy, log]);

  const goAbsolute = useCallback(async () => {
    const move = absoluteMove(abs);
    if (move.error) { log(move.error); return; }
    onBusy(true);
    try {
      const s = normalizeSpeed(speed);
      const speedFields = s === undefined ? {} : { panspeed: s, tiltspeed: s, zoomspeed: s };
      const j = await postJson(api("/ptz"), { ...move, ...speedFields });
      onPtz(j.ptz);
      log(t("절대 이동 → {p}", { p: fmtPtz(j.ptz) }));
    } catch (e) { log(t("절대 이동 실패") + ": " + e.message); }
    finally { onBusy(false); }
  }, [abs, speed, onPtz, onBusy, log]);

  const fillAbsolute = useCallback((ptz = lastPtz) => {
    if (!ptz) return;
    setAbs({ pan: String(ptz.panpos), tilt: String(ptz.tiltpos), zoom: String(ptz.zoompos) });
  }, [lastPtz]);

  return { step, setStep, speed, setSpeed, speedOf, abs, setAbs, nudge, goAbsolute, fillAbsolute };
}

export function PtzPad({ ctl }) {
  const n = Number(ctl.step) || 0;
  return (
    <div className="card">
      <h2>수동 조정 (이동량 step)</h2>
      <div className="row" style={{ marginBottom: 10 }}>
        <label>step <input data-role="step" type="number" min="1" value={ctl.step}
                           onChange={(e) => ctl.setStep(e.target.value)} /></label>
        <label>속도 <input data-role="speed" type="number" min="1" max="100" value={ctl.speed}
                          onChange={(e) => ctl.setSpeed(e.target.value)} /></label>
      </div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        {/* Hucoms 규약(fov-convert.mjs, cam-001 필드검증): higher tiltpos = 카메라 '아래'.
            따라서 ▲(위로 보기)=tiltpos↓=dTilt 음수, ▼(아래로 보기)=tiltpos↑=dTilt 양수. */}
        <div className="pad">
          <span /><button data-tilt="-1" onClick={() => ctl.nudge(0, -n, 0)}>▲</button><span />
          <button data-pan="-1" onClick={() => ctl.nudge(-n, 0, 0)}>◄</button><span />
          <button data-pan="1" onClick={() => ctl.nudge(n, 0, 0)}>►</button>
          <span /><button data-tilt="1" onClick={() => ctl.nudge(0, n, 0)}>▼</button><span />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button data-zoom="1" onClick={() => ctl.nudge(0, 0, n)}>＋ zoom in</button>
          <button data-zoom="-1" onClick={() => ctl.nudge(0, 0, -n)}>－ zoom out</button>
        </div>
      </div>
    </div>
  );
}

// 절대 위치 이동. overlay 면 영상 위에 얹히는 좁은 모양이 된다 — 제목을 빼고 라벨을 한 글자로
// 줄인다(영상을 가리는 면적이 곧 비용이다).
export function AbsoluteMove({ ctl, overlay = false }) {
  const set = (k) => (e) => ctl.setAbs({ ...ctl.abs, [k]: e.target.value });
  const label = (long, short) => (overlay ? `${short} ` : `${long} `);
  return (
    <div className={"card" + (overlay ? " ptz-absolute-card" : "")}>
      {!overlay && <h2>절대 위치 이동</h2>}
      <div className="row">
        <label>{label("pan", "P")}<input data-role="abs-pan" type="number" min="0" max="35999"
                                         value={ctl.abs.pan} onChange={set("pan")} /></label>
        <label>{label("tilt", "T")}<input data-role="abs-tilt" type="number" min="-2000" max="9000"
                                          value={ctl.abs.tilt} onChange={set("tilt")} /></label>
        <label>{label("zoom", "Z")}<input data-role="abs-zoom" type="number" min="0" max="65535"
                                          value={ctl.abs.zoom} onChange={set("zoom")} /></label>
        <button data-role="abs-go" onClick={ctl.goAbsolute}>이동</button>
        <button data-role="abs-fill" onClick={() => ctl.fillAbsolute()}>채우기</button>
      </div>
    </div>
  );
}
