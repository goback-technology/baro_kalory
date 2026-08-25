// 시뮬레이터 셋업 — 시뮬(UE·omTide) 씬을 /api/simulator/* 로 편집한다.
//
// 이 화면이 다루는 것은 **두 축**이다. 설치(볼트로 박는 값: 자리·높이·설치방위·하향각)는
// 씬 PATCH 로, 현재값(몰면서 바뀌는 값: P·T·Z)은 제어 창구로 나간다. 한 폼에 섞여 있던
// 시절에는 자리를 고치려던 손이 카메라를 움직였다 — 그래서 탭이 갈린다(2026-08-12).
//
// 판정·계산은 여기 없다. 무엇을 보낼지·왜 못 보내는지는 actions.mjs 가, 자리·각은 geometry.mjs
// 가 값으로 답하고 node 테스트가 그것을 문다. 여기 있는 것은 **왕복과 그리기**뿐이다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getJson, postJson, reqJson, api, fmtPtz as fmt } from "../../api.mjs";
import { t } from "../../i18n.mjs";
import { toNum } from "../../format.mjs";
import { createCameraPreview } from "../../camera-preview.mjs";
import { useJobPoll } from "../../app/hooks/use-job-poll.mjs";
import { useStagePointer } from "../../components/use-stage-pointer.mjs";
import { RigMap } from "./map.jsx";
import {
  MOVE_SPEED, ORACLE_TOLERANCE_PX,
  SIM_ACTIVE_CAMERA_KEY, SIM_PREVIEW_WANTED_KEY, SIM_CROSSHAIR_KEY,
  ptzSnapshot, readyStateOf, statusTextFromSimulatorState, endpointPayload,
  slotName, slotNameById, sortSlots, plateText,
  mountYawOf, viewOf, tiltposOf, hfovLimitsOf, viewYawOf, hfovOf,
  rigSignature, portBand, pickSpawnPorts, bandFullNotice, portRangeHint,
  spawnRequestFrom, spawnOutcome, installPatchFrom, driveChangeOf,
  installFieldsOf, cameraTitleLine, cameraPortsLine,
  deviceForCamera, cameraForDevice, resolveActiveCam, pickDevice,
  compareOracle, doomedCameraCount, restoreSummaryText, sceneMetaText, saveSceneText,
} from "./actions.mjs";
import {
  toWorld, computeMapView, measureSlotPitchCm, sceneGroundZcm, cameraHeightM,
  poseFromPlacement, aimYawTowards, panposForYaw, turnBetween,
  tiltSliderDeg, trackOffsetOf, hfovFromDrag,
} from "./geometry.mjs";
import "./simulator.css";

const enc = encodeURIComponent;
const read = (k, dflt) => { try { return localStorage.getItem(k) ?? dflt; } catch { return dflt; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 저장소 사용 불가 */ } };

const TABS = [
  ["log", "로그"], ["rig", "카메라 배치"], ["drive", "카메라 컨트롤"], ["info", "씬"], ["settings", "설정"],
];
// 이 키들은 actions 의 installFieldsOf(채우기)·installPatchFrom(보내기)와 **같은 이름표**다.
const BLANK_EDIT = { note: "", x: "", y: "", heightM: "", bearing: "", pitch: "", pan: "", tilt: "", zoom: "" };
const BLANK_SPAWN = { heightM: "6", httpPort: "", mjpegPort: "", note: "", yawDeg: "", pitchDeg: "" };
const BLANK_ENDPOINT = { host: "", controlPort: "", timeoutMs: "", username: "", password: "" };
const DRAG_SLOP = 4;   // 손떨림을 조작으로 읽지 않는다

export default function SimulatorPage() {
  // ── 씬에서 온 것들 ─────────────────────────────────────────────────────────
  const [devices, setDevices] = useState([]);
  const [activeCameraId, setActiveCameraId] = useState("");
  const [cameras, setCameras] = useState([]);
  const [viewByPort, setViewByPort] = useState(() => new Map());
  const [portInfo, setPortInfo] = useState(null);
  const [endpointPort, setEndpointPort] = useState(null);   // 제어 포트 — 스폰이 이 번호를 피한다
  const [slots, setSlots] = useState([]);
  const [carById, setCarById] = useState(() => new Map());
  const [catalog, setCatalog] = useState(null);
  const [lastPtz, setLastPtz] = useState(null);

  // ── 사람이 고른 것들 ───────────────────────────────────────────────────────
  const [tab, setTab] = useState("log");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedCar, setSelectedCar] = useState(null);
  const [mapSelectedId, setMapSelectedId] = useState("");
  const [placing, setPlacing] = useState(null);
  const [showAllSlots, setShowAllSlots] = useState(false);
  const [crosshair, setCrosshair] = useState(() => read(SIM_CROSSHAIR_KEY, "on") !== "off");

  // ── 화면이 말하는 것들 ─────────────────────────────────────────────────────
  const [lines, setLines] = useState([]);
  const [busyLabel, setBusyLabel] = useState("");
  const [ready, setReady] = useState({ led: "off", text: t("시뮬레이터 확인 중…") });
  const [camInfo, setCamInfo] = useState("");
  const [camStatus, setCamStatus] = useState("—");
  const [mapHint, setMapHint] = useState("—");
  const [carStatus, setCarStatus] = useState("");
  const [sceneStatus, setSceneStatus] = useState("—");
  const [overlayHint, setOverlayHint] = useState("");
  const [oracleOut, setOracleOut] = useState("");
  const [endpointStatus, setEndpointStatus] = useState("—");
  const [endpointConfigured, setEndpointConfigured] = useState(null);
  const [hasPassword, setHasPassword] = useState(false);

  // ── 폼 ────────────────────────────────────────────────────────────────────
  const [edit, setEdit] = useState(BLANK_EDIT);
  const [spawnForm, setSpawnForm] = useState(BLANK_SPAWN);
  const [endpointForm, setEndpointForm] = useState(BLANK_ENDPOINT);
  const [carForm, setCarForm] = useState({ carType: 0, color: 0, plateType: 0, city: "", prefix: "", kor: "", number: "" });
  const [force, setForce] = useState(false);
  const [sceneName, setSceneName] = useState("");
  const [savedScenes, setSavedScenes] = useState([]);

  // ── 프리뷰 ────────────────────────────────────────────────────────────────
  const [previewRunning, setPreviewRunning] = useState(false);
  const [previewLabel, setPreviewLabel] = useState("");

  // 손대는 중인 칸은 폴링이 덮지 않는다. **칸 단위**로 지킨다 — 폼 전체를 잠그면 이름 한 글자를
  // 적은 뒤로 P·T·Z 가 영영 멈추고, 영상을 클릭해 센터링해도 숫자가 안 바뀌어 "적용이 안 된다"로
  // 보인다(2026-08-11 실제 증상). 폼이 늘 열려 있으므로 "고치는 중이면 쉰다"는 곧 "영영 쉰다"다.
  const dirty = useRef(new Set());
  const markClean = useCallback(() => dirty.current.clear(), []);

  const viewRef = useRef(null);
  const svgRef = useRef(null);
  const previewRef = useRef(null);
  // 카탈로그는 한 번만 받는다(레벨이 갈릴 때만 비운다). 그리기용 상태와 "이미 받았나"의
  // 판단을 같이 두면, 비동기 흐름이 아직 반영 안 된 상태를 보고 두 번 받는다.
  const catalogRef = useRef(null);
  const reposeTimer = useRef(0);
  const carFormReq = useRef(0);
  const bootDone = useRef(false);
  const [booted, setBooted] = useState(false);

  // 오버레이 핀 — 서버가 계산한 좌표를 그리는 일뿐이다(2026-07-28). 투영 수식은 백엔드에만
  // 있고 브라우저는 광학 모듈을 모른다 — 계산 지점이 하나라 모델이 갈라질 수 없다.
  const [pins, setPins] = useState(() => new Map());
  const [pinsFrame, setPinsFrame] = useState({ width: 1920, height: 1080 });
  const [truthPins, setTruthPins] = useState(() => new Map());

  // 끌고 있는 것. **프레임마다 바뀌는 값이라 ref 가 정본이고**, 그림만 상태로 흔든다 —
  // window 의 mouseup 이 늘 지금 값을 봐야 하는데, 상태로 두면 그 클로저가 한 프레임 낡는다.
  const dragRef = useRef(null);
  const [dragTick, setDragTick] = useState(0);
  const drag = useMemo(() => dragRef.current, [dragTick]);
  const setDrag = useCallback((next) => { dragRef.current = next; setDragTick((n) => n + 1); }, []);

  // 비동기 흐름이 **지금** 값을 봐야 하는 자리가 많다(응답이 나는 사이 카메라가 바뀐다).
  // 예전 판의 모듈 전역이 하던 일이고, 여기서는 이 거울 하나가 그 자리를 받는다.
  const S = useRef({});
  S.current = {
    devices, activeCameraId, cameras, viewByPort, portInfo, endpointPort, slots,
    mapSelectedId, placing, lastPtz, tab, busyLabel, previewRunning, selectedSlot, edit, spawnForm,
  };

  const log = useCallback((msg) => {
    setLines((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 300));
  }, []);
  // 조작 중이라는 사실은 어느 탭에 있든 보여야 한다 — 조작 중에는 모든 버튼이 잠기므로,
  // 이 표시가 안 보이는 탭에서는 화면이 그냥 굳은 것처럼 보인다.
  const setBusy = useCallback((on, label) => setBusyLabel(on ? t(label || "카메라 이동 중…") : ""), []);
  const locked = !!busyLabel;

  const slotPitchCm = useMemo(() => measureSlotPitchCm(slots), [slots]);
  const mapView = useMemo(() => computeMapView(slots, cameras), [slots, cameras]);
  const selectedCam = useMemo(() => cameras.find((c) => c.id === mapSelectedId) || null, [cameras, mapSelectedId]);
  const pickedDevice = useMemo(() => devices.find((d) => d.id === activeCameraId) || null, [devices, activeCameraId]);
  const authored = selectedCam ? selectedCam.spawned === false : false;

  // ── 프리뷰: 페이지를 여는 것이 곧 시뮬 카메라 점유가 되지 않게 한다 ────────────
  // 시뮬은 캡처 예산이 유한해서(카메라 2대가 동시에 스트리밍하면 각 30 → 26fps) 안 보는
  // 사람이 잡고 있으면 그대로 손해다. 선택은 기억하고, 기본값은 꺼짐.
  //
  // 공용 useCameraPreview 를 쓰지 않는 이유: 그 훅은 헤더의 CCTV 셀렉터(CameraProvider)에
  // 매여 있는데 이 화면은 자기 목록과 자기 활성 창구(/simulator/active)를 쓴다. 대신 그
  // 훅이 지키는 **놓아주기 세 갈래**는 여기서도 그대로 건다: 카메라 전환 전 stop, 언마운트
  // destroy(document 리스너까지), 문서 이탈 pagehide.
  const modeBtnRef = useRef(null);
  const fpsRef = useRef(null);
  const intervalRef = useRef(null);
  useEffect(() => {
    const preview = createCameraPreview({
      img: viewRef.current,
      streamUrl: api("/simulator/stream"),
      snapshotUrl: api("/simulator/control/snapshot"),
      modeButton: modeBtnRef.current,
      intervalInput: intervalRef.current,
      fpsLabel: fpsRef.current,
      storageKey: "sim",
      log,
    });
    previewRef.current = preview;
    const bye = () => { preview.stop(); };
    window.addEventListener("pagehide", bye);
    return () => {
      window.removeEventListener("pagehide", bye);
      preview.destroy();   // stop() 과 달리 document 리스너까지 거둔다(라우트 왕복 누수 방지)
    };
  }, [log]);

  const startPreview = useCallback(() => {
    if (S.current.previewRunning) return;
    write(SIM_PREVIEW_WANTED_KEY, "on");
    previewRef.current?.start();
    setPreviewRunning(true);
    setPreviewLabel(t("실행 중"));
    log(t("시뮬 프리뷰 시작"));
  }, [log]);

  const stopPreview = useCallback(async () => {
    write(SIM_PREVIEW_WANTED_KEY, "off");
    await previewRef.current?.stop();
    setPreviewRunning(false);
    setPreviewLabel(t("정지됨"));
    log(t("시뮬 프리뷰 종료"));
  }, [log]);

  // ── 시뮬레이터 상태 ────────────────────────────────────────────────────────
  const refreshStatus = useCallback(async ({ silent = false } = {}) => {
    try {
      const state = await getJson(api("/simulator/status"));
      setEndpointPort(toNum(state?.endpoint?.port));
      setReady(readyStateOf(state));
      if (!silent) setEndpointStatus(statusTextFromSimulatorState(state));
      return state;
    } catch (e) {
      setReady(readyStateOf({ ready: false, unreachable: true, error: e.message }));
      if (!silent) setEndpointStatus(t("상태 확인 실패") + ": " + e.message);
      return null;
    }
  }, []);

  // ── 시뮬레이터 주소: 월드 하나의 주소와 계정. 카메라·stage 와 무관하다 ────────
  //   시뮬레이터 = 월드 하나 → stage 여럿(한 번에 하나 활성) → 그 stage 의 카메라들
  // 제어 포트는 맨 왼쪽의 것이다. 예전에는 이 값들이 카메라 기기마다 복사돼 있어서, 카메라를
  // 전부 지우면 백엔드가 시뮬을 잃고 조용히 인메모리 더블로 내려갔다.
  const loadEndpoint = useCallback(async () => {
    try {
      const r = await getJson(api("/simulator/endpoint"));
      const ep = r.endpoint || {};
      setEndpointForm({
        host: ep.host || "", controlPort: ep.controlPort ?? "", timeoutMs: ep.timeoutMs ?? "",
        username: ep.username || "", password: "",
      });
      setHasPassword(!!ep.hasPassword);
      setEndpointConfigured(!!r.configured);
      setEndpointStatus(r.configured
        ? `${ep.host}:${ep.controlPort}`
        : t("시뮬레이터 주소가 없습니다 — 호스트와 제어 포트를 넣으세요."));
    } catch (e) {
      setEndpointStatus(t("시뮬레이터 주소 조회 실패") + ": " + e.message);
    }
  }, []);

  // ── 씬 무효화 ─────────────────────────────────────────────────────────────
  // 카메라를 바꿔도 씬은 그대로다 — 한 백엔드는 시뮬레이터 하나만 보고, 그 주소는 어느
  // 카메라를 고르든 바뀌지 않는다. 씬이 바뀌는 유일한 순간은 그 주소를 저장할 때다.
  const invalidateScene = useCallback(({ clearSelection = false } = {}) => {
    setCatalog(null);
    setCameras([]);
    setViewByPort(new Map());   // 포트별 시야도 옛 월드의 것이다 — 같은 포트가 남의 시야를 입는다
    setSlots([]);
    setCarById(new Map());
    setPins(new Map());
    setTruthPins(new Map());
    if (clearSelection) { setSelectedSlot(null); setSelectedCar(null); }
  }, []);

  // ── 오버레이(3D→2D) ───────────────────────────────────────────────────────
  // 좌표는 PTZ/슬롯이 바뀔 때만 새로 받고, 선택·필터 변경은 캐시된 좌표로 다시 그린다
  // → 클릭 반응에 네트워크가 끼지 않는다.
  const reproject = useCallback(async () => {
    // 자세가 바뀌면 지난 오라클 답은 거짓말이 된다 — 남겨 두면 모델 오차처럼 보인다.
    setTruthPins(new Map());
    setOracleOut("");
    const { cameras: cams, devices: devs, activeCameraId: devId, lastPtz: ptz } = S.current;
    const { cam } = resolveActiveCam({ devices: devs, cameras: cams, deviceId: devId });
    if (!cam || !ptz) { setPins(new Map()); return; }
    const nw = viewRef.current?.naturalWidth || 1920;
    const nh = viewRef.current?.naturalHeight || 1080;
    const camId = cam.id;   // 응답이 나는 사이 카메라가 바뀌면 이 핀들은 옛 투영이다
    try {
      const r = await postJson(api("/simulator/overlay"), { ptz, width: nw, height: nh, cameraId: camId });
      const now = resolveActiveCam({ devices: S.current.devices, cameras: S.current.cameras, deviceId: S.current.activeCameraId });
      if (now.cam?.id !== camId) return;
      setPins(new Map((r.pins || []).map((p) => [p.id, p])));
      setPinsFrame({ width: r.width || nw, height: r.height || nh });
    } catch {
      setPins(new Map());   // 서버가 포즈를 모르면 핀 없음 — 틀린 자리에 그리느니 안 그린다
    }
  }, []);
  const scheduleRepose = useCallback(() => {
    clearTimeout(reposeTimer.current);
    reposeTimer.current = setTimeout(reproject, 150);
  }, [reproject]);
  useEffect(() => () => clearTimeout(reposeTimer.current), []);

  // ── 씬 읽기 ───────────────────────────────────────────────────────────────
  // 실패에 직전 목록을 지우지 않는다: 잠깐의 네트워크 실패로 평면도가 비면 「카메라 삭제」와
  // 구별되지 않고, 목록이 비는 순간 편집 폼이 작성 중인 값까지 잃는다. 씬 교체는 여기가
  // 아니라 invalidateScene 이 명시적으로 비운다.
  const fetchCameras = useCallback(async () => {
    try { setCameras((await getJson(api("/simulator/cameras"))).cameras || []); }
    catch { /* 직전 목록을 지키고 다음 폴링을 기다린다 */ }
  }, []);
  const fetchPtzTable = useCallback(async () => {
    try {
      const r = await getJson(api("/simulator/ptz"));
      setViewByPort(new Map((r.list || []).filter((row) => row.ptz).map((row) => [Number(row.port), row])));
    } catch { /* 직전 표를 지키고 다음 폴링을 기다린다 */ }
  }, []);
  // 스폰 포트의 정본은 서버다(대역·씬이 연 포트·다음 빈 쌍). 실패하면 null 로 남기고,
  // 프리필은 대역 없는 인스턴스용 관례 탐색이 받는다.
  const fetchPorts = useCallback(async () => {
    try { setPortInfo(await getJson(api("/simulator/ports"))); }
    catch { setPortInfo(null); }
  }, []);

  // 포즈는 mount(설치)와 자세(PTZ) 둘 다다 — 평면도가 그리는 시야는 둘의 합이라, 하나만 새로
  // 읽으면 카메라를 바꾼 직후 옆 카메라의 부채꼴이 사라지거나 낡은 자세로 남는다.
  const refreshCameraPose = useCallback(async () => {
    await Promise.all([fetchCameras(), fetchPtzTable()]);
    await reproject();
  }, [fetchCameras, fetchPtzTable, reproject]);

  // PTZ 를 새로 알았을 때 함께 낡는 것: 폼의 P·T·Z 칸과 **평면도의 시야**(부채꼴 방향은
  // 팬을, 폭은 줌을 따른다). 한자리에 모아 둔 이유는 자리마다 빠뜨렸기 때문이다 — 절대
  // 이동은 값을 보내 놓고 폼을 안 고쳐, 방금 보낸 값이 화면에 돌아오지 않았다.
  const applyPtz = useCallback((ptz) => {
    const changed = fmt(ptz) !== fmt(S.current.lastPtz);
    setLastPtz(ptz);
    if (!changed) return;
    // 몰고 있는 카메라가 움직였으면 평면도의 시야도 낡았다. 새 방위·화각은 **다시 받는다** —
    // 여기서 raw PTZ 로 지어내면 그 순간 광학 모델이 두 벌이 되고, 부채꼴과 영상 위의 핀이
    // 서로 다른 식으로 그려진다. 사람의 동작 한 번에 왕복 한 번이라 폴링과 달리 값싸다.
    fetchPtzTable();
  }, [fetchPtzTable]);

  const loadPtz = useCallback(async () => {
    const before = S.current.activeCameraId;
    try {
      const ptz = await getJson(api("/simulator/control/ptz"));
      if (before !== S.current.activeCameraId) return;   // 그 사이 전환 — 남의 PTZ 를 꽂지 않는다
      applyPtz(ptz);
      reproject();
    } catch (e) { log(t("읽기 실패") + ": " + e.message); }
  }, [applyPtz, reproject, log]);

  // ── 카탈로그·주차면·차량 ──────────────────────────────────────────────────
  const loadScene = useCallback(async () => {
    try {
      let cat = catalogRef.current;
      if (!cat) { cat = await getJson(api("/simulator/catalog")); catalogRef.current = cat; setCatalog(cat); }
      const [slotRes, carRes] = await Promise.all([
        getJson(api("/simulator/slots")),
        getJson(api("/simulator/cars")),
      ]);
      const list = sortSlots(slotRes.slots);
      setCarById(new Map((carRes.cars || []).map((car) => [car.id, car])));
      setSlots(list);
      // 선택 슬롯의 실제 점유 차량으로 편집 대상을 재동기화한다. 스폰 직후엔 방금 배치한
      // 차량이, 삭제/리셋 후엔 null 이 되도록 — 없으면 배치 직후 '적용'이 대상 없음으로 막힌다.
      const sel = S.current.selectedSlot;
      if (sel) setSelectedCar(list.find((s) => s.id === sel)?.carId || null);
      reproject();
      setCarStatus("");
    } catch (e) { setCarStatus(t("불러오기 실패") + ": " + e.message); }
  }, [reproject]);

  // ── 기기 목록 ─────────────────────────────────────────────────────────────
  const loadDevices = useCallback(async () => {
    try {
      const cfg = await getJson(api("/simulator/devices"));
      const sims = cfg.list || [];
      setDevices(sims);
      if (!sims.length) {
        await previewRef.current?.stop();
        setPreviewRunning(false);
        setActiveCameraId("");
        setLastPtz(null);
        setPins(new Map());
        // 카메라 0 대는 고장이 아니라 정상 상태다 — stage 가 비어 있을 뿐이고, 주소는 그대로다.
        setCamInfo(t("씬에 카메라가 없습니다 — 「카메라 배치」 탭에서 세우면 여기에 나타납니다."));
        return false;
      }
      let selectedId = pickDevice(sims, { savedId: read(SIM_ACTIVE_CAMERA_KEY, ""), activeId: cfg.active });
      // 활성 전환은 목록의 일이 아니다 — 이 POST 한 건의 일시 실패가 바깥 catch 로 나가면
      // 「카메라 목록 실패」로 오보되고, 목록은 이미 채워졌는데 활성만 반쪽으로 남는다.
      if (selectedId !== cfg.active) {
        try { await postJson(api("/simulator/active"), { id: selectedId }); }
        catch (e) {
          log(t("활성 전환 실패 — 서버의 활성({id})을 따릅니다", { id: cfg.active }) + ": " + e.message);
          if (sims.some((d) => d.id === cfg.active)) selectedId = cfg.active;
        }
      }
      setActiveCameraId(selectedId);
      write(SIM_ACTIVE_CAMERA_KEY, selectedId);
      setCamInfo("");
      return true;
    } catch (e) { setCamInfo(t("카메라 목록 실패") + ": " + e.message); }
    return false;
  }, [log]);

  // 씬의 카메라 포즈와 거기서 파생된 기기 목록을 함께 다시 읽는다. 파생이라도 두 번의
  // 요청이라, 하나만 갱신하면 화면이 방금 만든 것을 모르거나 방금 지운 것을 계속 보여준다.
  const refreshRig = useCallback(async () => {
    const activeBefore = S.current.activeCameraId;
    await Promise.all([fetchCameras(), fetchPtzTable(), fetchPorts()]);
    await loadDevices();
    // 보고 있던 카메라를 지우면 서버가 활성 sim 기기를 스스로 갈아 끼운다. 그때 PTZ 표시와
    // 핀만 옛 카메라 것으로 남으면, 새 카메라의 영상 위에 남의 핀이 얹힌 화면이 된다.
    if (S.current.activeCameraId !== activeBefore) {
      setLastPtz(null);
      await reproject();   // 옛 카메라의 핀을 먼저 지운다 — 틀린 자리에 그리느니 안 그린다
      await loadPtz();     // 새 카메라의 PTZ 로 다시 그린다
    }
  }, [fetchCameras, fetchPtzTable, fetchPorts, loadDevices, reproject, loadPtz]);

  // ── 카메라 전환 ───────────────────────────────────────────────────────────
  const switchCamera = useCallback(async (id) => {
    setBusy(true);
    let switched = false;   // 전환 POST 자체의 성패 — 실패 시 셀렉터를 되돌릴지가 여기 달렸다
    const before = S.current.activeCameraId;
    try {
      await postJson(api("/simulator/active"), { id });
      switched = true;
      setActiveCameraId(id);
      // 옛 카메라의 PTZ 를 새 카메라의 것으로 물려주지 않는다. 활성만 먼저 바뀌면 그 사이의
      // 그리기가 **새 카메라의 설치방위 + 옛 카메라의 팬** 으로 조준선을 그린다.
      setLastPtz(null);
      write(SIM_ACTIVE_CAMERA_KEY, id);
      invalidateScene();
      await previewRef.current?.stop();       // 이전 스트림 완전 종료 대기 후 새 카메라 시작
      if (S.current.previewRunning) previewRef.current?.start();
      await Promise.all([loadPtz(), refreshCameraPose(), loadScene(), refreshStatus({ silent: true })]);
      markClean();
      log(t("카메라 전환 → {id}", { id }));
    } catch (e) {
      // 로그 탭은 평소 가려져 있다 — 실패는 상시 보이는 자리(카메라 줄)에도 적는다.
      const msg = (switched ? t("전환은 됐지만 화면 갱신에 실패했습니다") : t("전환 실패")) + ": " + e.message;
      if (!switched && before) setActiveCameraId(before);
      setCamInfo(msg);
      log(msg);
    } finally { setBusy(false); }
  }, [setBusy, invalidateScene, loadPtz, refreshCameraPose, loadScene, refreshStatus, markClean, log]);

  // 고른 카메라는 하나다. 위의 드롭다운이 그 하나를 가리키고, 평면도 클릭도 같은 곳을
  // 가리킨다 — 둘이 갈리면 화면이 A 를 보여 주면서 B 를 옮길 준비를 하고 있게 된다.
  const selectSceneCamera = useCallback((id) => {
    if (id === S.current.mapSelectedId) return;
    setMapSelectedId(id);
    markClean();   // 옛 카메라에 적던 손글씨는 뜻을 잃는다
    const cam = S.current.cameras.find((c) => c.id === id);
    if (!cam) return;
    const device = deviceForCamera(S.current.devices, cam);
    // 기기는 이 카메라에서 파생되므로 못 찾는 경우는 목록이 잠깐 어긋난 때뿐이다.
    if (!device) { setCamStatus(t("{id} · 목록을 아직 못 읽었습니다 — 새로고침하세요.", { id: cam.id })); return; }
    setCamStatus(t("{id} · 기기 {dev}", { id: cam.id, dev: device.id }));
    // 전환 경로(프리뷰 재시작·PTZ)는 한 벌뿐이라 여기서 흉내 내지 않고 그 함수를 부른다.
    if (device.id !== S.current.activeCameraId) switchCamera(device.id);
  }, [markClean, switchCamera]);

  // 드롭다운이 갈리면 평면도의 선택과 폼도 따라온다. 여기서 selectSceneCamera 를 부르지
  // 않는 이유는 그쪽이 다시 전환을 부르기 때문이다 — 값만 맞춘다.
  useEffect(() => {
    const cam = cameraForDevice(devices, cameras, activeCameraId);
    const id = cam ? cam.id : "";
    setMapSelectedId((prev) => (prev === id ? prev : (markClean(), id)));
  }, [devices, cameras, activeCameraId, markClean]);

  // ── 설치/조종 폼 채우기 ───────────────────────────────────────────────────
  // 씬이 준 값으로 칸을 채우되, 지금 손대고 있는 칸만 건너뛴다. 좌표는 cm 정수로 보여 주고
  // 저장할 때는 손대지 않은 칸의 원값을 그대로 되돌려보낸다(installPatchFrom).
  //
  // PTZ 는 **지금 보고 있는 카메라**의 것이다 — 다른 카메라를 고른 폼에 적으면 남의 자세를
  // 이 카메라의 것으로 적게 되므로 그때는 비워 둔다.
  const ptzOfSelected = useCallback((cam) => {
    if (!cam || deviceForCamera(S.current.devices, cam)?.id !== S.current.activeCameraId) return null;
    return ptzSnapshot(S.current.lastPtz);
  }, []);

  useEffect(() => {
    const fields = installFieldsOf(selectedCam, {
      tiltpos: tiltposOf(viewByPort, selectedCam), ptz: ptzOfSelected(selectedCam),
    });
    setEdit((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(fields)) if (!dirty.current.has(k)) next[k] = v;
      return next;
    });
  }, [selectedCam, viewByPort, lastPtz, activeCameraId, devices, ptzOfSelected]);

  const editField = useCallback((key) => ({
    value: edit[key],
    onChange: (e) => { dirty.current.add(key); setEdit((f) => ({ ...f, [key]: e.target.value })); },
  }), [edit]);

  // ── 설치 적용 ─────────────────────────────────────────────────────────────
  const applyInstall = useCallback(async () => {
    const cam = S.current.cameras.find((c) => c.id === S.current.mapSelectedId) || null;
    const { error, patch } = installPatchFrom({
      cam, form: S.current.edit,
      tiltpos: tiltposOf(S.current.viewByPort, cam),
      cameras: S.current.cameras, slots: S.current.slots,
    });
    if (error) { setCamStatus(error); return; }
    setBusy(true, "설치를 고치는 중…");
    setCamStatus(t("설치를 고치는 중…"));
    try {
      const r = await reqJson("PATCH", api(`/simulator/cameras/${enc(cam.id)}`), patch);
      const movedM = cameraHeightM(r.camera) ?? toNum(S.current.edit.heightM);
      log(t("설치 갱신: {id} · {h} m", { id: cam.id, h: movedM === null ? "?" : movedM.toFixed(2) }));
      setCamStatus(t("적용했습니다: {id}", { id: cam.id }));
      markClean();   // 적용했으니 손글씨는 씬이 되었다 — 이제 씬 값으로 다시 채워야 한다
      await refreshRig();
    } catch (e) {
      // 씬이 정본이다 — 실패해도 일부는 반영됐을 수 있으므로 화면을 씬으로 되맞춘다.
      setCamStatus(t("적용 실패") + ": " + e.message);
      markClean();
      await refreshRig();
    } finally { setBusy(false); }
  }, [setBusy, markClean, refreshRig, log]);

  // ── 조종 적용 ─────────────────────────────────────────────────────────────
  const applyDrive = useCallback(async () => {
    const cam = S.current.cameras.find((c) => c.id === S.current.mapSelectedId) || null;
    if (!cam) { setCamStatus(t("고칠 카메라를 찾지 못했습니다 — 목록을 다시 읽으세요.")); return; }
    const { error, ptz } = driveChangeOf({
      form: { pan: S.current.edit.pan, tilt: S.current.edit.tilt, zoom: S.current.edit.zoom },
      now: ptzOfSelected(cam),
    });
    if (error) { setCamStatus(error); return; }
    setBusy(true, "카메라를 옮기는 중…");
    setCamStatus(t("옮기는 중…"));
    try {
      const j = await postJson(api("/simulator/control/ptz"), {
        ...ptz, panspeed: MOVE_SPEED, tiltspeed: MOVE_SPEED, zoomspeed: MOVE_SPEED,
      });
      applyPtz(j.ptz);
      log(t("절대 이동 → {p}", { p: fmt(j.ptz) }));
      scheduleRepose();
      setCamStatus(t("적용했습니다: {id}", { id: cam.id }));
      markClean();
      await refreshRig();
    } catch (e) {
      setCamStatus(t("적용 실패") + ": " + e.message);
      markClean();
      await refreshRig();
    } finally { setBusy(false); }
  }, [ptzOfSelected, setBusy, applyPtz, scheduleRepose, markClean, refreshRig, log]);

  // PTZ = 0. 오프셋이 사라지니 카메라는 설치 자세 그대로를 본다 — 배치·컨트롤 부채꼴이 일치한다.
  const resetDrive = useCallback(async () => {
    const cam = S.current.cameras.find((c) => c.id === S.current.mapSelectedId) || null;
    if (!cam) return;
    if (ptzOfSelected(cam) === null) {
      setCamStatus(t("조준할 수 없습니다 — 지금은 다른 카메라를 몰고 있습니다."));
      return;
    }
    setBusy(true, "카메라를 옮기는 중…");
    setCamStatus(t("설치 자세로 되돌리는 중…"));
    try {
      const j = await postJson(api("/simulator/control/ptz"), {
        panpos: 0, tiltpos: 0, zoompos: 0,
        panspeed: MOVE_SPEED, tiltspeed: MOVE_SPEED, zoomspeed: MOVE_SPEED,
      });
      applyPtz(j.ptz);
      scheduleRepose();
      setCamStatus(t("PTZ 0 — 설치 자세와 일치합니다"));
      log(t("PTZ 리셋: {id} → 0/0/0", { id: cam.id }));
      markClean();
      await refreshRig();
    } catch (e) {
      setCamStatus(t("적용 실패") + ": " + e.message);
    } finally { setBusy(false); }
  }, [ptzOfSelected, setBusy, applyPtz, scheduleRepose, markClean, refreshRig, log]);

  // ── 세우기 ────────────────────────────────────────────────────────────────
  const startPlacing = useCallback(() => {
    setPlacing({ stage: "position" });
    // 대역·빈 쌍을 지금 다시 읽는다(await 없음 — 자리 두 번 클릭하는 사이에 도착한다).
    fetchPorts();
    setMapSelectedId("");
    markClean();
    setMapHint(t("카메라를 세울 자리를 평면도에서 클릭하세요."));
    setCamStatus("");
  }, [fetchPorts, markClean]);

  const cancelPlacing = useCallback(() => {
    setPlacing(null);
    markClean();
    // 배치에 들어가면서 선택을 비웠다. 취소하고 나오면 **드롭다운이 가리키는 카메라로
    // 되돌아가야** 한다 — 안 그러면 위에서는 카메라를 고르고 있는데 아래 폼은 "없습니다"다.
    const cam = cameraForDevice(S.current.devices, S.current.cameras, S.current.activeCameraId);
    setMapSelectedId(cam ? cam.id : "");
    setMapHint("");
  }, [markClean]);

  const finishPlacing = useCallback((place) => {
    const pose = poseFromPlacement({ from: place.location, to: place.aim, heightM: S.current.spawnForm.heightM });
    const ports = pickSpawnPorts(S.current.portInfo, {
      cameras: S.current.cameras, devices: S.current.devices, controlPort: S.current.endpointPort,
    });
    setSpawnForm((f) => ({
      ...f, yawDeg: pose.yawDeg.toFixed(1), pitchDeg: pose.pitchDeg.toFixed(1),
      httpPort: String(ports.http), mjpegPort: String(ports.mjpeg),
      // 이름은 자동으로 채우지 않는다 — 직전에 세운 카메라의 근거가 다음 카메라에 묻어가면
      // 기록이 있는 것처럼 보이면서 틀린다. 빈칸이라야 사람이 자기 근거를 적는다.
      note: "",
    }));
    setPlacing({ ...place, stage: "ready" });
    // 대역이 꽉 찼으면 빈칸만 남는데, 빈칸은 "입력하세요"로 끝나 사람이 **아무 값도 안 된다는
    // 사실**을 시도해 봐야만 알게 된다. 그래서 여기서 먼저 말한다.
    const full = bandFullNotice(S.current.portInfo);
    if (full) setCamStatus(full);
    setMapHint(t("높이를 확인하고 세우세요 — 하향각은 높이에서 다시 계산됩니다."));
  }, []);

  const spawnCamera = useCallback(async (event) => {
    event.preventDefault();
    // 무엇을 보낼지와 왜 못 세우는지는 spawnRequestFrom 이 값으로 답한다 — 대역 검증도
    // (제출 전에 끊는다), 지면 판정도(모르면 세우지 않는다) 그쪽이다.
    const { error, body } = spawnRequestFrom({
      location: S.current.placing?.location,
      form: S.current.spawnForm,
      portInfo: S.current.portInfo, cameras: S.current.cameras, slots: S.current.slots,
    });
    if (error) { setCamStatus(error); return; }
    const note = body.note;
    setBusy(true, "카메라를 세우는 중…");
    setCamStatus(t("세우는 중…"));
    try {
      const r = await postJson(api("/simulator/cameras"), body);
      // **스폰 응답을 그대로 믿지 않는다** — 한 번 관측된 실패에서 응답에 camera 키가 통째로
      // 없었는데 카메라는 실제로 세워져 있었다(2026-08-17). 그 방어는 spawnOutcome 에 있다.
      const out = spawnOutcome(r, { httpPort: body.httpPort, note });
      log(t("카메라 세움: {id} :{port}", { id: out.camId || "?", port: out.camPort }));
      // 이름은 이 카메라의 유일한 출처 기록이라 조용히 비워 둘 수 없다.
      if (out.needsNoteRetry) {
        try { await reqJson("PATCH", api(`/simulator/cameras/${enc(out.camId)}`), { note }); }
        catch (noteError) { log(t("이름 저장 실패 — 카메라는 세워졌습니다") + ": " + noteError.message); }
      }
      // 기기는 따로 만들지 않는다 — 이 카메라가 곧 기기다(sim-cam-<포트>).
      setCamStatus(out.text);
      cancelPlacing();
      await refreshRig();
    } catch (e) {
      setCamStatus(t("세우기 실패") + ": " + e.message);
      log(t("카메라 세우기 실패") + ": " + e.message);
      await refreshRig();   // 실패해도 씬은 바뀌었을 수 있다
    } finally { setBusy(false); }
  }, [setBusy, cancelPlacing, refreshRig, log]);

  const removeCamera = useCallback(async () => {
    const cam = S.current.cameras.find((c) => c.id === S.current.mapSelectedId) || null;
    if (!cam) return;
    const device = deviceForCamera(S.current.devices, cam);
    const label = device?.name || `:${cam.hucomsPort}`;
    if (!confirm(t("카메라 '{name}' 를 씬에서 지울까요?", { name: label }))) return;
    setBusy(true, "카메라를 지우는 중…");
    try {
      const r = await reqJson("DELETE", api(`/simulator/cameras/${enc(cam.id)}`));
      setCamStatus(r.warning ? r.warning : t("지웠습니다: {id}", { id: r.removed }));
      log(t("카메라 삭제: {id}", { id: r.removed }));
      setMapSelectedId((prev) => (prev === cam.id ? "" : prev));
      await refreshRig();
    } catch (e) {
      setCamStatus(t("삭제 실패") + ": " + e.message);
    } finally { setBusy(false); }
  }, [setBusy, refreshRig, log]);

  // ── 평면도 드래그 ─────────────────────────────────────────────────────────
  // 화면 픽셀 → 월드 cm. SVG 가 viewBox 로 맞춰 그리므로 역변환은 브라우저에게 묻는다
  // (직접 계산하면 preserveAspectRatio 의 레터박스만큼 어긋난다).
  const worldAt = useCallback((event) => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return toWorld({ x: point.x, y: point.y });
  }, []);

  // 씬은 손을 뗄 때 한 번만 바뀐다. 끄는 동안 PATCH 를 흘리면 시뮬이 프레임마다 액터를
  // 옮기고, 중간에 실패하면 카메라가 어디에 있는지 아무도 모르는 상태가 된다.
  const onCamDown = useCallback((e, cam) => {
    if (S.current.placing || e.button !== 0) return;
    e.stopPropagation();          // 지도 배경의 배치 핸들러가 같이 받지 않게
    // 자리는 설치값이라 **배치 탭에서만** 끌린다 — 컨트롤 탭에서는 누르면 고르기만 한다.
    if (S.current.tab !== "rig") { selectSceneCamera(cam.id); return; }
    // 누르는 순간 그 카메라를 고르고, **그대로 끌린다.**
    if (cam.id !== S.current.mapSelectedId) selectSceneCamera(cam.id);
    const loc = cam?.mount?.location;
    const x = toNum(loc?.x), y = toNum(loc?.y), z = toNum(loc?.z);
    // 좌표 셋이 다 있어야 한다 — 축 하나만 보내면 나머지를 sim 이 0 으로 읽어 카메라가
    // 원점으로 날아간다(applyInstallEdit 과 같은 이유).
    if (x === null || y === null || z === null) return;
    setDrag({ kind: "cam", cam, from: { x, y, z }, to: null, moved: false, clientX: e.clientX, clientY: e.clientY });
  }, [selectSceneCamera, setDrag]);

  // 어느 축에 적히는지는 잡을 때 정해진다(target). "pan" = 카메라를 돌린다(현재값),
  // "mount" = 폴을 돌려 단다(설치방위 — 팬은 그대로). 손짓과 고스트는 같다.
  const onAimDown = useCallback((e, cam, target) => {
    if (S.current.placing || e.button !== 0) return;
    e.stopPropagation();
    if (target === "mount" && cam.id !== S.current.mapSelectedId) selectSceneCamera(cam.id);
    const loc = cam?.mount?.location;
    const x = toNum(loc?.x), y = toNum(loc?.y);
    // 시작각도 고스트 폭도 그 축의 것이다 — 설치 끌기는 설치방위·기준 시야, 팬 끌기는
    // 보는 방향·지금 화각. 섞으면 잡는 순간 부채꼴이 딴 각으로 튄다.
    const limits = hfovLimitsOf(S.current.viewByPort, cam);
    const fromYaw = target === "mount" ? mountYawOf(cam) : viewYawOf(S.current.viewByPort, cam);
    const nowHfov = hfovOf(S.current.viewByPort, cam);
    const ghostHalf = target === "mount"
      ? (limits ? limits.max / 2 : null)
      : (nowHfov === null ? null : nowHfov / 2);
    if (x === null || y === null || fromYaw === null) return;
    setDrag({ kind: "aim", cam, target, from: { x, y }, fromYaw, ghostHalf, yaw: null, moved: false, clientX: e.clientX, clientY: e.clientY });
  }, [selectSceneCamera, setDrag]);

  const onTiltDown = useCallback((e, cam, target, axisYaw, trackLen) => {
    if (S.current.placing || e.button !== 0) return;
    e.stopPropagation();
    if (target === "mount" && cam.id !== S.current.mapSelectedId) selectSceneCamera(cam.id);
    const loc = cam?.mount?.location;
    const x = toNum(loc?.x), y = toNum(loc?.y);
    if (x === null || y === null || axisYaw === null) return;
    setDrag({ kind: "tilt", cam, target, from: { x, y }, axisYaw, trackLen, tiltDeg: null, moved: false, clientX: e.clientX, clientY: e.clientY });
  }, [selectSceneCamera, setDrag]);

  // 화면은 **각으로** 말한다. 그 각이 이 렌즈의 어느 눈금인지는 백엔드의 광학 모델이 답한다.
  const onFovDown = useCallback((e, cam) => {
    if (S.current.placing || e.button !== 0) return;
    e.stopPropagation();
    const loc = cam?.mount?.location;
    const x = toNum(loc?.x), y = toNum(loc?.y);
    const axisYaw = viewYawOf(S.current.viewByPort, cam), hfov = hfovOf(S.current.viewByPort, cam);
    if (x === null || y === null || axisYaw === null || hfov === null) return;
    setDrag({ kind: "fov", cam, from: { x, y }, axisYaw, hfov, moved: false, clientX: e.clientX, clientY: e.clientY });
  }, [setDrag]);

  const onMapDown = useCallback((e) => {
    const place = S.current.placing;
    if (!place) return;
    const world = worldAt(e);
    if (!world) return;
    downAt.current = { clientX: e.clientX, clientY: e.clientY };
    if (place.stage === "position") {
      setPlacing({ ...place, location: world, stage: "aim", aimed: false });
      setMapHint(t("이 카메라가 바라볼 지면 지점을 클릭하세요 (드래그해도 됩니다)."));
    }
    // ready 단계에서 지도를 다시 누르면 조준을 고쳐 잡는 것이다 — 자리는 그대로 두고
    // 조준점만 새로 받는다.
  }, [worldAt]);
  const downAt = useRef(null);

  // 조준선은 프레임마다 한 번만 다시 그린다 — React 가 mousemove 를 프레임 단위로 묶는다.
  const onMapMove = useCallback((e) => {
    const d = dragRef.current;
    if (d) {
      // 손떨림을 조작으로 읽지 않는다 — 문턱을 넘기 전까지는 아직 아무것도 아니다.
      if (!d.moved && Math.hypot(e.clientX - d.clientX, e.clientY - d.clientY) <= DRAG_SLOP) return;
      const world = worldAt(e);
      if (!world) return;
      if (d.kind === "tilt") {
        // 커서를 광축에 투영한 트랙 위 자리 — 앵커는 축 위를 미끄러지는 슬라이더다.
        const s = trackOffsetOf(world, d.from, d.axisYaw);
        setDrag({ ...d, moved: true, tiltDeg: tiltSliderDeg(Math.min(Math.max(s, 0), d.trackLen), d.trackLen) });
        return;
      }
      if (d.kind === "fov") {
        const toward = aimYawTowards(d.from, world);
        if (toward === null) return;   // 커서가 카메라에 겹쳐 있는 동안은 각이 없다
        const hfov = hfovFromDrag(toward, d.axisYaw, hfovLimitsOf(S.current.viewByPort, d.cam));
        if (hfov === null) return;     // 한계를 모르면 끌 것이 없다
        setDrag({ ...d, moved: true, hfov });
        return;
      }
      if (d.kind === "aim") {
        const yaw = aimYawTowards(d.from, world);
        if (yaw === null) return;      // 커서가 카메라에 겹쳐 있는 동안은 방향이 없다
        setDrag({ ...d, moved: true, yaw });
        return;
      }
      setDrag({ ...d, moved: true, to: world });
      return;
    }
    const place = S.current.placing;
    if (!place?.location) return;
    if (place.stage !== "aim" && !downAt.current) return;   // ready 에서는 끌 때만 미리보기
    const world = worldAt(e);
    if (world) setPlacing({ ...place, aim: world });
  }, [worldAt, setDrag]);

  // ── 손을 뗀다 ─────────────────────────────────────────────────────────────
  // 뗄 때는 **window** 로 받는다 — 지도 밖으로 끌고 나갔다 돌아오는 드래그를 놓치지 않으려면
  // 그래야 한다. 대신 **뗀 자리가 평면도 안인지 반드시 확인한다.** 그 검사가 없으면 배치
  // 중에 영상을 클릭하거나 탭을 누르는 것만으로 조준이 확정된다 — 그때 좌표는 SVG 밖으로
  // 외삽된 주차장 바깥 점이라, 사람이 찍은 적 없는 자리·방위로 카메라가 세워진다.
  const finishTilt = useCallback(async (d) => {
    if (!d.moved || d.tiltDeg === null) return;
    // 설치 하향각(배치 탭): 씬 PATCH — pitchDeg 는 음수가 아래(세우기와 같은 규약).
    if (d.target === "mount") {
      setBusy(true, "설치를 고치는 중…");
      setCamStatus(t("설치를 고치는 중…"));
      try {
        await reqJson("PATCH", api(`/simulator/cameras/${enc(d.cam.id)}`), { pitchDeg: -d.tiltDeg });
        setCamStatus(t("설치 하향각 {d}°", { d: d.tiltDeg.toFixed(1) }));
        log(t("설치 하향각: {id} → {d}°", { id: d.cam.id, d: d.tiltDeg.toFixed(1) }));
      } catch (e) { setCamStatus(t("설치 고치기 실패") + ": " + e.message); }
      finally { setBusy(false); await refreshRig(); }
      return;
    }
    // 틸트(컨트롤 탭): 몰고 있는 카메라의 현재값. 팬·줌은 그대로 되돌려보낸다.
    if (deviceForCamera(S.current.devices, d.cam)?.id !== S.current.activeCameraId) {
      setCamStatus(t("조준할 수 없습니다 — 지금은 다른 카메라를 몰고 있습니다."));
      return;
    }
    setBusy(true, "조준하는 중…");
    setCamStatus(t("조준하는 중…"));
    try {
      const now = viewOf(S.current.viewByPort, d.cam)?.ptz || {};
      const j = await postJson(api("/simulator/control/ptz"), {
        panpos: now.panpos, tiltpos: Math.round(d.tiltDeg * 100), zoompos: now.zoompos,
        panspeed: MOVE_SPEED, tiltspeed: MOVE_SPEED, zoomspeed: MOVE_SPEED,
      });
      applyPtz(j.ptz);
      scheduleRepose();
      setCamStatus(t("틸트 {d}°", { d: d.tiltDeg.toFixed(1) }));
      log(t("카메라 틸트: {id} → {d}°", { id: d.cam.id, d: d.tiltDeg.toFixed(1) }));
    } catch (e) { setCamStatus(t("조준 실패") + ": " + e.message); }
    finally { setBusy(false); await refreshRig(); }
  }, [setBusy, applyPtz, scheduleRepose, refreshRig, log]);

  const finishFov = useCallback(async (d) => {
    if (!d.moved || !(d.hfov > 0)) return;
    if (deviceForCamera(S.current.devices, d.cam)?.id !== S.current.activeCameraId) {
      setCamStatus(t("줌을 바꿀 수 없습니다 — 지금은 다른 카메라를 몰고 있습니다."));
      return;
    }
    setBusy(true, "줌을 맞추는 중…");
    setCamStatus(t("줌을 맞추는 중…"));
    try {
      // 팬·틸트는 그대로 되돌려보낸다 — 화각만 바꾸려던 손이 카메라를 돌려 놓으면 안 된다.
      const now = viewOf(S.current.viewByPort, d.cam)?.ptz || {};
      const j = await postJson(api("/simulator/control/ptz"), {
        hfovDeg: d.hfov, panpos: now.panpos, tiltpos: now.tiltpos,
        panspeed: MOVE_SPEED, tiltspeed: MOVE_SPEED, zoomspeed: MOVE_SPEED,
      });
      applyPtz(j.ptz);
      setCamStatus(t("화각 {h}° (줌 {z})", { h: d.hfov.toFixed(1), z: j.ptz?.zoompos ?? "?" }));
      log(t("카메라 줌: {id} → 화각 {h}° (줌 {z})", { id: d.cam.id, h: d.hfov.toFixed(1), z: j.ptz?.zoompos ?? "?" }));
    } catch (e) { setCamStatus(t("줌 실패") + ": " + e.message); }
    finally { setBusy(false); await refreshRig(); }
  }, [setBusy, applyPtz, refreshRig, log]);

  const finishAim = useCallback(async (d, event) => {
    if (!d.moved) return;                              // 앵커를 눌렀다 뗐을 뿐이다
    const at = event && worldAt(event);
    const yaw = (at && aimYawTowards(d.from, at)) ?? d.yaw;
    if (yaw === null || yaw === undefined) return;
    // 얼마나 돌았는지를 함께 적는다 — 절대 방위만 적으면 손이 한 일의 크기가 안 보인다.
    const turned = turnBetween(yaw, d.fromYaw);

    // 설치방위(배치 탭): 폴을 돌려 단다 — 씬 PATCH 하나, 팬·틸트·줌은 건드리지 않는다.
    if (d.target === "mount") {
      setBusy(true, "설치를 고치는 중…");
      setCamStatus(t("설치를 고치는 중…"));
      try {
        const yawDeg = yaw;
        await reqJson("PATCH", api(`/simulator/cameras/${enc(d.cam.id)}`), { yawDeg });
        setCamStatus(t("설치방위 {m}° — {a}° 돌려 달았습니다", { m: yawDeg.toFixed(1), a: turned.toFixed(1) }));
        log(t("설치방위: {id} → {m}°", { id: d.cam.id, m: yawDeg.toFixed(1) }));
      } catch (e) { setCamStatus(t("설치 고치기 실패") + ": " + e.message); }
      finally { setBusy(false); await refreshRig(); }
      return;
    }

    // 팬(컨트롤 탭): 앵커는 몰고 있는 카메라에만 달리지만, 끄는 사이에 활성이 바뀌었을 수
    // 있다 — 그러면 이 명령은 남의 카메라로 간다. 보내기 전에 한 번 더 본다.
    if (deviceForCamera(S.current.devices, d.cam)?.id !== S.current.activeCameraId) {
      setCamStatus(t("조준할 수 없습니다 — 지금은 다른 카메라를 몰고 있습니다."));
      return;
    }
    setBusy(true, "조준하는 중…");
    setCamStatus(t("조준하는 중…"));
    try {
      // 하향각·줌은 그대로 되돌려보낸다 — 돌렸을 뿐인데 위아래로 기울거나 당겨지면 사고다.
      const now = viewOf(S.current.viewByPort, d.cam)?.ptz || {};
      const panpos = panposForYaw(yaw, mountYawOf(d.cam));
      const j = await postJson(api("/simulator/control/ptz"), {
        panpos, tiltpos: now.tiltpos, zoompos: now.zoompos,
        panspeed: MOVE_SPEED, tiltspeed: MOVE_SPEED, zoomspeed: MOVE_SPEED,
      });
      applyPtz(j.ptz);
      setCamStatus(t("조준했습니다 — {a}° 돌아 {y}°", { a: turned.toFixed(1), y: yaw.toFixed(1) }));
      log(t("카메라 조준: {id} → {y}° (팬 {p})", { id: d.cam.id, y: yaw.toFixed(1), p: panpos }));
    } catch (e) { setCamStatus(t("조준 실패") + ": " + e.message); }
    finally { setBusy(false); await refreshRig(); }   // 성공이든 실패든 씬과 카메라가 정본이다
  }, [worldAt, setBusy, applyPtz, refreshRig, log]);

  const finishCamDrag = useCallback(async (d, event) => {
    if (!d.moved) return;                              // 안 움직였으면 그냥 클릭이다
    // 레벨에 저작된 카메라는 손댈 수 없다(백엔드 403). 끌리지도 않게 막아 두었지만, 여기서도
    // 한 번 더 본다 — 목록이 갱신되는 사이에 성질이 바뀌었을 수 있다.
    if (d.cam.spawned === false) { setCamStatus(t("레벨에 저작된 카메라는 옮길 수 없습니다.")); return; }
    // 손을 뗀 자리를 다시 읽는다 — mousemove 의 마지막 값과 뗀 자리가 다를 수 있다.
    const at = (event && worldAt(event)) || d.to;
    if (!at) return;
    setBusy(true, "카메라를 옮기는 중…");
    setCamStatus(t("옮기는 중…"));
    try {
      // z 는 그대로 되돌려보낸다. 평면도는 자리(x·y)만 다루고 높이는 편집 폼의 몫이다 —
      // 여기서 높이까지 건드리면 자리를 옮겼을 뿐인데 설치 높이가 조용히 달라진다.
      await reqJson("PATCH", api(`/simulator/cameras/${enc(d.cam.id)}`),
        { location: { x: at.x, y: at.y, z: d.from.z } });
      const moved = Math.hypot(at.x - d.from.x, at.y - d.from.y) / 100;
      setCamStatus(t("옮겼습니다 — {d} m", { d: moved.toFixed(2) }));
      log(t("카메라 이동: {id} → ({x}, {y})", { id: d.cam.id, x: Math.round(at.x), y: Math.round(at.y) }));
    } catch (e) {
      setCamStatus(t("옮기기 실패") + ": " + e.message);
    } finally {
      setBusy(false);
      // 성공이든 실패든 씬이 정본이다. 폼이 옛 좌표를 들고 있으면 그다음 저장이 방금 끈 것을
      // 되돌린다 — 저장은 폼과 씬을 견주어 다른 칸만 보내므로, 남은 옛 값이 곧 "옮기라는 지시"다.
      dirty.current.delete("x");
      dirty.current.delete("y");
      await refreshRig();
    }
  }, [worldAt, setBusy, refreshRig, log]);

  useEffect(() => {
    const up = (event) => {
      const d = dragRef.current;
      if (d) {
        setDrag(null);
        // 지도 밖에서 뗐으면 반영하지 않는다 — 그 좌표는 SVG 밖으로 외삽된 점이라, 사람이
        // 겨눈 적 없는 방위·자리로 카메라가 간다. (틸트·화각은 뗀 자리를 다시 읽지 않으므로
        // 끌던 마지막 각을 그대로 쓴다 — 손이 지도 밖으로 나갔다고 값이 튀지는 않는다.)
        const inside = svgRef.current?.contains(event.target);
        if (d.kind === "tilt") { finishTilt(d); return; }
        if (d.kind === "fov") { finishFov(d); return; }
        if (d.moved && !inside) {
          setCamStatus(d.kind === "aim" ? t("평면도 안에서 놓아야 조준됩니다.") : t("평면도 안에서 놓아야 옮겨집니다."));
          return;
        }
        if (d.kind === "aim") finishAim(d, event);
        else finishCamDrag(d, event);
        return;
      }
      const place = S.current.placing;
      if (!place?.location) { downAt.current = null; return; }
      const start = downAt.current;
      downAt.current = null;
      if (!svgRef.current?.contains(event.target)) {
        if (place.stage === "aim") setMapHint(t("조준점은 평면도 안에서 찍어야 합니다."));
        return;
      }
      // 눌렀다 뗀 자리가 그대로면 아직 조준점을 안 찍은 것이다 — 두 번째 클릭을 기다린다.
      const dragged = start && Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) > 8;
      if (place.stage === "aim" && !dragged && !place.aimed) { setPlacing({ ...place, aimed: true }); return; }
      const world = worldAt(event);
      const aim = world || place.aim;
      if (!aim) return;
      finishPlacing({ ...place, aim });
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [setDrag, finishTilt, finishFov, finishAim, finishCamDrag, worldAt, finishPlacing]);

  // 끄는 중에는 컨텍스트 메뉴를 막는다 — macOS 의 Ctrl+클릭이 메뉴를 띄우면 mouseup 을
  // 못 받아 드래그가 손에 붙은 채로 남는다.
  const onContextMenu = useCallback((e) => { if (dragRef.current) e.preventDefault(); }, []);

  // 높이를 바꾸면 하향각이 따라와야 한다 — 두 값이 어긋난 채로 세우면 그게 곧 틀린 설치다.
  const onSpawnHeight = useCallback((v) => {
    setSpawnForm((f) => {
      const place = S.current.placing;
      if (!place?.aim) return { ...f, heightM: v };
      const pose = poseFromPlacement({ from: place.location, to: place.aim, heightM: v });
      return { ...f, heightM: v, pitchDeg: pose.pitchDeg.toFixed(1) };
    });
  }, []);

  // ── 영상 위: 클릭 = 센터링, 드래그 = 박스줌 ────────────────────────────────
  // 센터링의 뜻은 **열린 탭이 정한다.** 컨트롤 탭에서는 현재값의 일 — 팬·틸트가 움직여 그
  // 점이 중앙에 온다. 배치 탭에서는 설치의 일 — 같은 조준 뒤에 그 자세를 설치로 굳혀,
  // 클릭한 곳이 **팬 0 의 정면**이 되도록 폴을 돌려 단다. 카메라가 보는 곳은 같고, 그
  // 방향이 어느 축(오프셋/설치)에 적히는지가 갈린다.
  const rebaseInstall = useCallback(async () => {
    const cam = cameraForDevice(S.current.devices, S.current.cameras, S.current.activeCameraId);
    if (!cam) return;
    // 레벨 저작 카메라의 설치는 고정이다(씬 PATCH 403) — 조준은 위에서 이미 됐으니,
    // 굳히기만 건너뛰고 그 사실을 말한다. 403 을 「센터링 실패」로 옮겨 적지 않는다.
    if (cam.spawned === false) { log(t("레벨 저작 카메라 — 설치가 고정이라 굳히지 않습니다: {id}", { id: cam.id })); return; }
    const r = await reqJson("POST", api(`/simulator/cameras/${enc(cam.id)}/rebase`));
    if (r.ptz) applyPtz(r.ptz);
    log(t("설치로 굳힘: {id} — 이 방향이 팬 0 의 정면입니다", { id: cam.id }));
    await refreshRig();
  }, [applyPtz, refreshRig, log]);

  const [marker, setMarker] = useState(null);
  const centerAt = useCallback(async (p) => {
    const toInstall = S.current.tab === "rig";
    setMarker({ left: p.px, top: p.py });
    setBusy(true);
    // 원(마커)은 "화면에 보이는" 팬이 끝난 뒤 중앙으로 — 표시 영상은 정착 응답보다 늦다.
    const motion = previewRef.current?.watchDisplayedMotion();
    try {
      const j = await postJson(api("/simulator/control/center"), {
        x: p.x, y: p.y, frameWidth: p.nw, frameHeight: p.nh, speed: MOVE_SPEED,
      });
      applyPtz(j.ptz);          // 폴링(5초)을 기다리면 "눌렀는데 안 바뀐다" 로 보인다
      await motion?.settled();
      setMarker({ left: "50%", top: "50%" });
      log(t("센터링 ({x}, {y}) → {p}", { x: p.x, y: p.y, p: fmt(j.ptz) }));
      if (toInstall) {
        // 센터링은 이미 눈앞에서 성공했다 — 굳히기 실패를 「센터링 실패」로 말하면 사람은
        // 방금 본 것과 화면의 말 중 하나를 의심하게 된다.
        try { await rebaseInstall(); }
        catch (err) { log(t("설치로 굳히기 실패 — 조준은 됐습니다") + ": " + err.message); }
      }
    } catch (err) { log(t("센터링 실패") + ": " + err.message); }
    finally { motion?.stop(); setBusy(false); scheduleRepose(); }
  }, [setBusy, applyPtz, rebaseInstall, scheduleRepose, log]);

  const zoomBox = useCallback(async (box, from) => {
    const toInstall = S.current.tab === "rig";
    setMarker(null);
    setBusy(true);
    try {
      const j = await postJson(api("/simulator/control/center-box"), {
        ...box, frameWidth: from.nw, frameHeight: from.nh, speed: MOVE_SPEED,
      });
      applyPtz(j.ptz);
      log(t("박스줌 → {p}", { p: fmt(j.ptz) }));
      // 박스줌도 조준은 설치로 굳는다 — 줌만은 순수 현재값이라 굳힐 사본이 없다.
      if (toInstall) {
        try { await rebaseInstall(); }
        catch (err) { log(t("설치로 굳히기 실패 — 조준은 됐습니다") + ": " + err.message); }
      }
    } catch (err) { log(t("박스줌 실패") + ": " + err.message); }
    finally { setBusy(false); scheduleRepose(); }
  }, [setBusy, applyPtz, rebaseInstall, scheduleRepose, log]);

  const pointer = useStagePointer({ imgRef: viewRef, onClick: centerAt, onBox: zoomBox, enabled: !locked });

  // ── 오라클 대조 ───────────────────────────────────────────────────────────
  // 시뮬레이터가 존재하는 이유가 이것이다: 여기서는 정답이 실재한다. 두 답은 반드시 **같은
  // 순간의 자세**로 물어야 하므로 PTZ 를 바로 앞에서 새로 읽고 둘을 함께 던진다.
  const compareWithOracle = useCallback(async () => {
    const { cam } = resolveActiveCam({
      devices: S.current.devices, cameras: S.current.cameras, deviceId: S.current.activeCameraId,
    });
    if (!cam) { setOracleOut(t("이 카메라의 포즈를 몰라 대조할 수 없습니다.")); return; }
    const targets = S.current.slots.filter((s) => s?.transform?.location);
    if (!targets.length) { setOracleOut(t("대조할 주차면이 없습니다.")); return; }
    const nw = viewRef.current?.naturalWidth || 1920;
    const nh = viewRef.current?.naturalHeight || 1080;
    setBusy(true, "오라클 대조 중…");
    setOracleOut(t("대조 중…"));
    try {
      const ptz = await getJson(api("/simulator/control/ptz"));
      applyPtz(ptz);
      const [ours, truth] = await Promise.all([
        postJson(api("/simulator/overlay"), { ptz, width: nw, height: nh, cameraId: cam.id }),
        postJson(api("/simulator/project"), {
          cameraId: cam.id, points: targets.map((s) => s.transform.location),
          resolution: { width: nw, height: nh },
        }),
      ]);
      const cmp = compareOracle({ ours, truth, targets, frame: { width: nw, height: nh } });
      setPins(cmp.pins);
      setPinsFrame(cmp.frame);
      setTruthPins(cmp.truthPins);
      setOracleOut(cmp.summary);
      log(t("오라클 대조") + ": " + cmp.summary);
    } catch (e) {
      // Fake 씬에는 대조할 렌더가 없다 — 501 이 그 뜻이고, 다른 실패와 섞어 말하지 않는다.
      setOracleOut(e.status === 501
        ? t("이 씬에는 렌더가 없어 오라클이 없습니다 (Fake 모드).")
        : t("오라클 대조 실패") + ": " + e.message);
    } finally { setBusy(false); }
  }, [setBusy, applyPtz, log]);

  // ── 차량 ─────────────────────────────────────────────────────────────────
  // 연달아 다른 슬롯을 찍으면 느린 응답이 나중에 도착해 폼을 되덮는다 — 마지막 요청만 이긴다.
  const loadCarIntoForm = useCallback(async (id) => {
    const req = ++carFormReq.current;
    try {
      const { car } = await getJson(api("/simulator/cars/") + enc(id));
      if (req !== carFormReq.current) return;
      setCarForm({
        carType: car.carType, color: car.color, plateType: car.plate.type,
        city: car.plate.city || "", prefix: car.plate.prefix || "",
        kor: car.plate.kor || "", number: car.plate.number || "",
      });
    } catch (e) {
      if (req !== carFormReq.current) return;
      // 무언으로 삼키면 직전 차량의 값이 방금 고른 차량의 것처럼 남는다 — 이어지는
      // 「선택 차량에 적용」이 그 낡은 값으로 PATCH 하므로, 실패는 말한다.
      setCarStatus(t("차량 조회 실패") + ": " + e.message);
    }
  }, []);

  const pickSlot = useCallback((slot) => {
    setSelectedSlot(slot.id);
    setSelectedCar(slot.carId || null);
    if (slot.carId) loadCarIntoForm(slot.carId);
  }, [loadCarIntoForm]);

  const carBody = useCallback(() => ({
    carType: Number(carForm.carType), color: Number(carForm.color),
    plate: {
      type: Number(carForm.plateType), city: carForm.city.trim(), prefix: carForm.prefix.trim(),
      kor: carForm.kor, number: carForm.number.trim(),
    },
  }), [carForm]);

  const simSpawn = useCallback(async () => {
    if (!selectedSlot) { setCarStatus(t("먼저 슬롯을 선택하세요.")); return; }
    try {
      const r = await postJson(api("/simulator/cars"), { slotId: selectedSlot, force, ...carBody() });
      // 카메라 스폰과 같은 방어 — 2xx 인데 본문이 비면 스폰은 됐는데 화면만 「실패」라고 말한다.
      const car = r.car || null;
      await loadScene();   // 재적재가 status 를 비우므로, 성공 보고는 그 뒤에 한다
      setCarStatus(car?.id ? t("스폰됨: {id}", { id: car.id }) : t("스폰됨 — 응답이 차량 정보를 싣지 않았습니다"));
    } catch (e) { setCarStatus(t("스폰 실패") + ": " + e.message); }
  }, [selectedSlot, force, carBody, loadScene]);

  const simApply = useCallback(async () => {
    if (!selectedCar) { setCarStatus(t("편집할 차량을 선택하세요.")); return; }
    try {
      const applied = selectedCar;
      await reqJson("PATCH", api("/simulator/cars/") + enc(applied), carBody());
      await loadScene();
      setCarStatus(t("적용됨: {id}", { id: applied }));
    } catch (e) { setCarStatus(t("적용 실패") + ": " + e.message); }
  }, [selectedCar, carBody, loadScene]);

  const simDelete = useCallback(async () => {
    if (!selectedCar) { setCarStatus(t("삭제할 차량을 선택하세요.")); return; }
    const id = selectedCar;
    try {
      await reqJson("DELETE", api("/simulator/cars/") + enc(id));
      setSelectedCar(null);   // loadScene 이 빈 슬롯에서 재확인하지만, 즉시 선점 해제
      await loadScene();
      setCarStatus(t("삭제됨: {id}", { id }));
    } catch (e) { setCarStatus(t("삭제 실패") + ": " + e.message); }
  }, [selectedCar, loadScene]);

  const simReset = useCallback(async () => {
    try {
      const r = await postJson(api("/simulator/reset"), {});
      setSelectedCar(null);
      await loadScene();
      setCarStatus(t("{n}대 초기화됨", { n: r.cleared }));
    } catch (e) { setCarStatus(t("초기화 실패") + ": " + e.message); }
  }, [loadScene]);

  // ── 저장된 씬: 리그의 유일한 내구 기록 ────────────────────────────────────
  // 런타임에 세운 카메라는 시뮬 프로세스 안에만 산다. 시뮬이 꺼지면 카메라도 기기도 함께
  // 사라진다 — 목록이 씬에서 파생되니 남을 것이 없고, 되살릴 것은 씬 하나뿐이다.
  // 저장본은 **서버**에 남는다. 브라우저가 받아 둔 파일은 받은 사람의 다운로드 폴더 밖에서는
  // 없는 것과 같았다.
  const loadSavedScenes = useCallback(async () => {
    let list = [];
    try { list = (await getJson(api("/simulator/scenes"))).scenes || []; }
    catch (e) { setSceneStatus(t("저장 목록 실패") + ": " + e.message); }
    setSavedScenes(list);
    // 빈 칸에는 레벨 이름을 넣어 둔다. 저장되는 것은 카메라 하나가 아니라 **이 월드**인데,
    // 이름 칸이 비어 있으면 눈앞의 카메라 별명을 적게 된다.
    const level = catalogRef.current?.level || "";
    setSceneName((prev) => (prev.trim() || !level ? prev : level));
  }, []);

  const putScene = useCallback(async (name) => {
    setBusy(true, "씬을 저장하는 중…");
    setSceneStatus(t("저장 중…"));
    try {
      // 본문을 싣지 않는다 — 서버가 시뮬에서 직접 읽어 저장한다(브라우저가 씬을 실어 나르면
      // 화면이 낡은 사이에 저장을 누른 만큼 옛 씬이 저장된다).
      const r = await reqJson("PUT", api(`/simulator/scenes/${enc(name)}`));
      setSceneStatus(saveSceneText(r));   // 요약이 없으면 0 을 지어내지 않는다
      log(t("씬 저장: {name}", { name }));
      await loadSavedScenes();
    } catch (e) { setSceneStatus(t("씬 저장 실패") + ": " + e.message); }
    finally { setBusy(false); }
  }, [setBusy, loadSavedScenes, log]);

  const saveSceneAs = useCallback(async () => {
    const name = sceneName.trim();
    if (!name) { setSceneStatus(t("저장할 이름을 적으세요.")); return; }
    // 같은 이름은 덮어쓴다. 저장본이 이름마다 쌓이면 어느 것이 지금 리그인지 알 수 없다.
    if (savedScenes.some((s) => s.name === name) && !confirm(t("'{name}' 저장본을 덮어쓸까요?", { name }))) return;
    await putScene(name);
  }, [sceneName, savedScenes, putScene]);

  // 이름만 바꾼다 — 담긴 씬은 서버에서 그대로 옮겨진다. 여기서 "새 이름으로 저장 후 삭제"를
  // 하면 그 사이 달라진 씬이 저장본에 옮겨 붙어, 이름을 고친 사람이 내용을 바꾸게 된다.
  const renameSavedScene = useCallback(async (scene) => {
    const next = (prompt(t("새 이름"), scene.name) || "").trim();
    if (!next || next === scene.name) return;
    const taken = savedScenes.some((s) => s.name === next);
    if (taken && !confirm(t("'{name}' 저장본을 덮어쓸까요?", { name: next }))) return;
    setBusy(true, "이름을 바꾸는 중…");
    try {
      await postJson(api(`/simulator/scenes/${enc(scene.name)}/rename`), { to: next, overwrite: taken });
      setSceneStatus(t("이름을 바꿨습니다: {from} → {to}", { from: scene.name, to: next }));
      log(t("씬 이름 변경: {from} → {to}", { from: scene.name, to: next }));
      await loadSavedScenes();
    } catch (e) { setSceneStatus(t("이름 바꾸기 실패") + ": " + e.message); }
    finally { setBusy(false); }
  }, [savedScenes, setBusy, loadSavedScenes, log]);

  const deleteSavedScene = useCallback(async (scene) => {
    if (!confirm(t("저장본 '{name}' 을 지울까요? (씬은 그대로입니다)", { name: scene.name }))) return;
    setBusy(true, "저장본을 지우는 중…");
    try {
      await reqJson("DELETE", api(`/simulator/scenes/${enc(scene.name)}`));
      setSceneStatus(t("저장본을 지웠습니다: {name}", { name: scene.name }));
      await loadSavedScenes();
    } catch (e) { setSceneStatus(t("삭제 실패") + ": " + e.message); }
    finally { setBusy(false); }
  }, [setBusy, loadSavedScenes]);

  const restoreSavedScene = useCallback(async (scene) => {
    const path = api(`/simulator/scenes/${enc(scene.name)}/restore`);
    // 복원은 되돌릴 수 없다: 차량은 전량 리셋 후 재배치되고, 저장본에 없는 스폰 카메라는
    // 지워진다. 무엇이 사라지는지 세어서 보여준 뒤에 묻는다.
    let snap;
    try { snap = await getJson(api(`/simulator/scenes/${enc(scene.name)}`)); }
    catch (e) { setSceneStatus(t("저장본을 읽지 못했습니다") + ": " + e.message); return; }
    const doomed = doomedCameraCount(S.current.cameras, snap);
    if (!confirm(t("복원하면 차량이 전부 다시 배치되고, 저장본에 없는 카메라 {n}대가 지워집니다. 계속할까요? (카메라 {cams} · 차량 {cars})",
      { n: doomed, cams: (snap.cameras || []).length, cars: (snap.cars || []).length }))) return;
    setBusy(true, "씬을 되돌리는 중…");
    setSceneStatus(t("복원 중…"));
    try {
      let r;
      try { r = await postJson(path, {}); }
      catch (e) {
        // 레벨이 다르면 409 다. 강행 여부는 사람이 정한다 — 다른 주차장의 좌표를 이 레벨에
        // 쏟아붓는 일이라 조용히 force 를 붙이면 안 된다.
        if (e.status !== 409) throw e;   // 상태코드로 가른다 — 본문 문구는 서버마다 다르다
        if (!confirm(t("이 저장본은 다른 레벨({level})의 것입니다. 그래도 이 레벨에 적용할까요?", { level: snap.level || "?" }))) {
          setSceneStatus(t("복원을 취소했습니다."));
          return;
        }
        r = await postJson(path, { force: true });
      }
      setSceneStatus(restoreSummaryText(r));
      const c = r.cameras || {};
      log(t("씬 복원: 카메라 +{sp}/{mv}/{rm} · 차량 {cars}",
        { sp: c.spawned ?? 0, mv: c.moved ?? 0, rm: c.removed ?? 0, cars: r.cars?.restored ?? 0 }));
      // 복원은 카메라도 차량도 바꾼다 — 씬·기기 목록·슬롯을 전부 다시 읽는다.
      catalogRef.current = null;
      await refreshRig();
      await loadScene();
    } catch (e) { setSceneStatus(t("복원 실패") + ": " + e.message); }
    finally { setBusy(false); }
  }, [setBusy, refreshRig, loadScene, log]);

  // ── 주소 저장/테스트 ──────────────────────────────────────────────────────
  const probeEndpoint = useCallback(async () => {
    try {
      const d = endpointPayload(endpointForm);
      if (!d.host || !d.controlPort) throw new Error(t("제어 포트를 입력하세요 (시뮬레이터 제어 HTTP 포트, 기본 8095)."));
      setEndpointStatus(t("연결 테스트 중..."));
      setEndpointStatus(statusTextFromSimulatorState(await postJson(api("/simulator/probe"), d)));
    } catch (e) { setEndpointStatus(t("연결 테스트 실패") + ": " + e.message); }
  }, [endpointForm]);

  const saveEndpoint = useCallback(async () => {
    try {
      setEndpointStatus(t("저장 중..."));
      // 저장과 연결은 다른 말이다 — 백엔드가 실제 연결 결과를 함께 준다.
      const r = await reqJson("PUT", api("/simulator/endpoint"), endpointPayload(endpointForm));
      setEndpointStatus(statusTextFromSimulatorState(r.status || {}));
      setEndpointConfigured(!!r.configured);
      invalidateScene({ clearSelection: true });
      catalogRef.current = null;
      await refreshStatus();
      // 씬이 바뀌면 카메라 목록도 통째로 바뀐다 — 목록의 정본이 그 씬이기 때문이다.
      await loadDevices();
      // 무효화가 지운 것은 목록만이 아니다 — 레벨·주차면·카탈로그·포즈·포트 대역도 지웠으니
      // 전부 다시 채운다. 안 채우면 새 주소 저장 후 씬 화면이 빈 채로 고착된다.
      await Promise.all([loadScene(), refreshCameraPose(), fetchPorts()]);
      await loadEndpoint();   // 비밀번호 칸을 비우고 "(저장됨)" 표시를 되돌린다
    } catch (e) { setEndpointStatus(t("저장 실패") + ": " + e.message); }
  }, [endpointForm, invalidateScene, refreshStatus, loadDevices, loadScene, refreshCameraPose, fetchPorts, loadEndpoint]);

  // ── 초기화 ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (bootDone.current) return;
    bootDone.current = true;
    (async () => {
      refreshStatus({ silent: true });
      const hasCamera = await loadDevices();
      if (hasCamera) {
        // 프리뷰를 여는 것은 **사용자 선택**이고 그 선택만 기억한다 — 페이지를 여는 행위가
        // 카메라 점유가 되면 안 된다(시뮬은 캡처 예산이 유한하다).
        if (read(SIM_PREVIEW_WANTED_KEY, "off") === "on") startPreview();
        else setPreviewLabel(t("정지됨 — 시작을 누르세요"));
        await loadPtz();
      } else {
        setPreviewLabel(t("시뮬 카메라 없음"));
      }
      await refreshCameraPose();
      await loadScene();
      setBooted(true);
    })();
  }, [refreshStatus, loadDevices, startPreview, loadPtz, refreshCameraPose, loadScene]);

  // ── 씬은 이 화면 밖에서도 바뀐다 ──────────────────────────────────────────
  // 세우기·지우기를 다른 브라우저에서 하거나 sim 이 재시작하면 이 목록은 조용히 낡는다.
  // 새로고침 버튼은 답이 못 된다 — 낡았다는 걸 아는 사람만 누를 수 있는데, 모르니까 안 누른다.
  // 그래서 탭이 보이는 동안 씬을 다시 읽되 **바뀐 게 없으면 아무것도 다시 그리지 않는다**.
  //
  // 게이트는 두 단이다. 조준(PTZ)·영상 위 핀은 **어느 탭에서든** 보이므로 그 갱신은 숨김
  // 여부만 본다 — 지도 탭 게이트를 머리에 두면 기본 탭(로그)에서 핀이 무기한 낡는다.
  // 무거운 리그 갱신만 지도가 보일 때(rig/drive) 돈다.
  //
  // 기기 목록은 같이 읽지 않는다 — loadDevices 는 활성 기기를 **서버에 쓰기**까지 하므로
  // 주기 호출로 쓸 함수가 아니다. 목록 변화는 탭을 열 때 refreshRig 가 잡는다.
  const pollTick = useCallback(async () => {
    refreshStatus({ silent: true });
    // 조준(PTZ)은 이 화면만 바꾸는 값이 아니다 — 밖에서 돌아간 카메라 앞에서 화면이 옛
    // 자세를 계속 말하면 값이 "연동되지 않는다"로 보인다. 달라졌을 때만 고쳐 쓴다.
    const before = S.current.activeCameraId;
    const ptz = await getJson(api("/simulator/control/ptz")).catch(() => null);
    if (before !== S.current.activeCameraId) return;
    if (ptz && fmt(ptz) !== fmt(S.current.lastPtz)) {
      applyPtz(ptz);
      scheduleRepose();   // 자세가 갈렸으면 영상 위 핀도 옛 자세로 그려져 있다
    }
    // 평면도 리그 갱신은 지도가 보일 때만 — 조준·핀은 위에서 이미 봤다.
    if (S.current.tab !== "rig" && S.current.tab !== "drive") return;
    const sig = rigSignature(S.current.cameras, S.current.viewByPort);
    await Promise.all([fetchCameras(), fetchPtzTable()]);
    if (rigSignature(S.current.cameras, S.current.viewByPort) === sig) return;
    // 리그가 **실제로 바뀐** 뒤에만 포트를 다시 읽는다. 조기반환 위에 두면 5초마다 한
    // 요청을 공짜로 버린다.
    fetchPorts();
    // 보고 있던 카메라가 움직였으면 영상 위의 주차면 핀도 옛 포즈로 그려져 있다.
    reproject();
  }, [refreshStatus, applyPtz, scheduleRepose, fetchCameras, fetchPtzTable, fetchPorts, reproject]);

  // 사람이 뭔가 하고 있는 중이면 손대지 않는다. **편집 중은 여기서 빠진다** — 폼이 늘 열려
  // 있으므로 그걸로 쉬면 영영 쉰다(손대는 중인 칸은 dirty 가 폼 안에서 지킨다).
  useJobPoll(pollTick, {
    intervalMs: 5000,
    enabled: booted,
    pauseWhen: () => !!(S.current.placing || dragRef.current || S.current.busyLabel),
  });

  // 탭을 열 때만 하는 일들 — 저장본은 다른 브라우저에서도 늘어나고, 리그는 밖에서 바뀐다.
  useEffect(() => {
    if (!booted) return;
    if (tab === "settings") loadEndpoint();
    if (tab === "info") loadSavedScenes();
    if (tab === "rig" || tab === "drive") refreshRig();
  }, [tab, booted, loadEndpoint, loadSavedScenes, refreshRig]);

  // 오버레이를 못 그리는 이유는 말한다 — 조용히 비면 화면이 고장 난 것으로 읽힌다.
  // 기준기(derived:false)는 씬 카메라가 아니라 자기 하드웨어라 씬 포즈가 아예 없다.
  useEffect(() => {
    setOverlayHint(resolveActiveCam({ devices, cameras, deviceId: activeCameraId }).hint);
  }, [devices, cameras, activeCameraId]);

  // 기본 안내는 탭이 정한다 — 기즈모가 탭마다 다르니 안내도 그 탭의 것만 말해야 한다.
  useEffect(() => {
    if (placing) return;
    if (!mapView) { setMapHint(t("씬에서 받은 주차면·카메라가 없습니다.")); return; }
    setMapHint(tab === "drive"
      ? t("붉은 앵커 = 조준 · 모서리 앵커 = 화각(줌)")
      : t("클릭 = 선택 · 끌기 = 자리 · 붉은 앵커 = 설치방위"));
  }, [tab, placing, mapView]);

  // ── 그리기 ────────────────────────────────────────────────────────────────
  // 핀은 **프레임 좌표의 백분율**로 앉는다. px 로 앉히면 그릴 때마다 <img> 를 재어야 하고,
  // 창 크기가 바뀔 때마다 다시 재려고 서버에 좌표를 되물어야 했다 — 그 왕복이 통째로 없어진다.
  // 대조 결과가 있으면 전체를 그린다(대조는 본디 모든 주차면에 대한 답이다).
  const pinTargets = (showAllSlots || truthPins.size) ? slots : slots.filter((s) => s.id === selectedSlot);
  const carsOf = catalog?.cars || [];
  const carCount = carsOf.length || catalog?.carCount || 0;

  return (
    <main id="sim-main">
      {/* 좌: 시뮬 카메라 뷰 */}
      <div id="sim-left">
        <div className="row">
          <label htmlFor="cam-select">시뮬 카메라</label>
          <select id="cam-select" value={activeCameraId} disabled={locked}
                  onChange={(e) => switchCamera(e.target.value)}>
            {devices.map((d) => <option key={d.id} value={d.id}>{d.name || d.id}</option>)}
          </select>
          {camInfo && <span id="cam-info" className="hint" style={{ margin: 0 }}>{camInfo}</span>}
          <span id="sim-ready-led" className={"sim-led " + ready.led} title="시뮬레이터 준비 상태" />
          <span id="sim-ready-text" className="hint" style={{ margin: 0 }}>{ready.text}</span>
        </div>

        {/* 첫 페인트는 **대기가 아니라 정지**다 — 프리뷰 기본값이 꺼짐이라 기다릴 것이 없다.
            camera-preview 도 만들어지자마자 setPaused(true) 로 시작하고, 호스트 마크업이 그와
            어긋나 있으면 켜지 않은 화면이 한 순간 "Wait..." 를 띄운다(2026-08-04 지적). */}
        <div id="stage" data-paused-label="정지됨"
             className={"preview-stage preview-paused" + (crosshair ? "" : " crosshair-off")}>
          <img id="view" ref={viewRef} className="preview-waiting-image" alt="sim camera" {...pointer.handlers} />
          <div className="view-crosshair" aria-hidden="true" />
          {marker && <div id="marker" style={{ left: marker.left, top: marker.top }} />}
          {pointer.rubber && <div id="rubber" style={{ ...pointer.rubber }} />}
          <div id="slot-markers">
            {pinTargets.map((s) => {
              const p = pins.get(s.id);
              if (!p || p.behind) return null;          // 카메라 뒤 = 표시 안 함
              const truth = truthPins.get(s.id);
              const pct = (v, of) => `${(v / of) * 100}%`;
              return (
                <div key={s.id}>
                  <div className={"slot-pin" + (s.id === selectedSlot ? " sel" : " dim") + (s.occupied ? " occ" : "")}
                       style={{ left: pct(p.x, pinsFrame.width), top: pct(p.y, pinsFrame.height) }}
                       title={truth ? t("모델과 오라클의 차이: {d} px", { d: truth.d.toFixed(1) }) : undefined}>
                    <span className="dot" />
                    <span className="tag">{slotName(s)}</span>
                  </div>
                  {/* 오라클 핀은 우리 핀과 **같은 프레임 좌표계**로 환산한다 — 다른 배율을
                      쓰면 그 배율 차이가 그대로 모델 오차로 보인다. */}
                  {truth && !truth.behind && (
                    <div className={"truth-pin" + (truth.d > ORACLE_TOLERANCE_PX ? " off" : "")}
                         style={{ left: pct(truth.x, pinsFrame.width), top: pct(truth.y, pinsFrame.height) }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div id="viewbar">
          <span id="sim-preview-led" className={"sim-led " + (previewRunning ? "ready" : "off")} title="프리뷰 상태" />
          <span id="sim-preview-status" className="hint" style={{ margin: 0 }}>
            {previewLabel || (previewRunning ? t("실행 중") : t("정지됨"))}
          </span>
          <button id="sim-preview-start" onClick={startPreview} disabled={locked || previewRunning || !devices.length}>시작</button>
          <button id="sim-preview-stop" onClick={stopPreview} disabled={locked || !previewRunning}>종료</button>
          <button id="preview-mode" ref={modeBtnRef} disabled={locked}>프리뷰: 스트림</button>
          <label>스냅샷 간격 <input id="fps-int" ref={intervalRef} type="number" min="0" max="3000" step="50" /> ms</label>
          <span id="fps-actual" ref={fpsRef} className="hint" style={{ margin: 0 }}>—</span>
          <span id="busy" className="hint sim-busy">{busyLabel}</span>
          <label style={{ margin: 0 }} title="화면 중앙 조준선 켜기/끄기">
            <input type="checkbox" id="crosshair-toggle" style={{ width: "auto" }} checked={crosshair}
                   onChange={(e) => { setCrosshair(e.target.checked); write(SIM_CROSSHAIR_KEY, e.target.checked ? "on" : "off"); }} />
            {" "}Crosshair
          </label>
          <label style={{ margin: 0 }}>
            <input type="checkbox" id="show-all-slots" style={{ width: "auto" }} checked={showAllSlots}
                   onChange={(e) => setShowAllSlots(e.target.checked)} />
            {" "}전체 슬롯
          </label>
          <button id="oracle-check" type="button" disabled={locked} onClick={compareWithOracle}
                  title="렌더러가 계산한 픽셀(그라운드-트루스)과 우리 광학 모델의 픽셀을 나란히 놓습니다">오라클 대조</button>
          <span className="hint view-help" style={{ margin: 0 }}>클릭 = 센터링 · 드래그 = 박스줌</span>
          <span id="overlay-hint" className="hint" style={{ margin: 0 }}>{overlayHint}</span>
          <span id="oracle-out" className="hint" style={{ margin: 0 }}>{oracleOut}</span>
        </div>

        <div id="sim-bottom-tabs" className={tab === "rig" || tab === "drive" ? "tall" : ""}>
          <div className="sim-tabs" role="tablist" aria-label="시뮬레이터 보조 패널">
            {TABS.map(([key, label]) => (
              <button key={key} className={"sim-tab" + (tab === key ? " active" : "")} type="button"
                      data-sim-tab={key} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>

          {tab === "log" && (
            <div id="sim-log-panel" className="sim-tab-panel" data-sim-tab-panel="log">
              <pre id="log">{lines.join("\n")}</pre>
            </div>
          )}

          {/* 평면도는 **한 장**이고 배치·컨트롤 두 탭이 그 옆칸만 바꿔 단다. 사본을 두 장
              그리면 같은 씬이 두 그림이 되고, 어느 쪽이 낡았는지 아무도 모른다. */}
          {(tab === "rig" || tab === "drive") && (
            <div id="sim-rig-panel" className="sim-tab-panel" data-sim-tab-panel={tab}>
              <div className="sim-rig-layout">
                <section className="sim-map-pane" aria-label="주차장 평면도">
                  <RigMap
                    svgRef={svgRef} view={mapView} slots={slots} cameras={cameras} viewByPort={viewByPort}
                    slotPitchCm={slotPitchCm} tab={tab} selectedCamId={mapSelectedId} selectedSlotId={selectedSlot}
                    activeCameraId={activeCameraId} devices={devices} placing={placing} drag={drag}
                    onSlotClick={pickSlot} onCamDown={onCamDown} onAimDown={onAimDown}
                    onTiltDown={onTiltDown} onFovDown={onFovDown}
                    onMapDown={onMapDown} onMapMove={onMapMove} onContextMenu={onContextMenu}
                  />
                  <div id="sim-map-hint" className="hint sim-map-hint">{mapHint || "—"}</div>
                  <div id="sim-cam-status" className="hint sim-rig-status">{camStatus}</div>
                </section>

                {tab === "rig" ? (
                  <section className="sim-rig-side" aria-label="씬 카메라">
                    <div className="sim-rig-actions">
                      {placing
                        ? <button id="sim-cam-cancel" type="button" onClick={cancelPlacing}>취소</button>
                        : <button id="sim-cam-add" type="button" disabled={locked} onClick={startPlacing}>＋ 카메라 세우기</button>}
                    </div>

                    {/* 세우기와 설치는 같은 양을 다룬다 — 이름과 배치도 같아야 한다. x·y 가
                        없는 이유는 그 둘이 평면도 클릭에서 오기 때문이다. */}
                    {placing?.stage === "ready" && (
                      <form id="sim-cam-form" className="sim-cam-form" onSubmit={spawnCamera}>
                        <div className="sim-rig-group">세우기</div>
                        <div className="sim-cam-place-row">
                          <label className="sim-cam-place-cell"><span>H</span>
                            <input id="sim-cam-height" type="number" min="0.5" max="60" step="0.1"
                                   title="설치 높이 — 지면 기준 m"
                                   value={spawnForm.heightM} onChange={(e) => onSpawnHeight(e.target.value)} /></label>
                          <label className="sim-cam-place-cell wide"><span>포트</span>
                            <input id="sim-cam-http" type="number" min={portRangeHint(portInfo).http.min} max={portRangeHint(portInfo).http.max}
                                   title="Hucoms 제어 포트 — 기기 id 가 됩니다 (sim-cam-<포트>)"
                                   value={spawnForm.httpPort} onChange={(e) => setSpawnForm((f) => ({ ...f, httpPort: e.target.value }))} /></label>
                          <label className="sim-cam-place-cell wide"><span>MJPEG</span>
                            <input id="sim-cam-mjpeg" type="number" min={portRangeHint(portInfo).mjpeg.min} max={portRangeHint(portInfo).mjpeg.max}
                                   title="MJPEG 스트림 포트"
                                   value={spawnForm.mjpegPort} onChange={(e) => setSpawnForm((f) => ({ ...f, mjpegPort: e.target.value }))} /></label>
                        </div>
                        {portRangeHint(portInfo).text && (
                          <div id="sim-cam-port-range" className="muted">{portRangeHint(portInfo).text}</div>
                        )}
                        {/* 세운 사람과 이유는 씬에 남아야 한다. 씬 API 에 감사 로그가 없어서, 이
                            칸을 비워 두면 나중에 "이 카메라 누가 왜 세웠나"에 답할 방법이 아무
                            데도 없다(2026-08-17 실제로 못 찾았다). */}
                        <label className="sim-cam-name"><span>이름</span>
                          <input id="sim-cam-note" type="text" maxLength={60} required placeholder="누가·왜 — 씬에 남습니다"
                                 title="사람이 부르는 별명 — 씬에 저장되고 스냅샷·복원에 따라옵니다. 세운 근거를 적으세요."
                                 value={spawnForm.note} onChange={(e) => setSpawnForm((f) => ({ ...f, note: e.target.value }))} /></label>
                        <input id="sim-cam-yaw" type="hidden" value={spawnForm.yawDeg} readOnly />
                        <input id="sim-cam-pitch" type="hidden" value={spawnForm.pitchDeg} readOnly />
                        <div className="sim-rig-actions">
                          <button id="sim-cam-spawn" type="submit" disabled={locked}>세우기</button>
                        </div>
                      </form>
                    )}

                    {/* 고를 곳은 하나다: 위의 「시뮬 카메라」 드롭다운(= 평면도 클릭). 그래서 이
                        폼은 숨었다 나타나지 않고 **늘 지금 고른 카메라**를 보여 준다. */}
                    <form id="sim-cam-edit-form" className="sim-cam-form"
                          onSubmit={(e) => { e.preventDefault(); applyInstall(); }}>
                      <div className="sim-rig-group">설치</div>
                      {/* 별명. 씬(카메라의 note)에 사는 값이라 스냅샷·복원에 따라온다.
                          레벨 저작 카메라도 이름은 고칠 수 있다 — 옮기지 못하는 것은 자세가
                          레벨의 것이기 때문이지 사람이 부르는 이름까지 레벨의 것이어서가 아니다. */}
                      <label className="sim-cam-name"><span>이름</span>
                        <input id="sim-cam-edit-note" type="text" maxLength={60} placeholder="비우면 높이로 자동"
                               title="사람이 부르는 별명 — 씬에 저장됩니다. 비우면 설치 높이로 만든 이름이 쓰입니다."
                               disabled={!selectedCam} {...editField("note")} /></label>
                      <div className="hint sim-cam-edit-title" id="sim-cam-edit-title">{cameraTitleLine(selectedCam, pickedDevice)}</div>
                      <div className="hint sim-cam-edit-title" id="sim-cam-edit-ports">{cameraPortsLine(selectedCam)}</div>
                      {/* 자리(x·y·H). z 칸은 두지 않는다: z 는 H 에서 나오고(z = H×100 + 지면),
                          두 칸을 두면 같은 값을 두 곳에서 고치게 되어 지면이 조용히 어긋난다. */}
                      <div className="sim-cam-place-row">
                        <label className="sim-cam-place-cell"><span>x</span>
                          <input id="sim-cam-edit-x" type="number" step="1" title="씬 x (cm)"
                                 disabled={!selectedCam || authored} {...editField("x")} /></label>
                        <label className="sim-cam-place-cell"><span>y</span>
                          <input id="sim-cam-edit-y" type="number" step="1" title="씬 y (cm)"
                                 disabled={!selectedCam || authored} {...editField("y")} /></label>
                        <label className="sim-cam-place-cell"><span>H</span>
                          <input id="sim-cam-edit-height" type="number" min="0.5" max="60" step="0.1"
                                 title="설치 높이 — 지면 기준 m (씬 z = H×100 + 지면)"
                                 disabled={!selectedCam || authored} {...editField("heightM")} /></label>
                      </div>
                      {/* 설치 자세. P·T·Z(현재값)는 「카메라 컨트롤」 탭에 있다: 설치는 볼트로
                          박는 값이고 현재값은 몰면서 바뀌는 값이라, 한 폼에 섞으면 자리를
                          고치려던 손이 카메라를 움직인다. */}
                      <div className="sim-cam-place-row">
                        <label className="sim-cam-place-cell"><span>방위</span>
                          <input id="sim-cam-edit-bearing" type="number" step="0.1"
                                 title="설치 방위(°) — 팬 0 일 때 보는 월드 방위"
                                 disabled={!selectedCam || authored} {...editField("bearing")} /></label>
                        <label className="sim-cam-place-cell"><span>하향</span>
                          <input id="sim-cam-edit-pitch" type="number" min="-89" max="20" step="0.1"
                                 title="설치 하향각(°) — 음수가 아래. 틸트를 이 각으로 다시 앉힙니다"
                                 disabled={!selectedCam || authored} {...editField("pitch")} /></label>
                      </div>
                      <div className="sim-rig-actions">
                        {selectedCam && <button id="sim-cam-edit-apply" type="submit" disabled={locked}>적용</button>}
                        {selectedCam && !authored && (
                          <button id="sim-cam-edit-delete" type="button" className="danger" disabled={locked}
                                  onClick={removeCamera}>삭제</button>
                        )}
                      </div>
                    </form>
                  </section>
                ) : (
                  <section className="sim-rig-side" aria-label="카메라 조종">
                    {/* 현재값(오프셋)만 다룬다. 설치(x·y·H·방위·하향)는 「카메라 배치」 탭이다. */}
                    <form id="sim-cam-drive-form" className="sim-cam-form"
                          onSubmit={(e) => { e.preventDefault(); applyDrive(); }}>
                      <div className="sim-rig-group">조종 — 현재 PTZ</div>
                      <div className="hint sim-cam-edit-title" id="sim-cam-drive-title">{cameraTitleLine(selectedCam, pickedDevice)}</div>
                      {/* 조종(P·T·Z)은 현재값이다 — 레벨 저작이 고정하는 것은 설치이지 조준이
                          아니다. 숫자 입력만 잠그면 이 폼이 통째로 죽은 기능이 된다. */}
                      <div className="sim-cam-place-row">
                        <label className="sim-cam-place-cell"><span>P</span>
                          <input id="sim-cam-edit-pan" type="number" min="0" max="35999" title="휴컴스 pan (0–35999)"
                                 disabled={!selectedCam} {...editField("pan")} /></label>
                        <label className="sim-cam-place-cell"><span>T</span>
                          <input id="sim-cam-edit-tilt" type="number" min="-2000" max="9000"
                                 title="휴컴스 tilt (−2000–9000, 클수록 아래)"
                                 disabled={!selectedCam} {...editField("tilt")} /></label>
                        <label className="sim-cam-place-cell"><span>Z</span>
                          <input id="sim-cam-edit-zoom" type="number" min="0" max="65535" title="휴컴스 zoom (0–65535)"
                                 disabled={!selectedCam} {...editField("zoom")} /></label>
                      </div>
                      <div className="sim-rig-actions">
                        {selectedCam && <button id="sim-cam-drive-apply" type="submit" disabled={locked}>적용</button>}
                        {selectedCam && (
                          <button id="sim-cam-drive-reset" type="button" disabled={locked} onClick={resetDrive}
                                  title="팬·틸트·줌을 0 으로 — 설치 자세와 일치시킵니다">리셋 (PTZ 0)</button>
                        )}
                      </div>
                    </form>
                  </section>
                )}
              </div>
            </div>
          )}

          {tab === "info" && (
            <div id="sim-info-panel" className="sim-tab-panel" data-sim-tab-panel="info">
              <div className="sim-info-grid">
                <span className="sim-info-label">레벨</span>
                <span id="sim-level" className="sim-info-value">{catalog?.level || "—"}</span>
                <span className="sim-info-label">플러그인 버전</span>
                <span id="sim-plugin-version" className="sim-info-value">{catalog?.pluginVersion ? "v" + catalog.pluginVersion : "—"}</span>
              </div>
              <div className="sim-info-actions">
                <button id="sim-refresh" type="button" disabled={locked} onClick={loadScene}>새로고침</button>
                <button id="sim-reset" type="button" disabled={locked} onClick={simReset}>전체 초기화</button>
              </div>
              {/* 저장된 씬은 **씬 전체**(세운 카메라 + 차량)의 것이라 카메라 옆에 둘 수 없다.
                  거기 두면 "이 카메라를 저장한다"로 읽힌다. 초기화와 복원은 같은 축의 양끝이라
                  나란히 있는 자리가 여기다. */}
              <div className="sim-scene-snapshot">
                <div className="sim-scene-save">
                  <input id="sim-scene-name" type="text" maxLength={60} placeholder="저장 이름"
                         title="한글·영숫자·공백과 ._()[]+- 만, 60자까지. 같은 이름으로 저장하면 덮어씁니다."
                         value={sceneName} onChange={(e) => setSceneName(e.target.value)}
                         onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveSceneAs(); } }} />
                  <button id="sim-scene-save" type="button" disabled={locked} onClick={saveSceneAs}
                          title="지금 씬(세운 카메라 + 차량)을 서버에 저장합니다">저장</button>
                </div>
                <div id="sim-scene-list" className="sim-scene-list">
                  {savedScenes.length === 0
                    ? <div className="hint">저장된 씬이 없습니다.</div>
                    : savedScenes.map((scene) => (
                      <div key={scene.name} className="sim-scene-row">
                        <span className="name" title={scene.level || ""}>{scene.name}</span>
                        <span className="meta">{sceneMetaText(scene)}</span>
                        {/* 이름을 고치는 것과 내용을 고치는 것은 다른 일이다. 한 버튼으로 묶으면
                            이름만 고치려던 사람이 그 사이 달라진 씬까지 저장하게 된다. */}
                        <button type="button" disabled={locked} title="이름만 바꿉니다 — 담긴 씬은 그대로입니다"
                                onClick={() => renameSavedScene(scene)}>이름 바꾸기</button>
                        <button type="button" disabled={locked} title="이 저장본을 지금 씬으로 덮어씁니다"
                                onClick={() => { if (confirm(t("'{name}' 저장본을 지금 씬으로 덮어쓸까요?", { name: scene.name }))) putScene(scene.name); }}>덮어쓰기</button>
                        <button type="button" disabled={locked} title="이 저장본으로 씬을 되돌립니다"
                                onClick={() => restoreSavedScene(scene)}>복원</button>
                        <button type="button" className="danger" disabled={locked}
                                onClick={() => deleteSavedScene(scene)}>삭제</button>
                      </div>
                    ))}
                </div>
                <div id="sim-scene-status" className="hint" style={{ margin: "6px 0 0" }}>{sceneStatus}</div>
              </div>
            </div>
          )}

          {tab === "settings" && (
            <div id="sim-settings-panel" className="sim-tab-panel" data-sim-tab-panel="settings">
              <section className="sim-scene-endpoint" aria-label="시뮬레이터 주소">
                <div className="sim-pane-head">
                  <strong>시뮬레이터 주소</strong>
                  <span id="sim-endpoint-state" className="sim-mode-badge">
                    {endpointConfigured === null ? "—" : endpointConfigured ? t("설정됨") : t("미설정")}
                  </span>
                </div>
                <div className="hint" style={{ margin: "0 0 7px" }}>
                  시뮬레이터(월드) 하나의 주소와 계정입니다. 제어 포트는 시뮬레이터 전체가 하나 가지며 stage 마다 있는 것이 아닙니다 — 활성 stage 도 이 포트로 고릅니다. 카메라와 무관하므로 카메라가 0 대여도 그대로 남습니다.
                </div>
                <div className="row">
                  <label>호스트</label>
                  <input id="sim-endpoint-host" type="text" placeholder="192.0.2.60" style={{ width: 150 }}
                         value={endpointForm.host} onChange={(e) => setEndpointForm((f) => ({ ...f, host: e.target.value }))} />
                  <label>제어 포트</label>
                  <input id="sim-endpoint-port" type="number" min="1" max="65535" placeholder="8095" style={{ width: 80 }}
                         value={endpointForm.controlPort} onChange={(e) => setEndpointForm((f) => ({ ...f, controlPort: e.target.value }))} />
                  <label>Timeout</label>
                  <input id="sim-endpoint-timeout" type="number" min="1000" max="120000" step="1000" placeholder="8000" style={{ width: 90 }}
                         value={endpointForm.timeoutMs} onChange={(e) => setEndpointForm((f) => ({ ...f, timeoutMs: e.target.value }))} />
                </div>
                <div className="row" style={{ marginTop: 6 }}>
                  <label>계정</label>
                  <input id="sim-endpoint-user" type="text" autoComplete="username" placeholder="admin" style={{ width: 120 }}
                         value={endpointForm.username} onChange={(e) => setEndpointForm((f) => ({ ...f, username: e.target.value }))} />
                  <label>비밀번호</label>
                  {/* 빈 칸은 "모른다"이지 "지워라"가 아니다 — 자리표시가 그 사실을 말한다. */}
                  <input id="sim-endpoint-pass" type="password" autoComplete="new-password" style={{ width: 150 }}
                         placeholder={hasPassword ? t("(저장됨 · 변경 시에만 입력)") : t("비밀번호")}
                         value={endpointForm.password} onChange={(e) => setEndpointForm((f) => ({ ...f, password: e.target.value }))} />
                  <button id="sim-endpoint-probe" type="button" disabled={locked} onClick={probeEndpoint}>연결 테스트</button>
                  <button id="sim-endpoint-save" type="button" disabled={locked} onClick={saveEndpoint}>저장</button>
                </div>
                <div id="sim-endpoint-status" className="hint" style={{ marginTop: 7 }}>{endpointStatus}</div>
              </section>
            </div>
          )}
        </div>
      </div>

      {/* 우: 씬 셋업 */}
      <div id="sim-panel">
        <div id="slot-card" className="card">
          <h2>주차면 (슬롯)</h2>
          <div id="sim-slots">
            {slots.length === 0
              ? <span className="hint">주차면이 없습니다. sim 레벨에 BP_ParkingSlot 배치가 필요합니다.</span>
              : slots.map((s) => {
                const car = s.carId ? carById.get(s.carId) : null;
                const plate = car ? plateText(car.plate) : "";
                return (
                  <button key={s.id} type="button" data-slot={s.id}
                          className={"sim-slot" + (s.occupied ? " occ" : "") + (s.id === selectedSlot ? " sel" : "")}
                          title={s.label && s.label !== s.id ? s.id : ""}
                          onClick={() => pickSlot(s)}>
                    <b className="slot-name">{slotName(s)}</b>
                    <span className="slot-type">{s.type || ""}</span>
                    {s.occupied && <em className="slot-car">{s.carId || t("점유")}</em>}
                    {s.occupied && plate && <span className="slot-plate" title={plate}>{plate}</span>}
                  </button>
                );
              })}
          </div>
        </div>

        <div className="card">
          <h2>차량 배치 / 편집</h2>
          <div className="row" style={{ marginBottom: 6 }}>
            <label>대상 슬롯</label>
            <span id="sim-sel-slot" className="hint" style={{ margin: 0 }}>
              {selectedSlot ? slotNameById(slots, selectedSlot) + (selectedCar ? ` (${selectedCar})` : "") : t("— 슬롯을 선택하세요")}
            </span>
          </div>
          <div className="row" style={{ marginBottom: 6 }}>
            <label>차종</label>
            <select id="sim-cartype" style={{ width: "auto", padding: 5 }} value={carForm.carType}
                    onChange={(e) => setCarForm((f) => ({ ...f, carType: e.target.value }))}>
              {Array.from({ length: carCount }, (_, i) => (
                <option key={i} value={i}>{carsOf[i]?.name || `${t("차종")} ${i}`}</option>
              ))}
            </select>
            <label>색상</label>
            <select id="sim-color" style={{ width: "auto", padding: 5 }} value={carForm.color}
                    onChange={(e) => setCarForm((f) => ({ ...f, color: e.target.value }))}>
              {(catalog?.colors || []).map((c) => <option key={c.index} value={c.index}>{c.name}</option>)}
            </select>
            <span id="sim-color-chip" style={{
              width: 20, height: 20, borderRadius: 4, border: "1px solid #3a414c", display: "inline-block",
              background: (() => {
                const c = (catalog?.colors || [])[Number(carForm.color) || 0];
                return c?.rgb ? `rgb(${c.rgb.map((v) => Math.round(v * 255)).join(",")})` : undefined;
              })(),
            }} />
          </div>
          <div className="row" style={{ marginBottom: 8 }}>
            <label>번호판</label>
            <select id="sim-platetype" style={{ width: "auto", padding: 5 }} value={carForm.plateType}
                    onChange={(e) => setCarForm((f) => ({ ...f, plateType: e.target.value }))}>
              {(catalog?.plateTypes || []).map((p) => <option key={p.index} value={p.index}>{p.name}</option>)}
            </select>
            <input id="sim-plate-city" style={{ width: 52 }} placeholder="서울" title="도시(선택)"
                   value={carForm.city} onChange={(e) => setCarForm((f) => ({ ...f, city: e.target.value }))} />
            <input id="sim-plate-prefix" style={{ width: 48 }} placeholder="123" title="앞 3자리 (한국 신형)"
                   value={carForm.prefix} onChange={(e) => setCarForm((f) => ({ ...f, prefix: e.target.value }))} />
            <select id="sim-plate-kor" style={{ width: "auto", padding: 5 }} title="한글" value={carForm.kor}
                    onChange={(e) => setCarForm((f) => ({ ...f, kor: e.target.value }))}>
              {(catalog?.korList || []).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input id="sim-plate-number" style={{ width: 62 }} placeholder="4567" title="뒤 4자리"
                   value={carForm.number} onChange={(e) => setCarForm((f) => ({ ...f, number: e.target.value }))} />
          </div>
          <div className="row">
            <button id="sim-spawn" disabled={locked} onClick={simSpawn}>이 슬롯에 스폰</button>
            <button id="sim-apply" disabled={locked} onClick={simApply}>선택 차량에 적용</button>
            <button id="sim-delete" disabled={locked} onClick={simDelete}>선택 차량 삭제</button>
            <label style={{ marginLeft: 8 }}>
              <input type="checkbox" id="sim-force" style={{ width: "auto" }} checked={force}
                     onChange={(e) => setForce(e.target.checked)} />
              {" "}점유 덮어쓰기
            </label>
          </div>
          <div className="row sim-status-row"><span id="sim-status" className="hint" style={{ margin: 0 }}>{carStatus}</span></div>
        </div>
      </div>
    </main>
  );
}
