// 설정 화면의 판정·페이로드 로직 — DOM 없이 성립하는 부분 전부. React 전환(plan §2 계약 셋)
// 에서 뷰와 분리해 node 테스트를 붙인다. 인라인 <script> 시절 이 규칙들은 전부 DOM 읽기와
// 섞여 있어 그물이 HTML 정규식뿐이었다.
//
// 이 파일이 드는 계약의 핵심은 **빈칸의 세 갈래 뜻**이다(plan §0 보존 계약):
//   ① 기기 필드: 원래 있던 필드만 "" 로 제거 신호 — 화면이 보지도 못한 값을 빈칸이라는
//      이유로 지우면 안 된다(putField).
//   ② 가상 PTZ: 끄면 "" 를 보내 제거 — 백엔드가 그렇게 읽는다.
//   ③ LLM 타임아웃: 빈칸은 0 이 아니라 **필드를 통째로 뺀다** — 보내면 보존이 깨진다.
import { t } from "../../i18n.mjs";

// ── 기기 페이로드 ────────────────────────────────────────────────────────────

// 접속 상세 — host 기기에만 의미가 있는 필드들. 백엔드가 정규화하는 이름 그대로 쓴다.
// 제어 포트는 여기 없다 — 주소는 카메라가 아니라 시뮬레이터(월드)의 것이다(config.simulator).
export const DEV_CONN_KEYS = ["scheme", "mjpegPort", "timeoutMs",
                              "rtspPath", "rtspPort", "streamFps", "insecureTls",
                              "fwModId", "portId", "ptzPortId", "streamIndex"];

// 빈칸의 뜻은 둘로 갈린다: "지운다"와 "나는 이 값을 모른다".
// 백엔드는 안 보낸 필드를 보존하고 "" 를 제거로 읽으므로, 화면이 **보지도 못한** 값을
// 빈칸이라는 이유로 지우면 안 된다 — 그래서 원래 그 필드가 있었을 때만 "" 를 보낸다.
export function putField(out, base, key, value) {
  if (value !== "" && value !== undefined && value !== null) out[key] = value;
  else if (base && base[key] !== undefined && base[key] !== "") out[key] = "";
}

// 폼의 숫자 칸: 빈칸은 "" 그대로(제거/모름 판정은 putField 가), 값이 있으면 Number.
export const numOrBlank = (v) => {
  const s = String(v ?? "").trim();
  return s === "" ? "" : Number(s);
};

// 저장 payload 한 건. 편집기가 아는 필드는 전부 명시로 되돌려보낸다 — 백엔드는 **안 보낸**
// 필드를 보존하고 빈 문자열을 제거로 읽으므로, 이 함수가 흘리는 필드는 조용히 옛 값에 묶인다.
export function toSaveEntry(x, needsHost) {
  const e = { id: x.id, name: x.name, type: x.type };
  if (x.mode) e.mode = x.mode;
  // 캘리브레이션은 편집기가 바꿀 수 있는 값이므로 명시로 되돌려보낸다. GET 이 준 모양
  // 그대로라 왕복이 성립하고, "" 는 백엔드가 **제거**로 읽는다(보정 없음).
  if (x.intrinsics !== undefined) e.intrinsics = x.intrinsics;
  // 가상 PTZ 는 타입과 무관하다 — 접속 대상이 없는 기기도 이 값을 가진다.
  if (x.virtualPtz !== undefined) e.virtualPtz = x.virtualPtz;
  if (needsHost) {
    e.host = x.host; e.port = x.port; e.username = x.username;
    for (const k of DEV_CONN_KEYS) if (x[k] !== undefined) e[k] = x[k];
    if (x.password) e.password = x.password;  // 빈칸이면 omit → 백엔드가 기존 비밀번호 유지
  }
  return e;
}

// 편집 폼 값(전부 문자열/불린) → 기기 항목 + 빌려오기 표시. DOM 읽기(readEditor)에서
// 분리한 본체다. base 는 편집 전의 그 기기(새 기기는 null) — 빈칸 판정의 기준이 된다.
export function deviceFormToEntry(f, { base = null, needsHost = true } = {}) {
  const d = {
    id: String(f.id ?? "").trim(),
    name: String(f.name ?? "").trim(),
    type: f.type,
    mode: f.mode === "sim" ? "sim" : "real",
  };
  // 가상 PTZ 는 타입 바깥이다. 끄면 "" 를 보내 제거한다 — 백엔드가 그렇게 읽는다.
  if (f.vptzOn) {
    const vp = { hfovDeg: Number(f.vptzHfov) };
    for (const [key, v] of [["width", f.vptzW], ["height", f.vptzH], ["maxMag", f.vptzMaxMag]]) {
      if (String(v ?? "").trim() !== "") vp[key] = Number(v);
    }
    d.virtualPtz = vp;
  } else putField(d, base, "virtualPtz", "");
  if (needsHost) {
    d.host = String(f.host ?? "").trim();
    d.port = Number(f.port) || 80;
    d.username = String(f.username ?? "").trim();
    if (f.password) d.password = f.password;  // 빈칸 => 백엔드가 기존 비밀번호 유지
    putField(d, base, "scheme", f.scheme);
    putField(d, base, "rtspPath", String(f.rtspPath ?? "").trim());
    putField(d, base, "rtspPort", numOrBlank(f.rtspPort));
    putField(d, base, "streamFps", numOrBlank(f.streamFps));
    putField(d, base, "mjpegPort", numOrBlank(f.mjpegPort));
    putField(d, base, "timeoutMs", numOrBlank(f.timeoutMs));
    putField(d, base, "insecureTls", f.insecureTls ? true : "");
    putField(d, base, "fwModId", numOrBlank(f.fwModId));
    putField(d, base, "portId", numOrBlank(f.portId));
    putField(d, base, "ptzPortId", numOrBlank(f.ptzPortId));
    putField(d, base, "streamIndex", numOrBlank(f.streamIndex));
  }
  // 캘리브레이션. "__keep" 은 이 필드를 아예 싣지 않는다는 뜻이고(백엔드가 보존),
  // "" 는 명시적 제거다. 빌려오기는 저장 뒤 백엔드 창구가 푼다(표시만 넘긴다).
  let borrowFrom = null;
  if (f.calib === "") d.intrinsics = "";
  else if (typeof f.calib === "string" && f.calib.startsWith("profile:")) borrowFrom = f.calib.slice("profile:".length);
  return { entry: d, borrowFrom };
}

// 가상 PTZ 검증 — 백엔드도 400 으로 막지만, 그 전에 말해 주는 편이 낫다. 빈 화각은
// Number("")=0 이 되어 "0~180 사이여야 합니다"라는, 입력한 적 없는 값에 대한 오류로 돌아온다.
export function vptzError(vp) {
  if (!vp || typeof vp !== "object") return null;
  const h = vp.hfovDeg;
  if (!Number.isFinite(h) || h <= 0 || h >= 180) return t("가상 PTZ 소스 화각은 0~180 사이여야 합니다");
  const mm = vp.maxMag;
  if (mm !== undefined && !(mm > 1 && mm <= 64)) return t("가상 PTZ 최대 배율은 1 초과 64 이하여야 합니다");
  return null;
}

// '저장하면 이렇게 될 목록' 만들기 — 서버에 보내기 전 단계라 실패해도 현재 상태는 그대로다.
// 반환: { list, id, active } 또는 { error }.
export function stageDeviceList({ devices, selId, draft, entry, activeId }) {
  const d = { ...entry };
  const list = devices.map((x) => ({ ...x }));
  if (draft) {
    if (list.some((x) => x.id === d.id)) return { error: t("이미 있는 id: {id}", { id: d.id }) };
    d.hasPassword = !!d.password;
    list.push(d);
  } else {
    const idx = list.findIndex((x) => x.id === selId);
    if (idx < 0) return { error: t("편집 중인 기기가 없습니다") };
    d.hasPassword = d.password ? true : !!list[idx].hasPassword;
    // 통째 교체가 아니라 병합이다. deviceFormToEntry 는 "바꾸지 않는다"를 **필드를 안 싣는
    // 것**으로 표현하므로(putField), 없는 키는 기존 값이 그대로 살아 있어야 뜻이 맞는다.
    list[idx] = { ...list[idx], ...d };
  }
  return { list, id: d.id, active: activeId || d.id };
}

// 새 기기 id — cam-00N 관례, 이미 있는 번호는 건너뛴다.
export function nextDeviceId(devices) {
  const ids = new Set(devices.map((x) => x.id));
  let n = devices.length + 1, id;
  do { id = "cam-" + String(n).padStart(3, "0"); n++; } while (ids.has(id));
  return id;
}

// 목록 순서 바꾸기 — from<to 면 대상 뒤, from>to 면 대상 앞: 끌어 놓은 그대로.
// 바뀔 일이 없으면 null(호출부가 서버 왕복을 건너뛴다).
export function moveInList(devices, fromId, toId) {
  const list = devices.map((x) => ({ ...x }));
  const from = list.findIndex((x) => x.id === fromId);
  const to = list.findIndex((x) => x.id === toId);
  if (from < 0 || to < 0 || from === to) return null;
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  return list;
}

// ── 표시 문구 ────────────────────────────────────────────────────────────────

// intrinsics 는 네 모양 중 하나다(백엔드 resolveIntrinsics): 없음 · 내장 프리셋 이름(문자열) ·
// 조준 곡선만 담긴 배열(구형식) · 실측 객체. 어느 쪽인지가 곧 "이 값이 어디서 왔나"이므로
// 화면은 그걸 구분해 말해야 한다 — 빌려온 값을 "이 카메라 실측"으로 보여 주면 안 된다.
export function describeIntrinsics(ins) {
  if (!ins) return t("씨앗값 없음");
  if (typeof ins === "string") return t("내장 프리셋") + ` "${ins}"`;
  if (Array.isArray(ins)) return t("조준 곡선만 (구형식)");
  // label 분기는 두지 않는다 — 그 값을 만들던 브라우저측 빌려오기는 사라졌고, 살아 있으면
  // 아래 리비전 분기보다 먼저 걸려 권위 있는 번호 대신 지어낸 옛 문구가 이긴다.
  if (Number.isFinite(ins.profileRevision)) return t("발행본 rev {rev} 적용", { rev: ins.profileRevision });
  if (ins.measuredAt) return t("실측 객체 · 리비전 표기 없음") + ` (${new Date(ins.measuredAt).toLocaleDateString()})`;
  return t("지정됨");
}

// 기기의 "어디에 있나". 접속 대상이 없는 타입(기준기)은 주소 대신 성격을 보여 준다.
// 타입 이름을 하드코딩하지 않는다 — needsHost 는 서버의 기기 타입 표에서 온다.
export function deviceWhere(d, needsHost) {
  return needsHost ? `${d.host || "?"}:${d.port || 80}` : t("기준기 (무카메라)");
}

// ── 설치 높이 (발행본의 extrinsic) ───────────────────────────────────────────

export const HEIGHT_SOURCE_LABEL = {
  manual: "시공 시 현장 실측",
  spec: "도면 · 폴 규격",
  measured: "영상 자동 측정 (보조)",
};

// 발행 여부 판정 — 창구를 두드리기 전의 결정만 떼어 낸다. 반환 kind:
//   skip      빈칸/변화 없음 — 아무 일도 하지 않는다(빈칸은 "지운다"가 아니다. 발행본은
//             지울 수 없고, 높이를 무르는 방법은 새 값을 발행하는 것뿐이다)
//   nan       숫자가 아님 — 발행하지 않았다는 사실을 말한다
//   range     1~30 m 밖 — cm 를 넣는 실수가 가장 흔하므로 왕복 전에 말해 준다
//   publish   확인을 받고 발행한다
export function stageHeight(raw, current) {
  const s = String(raw ?? "").trim();
  if (s === "") return { kind: "skip" };
  const heightM = Number(s);
  if (!Number.isFinite(heightM)) return { kind: "nan" };
  if (current !== null && current !== undefined && Math.abs(heightM - current) < 0.005) return { kind: "skip" };
  if (heightM < 1 || heightM > 30) return { kind: "range", heightM };
  return { kind: "publish", heightM };
}

// ── 검출·판독 탭 payload ─────────────────────────────────────────────────────

// LLM 항목: 주소를 비워 저장하면 해제(백엔드가 llm 블록을 지운다). 타임아웃 빈칸은
// "안 보냄"이어야 보존되므로, 0 이 아니라 필드를 통째로 뺀다.
export function llmConfigOf({ url, model, timeoutRaw }) {
  const t0 = Number(timeoutRaw);
  return {
    url: String(url ?? "").trim(),
    model: String(model ?? "").trim(),
    ...(Number.isFinite(t0) && t0 > 0 ? { timeoutMs: t0 } : {}),
  };
}

// ── API 서버 프로브 판정 ─────────────────────────────────────────────────────

// fetch 실패의 분류 — 원인을 알려주지 않는 TypeError 를 문구로 가른다. 포트로 출처가 갈린
// 이 배포에서는 CORS 가 가장 흔한 원인이므로 문구가 그걸 짚어 줘야 한다.
export function classifyProbeError(e) {
  const reason = String((e && e.message) || e);
  return { ok: false, kind: /abort|timeout|signal/i.test(reason) ? "timeout" : "unreachable", reason };
}

// 프로브 결과 → 상태줄 문구. 뷰와 분리해 두는 이유: 다섯 갈래의 원인-문구 짝이 이 화면의
// 진단 가치 그 자체라(혼합 콘텐츠는 CORS 를 고쳐도 안 풀린다), 테스트가 짝을 지켜야 한다.
export function probeReportText(v, r) {
  if (r.ok) {
    return `${t("연결됨")}: backend v${r.version}` + (r.upstream ? ` · upstream ${r.upstream}` : "");
  }
  if (r.kind === "mixed-content") {
    // 원인을 단정해서 말한다 — 이 경우만은 추측이 아니다.
    return `${t("브라우저가 요청을 막았습니다")} — `
      + `${t("이 페이지는 https 라 http 주소를 부를 수 없습니다(혼합 콘텐츠). https 주소를 쓰거나 UI 를 같은 http 출처에서 여세요")}`;
  }
  if (r.kind === "timeout") return `${t("응답 없음")} — ${t("백엔드가 떠 있는지, 주소·포트가 맞는지 확인하세요")} (${r.reason})`;
  if (r.kind === "unreachable") return `${t("연결 실패")} — ${t("출처가 다르면 백엔드가 이 주소를 CORS 로 허용해야 합니다")} (${r.reason})`;
  return `${v} ${t("는 baro backend 로 응답하지 않습니다")} (${r.reason})`;
}
