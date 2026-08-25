// 캘리브레이션 화면의 **비-DOM 로직** — 계약 해석과 문장 조립만 있고 화면이 없다.
// React 전환(2026-08-22)에서 인라인 스크립트로부터 분리했다: 이 층은 node 로 직접
// 테스트할 수 있고, 뷰 계층이 무엇이든 그대로 산다.
import { getJson, postJson, api } from "../../lib/api.mjs";
import { t } from "../../i18n/index.mjs";
import { fmtWhen } from "../../lib/format.mjs";

// 백엔드 0.17.0 부터 드라이버가 광학을 **읽는 시점에** 해결한다 — 발행하면 다음 조준이 새
// 문서를 본다. 재시작도 재선택도 없다. 그 이전 백엔드는 부팅과 기기 재선택 때만 읽으므로 같은
// 기기를 다시 골라야 했고, 거기서는 **force 가 필수다** — 없으면 `{unchanged:true}` 로 튕기고
// 광학이 옛 상태로 남는다(2026-08-18 실측. 이 함정 때문에 재시작이 유일한 길처럼 보였다).
//
// **버전으로 갈래를 고르지 않고 응답을 읽는다.** 백엔드가 `reload` 로 「더 할 일이 있는가」를
// 스스로 답한다(0.16.6+). 두 계약이 동시에 살아 있고, 0.16.x 가 사라지면 옛 갈래는 저절로 죽는다.
//
// 0.17.0 에서 재선택은 불필요할 뿐 아니라 **해롭다** — 기기 컨텍스트를 다시 지으면서 스윕
// 결과를 쥔 캘리브레이션 매니저가 갈아치워진다(같은 스윕으로 두 번째 발행이 막힌다).
export async function applyPublishedToRuntime(id, res) {
  const reload = res && typeof res === "object" ? res.reload : null;
  if (reload && reload.required === false) {
    // 핀(고정)이 생기면 「할 일 없음」과 「조준이 바뀌었음」이 갈라진다(baro_memo #73).
    // 그때를 위해 applied 를 따로 읽는다 — 필드가 없으면 지금처럼 적용된 것이다.
    return { applied: reload.applied !== false, how: "read-time", note: reload.note || "" };
  }
  if (!id) return { applied: false, how: "failed", note: "" };
  try {
    await postJson(api("/cctv/active"), { id, force: true });
    return { applied: true, how: "reselect", note: "" };
  } catch {
    // 발행은 이미 성공했다 — 적재에 실패했다고 그 사실까지 실패로 말하면 안 된다.
    return { applied: false, how: "failed", note: "" };
  }
}

// 발행 뒤 적재까지 한 문장으로 말한다. 왜 그런지는 백엔드가 말한 것을 그대로 옮긴다 —
// 우리가 지어내면 백엔드가 바뀔 때마다 화면이 조용히 거짓말을 시작한다.
export function appliedSuffix(state) {
  const s = state && typeof state === "object"
    ? state
    : { applied: !!state, how: state ? "reselect" : "failed", note: "" };
  if (s.applied) {
    return s.how === "read-time"
      ? t(" — 발행 즉시 적용됐습니다. 재시작도 카메라 재선택도 필요 없습니다.")
      : t(" — 지금 이 카메라에 적용됐습니다.");
  }
  // 발행은 됐는데 조준이 안 바뀐 경우다. 이유는 백엔드만 안다 — 있으면 그대로 보여 준다.
  return s.how === "read-time"
    ? t(" — 다만 조준은 아직 이 곡선으로 바뀌지 않았습니다.") + (s.note ? " " + s.note : "")
    : t(" — 다만 런타임 적재에 실패했습니다. 헤더에서 카메라를 다시 고르면 적용됩니다.");
}

// 퇴역은 적재의 반대라 적용 경로를 쓸 수 없다. 그리고 언제 씨앗값으로 돌아가는지는 백엔드가
// 광학을 **언제 읽느냐**에 달려 있다 — 계약마다 다르다. 예측하는 갈래를 만드는 대신 **물어본다.**
//
// 다만 한 칸(declared)만 읽으면 안 된다 — declared 는 「발행본이 적재됨」과 「씨앗값이 광학을
// 제공함」을 구분하지 못해서, 씨앗값 있는 기기는 퇴역 직후에도 true 다. 그 판정이 「아직 옛
// 곡선을 씁니다」라는 거짓말을 만들었다(2026-08-19 ref-ptz 실측 — 실제로는 이미 씨앗값 13점으로
// 내려앉아 있었다). 그래서 퇴역 **전후를 비교**한다: 광학이 달라졌으면 내려앉은 것, 그대로면
// 아직 옛 곡선. 어느 필드 하나의 의미에도 기대지 않는 판정이다.
export async function opticsSnapshot() {
  try { return ((await getJson(api("/help?format=json"))).live || {}).optics || null; }
  catch { return null; }
}

export function opticsSig(o) {
  return o ? JSON.stringify({ d: !!o.declared, p: o.points ?? null, r: o.hfovRangeDeg ?? null }) : null;
}

export function retireEffect(before, after) {
  if (!after) return t("광학 상태를 다시 읽지는 못했습니다 — 위 상태 줄을 확인하세요.");
  // 0.18.0 부터 런타임이 방금 읽은 광학의 출처를 스스로 말한다(source) — 있으면 추론(전후
  // 비교)은 그 앞에서 물러난다. reload.required 와 같은 패턴: 백엔드의 답이 이기고,
  // 옛 추론은 옛 백엔드에서만 산다.
  if (typeof after.source === "string") {
    if (after.source === "seed") return t("이 카메라는 지금 config 씨앗값으로 조준합니다.");
    if (after.source === "none") return t("이 카메라는 지금 보정 없이 조준합니다 — 씨앗값도 없습니다.");
    return t("돌고 있는 카메라는 아직 발행 곡선을 씁니다 — 카메라를 다시 고르거나 백엔드를 재시작하면 씨앗값으로 돌아갑니다.");
  }
  if (after.declared === false) return t("이 카메라는 지금 보정 없이 조준합니다 — 씨앗값도 없습니다.");
  if (before && opticsSig(before) !== opticsSig(after)) return t("이 카메라는 지금 config 씨앗값으로 조준합니다.");
  // 광학이 그대로다 — 옛 계약(부팅·재선택 때만 읽는 백엔드)이 옛 곡선을 물고 있는 경우다.
  // 씨앗값이 우연히 같은 숫자일 수도 있지만, 그때도 조준 값은 같으니 이 문장은 틀리지 않는다.
  return t("돌고 있는 카메라는 아직 지금 곡선을 씁니다 — 카메라를 다시 고르거나 백엔드를 재시작하면 씨앗값으로 돌아갑니다.");
}

// ── 리비전 출처 라벨 ─────────────────────────────────────────────────────────
const PROV_LABEL = { sweep: "실측", import: "수입", copy: "복사" };

export function provText(p) {
  // 출처를 **모르는** 문서를 "실측"이라 부르면 안 된다 — 그건 provenance 가 막으려던 바로 그
  // 거짓말이다(재지 않은 값이 실측처럼 보이면 없느니만 못하다). 모르면 모른다고 한다.
  if (!p || typeof p !== "object" || !p.method) return t("출처 미상");
  const base = PROV_LABEL[p.method] ? t(PROV_LABEL[p.method]) : p.method;
  if (p.method === "copy" && p.from) return `${base} ← ${p.from.profileId} rev ${p.from.revision}`;
  return base;
}

// ── 설치 상태 문장 — loadCalibInstalled 의 판정부 ─────────────────────────────
// **판정의 출처는 런타임이다.** 예전에는 config 의 devices[].intrinsics 를 보고 답했는데,
// 백엔드 0.16.3 부터 발행(mint·copy·import)은 config 에 아무것도 쓰지 않는다 — intrinsics 는
// 이제 스윕의 줌 앵커를 잡아 주는 **씨앗값**일 뿐이다. 그래서 config 만 보면 20분 스윕이
// 성공해 실제로 적용된 카메라를 두고도 「캘리브레이션이 없습니다」라고 거짓말을 한다
// (2026-08-18 실제로 그랬다). 서버가 매 요청 계산해 주는 live.optics 가 정본이다.
//
// 반환은 [{text, strong?}] 조각 목록이다 — 서버 문자열(label 등)이 마크업으로 해석되지 않게
// 뷰가 텍스트로만 그린다. kind 는 상태 식별용(테스트가 문다).
export function installedLine({ optics, hasProfile, ins }) {
  const opticsDesc = optics
    ? [
        Number.isFinite(optics.points) ? `${optics.points}점` : null,
        Array.isArray(optics.hfovRangeDeg) && optics.hfovRangeDeg.length === 2
          ? `화각 ${Number(optics.hfovRangeDeg[0]).toFixed(2)}°~${Number(optics.hfovRangeDeg[1]).toFixed(2)}°` : null,
      ].filter(Boolean).join(" · ")
    : "";
  const desc = opticsDesc ? ` (${opticsDesc})` : "";
  const frag = (kind, parts) => ({ kind, parts });
  const T = (text) => ({ text });
  const B = (text) => ({ text, strong: true });

  // 0.18.0 부터 런타임이 방금 읽은 광학의 **출처**를 스스로 말한다(source·revision·
  // following·detached, 보드 #73) — 존재 재조회(hasProfile)와 declared 추론은 그 앞에서
  // 물러나 옛 백엔드에서만 산다. reload.required 와 같은 퇴역 패턴이다.
  if (optics && optics.detached === true) {
    // 일부러 뗀 상태 — 비교 시연 중일 가능성이 높다. 고장 경고를 칠하지 않는다.
    return frag("detached", [T("현재 "), B("적용 해제됨"),
      T(` — ${optics.source === "seed" ? "config 씨앗값으로" : "보정 없이"} 조준 중입니다(적용 전/후 비교 상태). 발행본은 그대로 있고, 아래 「다시 적용」으로 복귀합니다.`)]);
  }
  if (optics && optics.source === "published") {
    return frag("published", [T("현재 "), B(`발행본 rev ${Number(optics.revision)}`),
      T(` 이 적용돼 있습니다${desc} — `),
      ...(optics.following === false
        ? [T("이 리비전에 "), B("고정"), T("됨(새 발행이 실리지 않습니다)")]
        : [T("최신 따름")]),
      T(". 출처는 아래 리비전 목록에서 확인하세요.")]);
  }
  if (optics && optics.source === "seed") {
    return frag("seed", [T("현재 "), B("발행본이 없습니다"), T(` — config 씨앗값으로 조준합니다${desc}.`)]);
  }
  // source 필드가 없는 옛 백엔드(≤0.17.x): 아래 추론 경로가 그대로 답한다.
  if (optics && optics.declared && hasProfile !== false) {
    // 지금 이 카메라가 실제로 쓰고 있는 곡선. 점 수와 화각 범위가 곧 "무엇이 적용됐나"다.
    return frag("legacy-published", [T("현재 "), B("발행본이 적용돼 있습니다"),
      T(`${desc}. 출처는 아래 리비전 목록에서 확인하세요.`)]);
  }
  if (optics && optics.declared) {
    // 발행본은 없는데 런타임은 광학을 갖고 있다. 0.17.0 에선 씨앗값이고, 옛 백엔드에서
    // 방금 퇴역시켰다면 재선택 전까지 옛 곡선이 남은 것이다 — 출처를 단정하면 어느 한쪽
    // 계약에서 거짓말이 되므로, 아는 두 경우를 그대로 말한다.
    return frag("legacy-ambiguous", [T("현재 "), B("발행본이 없습니다"),
      T(` — 그래도 런타임에 광학이 있습니다${desc}: config 씨앗값이거나, 방금 삭제한 곡선이 아직 남은 것입니다.`)]);
  }
  if (!ins) {
    return frag("none", [T("현재 이 기기에는 "), B("캘리브레이션이 없습니다"),
      T(" — 클릭 센터링이 보정 없이 동작합니다.")]);
  }
  if (optics && !optics.declared) {
    // 설정에 값은 있는데 런타임이 광학을 모른다 = 그 값은 **씨앗값**이다. 지우면 스윕이
    // 다른 벤더의 줌 눈금으로 넘어가 앵커를 양끝에 몰아 놓고도 rc=0 으로 끝난다
    // (측정된 것처럼 보이는 표가 남는다) — 그러니 "쓰이지 않는 값"이라고 말하면 안 된다.
    return frag("seed-only-config", [T("현재 "), B("적용된 발행본이 없습니다"),
      T(" — 설정의 값은 스윕이 줌 앵커를 잡는 데 쓰는 "), B("씨앗값"),
      T("이라 지우지 마세요. 클릭 센터링은 보정 없이 동작합니다.")]);
  }
  if (typeof ins === "string") {
    return frag("preset", [T("현재 "), B(`내장 프리셋 “${ins}”`),
      T("를 쓰고 있습니다 (다른 카메라에서 실측한 값). 이 개체에 맞는지 "), B("검증"), T("으로 확인하세요.")]);
  }
  if (ins.label) {
    // 빌려온 값이다. measuredAt 이 함께 있어도 그건 **원본 카메라**가 잰 시각이므로,
    // 아래 분기로 흘려보내면 "이 카메라에서 실측한 값"이라고 거짓말을 하게 된다.
    return frag("borrowed", [T("현재 "), B(String(ins.label)),
      T(" 을 쓰고 있습니다 (다른 카메라의 실측값). 이 개체에 맞는지 검증으로 확인하세요.")]);
  }
  if (Number.isFinite(ins.profileRevision)) {
    // 창구를 지나 깔린 값 — 어느 리비전인지가 곧 출처다. 실측인지 복사인지는 아래
    // 리비전 목록이 말한다. measuredAt 만 보고 "이 카메라 실측"이라 하면 복사본에 대해
    // 거짓말이 되므로, 아는 사실(리비전 번호)만 말한다.
    return frag("config-revision", [T("현재 "), B(`발행본 rev ${ins.profileRevision}`),
      T(" 을 쓰고 있습니다. 출처는 아래 리비전 목록에서 확인하세요.")]);
  }
  if (ins.measuredAt) {
    return frag("measured-here", [T("현재 "), B("이 카메라에서 실측한 값"),
      T(`을 쓰고 있습니다 (${fmtWhen(ins.measuredAt)}).`)]);
  }
  return frag("assigned", [T("현재 이 기기에 캘리브레이션이 지정돼 있습니다.")]);
}
