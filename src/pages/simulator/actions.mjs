// 시뮬레이터 셋업 화면의 판정·문구 — DOM 없이 성립하는 부분 전부.
//
// 이 화면이 다루는 값은 두 축이다. **설치**(볼트로 박는 값: 자리·높이·설치방위·하향각)는
// 씬 PATCH 로 나가고, **현재값**(몰면서 바뀌는 값: P·T·Z)은 제어 창구로 나간다. 한 함수에
// 섞이던 시절에는 자리를 고치려던 손이 카메라를 움직였다 — 그래서 여기서도 두 축이 서로
// 다른 함수다(installPatchFrom · driveChangeOf).
//
// 기하(부채꼴·앵커 자리·투영)는 geometry.mjs 다. 여기 있는 것은 「무엇을 보낼 것인가」와
// 「무엇이라고 말할 것인가」다.
import { toNum, pad2 } from "../../format.mjs";
import { t } from "../../i18n/index.mjs";
// 지면 판정과 중앙값은 기하의 것이다 — 두 벌이 되면 세우기와 설치가 다른 지면을 본다.
import { sceneGroundZcm as sceneGround, cameraHeightM, median } from "./geometry.mjs";

/** 이동 속도(1–100). 조작 패드를 걷어내면서 이 값을 고를 칸도 사라졌다 — 모든 이동이 이 값을 쓴다. */
export const MOVE_SPEED = 50;

/** 오라클과 우리 모델의 차이를 색으로 표시하는 문턱(프레임 1920 기준 0.16%). */
export const ORACLE_TOLERANCE_PX = 3;

export const SIM_ACTIVE_CAMERA_KEY = "sim:active-camera.v1";
export const SIM_PREVIEW_WANTED_KEY = "sim:preview-on.v1";
export const SIM_CROSSHAIR_KEY = "sim:crosshair.v1";

// ── 시뮬레이터 상태 ──────────────────────────────────────────────────────────────

/**
 * PTZ 값 게이트 — 셋이 다 유한할 때만 자세다. 반쪽을 통과시키면 그 반쪽이 폼에 적히고,
 * 다음 「적용」이 나머지를 0 으로 채워 보낸다.
 */
export function ptzSnapshot(p) {
  if (!p) return null;
  const panpos = toNum(p.panpos), tiltpos = toNum(p.tiltpos), zoompos = toNum(p.zoompos);
  if (panpos === null || tiltpos === null || zoompos === null) return null;
  return { panpos, tiltpos, zoompos };
}

/**
 * 준비 LED 와 그 옆 한 줄. **죽은 것이 무엇인가**를 가려서 말한다 — 백엔드가 무응답인데
 * 「시뮬레이터 미연결」이라고 말하면 사람이 UE 를 뒤진다.
 */
export function readyStateOf(state = {}) {
  const mode = state.mode || "";
  const ready = Boolean(state.ready);
  const led = ready ? "ready" : mode === "fake" ? "warn" : "off";
  if (ready) {
    const version = state.pluginVersion ? ` · v${state.pluginVersion}` : "";
    return { led, text: t("시뮬레이터 준비됨") + version };
  }
  if (mode === "fake") return { led, text: t("Fake 모드") };
  if (state.unreachable) {
    return { led, text: t("백엔드 무응답 — 시뮬레이터 상태를 알 수 없습니다 ({e})", { e: state.error }) };
  }
  const why = state.message || state.error;   // 계약은 message — error 는 로컬(fetch 실패) 폴백
  return { led, text: why ? t("시뮬레이터 미연결: {why}", { why }) : t("시뮬레이터 미연결") };
}

/** 설정 탭의 상태줄 — 어디에 붙어 있는가를 늘 함께 말한다. */
export function statusTextFromSimulatorState(state = {}) {
  const endpoint = state.endpoint || {};
  const where = endpoint.host
    ? `${endpoint.host}${endpoint.port ? ":" + endpoint.port : ""}`
    : t("host 미설정");
  if (state.ready) return `${t("연결됨")} · ${endpoint.name || endpoint.id || "sim"} · ${where}`;
  if (state.mode === "fake") return `${t("Fake 모드")} · ${where}`;
  const why = state.message || state.error;
  return `${t("미연결")} · ${where}` + (why ? ` · ${why}` : "");
}

/**
 * 시뮬레이터 주소 저장 본문.
 *
 * **비밀번호는 서버가 내려주지 않는다.** 빈 칸은 "모른다"라서 보내지 않는 것이 맞다 —
 * 빈 문자열로 보내면 호스트만 고치는 저장 한 번에 월드의 계정이 지워지고, 파생된 카메라
 * 전부가 인증에 실패한다.
 */
export function endpointPayload({ host, controlPort, timeoutMs, username, password } = {}) {
  const timeout = String(timeoutMs ?? "").trim();
  const user = String(username ?? "").trim();
  return {
    host: String(host ?? "").trim(),
    controlPort: String(controlPort ?? "").trim(),
    ...(timeout ? { timeoutMs: Number(timeout) } : {}),
    ...(user ? { username: user } : {}),
    ...(password ? { password } : {}),
  };
}

// ── 주차면·차량 ─────────────────────────────────────────────────────────────────

const slotCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function slotName(slot) {
  return String(slot?.label || slot?.id || "");
}

export function slotNameById(slots = [], id) {
  const slot = slots.find((s) => s.id === id);
  return slot ? slotName(slot) : String(id || "");
}

export function sortSlots(slots = []) {
  return [...slots].sort((a, b) => slotCollator.compare(slotName(a), slotName(b)));
}

/** 번호판 한 줄. 빈 조각은 빠지고, 남은 것만 공백으로 잇는다. */
export function plateText(p = {}) {
  const region = String(p.city || "").trim();
  const middle = (String(p.prefix || "").trim() + String(p.kor || "").trim()).trim();
  const number = String(p.number || "").trim();
  return [region, middle, number].filter(Boolean).join(" ");
}

/** 저장본 시각. 못 읽으면 빈 문자열 — 에포크(1970)를 그리지 않는다. */
export function sceneStamp(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// ── 카메라마다의 시야 — 서버가 낸 값을 읽기만 한다 ────────────────────────────────
//
// 방향(설치방위 + 팬)도 화각(줌→화각 표)도 백엔드의 광학 모델이 낸 숫자다. 화면이 raw PTZ 로
// 지어내면 그 순간 모델이 두 벌이 되고, 부채꼴과 영상 위의 핀이 서로 다른 식으로 그려진다.

/** 설치방위 — 카메라를 **세운** 방향이지 보는 방향이 아니다. */
export function mountYawOf(cam) {
  return Number(cam?.mount?.baseYaw) || 0;
}

/** 이 카메라의 지금 자세. 없으면 null: 안 닿는 카메라라는 뜻이고, 모르는 것은 그리지 않는다. */
export function viewOf(viewByPort, cam) {
  return viewByPort?.get?.(Number(cam?.hucomsPort)) || null;
}

export function viewYawOf(viewByPort, cam) {
  return toNum(viewOf(viewByPort, cam)?.viewYawDeg);
}

export function hfovOf(viewByPort, cam) {
  return toNum(viewOf(viewByPort, cam)?.hfovDeg);
}

export function tiltposOf(viewByPort, cam) {
  return toNum(viewOf(viewByPort, cam)?.ptz?.tiltpos);
}

/**
 * 렌즈가 갈 수 있는 화각의 양끝. 서버가 카메라마다 답한 값이다 — 모르면 지금 화각에 묶어
 * 아무 데도 못 가게 한다(모르는 한계를 지어내 그 너머로 보내지 않는다).
 */
export function hfovLimitsOf(viewByPort, cam) {
  const range = viewOf(viewByPort, cam)?.hfovRange;
  const min = toNum(range?.minDeg), max = toNum(range?.maxDeg);
  if (min !== null && max !== null && min > 0 && max >= min) return { min, max };
  const now = hfovOf(viewByPort, cam);
  return now === null ? null : { min: now, max: now };
}

/**
 * 부채꼴이 그리는 것은 **탭이 정한다 — FK 의 어느 단인가.**
 *
 * 시뮬의 카메라는 액터(설치 변환) → PanPivot(설치방위 + 팬) → TiltPivot 의 계층이다.
 *   배치 탭  = 부모: 설치방위, 폭은 팬 0·줌 0 의 기준 시야(렌즈 광각 끝).
 *   컨트롤 탭 = 자식: 설치 + 팬(지금 보는 방향), 폭은 지금 줌의 화각.
 * 팬이 걸려 있으면 두 탭의 부채꼴이 서로 다른 곳을 가리키는 것이 **맞는 그림**이다.
 *
 * 팬이나 줌을 모르는 카메라(안 닿음)는 null — 0 으로 채우면 그 0 이 곧 "정면을 본다"는
 * 거짓말이 되고, 실제로 89° 어긋난 곳을 가리켰다(2026-08-12 실측).
 */
export function coneOf(viewByPort, cam, { installMode }) {
  const limits = hfovLimitsOf(viewByPort, cam);
  const yaw = installMode ? mountYawOf(cam) : viewYawOf(viewByPort, cam);
  const hfov = installMode ? (limits ? limits.max : null) : hfovOf(viewByPort, cam);
  if (yaw === null || hfov === null) return null;
  return { yaw, half: hfov / 2 };
}

/**
 * 조준 앵커가 **어느 장부에 적히는가**. 같은 손짓인데 축이 다르다.
 *   컨트롤 탭 → "pan": 카메라를 돌린다(현재값). 제어 창구는 활성 카메라 한 대에만 닿으므로
 *                      그 카메라에만 단다.
 *   배치 탭   → "mount": 폴을 돌려 단다(설치방위). 씬 PATCH 라 스폰 카메라 전부에 달되,
 *                      레벨 저작은 자세가 레벨의 것이라 403 — 잡을 수 없는 것은 보이지도 않는다.
 */
export function aimTargetFor(cam, { tab, deviceId, activeCameraId }) {
  if (tab === "drive") return deviceId === activeCameraId ? "pan" : null;
  return cam?.spawned !== false ? "mount" : null;
}

/**
 * 리그가 바뀌었는가를 재는 서명. 5초 폴링이 이 값만 보고 다시 그릴지 정한다 — 바뀐 게 없는데
 * 목록을 새로 만들면 스크롤과 커서가 그때마다 튄다.
 *
 * **시야가 빠지면** 다른 카메라를 누가 돌려도 평면도가 옛 시야를 계속 그린다(바뀐 게 없다고
 * 판단해 다시 그리지 않으므로). 틸트는 틸트 앵커의 자리다.
 */
export function rigSignature(cameras = [], viewByPort) {
  return JSON.stringify(cameras.map((c) => [
    c.id, c.hucomsPort, c.mjpegPort, c.spawned !== false,
    c?.heightAboveReferenceGroundCm, c?.mount?.location?.x, c?.mount?.location?.y, c?.mount?.baseYaw,
    viewYawOf(viewByPort, c), hfovOf(viewByPort, c), viewOf(viewByPort, c)?.ptz?.tiltpos,
  ]));
}

// ── 스폰 포트 — 정본은 서버다 ────────────────────────────────────────────────────
//
// 카메라 포트 대역은 **인스턴스마다 다르므로**(다중 인스턴스 계약, 플러그인 v0.1.17부터 대역
// 밖 스폰은 409) 프런트가 관례로 고르면 안 된다 — 8200 하드코딩이 정확히 그 사고였다
// (2026-08-17 재현: 대역 8030~8040 인스턴스에서 폼이 8200 을 채워 409).

/**
 * 대역의 네 값이 **전부 유한할 때만** 대역이 있다고 친다. 무제한 인스턴스는 경계를 null 로
 * 보낼 수 있는데, null 을 그대로 비교에 태우면 port > null 이 항상 참이라 모든 스폰이
 * 「대역 밖」으로 거절된다 — 반쪽 대역도 같은 이유로 통째로 「대역 없음」으로 다룬다.
 */
export function portBand(portInfo) {
  const r = portInfo?.cameraPortRange;
  if (!r) return null;
  const b = {
    httpFrom: toNum(r.httpFrom), httpTo: toNum(r.httpTo),
    mjpegFrom: toNum(r.mjpegFrom), mjpegTo: toNum(r.mjpegTo),
  };
  return Object.values(b).some((v) => v === null) ? null : b;
}

/**
 * **대역이 없는 인스턴스 전용 관례 탐색.** 무제한 인스턴스이거나 대역 계약 이전(플러그인
 * 0.1.17 미만) 백엔드라 서버가 고를 근거를 못 주는 경우다. 그때는 어느 빈 포트든 합법이라
 * 창(8200~)도 짝(+100)도 이쪽의 관례일 뿐이다 — **대역이 있는 인스턴스에는 절대 쓰지 않는다.**
 *
 * 빈 포트를 고르는 근거는 **씬이 지금 열고 있는 포트**다. 포트는 그 카메라의 신원이기도
 * 하므로(기기 id 가 sim-cam-<포트>) 겹치면 두 카메라가 한 기기가 된다.
 */
export function suggestPortsByConvention({ cameras = [], devices = [], controlPort } = {}) {
  const used = new Set();
  for (const cam of cameras) {
    for (const key of ["hucomsPort", "mjpegPort"]) {
      const p = toNum(cam[key]);
      if (p !== null) used.add(p);
    }
  }
  for (const d of devices) {
    for (const key of ["port", "mjpegPort"]) {
      const p = toNum(d[key]);
      if (p !== null) used.add(p);
    }
  }
  // 제어 포트는 기기 목록에 없다(월드 전역이라 config.simulator 소유) — 그래도 카메라가
  // 그 번호를 집으면 UE 가 400 으로 거절하므로 쓰인 번호로 함께 센다.
  const control = toNum(controlPort);
  if (control !== null) used.add(control);
  // 낮은 쪽부터 찾는다. 「쓰인 것 중 최대 + 1」로 늘리면 CGI 포트가 MJPEG 대역(83xx)으로
  // 흘러들어가 두 대역이 섞이고, 지웠다 만들기를 반복할수록 번호가 실제 대수와 멀어진다.
  for (let http = 8200; http <= 8299; http += 1) {
    if (!used.has(http) && !used.has(http + 100)) return { http, mjpeg: http + 100 };
  }
  const highest = used.size ? Math.max(...used) : 8080;
  for (let http = highest + 1; http <= 65400; http += 1) {
    if (!used.has(http) && !used.has(http + 100)) return { http, mjpeg: http + 100 };
  }
  return { http: "", mjpeg: "" };
}

/**
 * 세울 포트를 고른다. **세 갈래이고 가운데를 빠뜨리면 고치려던 증상이 그대로 돌아온다.**
 *  - nextFree 있음            → 그 쌍. 서버가 이 인스턴스의 대역 안에서, 씬이 연 포트를 피해 골랐다
 *  - 대역 있는데 nextFree 없음 → **대역 만원**이다. 관례로 내려가면 대역 밖 값을 다시 제안한다
 *  - 대역 자체가 없음          → 무제한 인스턴스이거나 대역 계약 이전 백엔드. 이때만 관례 탐색
 *
 * nextFree 는 **쌍이거나 null 이지 반쪽이 아니다** — 반쪽을 주면 받는 쪽이 나머지를 +100 으로
 * 지어내게 되고, 두 대역이 100 차이라는 보장은 어디에도 없다(인자가 넷이라 독립이다).
 */
export function pickSpawnPorts(portInfo, scene = {}) {
  const next = portInfo?.nextFree;
  if (next) return { http: next.httpPort, mjpeg: next.mjpegPort };
  if (portBand(portInfo)) return { http: "", mjpeg: "" };
  return suggestPortsByConvention(scene);
}

/**
 * 대역이 있는데 빈 쌍이 없다 = 만원. 빈 문자열이면 만원이 아니다(호출부가 그대로 쓴다).
 *
 * 만원은 입력 실수가 아니라 **상태**다. 빈칸만 남기고 "포트를 입력하세요"로 끝내면, 사람은
 * 아무 값도 안 된다는 사실을 시도해 봐야만 알게 된다.
 */
export function bandFullNotice(portInfo) {
  const range = portBand(portInfo);
  if (!range || portInfo?.nextFree) return "";
  return t("카메라 포트 대역({from}~{to})이 가득 찼습니다 — 카메라를 지우거나 더 넓은 대역으로 시뮬레이터를 다시 띄우세요.",
    { from: range.httpFrom, to: range.httpTo });
}

/**
 * 대역을 폼에 새긴다 — min/max(브라우저 1차 방어)와 힌트 한 줄. 모르면 새기지 않는다
 * (추측으로 좁히면 옛 백엔드에서 스폰 자체가 막힌다).
 */
export function portRangeHint(portInfo) {
  const range = portBand(portInfo);
  if (!range) {
    return { http: { min: 1, max: 65535 }, mjpeg: { min: 1, max: 65535 }, text: "" };
  }
  return {
    http: { min: range.httpFrom, max: range.httpTo },
    mjpeg: { min: range.mjpegFrom, max: range.mjpegTo },
    text: t("허용 포트 {hf}–{ht} · MJPEG {mf}–{mt}",
      { hf: range.httpFrom, ht: range.httpTo, mf: range.mjpegFrom, mt: range.mjpegTo }),
  };
}

// ── 세우기 ──────────────────────────────────────────────────────────────────────

/**
 * 세우기 요청 본문 — 또는 **왜 못 세우는지**. 검증을 서버에만 맡기지 않는 이유는, 자리·높이를
 * 다 정한 뒤에 받는 409 가 비싸기 때문이다. 다만 **대역을 알 때만** 막는다(모르면 서버가
 * 판정한다 — 추측으로 막아 옛 백엔드의 스폰까지 죽이지 않는다).
 */
export function spawnRequestFrom({ location, form = {}, portInfo, cameras = [], slots = [] } = {}) {
  const fail = (error) => ({ error, body: null });
  if (!location) return fail(t("먼저 평면도에서 자리를 정하세요."));
  const height = toNum(form.heightM);
  if (height === null || height <= 0) return fail(t("높이를 입력하세요 (m)."));
  // 이름은 필수다. 씬 API 에 감사 로그가 없어서 이 값이 "누가 왜 세웠나"의 유일한 기록이다.
  const note = String(form.note ?? "").trim();
  if (!note) return fail(t("이름을 입력하세요 — 누가 왜 세웠는지가 씬에 남는 유일한 기록입니다."));
  const httpPort = toNum(form.httpPort);
  const mjpegPort = toNum(form.mjpegPort);
  // 대역이 꽉 차서 비어 있는 것과, 사람이 지운 것은 다른 사실이다. 전자에 "입력하세요"라고
  // 답하면 넣을 값이 있는 것처럼 들린다 — 없다.
  if (httpPort === null || mjpegPort === null) {
    return fail(bandFullNotice(portInfo) || t("포트를 입력하세요."));
  }
  const range = portBand(portInfo);
  if (range && (httpPort < range.httpFrom || httpPort > range.httpTo)) {
    return fail(t("포트 {p} 는 이 인스턴스의 허용 범위({from}~{to}) 밖입니다.",
      { p: httpPort, from: range.httpFrom, to: range.httpTo }));
  }
  if (range && (mjpegPort < range.mjpegFrom || mjpegPort > range.mjpegTo)) {
    return fail(t("MJPEG 포트 {p} 는 이 인스턴스의 허용 범위({from}~{to}) 밖입니다.",
      { p: mjpegPort, from: range.mjpegFrom, to: range.mjpegTo }));
  }
  // 높이는 지면 기준이다 — 월드 z 로 바꾸려면 이 레벨의 지면을 더해야 한다. 모르면 세우지
  // 않는다: 0 으로 가정하면 지면이 z=0 이 아닌 레벨에서 그 차이가 통째로 높이 오차가 되고,
  // 그 오차는 나중에 높이 축이 "실측"으로 읽는다.
  const ground = sceneGround(cameras, slots);
  if (ground === null) {
    return fail(t("이 씬의 지면 높이를 알 수 없습니다 — 주차면이나 카메라가 하나는 있어야 합니다."));
  }
  return {
    error: null,
    body: {
      location: { x: location.x, y: location.y, z: height * 100 + ground },
      yawDeg: toNum(form.yawDeg) ?? 0,
      pitchDeg: toNum(form.pitchDeg) ?? -20,
      httpPort, mjpegPort, note,
    },
  };
}

/**
 * **스폰 응답을 그대로 믿지 않는다.** 백엔드도 씬도 note 를 버리지 않지만(baro_memo #55 에서
 * 소스로 확인), 한 번 관측된 실패가 있다 — 응답에 `camera` 키가 통째로 없고 note 가 ""로
 * 남았는데 **카메라는 실제로 세워져 있었다**(2026-08-17). 재현되지 않아 원인은 미정이다.
 *
 * 그래서 방어적으로 읽는다. 곧장 `r.camera.id` 를 읽으면 **성공한 스폰에서 예외가 나** 화면이
 * "실패"라고 말하는데 카메라는 씬에 서 있는 상태가 된다.
 */
export function spawnOutcome(response, { httpPort, note } = {}) {
  const spawned = response?.camera || null;
  const camId = spawned?.id || null;
  const camPort = spawned?.hucomsPort ?? httpPort;
  return {
    camId, camPort,
    // 이름은 이 카메라의 유일한 출처 기록이라 조용히 비워 둘 수 없다. 안 들어갔을 때만
    // 한 번 더 쓴다 — 간헐 실패에는 무조건 왕복보다 재시도가 맞는 모양이다.
    needsNoteRetry: Boolean(camId && String(spawned.note ?? "") !== note),
    text: camId
      ? t("세웠습니다: {id} · 기기 sim-cam-{port}", { id: camId, port: camPort })
      : t("세웠습니다 — 응답이 카메라를 싣지 않아 이름은 목록에서 확인하세요 (sim-cam-{port})", { port: camPort }),
  };
}

// ── 설치 편집 ───────────────────────────────────────────────────────────────────

/**
 * 폼은 좌표를 cm 정수로 보여 준다. 그 표시를 그대로 보내면, 아무것도 안 고치고 저장만 눌러도
 * 카메라가 반올림한 만큼(≤5 mm) 움직인다. 그래서 **표시와 같은 값이면 씬의 원값을
 * 되돌려보낸다** — 사람이 적은 것만 사람이 적은 값으로 나간다.
 */
export function typedOrExact(formValue, sceneValue) {
  if (formValue === null || sceneValue === null) return sceneValue;
  return formValue === Math.round(sceneValue) ? sceneValue : formValue;
}

/**
 * 설치 적용의 PATCH 본문 — 또는 **왜 못 보내는지**. 씬 PATCH 하나로 나간다
 * (location·note·yawDeg·pitchDeg, 바뀐 필드만). 현재값(P·T·Z)은 여기 없다.
 *
 * 축 하나만 보내면 나머지를 sim 이 0 으로 읽어 카메라가 원점으로 날아간다(백엔드도 같은
 * 이유로 셋을 다 요구한다). 그래서 한 축만 고쳐도 셋을 함께 보낸다.
 */
export function installPatchFrom({ cam, form = {}, tiltpos, cameras = [], slots = [] } = {}) {
  const fail = (error) => ({ error, patch: null });
  if (!cam) return fail(t("고칠 카메라를 찾지 못했습니다 — 목록을 다시 읽으세요."));
  const patch = {};
  const nowX = toNum(cam?.mount?.location?.x), nowY = toNum(cam?.mount?.location?.y);
  const nowZ = toNum(cam?.mount?.location?.z);
  const x = typedOrExact(toNum(form.x), nowX);
  const y = typedOrExact(toNum(form.y), nowY);
  const heightM = toNum(form.heightM);
  const nowHeightM = cameraHeightM(cam);
  const heightChanged = heightM !== null && (nowHeightM === null || Math.abs(heightM - nowHeightM) > 0.005);
  if (x !== nowX || y !== nowY || heightChanged) {
    if (x === null || y === null) return fail(t("씬이 이 카메라의 설치 좌표를 주지 않았습니다."));
    let z = nowZ;
    if (heightChanged) {
      if (heightM <= 0) return fail(t("높이는 0 보다 커야 합니다."));
      // 세울 때와 같은 이유로 지면을 모르면 옮기지 않는다.
      const ground = sceneGround(cameras, slots);
      if (ground === null) {
        return fail(t("이 씬의 지면 높이를 알 수 없습니다 — 주차면이나 카메라가 하나는 있어야 합니다."));
      }
      z = heightM * 100 + ground;
    }
    if (z === null) return fail(t("씬이 이 카메라의 설치 좌표를 주지 않았습니다."));
    patch.location = { x, y, z };
  }
  // 설치 자세(도 단위). 0.05° 는 toFixed(1) 표시 반올림 아래라, 안 고친 칸이 표시 오차만큼
  // "바뀐 척" 나가는 것을 막는다.
  const bearing = toNum(form.bearing);
  const nowBearing = toNum(cam?.mount?.baseYaw);
  if (bearing !== null && (nowBearing === null || Math.abs(bearing - nowBearing) > 0.05)) {
    patch.yawDeg = bearing;
  }
  const pitch = toNum(form.pitch);
  const camTilt = toNum(tiltpos);
  const nowPitch = camTilt === null ? null : -camTilt / 100;
  if (pitch !== null && (nowPitch === null || Math.abs(pitch - nowPitch) > 0.05)) {
    patch.pitchDeg = pitch;
  }
  // 별명은 빈 문자열도 뜻이 있다("이름 지움") — 씬이 준 값과 다를 때만 보낸다.
  const note = String(form.note ?? "").trim();
  if (note !== String(cam.note ?? "").trim()) patch.note = note;

  if (!Object.keys(patch).length) return fail(t("바뀐 값이 없습니다."));
  return { error: null, patch };
}

/**
 * 조종 적용의 PTZ — 또는 왜 못 보내는지. 셋이 다 있고 그중 하나라도 지금과 다를 때만 보낸다.
 * 폼이 비어 있으면(남의 카메라를 고른 상태) 보낼 것도 없다.
 */
export function driveChangeOf({ form = {}, now } = {}) {
  const fail = (error) => ({ error, ptz: null });
  if (now === null || now === undefined) {
    return fail(t("조준할 수 없습니다 — 지금은 다른 카메라를 몰고 있습니다."));
  }
  const want = { panpos: toNum(form.pan), tiltpos: toNum(form.tilt), zoompos: toNum(form.zoom) };
  const complete = Object.values(want).every((v) => v !== null);
  const changed = complete && Object.entries(want).some(([k, v]) => v !== now[k]);
  if (!changed) return fail(t("바뀐 값이 없습니다."));
  return { error: null, ptz: want };
}

/**
 * 설치 폼에 채울 값들. **키 이름은 installPatchFrom 이 읽는 이름과 같아야 한다** — 폼은 이
 * 객체로 채워지고 그 폼이 그대로 저 함수로 들어가므로, 한쪽만 고치면 그 칸이 조용히 「안 고침」이
 * 된다(입력은 되는데 저장이 안 나가는 모양이다).
 * 좌표는 cm 정수로 보여 주되 저장할 때는 손대지 않은 칸의 원값을 그대로
 * 되돌려보낸다(installPatchFrom) — 반올림한 표시가 그대로 나가면 아무것도 안 고치고 저장만
 * 눌러도 카메라가 5 mm 씩 움직인다.
 *
 * 하향은 이 카메라의 **틸트**에서 온다 — 씬 계약에서 설치 하향각은 별도 저장이 아니라 틸트를
 * 다시 앉히는 값이라(pitchDeg→tilt), 틸트가 곧 그 값의 지금 모습이다.
 */
export function installFieldsOf(cam, { tiltpos, ptz } = {}) {
  if (!cam) return { note: "", x: "", y: "", heightM: "", bearing: "", pitch: "", pan: "", tilt: "", zoom: "" };
  const cm = (v) => (v === null ? "" : String(Math.round(v)));
  const loc = cam?.mount?.location;
  const heightM = cameraHeightM(cam);
  const baseYaw = toNum(cam?.mount?.baseYaw);
  const camTilt = toNum(tiltpos);
  const p = ptzSnapshot(ptz);
  return {
    note: String(cam.note ?? ""),
    x: cm(toNum(loc?.x)),
    y: cm(toNum(loc?.y)),
    heightM: heightM === null ? "" : heightM.toFixed(2),
    bearing: baseYaw === null ? "" : baseYaw.toFixed(1),
    pitch: camTilt === null ? "" : (-camTilt / 100).toFixed(1),
    pan: p === null ? "" : String(p.panpos),
    tilt: p === null ? "" : String(p.tiltpos),
    zoom: p === null ? "" : String(p.zoompos),
  };
}

/**
 * 폼 머리의 아이디 줄. 카메라가 없는 데는 **두 가지 뜻**이 있다 — 기준기를 고른 것과, 씬이
 * 비었거나 목록을 아직 못 읽은 것. "없습니다" 하나로 뭉뚱그리면 기준기를 고른 사람은 화면이
 * 고장 났다고 읽는다.
 */
export function cameraTitleLine(cam, pickedDevice) {
  if (cam) return cam.id + (cam.spawned === false ? t(" · 레벨 저작(자세 고정)") : "");
  return pickedDevice?.derived === false
    ? t("{name} · 기준기 — 설치는 시뮬 카메라만 고칩니다", { name: pickedDevice.name || pickedDevice.id })
    : t("고른 카메라가 없습니다.");
}

export function cameraPortsLine(cam) {
  return cam ? t("제어 :{c} · 프리뷰 :{m}", { c: cam.hucomsPort, m: cam.mjpegPort ?? "—" }) : "";
}

// ── 기기 ↔ 씬 카메라 ─────────────────────────────────────────────────────────────

export function deviceForCamera(devices = [], camera) {
  return devices.find((d) => Number(d.port) === Number(camera?.hucomsPort)) || null;
}

/**
 * 드롭다운이 가리키는 기기의 씬 카메라. deviceForCamera 의 역방향이고, 이어 주는 값은 포트
 * 하나다(기기 id 는 sim-cam-<포트> 라 포트가 곧 정체다).
 *
 * 기준기(reference)는 씬에서 파생된 것이 아니라 config 에 사는 계약의 정본이라 씬 카메라가
 * 없다 — 서버가 `derived: false` 로 그렇게 말한다. **그 표시를 봐야 한다.** 포트 일치만 보면,
 * 기준기가 어쩌다 씬 카메라와 같은 포트를 갖는 순간 남의 카메라에 설치 폼이 붙는다.
 */
export function cameraForDevice(devices = [], cameras = [], deviceId) {
  const dev = devices.find((d) => d.id === deviceId);
  if (!dev || dev.derived === false) return null;
  return cameras.find((c) => c.hucomsPort === dev.port) || null;
}

/**
 * 영상 위 핀을 그릴 카메라의 포즈.
 *
 * 첫 카메라 폴백은 **합성 fake 기기**의 것이다(포트 없는 지어낸 기기 하나 = 씬 카메라 하나).
 * 기준기(derived:false)는 씬 카메라가 아니라 자기 하드웨어다 — 여기에 폴백을 태우면 남의
 * 카메라 광학모델에 이 카메라의 PTZ 를 꽂아 핀·오라클을 그린다.
 */
export function resolveActiveCam({ devices = [], cameras = [], deviceId } = {}) {
  const dev = devices.find((d) => d.id === deviceId) || {};
  const port = dev.port;
  const cam = cameras.find((c) => c.hucomsPort === port)
    || (port == null && dev.derived !== false && cameras.length ? cameras[0] : null);
  const hint = cam ? ""
    : dev.derived === false ? t("기준기 — 씬 포즈가 없어 오버레이를 그리지 않습니다")
    : t("이 카메라의 포즈 없음 — 오버레이 미표시");
  return { cam, hint };
}

/**
 * 목록을 채운 뒤 어느 기기를 고를 것인가. 저장된 선택 → 서버의 활성 → 첫째 순이다.
 * 저장본을 먼저 보는 이유는, 사람이 마지막으로 본 카메라가 이 화면의 문맥이기 때문이다.
 */
export function pickDevice(devices = [], { savedId, activeId } = {}) {
  if (!devices.length) return "";
  if (devices.some((d) => d.id === savedId)) return savedId;
  if (devices.some((d) => d.id === activeId)) return activeId;
  return devices[0].id;
}

// ── 오라클 대조 ─────────────────────────────────────────────────────────────────
// 시뮬레이터가 존재하는 이유가 이것이다: 여기서는 정답이 실재한다. /simulator/project 는
// 렌더러가 실제 렌더에 쓰는 뷰·투영 행렬로 월드점을 픽셀로 옮긴 값이고, /simulator/overlay 는
// 같은 점을 우리 광학 모델로 옮긴 값이다. 둘을 나란히 놓는 것이 우리 모델의 시험이다.

/**
 * 두 답을 견준다. 오라클이 다른 해상도로 답하면 그 배율로 우리 프레임에 맞춘다 — 다른 배율을
 * 쓰면 그 배율 차이가 그대로 모델 오차로 보인다.
 *
 * 화면 밖 점은 통계에서 뺀다 — 화면 가장자리 너머에서는 각도 오차가 픽셀로 발산해서, 몇 개가
 * 프레임을 벗어났느냐에 따라 "최대 오차"가 널뛴다.
 */
export function compareOracle({ ours, truth, targets = [], frame } = {}) {
  const pins = new Map((ours?.pins || []).map((p) => [p.id, p]));
  const size = { width: ours?.width || frame.width, height: ours?.height || frame.height };
  const sx = size.width / (truth?.resolution?.width || frame.width);
  const sy = size.height / (truth?.resolution?.height || frame.height);
  const truthPins = new Map();
  const inFrame = [];
  let behind = 0, outside = 0;
  (truth?.points || []).forEach((point, index) => {
    const slot = targets[index];
    const ourPin = pins.get(slot?.id);
    if (!slot || !ourPin) return;
    if (point.behind || ourPin.behind) { behind += 1; return; }
    const x = point.x * sx, y = point.y * sy;
    const d = Math.hypot(ourPin.x - x, ourPin.y - y);
    truthPins.set(slot.id, { x, y, behind: false, d });
    if (x >= 0 && x <= size.width && y >= 0 && y <= size.height) inFrame.push(d);
    else outside += 1;
  });
  const summary = inFrame.length
    ? t("프레임 안 {n}면 · 중앙 {med} px · 최대 {max} px (밖 {o} · 뒤 {b}) — 프레임 {w}×{h}", {
      n: inFrame.length, med: median(inFrame).toFixed(1), max: Math.max(...inFrame).toFixed(1),
      o: outside, b: behind, w: size.width, h: size.height,
    })
    : t("프레임 안에 든 주차면이 없습니다 — 카메라를 주차면 쪽으로 돌리고 다시 재세요. (뒤 {b} · 밖 {o})",
      { b: behind, o: outside });
  return { pins, frame: size, truthPins, summary };
}

// ── 저장된 씬 ───────────────────────────────────────────────────────────────────

/**
 * 복원하면 무엇이 사라지는가. 저장본에 없는 **스폰** 카메라는 지워진다 — 레벨 저작 카메라는
 * 애초에 지울 수 없으므로 세지 않는다.
 */
export function doomedCameraCount(cameras = [], snapshot = {}) {
  const kept = new Set((snapshot.cameras || []).map((s) => Number(s.httpPort)));
  return cameras.filter((c) => c.spawned && !kept.has(Number(c.hucomsPort))).length;
}

export function restoreSummaryText(r = {}) {
  const c = r.cameras || {};
  return t("복원됨 — 카메라 +{sp}/이동 {mv}/삭제 {rm} · 차량 {cars}대{fail}", {
    sp: c.spawned ?? 0, mv: c.moved ?? 0, rm: c.removed ?? 0,
    cars: r.cars?.restored ?? 0,
    fail: (r.failures || []).length ? t(" · 실패 {n}건", { n: r.failures.length }) : "",
  });
}

/** 저장본 한 줄의 요약. 깨진 저장본은 숨기지 않는다 — 목록에서 사라지면 저장이 안 된 줄 안다. */
export function sceneMetaText(scene = {}) {
  if (scene.error) return t("읽을 수 없음");
  return `${t("카메라")} ${scene.cameras} · ${t("차량")} ${scene.cars} · ${sceneStamp(scene.savedAtUtc)}`;
}

/** 저장 결과. 요약이 없으면 0 을 지어내지 않는다. */
export function saveSceneText(r = {}) {
  return r.scene
    ? t("저장했습니다 — 카메라 {cams}대 · 차량 {cars}대", { cams: r.scene.cameras ?? "?", cars: r.scene.cars ?? "?" })
    : t("저장했습니다");
}
