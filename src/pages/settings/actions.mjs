// 설정 화면의 판정·페이로드 로직 — DOM 없이 성립하는 부분 전부. React 전환(plan §2 계약 셋)
// 에서 뷰와 분리해 node 테스트를 붙인다. 인라인 <script> 시절 이 규칙들은 전부 DOM 읽기와
// 섞여 있어 그물이 HTML 정규식뿐이었다.
//
// 이 파일이 드는 계약의 핵심은 **빈칸의 세 갈래 뜻**이다(plan §0 보존 계약):
//   ① 기기 필드: 원래 있던 필드만 "" 로 제거 신호 — 화면이 보지도 못한 값을 빈칸이라는
//      이유로 지우면 안 된다(putField).
//   ② 가상 PTZ: 끄면 "" 를 보내 제거 — 백엔드가 그렇게 읽는다.
//   ③ LLM 타임아웃: 빈칸은 0 이 아니라 **필드를 통째로 뺀다** — 보내면 보존이 깨진다.
import { t } from "../../i18n/index.mjs";

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

// ── 프로브 결과 문구 ─────────────────────────────────────────────────────────
//
// 인라인 시절 이 결과들은 innerHTML 로 붙었다(`<b>${r.model}</b>`). 값이 상류에서 오므로
// 그 자체가 위험하고, 무엇보다 **테스트가 물 수 없는 형태**였다. 텍스트를 돌려주고 강조가
// 필요한 자리는 조각으로 넘긴다 — 캘리브레이션 화면의 installedLine 과 같은 규칙이다.

export function probeCameraText(r) {
  if (!r || !r.reachable) {
    return { ok: false, parts: [{ text: t("❌ 응답 없음") + ": " + ((r && r.error) || "unreachable") }], note: null };
  }
  // 모델명은 강조해서 읽는다 — 이 프로브의 값어치가 「무엇이 붙어 있나」라서, 그 한 낱말이
  // 나머지 문장보다 먼저 눈에 들어와야 한다. 문장은 번역을 지나야 하므로, 자리표시자를
  // 본문에 없는 글자로 채운 뒤 그 자리에서 자른다.
  const MARK = String.fromCharCode(1);
  const line = t("✅ 응답 · 모델 {model} · FW {fw}", { model: MARK, fw: r.firmware || "?" });
  const [head, tail = ""] = line.split(MARK);
  const parts = [{ text: head }, { text: r.model || "?", strong: true }, { text: tail }];
  if (r.ptz) parts.push({ text: ` · PTZ ${r.ptz.panpos}/${r.ptz.tiltpos}/${r.ptz.zoompos}` });
  return {
    ok: true,
    parts,
    // 이 프로브는 Hucoms CGI 를 평문 HTTP 로 두드린다 — 실제 드라이버가 쓰는 스킴·인증과
    // 다르다. "응답"만 보고 화면도 나올 거라 읽으면 틀린다(IDIS 실기에서 그대로 겪었다:
    // 테스트는 통과하는데 스냅샷은 평문 포트에 TLS 를 걸어 전부 실패). 통과했을 때만
    // 덧붙인다 — 실패했을 때는 오해할 여지가 없다.
    note: t("Hucoms CGI 를 평문 HTTP 로 확인한 결과입니다 — 다른 규약의 기기는 이 결과와 무관하게 스킴·RTSP 경로가 맞아야 화면이 나옵니다."),
  };
}

export function probeDetectorText(r) {
  const d = r && r.detector;
  return d && d.reachable ? t("✅ 응답 (status {s})", { s: d.status }) : `❌ ${(d && d.error) || "unreachable"}`;
}

export function probeLprText(r) {
  const l = r && r.lpr;
  return l && l.reachable ? t("✅ 응답 (status {s})", { s: l.status }) : `❌ ${(l && l.error) || "unreachable"}`;
}

export function probeLlmText(r) {
  const models = (r && r.models) || [];
  const resolved = models.filter((m) => m.resolvedModel).map((m) => `${m.id} → ${m.resolvedModel}`);
  return t("✅ 응답 · 별칭 {n}개", { n: models.length })
    + (r.ready === false ? ` · ${t("아직 추론 준비 안 됨")}${r.readyDetail ? ` (${r.readyDetail})` : ""}` : "")
    + (resolved.length ? ` · ${resolved.join(" · ")}` : "");
}

export function runLlmText(r) {
  if (!r || !r.ok) return "❌ " + ((r && r.error) || t("실패")) + (r && r.status ? ` (HTTP ${r.status})` : "");
  // 정답 여부는 **경고이지 실패가 아니다** — 여기서 재는 것은 모델의 실력이 아니라 이미지가
  // 모델에 닿는가다. 다만 틀렸다면 그 사실을 말해야 다음 의심처가 생긴다.
  return t("✅ 응답 {ms}ms · 스키마 준수", { ms: r.latencyMs })
    + (r.resolvedModel ? ` · ${r.resolvedModel}` : "")
    + (r.correct ? "" : ` · ⚠ ${t("판독이 틀렸습니다 — 이미지가 모델에 제대로 닿지 않을 수 있습니다")} (${r.answer})`);
}

// ── 편집 폼의 안내 문구 ──────────────────────────────────────────────────────

// 기기 타입 표에서 needsHost 를 읽는다. 타입 이름을 하드코딩하지 않는다 — 표는 서버가 준다.
export function needsHostOf(devTypes, type) {
  const meta = (devTypes || []).find((dt) => dt.type === type);
  return meta ? meta.needsHost : true;
}

// 용도는 화면 하나를 통째로 가른다 — 시뮬레이터 페이지의 카메라 목록은 이 값으로 고른다.
export function modeHintText(mode) {
  return mode === "sim"
    ? t("시뮬레이터 페이지의 카메라 목록에 나타납니다.")
    : t("시뮬레이터 페이지에는 나타나지 않습니다.");
}

// 씨앗값 셀렉트의 안내. 이 칸은 **씨앗값**을 편집한다 — 지금 조준에 쓰이는 곡선이 아니다.
// 반환에 warn 이 붙는 이유: 「지운다」만 경고색이어야 한다.
export function calibHintText(value, ins) {
  if (value === "") {
    // 지우면 조용히 망가진다 — 벤더마다 줌 눈금이 달라서(IDIS 는 배율 ×100, 100..1200)
    // 씨앗값이 없으면 스윕이 남의 눈금으로 앵커를 양끝에 몰아 놓고도 **성공으로 끝난다.**
    // 측정된 것처럼 보이는 표가 남으므로, 사람이 나중에 알아챌 방법이 없다.
    return { warn: true, text: t("씨앗값을 지웁니다 — 지금 조준에 쓰는 곡선(발행본)은 그대로입니다. 다만 이 값은 스윕이 줌 앵커를 잡는 기준이라, 지우면 벤더에 따라 다음 캘리브레이션이 엉뚱한 줌 눈금으로 돌고도 성공으로 끝납니다(측정된 것처럼 보이는 표가 남습니다). 값이 있다면 「유지」를 고르세요.") };
  }
  if (value === "__keep") {
    return { warn: false, text: t("지금 씨앗값을 그대로 둡니다") + " — " + describeIntrinsics(ins) };
  }
  return { warn: false, text: t("다른 카메라의 실측값을 이 기기의 새 리비전으로 발행합니다 — 캘리브레이션은 개체마다 다르므로, 발행한 뒤 '검증'을 돌려 이 개체에 맞는지 확인하세요.") };
}

// 씨앗값 셀렉트의 항목들. 자기 자신은 대상이 아니다 — 같은 기기로의 복사는 곡선이 그대로인
// 리비전만 하나 더 만들고, 발행본은 지울 수 없으므로 그 한 번이 이력에 영구히 남는다.
export function calibOptions(profiles, ins, selId) {
  const out = [{ value: "", label: t("씨앗값 없음") }];
  // 지금 들고 있는 값은 목록에 없을 수 있다(내장 프리셋 이름이거나 이 카메라의 실측 객체).
  // 그래서 "건드리지 않는다"를 언제나 고를 수 있게 둔다 — 고르면 저장이 그 필드를 아예 안
  // 보내고 백엔드가 기존 값을 보존한다.
  if (ins) out.push({ value: "__keep", label: t("유지") + " — " + describeIntrinsics(ins) });
  for (const p of profiles || []) {
    if (p.profileId === selId) continue;
    out.push({ value: `profile:${p.profileId}`, label: `${p.profileId} rev ${p.revision} ` + t("의 실측값 빌리기") });
  }
  return out;
}

// 설치 높이 안내 — 발행본에서 읽은 값을 말로 바꾼다. 404 는 장애가 아니라 「아직 없다」는
// 정상 상태다: 높이는 곡선 위에 얹히는 값이라(백엔드가 그렇게 거절한다) 넣을 것이 없다.
export function heightHintText({ known, revision, source, error, notSaved }) {
  if (notSaved) return t("기기를 저장한 뒤에 넣을 수 있습니다.");
  if (error) {
    return error.status === 404
      ? t("발행된 프로파일이 없습니다 — 캘리브레이션을 먼저 발행해야 높이를 얹을 수 있습니다.")
      : t("설치 높이를 읽지 못했습니다") + ": " + (error.message || error);
  }
  return known
    ? t("발행본 rev {rev} · {src}", { rev: revision, src: t(HEIGHT_SOURCE_LABEL[source] || source || "출처 없음") })
    : t("아직 없습니다 — 시공 때 잰 값을 넣으면 저장할 때 새 리비전으로 발행됩니다.");
}

// API 키 등록 여부 한 줄. 값 자체는 서버가 절대 돌려주지 않는다 — 등록 여부와 끝 몇 자뿐이다.
export function keyHintText(apikey) {
  const ak = apikey || {}, ah = ak.anthropic || {}, oh = ak.openai || {};
  const one = (h) => (h.set ? t("등록됨") + " ···" + (h.hint || "") : t("미등록"));
  return `Anthropic: ${one(ah)} · OpenAI: ${one(oh)}`;
}
