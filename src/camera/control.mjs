import { apiFetch } from "../lib/api.mjs";
import { t } from "../i18n/index.mjs";

export const controlPath = (cameraId) => `/cctv/devices/${encodeURIComponent(cameraId)}/control`;

const STATES = new Set(["idle", "owned", "recovering", "recovery_required"]);

async function requestControl(cameraId, { api, fetchImpl = apiFetch, signal }, recover) {
  const response = await fetchImpl(api(controlPath(cameraId) + (recover ? "/recover" : "")), {
    method: recover ? "POST" : "GET", signal, cache: "no-store",
    ...(recover ? { headers: { "content-type": "application/json" }, body: "{}" } : {}),
  });
  // Older backends have no control endpoint. This is not a claim that the camera is idle.
  if (!recover && response.status === 404) return null;
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  if (body.cameraId !== cameraId || !STATES.has(body.state)) {
    throw new Error(t("카메라 제어 상태 응답을 확인할 수 없습니다."));
  }
  return body;
}

export const loadCameraControl = (cameraId, options) => requestControl(cameraId, options, false);
export const retryCameraRecovery = (cameraId, options) => requestControl(cameraId, options, true);

const OPERATIONS = { homing: "번호판 호밍", calibration: "캘리브레이션", height: "설치 높이 측정" };

// Transient legacy movement stays quiet; persistent human/AI ownership is visible.
export function controlSummary(control) {
  if (!control || control.state === "idle") return null;
  if (control.state === "owned") {
    const operation = control.owner?.operation;
    if (operation === "switch" || (operation === "manual" && !control.owner?.persistent)) return null;
    if (operation === "manual") return {
      label: t("수동 제어권 사용 중"),
      detail: [control.owner.actor?.kind, control.owner.actor?.id, control.owner.purpose].filter(Boolean).join(" · "),
      warn: false, canRetry: false, manual: true,
    };
    return {
      label: t("{job} 진행 중", { job: t(OPERATIONS[operation] || "카메라 작업") }),
      detail: [control.owner?.actor?.kind, control.owner?.actor?.id, t("작업이 카메라를 사용하고 있습니다. 중지는 해당 작업 화면에서 할 수 있습니다.")].filter(Boolean).join(" · "),
      warn: false, canRetry: false,
    };
  }
  if (control.state === "recovering") {
    return { label: t("카메라 원위치 복귀 중"), detail: "", warn: false, canRetry: false };
  }
  if (control.state === "recovery_required") {
    return {
      label: t("카메라 복구 필요"),
      detail: control.recovery?.error || t("원위치 복귀에 실패해 카메라 제어가 잠겨 있습니다."),
      warn: true, canRetry: control.recovery?.canRetry === true,
    };
  }
  return null;
}

export async function loadControlHistory(cameraId, { api, after = 0, limit = 25, fetchImpl = apiFetch, signal }) {
  const query = new URLSearchParams({ after: String(after), limit: String(limit) });
  const response = await fetchImpl(api(controlPath(cameraId) + "/history") + "?" + query, { signal, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error || `HTTP ${response.status}`), { status: response.status, body });
  if (body.cameraId !== cameraId || !Array.isArray(body.events) || !Number.isSafeInteger(body.nextCursor)) {
    throw new Error(t("카메라 사용 기록 응답을 확인할 수 없습니다."));
  }
  return body;
}
