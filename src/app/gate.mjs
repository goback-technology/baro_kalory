// 백엔드 미연결 게이트의 **판정**만. 그리는 일은 backend-gate.jsx 가 한다.
//
// 왜 게이트가 있나 — 예전에는 같은 마운트에 백엔드가 있다고 추측하고 그대로 진행해서,
// 분리 배포에서는 첫 화면이 이유 없이 비어 보였다. 추측하지 말고 확인한 뒤 안내한다.
import { mixedContentBlocked } from "../api.mjs";
import { t } from "../i18n/index.mjs";

// 셋을 가른다: 주소 미설정 / 부를 수 없음(혼합 콘텐츠) / 불렀는데 응답 없음.
// 가운데가 빠져 있던 동안에는 "주소는 맞는데 응답이 없습니다" 로 뭉개져서, 멀쩡히 200 을
// 내는 백엔드를 두고 주소·포트를 의심하게 만들었다 — 실제로는 요청이 나가지도 않았다.
export function gateKind({ explicit, base, protocol, failed }) {
  if (!explicit) return "unset";
  if (mixedContentBlocked(base, protocol)) return "blocked";
  return failed ? "down" : "ok";
}

export function gateText(kind) {
  if (kind === "unset") {
    return {
      headline: t("백엔드 API 주소가 설정되지 않았습니다"),
      guide: t("이 화면은 UI 뿐입니다. 설정에서 백엔드 주소를 먼저 지정하세요."),
    };
  }
  if (kind === "blocked") {
    return {
      headline: t("이 페이지에서는 백엔드를 부를 수 없습니다"),
      guide: t("이 페이지는 https 인데 백엔드 주소가 http 라 브라우저가 요청을 막습니다(혼합 콘텐츠). 백엔드 CORS 설정과는 무관합니다 — https 주소를 쓰거나 UI 를 같은 http 출처에서 여세요."),
    };
  }
  return {
    headline: t("백엔드에 연결할 수 없습니다"),
    guide: t("주소는 맞는데 응답이 없습니다 — 백엔드가 떠 있는지, 주소·포트가 맞는지 확인하세요."),
  };
}

// 응답이 왔어도 baro 백엔드가 아니면 실패로 본다. 엉뚱한 서버의 200(캐치올 프록시·기본
// 페이지)을 연결로 오인하면 화면이 열린 채 전 기능이 조용히 죽는다 — 사용자에게는
// "다 되는데 아무것도 안 된다" 로 보이는 최악의 상태다.
export function backendVersionOf(json) {
  if (!json || typeof json !== "object") return null;
  const v = json.backendVersion || json.version;
  return typeof v === "string" && v ? v : null;
}

// 백엔드 없이 열 수 있는 화면. 대문은 정적 카드뿐이고, 설정은 **주소를 정하는 곳**이다.
// 나머지는 열어 봐야 할 수 있는 일이 없다. 설정을 빼먹으면 벽돌에서 벗어날 길이 사라진다.
export function openWithoutBackend(pageId) {
  return pageId === "home" || pageId === "settings";
}
