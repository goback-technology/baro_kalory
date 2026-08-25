// 주차장 평면도 — 씬이 보고한 주차면·카메라를 위에서 내려다본 그림.
//
// **좌표는 하나도 만들어 내지 않는다.** 슬롯·카메라 위치는 전부 씬에서 오고, 사람이 넣는 것은
// 높이 하나뿐이다. 월드 cm 를 손으로 적게 하는 순간 이 화면은 못 쓰는 화면이 된다.
//
// 이 파일은 **그리기만** 한다. 무엇을 그릴지의 판정(부채꼴의 FK 단·앵커가 적히는 축·시야를
// 아는가)은 actions 에, 자리 계산은 geometry 에 있다. 손을 뗐을 때 무엇을 보낼지는 page.jsx 다.
//
// 평면도는 **한 장**이고 배치·컨트롤 두 탭이 옆칸만 바꿔 단다. 기즈모의 뜻은 탭이 정한다:
// 배치에서는 설치(자리·설치방위·설치 하향각), 컨트롤에서는 현재값(조준·틸트·화각).
import { coneOf, aimTargetFor, deviceForCamera, tiltposOf } from "./actions.mjs";
import {
  toMap, tipAt, conePathD, spreadClusters, slotBoxCm, cameraHeightM, tiltSliderPos, CONE_LEN_RATIO,
} from "./geometry.mjs";
import { t } from "../../i18n.mjs";

const rad = (deg) => deg * Math.PI / 180;

// 끄는 중 미리보기 — 씬은 아직 그대로다. 손을 떼야 바뀐다.
function Ghosts({ span, placing, drag }) {
  const dot = span / 80;
  const len = span * CONE_LEN_RATIO;
  const out = [];

  // 배치 중: 세울 자리와 조준선. 아직 씬에는 아무것도 없다.
  if (placing?.location) {
    const p = toMap(placing.location);
    out.push(<circle key="place-dot" cx={p.x} cy={p.y} r={dot} className="map-ghost-dot" />);
    if (placing.aim) {
      const q = toMap(placing.aim);
      out.push(<line key="place-line" x1={p.x} y1={p.y} x2={q.x} y2={q.y} vectorEffect="non-scaling-stroke" className="map-ghost" />);
      out.push(<circle key="place-aim" cx={q.x} cy={q.y} r={dot * 0.7} className="map-ghost-dot" />);
    }
  }

  if (drag?.moved) {
    const from = toMap(drag.from);
    // 자리 끌기: 어디서 어디로.
    if (drag.kind === "cam" && drag.to) {
      const to = toMap(drag.to);
      out.push(<line key="drag-line" x1={from.x} y1={from.y} x2={to.x} y2={to.y} vectorEffect="non-scaling-stroke" className="map-ghost" />);
      out.push(<circle key="drag-dot" cx={to.x} cy={to.y} r={dot} className="map-ghost-dot" />);
    }
    // 조준: 선 하나만 그리면 화각이 어디를 덮는지 알 수 없어, 손을 뗀 뒤에야 너무 돌렸다는
    // 걸 알게 된다. 그래서 **새 방위의 시야 부채꼴**을 통째로 그린다.
    if (drag.kind === "aim" && drag.yaw !== null) {
      if (drag.ghostHalf !== null) {
        out.push(<path key="aim-cone" d={conePathD(from, drag.yaw, drag.ghostHalf, len)} vectorEffect="non-scaling-stroke" className="map-ghost" />);
      }
      const tip = tipAt(from, drag.yaw, len);
      out.push(<line key="aim-line" x1={from.x} y1={from.y} x2={tip.x} y2={tip.y} vectorEffect="non-scaling-stroke" className="map-ghost" />);
      out.push(<circle key="aim-dot" cx={tip.x} cy={tip.y} r={dot * 0.9} className="map-ghost-dot" />);
    }
    // 화각: 한계에 물리면 부채꼴이 더는 안 벌어지는 것으로 그 사실이 보인다.
    if (drag.kind === "fov" && drag.hfov > 0) {
      out.push(<path key="fov-cone" d={conePathD(from, drag.axisYaw, drag.hfov / 2, len)} vectorEffect="non-scaling-stroke" className="map-ghost" />);
      for (const side of [-1, 1]) {
        const edge = rad(drag.axisYaw + side * drag.hfov / 2);
        out.push(<circle key={`fov-dot${side}`} cx={from.x + Math.sin(edge) * len} cy={from.y - Math.cos(edge) * len} r={dot * 0.8} className="map-ghost-dot" />);
      }
    }
    // 틸트: 앵커원만 새 자리에 — 기준선(틸트 0)은 원래 자리에 그대로 있고 카메라도 안 움직였다.
    if (drag.kind === "tilt" && drag.tiltDeg !== null) {
      const s = tiltSliderPos(drag.tiltDeg, drag.trackLen);
      const at = tipAt(from, drag.axisYaw, s);
      out.push(<circle key="tilt-dot" cx={at.x} cy={at.y} r={dot * 0.75} className="map-ghost-dot" />);
    }
  }
  return out;
}

function CameraGizmos({
  cam, p, span, tab, viewByPort, devices, activeCameraId, selected, drag,
  onAimDown, onTiltDown, onFovDown, onSelect,
}) {
  const dot = span / 90;
  const coneLen = span * CONE_LEN_RATIO;
  // **부채꼴이 그리는 것은 탭이 정한다 — FK 의 어느 단인가.** 팬이 걸려 있으면 두 탭의
  // 부채꼴이 서로 다른 곳을 가리키는 것이 맞는 그림이다(컨트롤은 배치를 물려받은 오프셋이다).
  const cone = coneOf(viewByPort, cam, { installMode: tab !== "drive" });
  // 돌리는 중인 카메라는 옛 방위를 지운다 — 두 콘이 겹쳐 있으면 어느 쪽이 결과인지 모른다.
  const aiming = !!drag?.moved && (drag.kind === "aim" || drag.kind === "fov") && drag.cam.id === cam.id;
  const aimTarget = aimTargetFor(cam, {
    tab, deviceId: deviceForCamera(devices, cam)?.id, activeCameraId,
  });
  const out = [];

  if (cone !== null && !aiming) {
    const { yaw, half } = cone;
    out.push(<path key="cone" d={conePathD(p, yaw, half, coneLen)} className={"map-cone" + (selected ? " sel" : "")} />);
    // 시야의 한가운데 = 카메라의 광축. 부채꼴은 얼마나 넓게 보는지를, 이 선은 어디를 보는지를
    // 말한다 — 넓은 화각에서는 부채꼴만으로 중심이 어디인지 눈으로 못 짚는다.
    const tip = tipAt(p, yaw, coneLen);
    out.push(<line key="axis" x1={p.x} y1={p.y} x2={tip.x} y2={tip.y} vectorEffect="non-scaling-stroke"
                   className={"map-view-axis" + (selected ? " sel" : "")} />);
    if (aimTarget) {
      out.push(
        <circle key="aim" cx={tip.x} cy={tip.y} r={dot * 0.9} vectorEffect="non-scaling-stroke" className="map-aim-handle"
                onMouseDown={(e) => onAimDown(e, cam, aimTarget)}>
          <title>{aimTarget === "pan" ? t("끌어서 조준") : t("끌어서 설치방위")}</title>
        </circle>,
      );
      // 시선 막대 **위의 틸트 슬라이더**. 막대 한가운데의 녹색 기준선이 **틸트 0**(수평)이고
      // 자리에서 움직이지 않는다 — 움직이는 것은 앵커원뿐이다. 틸트를 모르는 카메라(안 닿음)
      // 에는 달지 않는다.
      const tiltNow = tiltposOf(viewByPort, cam);
      if (tiltNow !== null) {
        const a = rad(yaw);
        const across = { x: Math.cos(a), y: Math.sin(a) };   // 축에 수직(평면도 기준)
        const zeroAt = tipAt(p, yaw, coneLen / 2);
        out.push(
          <line key="tilt0"
                x1={zeroAt.x - across.x * dot * 1.8} y1={zeroAt.y - across.y * dot * 1.8}
                x2={zeroAt.x + across.x * dot * 1.8} y2={zeroAt.y + across.y * dot * 1.8}
                vectorEffect="non-scaling-stroke" className={"map-tilt-zero" + (selected ? " sel" : "")} />,
        );
        const tilting = !!drag?.moved && drag.kind === "tilt" && drag.cam.id === cam.id;
        if (!tilting) {
          const at = tipAt(p, yaw, tiltSliderPos(tiltNow / 100, coneLen));
          out.push(
            <circle key="tilt" cx={at.x} cy={at.y} r={dot * 0.75} vectorEffect="non-scaling-stroke" className="map-tilt-handle"
                    onMouseDown={(e) => onTiltDown(e, cam, aimTarget, yaw, coneLen)}>
              <title>{aimTarget === "pan" ? t("끌어서 틸트") : t("끌어서 설치 하향각")}</title>
            </circle>,
          );
        }
      }
      // 부채꼴 **모서리**의 줌 앵커 둘. 줌은 순수 현재값이라(설치 줌이라는 것은 씬에 없다)
      // **컨트롤 탭에만** 단다.
      if (aimTarget === "pan") {
        for (const side of [-1, 1]) {
          const edge = rad(yaw + side * half);
          out.push(
            <circle key={`fov${side}`} cx={p.x + Math.sin(edge) * coneLen} cy={p.y - Math.cos(edge) * coneLen}
                    r={dot * 0.8} vectorEffect="non-scaling-stroke" className="map-fov-handle"
                    onMouseDown={(e) => onFovDown(e, cam)}>
              <title>{t("끌어서 화각(줌)")}</title>
            </circle>,
          );
        }
      }
    }
  }

  // 손댈 수 있는 것은 **고른 카메라 하나뿐**이 아니다 — 누르면 고르고 그대로 끌린다.
  // 첫 동작을 선택으로만 끝내면, 누르고 곧장 끄는 보통의 손짓이 아무것도 안 움직이는
  // 것으로 보인다("클릭해서 옮기면 안 움직여요" — 2026-08-11).
  const movable = cam.spawned !== false;
  const heightM = cameraHeightM(cam);
  out.push(
    <circle key="marker" cx={p.x} cy={p.y} r={selected ? dot * 1.35 : dot} vectorEffect="non-scaling-stroke"
            className={"map-cam" + (cam.spawned === false ? " authored" : "") + (selected ? " sel" : "") + (movable ? " movable" : "")}
            onMouseDown={(e) => onSelect(e, cam)}>
      <title>{`:${cam.hucomsPort} · ${heightM === null ? "?" : heightM.toFixed(2) + " m"}`}</title>
    </circle>,
  );
  out.push(
    <text key="label" x={p.x} y={p.y + dot * 2.8} fontSize={span / 46} className="map-cam-label">
      {heightM === null ? String(cam.hucomsPort) : `${heightM.toFixed(1)}m`}
    </text>,
  );
  return out;
}

export function RigMap({
  svgRef, view, slots, cameras, viewByPort, slotPitchCm,
  tab, selectedCamId, selectedSlotId, activeCameraId, devices, placing, drag,
  onSlotClick, onCamDown, onAimDown, onTiltDown, onFovDown, onMapDown, onMapMove, onContextMenu,
}) {
  const cls = (placing ? "placing" : "")
    + (drag && (drag.kind === "aim" || drag.kind === "fov" || drag.kind === "tilt") ? " aiming" : "");
  // 씬에서 받은 것이 하나도 없으면 그릴 것이 없다 — viewBox 를 지어내지 않는다.
  if (!view) return <svg id="sim-map" ref={svgRef} className={cls} role="img" aria-label="주차장 평면도" />;

  const span = Math.max(view.width, view.height);
  const dot = span / 90;
  const markerAt = spreadClusters(cameras, dot);

  return (
    <svg id="sim-map" ref={svgRef} className={cls} role="img" aria-label="주차장 평면도"
         viewBox={`${view.minX} ${view.minY} ${view.width} ${view.height}`} preserveAspectRatio="xMidYMid meet"
         onMouseDown={onMapDown} onMouseMove={onMapMove} onContextMenu={onContextMenu}>
      {slots.map((slot) => {
        const loc = slot?.transform?.location;
        if (!loc) return null;
        const p = toMap(loc);
        const yaw = Number(slot?.transform?.rotation?.yaw) || 0;
        const box = slotBoxCm(slot, slotPitchCm);
        const cls2 = "map-slot" + (slot.occupied ? " occ" : "") + (slot.id === selectedSlotId ? " sel" : "");
        // 치수를 알면 사각형, 모르면 점. 모르는 것을 규격으로 채워 넣으면 그림이 거짓말을 한다.
        const onClick = (e) => { if (placing) return; e.stopPropagation(); onSlotClick(slot); };
        return box
          ? <rect key={slot.id} x={p.x - box.width / 2} y={p.y - box.length / 2} width={box.width} height={box.length}
                  transform={`rotate(${-yaw} ${p.x} ${p.y})`} vectorEffect="non-scaling-stroke"
                  className={cls2} onClick={onClick} />
          : <circle key={slot.id} cx={p.x} cy={p.y} r={dot * 0.8} vectorEffect="non-scaling-stroke"
                    className={cls2} onClick={onClick} />;
      })}
      {cameras.map((cam) => {
        const p = markerAt.get(cam.id);
        if (!p) return null;   // 씬이 자리를 안 준 카메라 — 그릴 자리가 없다
        return (
          <g key={cam.id}>
            <CameraGizmos
              cam={cam} p={p} span={span} tab={tab} viewByPort={viewByPort} devices={devices}
              activeCameraId={activeCameraId} selected={cam.id === selectedCamId} drag={drag}
              onAimDown={onAimDown} onTiltDown={onTiltDown} onFovDown={onFovDown} onSelect={onCamDown}
            />
          </g>
        );
      })}
      <Ghosts span={span} placing={placing} drag={drag} />
    </svg>
  );
}
