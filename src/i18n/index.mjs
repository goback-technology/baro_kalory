// Tiny i18n, keyed by the KOREAN source string (the app's original language) — so a screen
// written in Korean needs no extra markup: wrap the literal in t() and it is already keyed.
// Paragraphs that carry inline markup (<b> inside a sentence) live in HTML{} and are pulled
// by key with i18nHtml(), because splitting them into fragments breaks word order in other
// languages.
//
//   import { initI18n, setLang, getLang, t, i18nHtml } from "../i18n/index.mjs";
//   initI18n();                                   // <html lang> + document.title
//   <span>{t("대기 중")}</span>                     // every string, static or dynamic
//   <p dangerouslySetInnerHTML={{ __html: i18nHtml("height.normalRefusal") }} />
//
// There is no DOM walker. Screens are drawn by React, and a walker that edits text nodes
// from outside fights the next render (and edits nodes React owns). Changing the language
// re-renders the tree; t() is then called with the new language in place.
//
// 사전(DICT·HTML)은 ./dict.mjs 에 있다 — 900줄짜리 데이터라 규칙과 같은 파일에 두지 않는다.
import { DICT, HTML } from "./dict.mjs";

const LANGS = ["ko", "en", "vi"];
const STORE_KEY = "baro_lang";
const TITLE_KEY = typeof document === "undefined" ? "Baro Calory · CCTV 제어" : document.title;
function detectLang() {
  // 브라우저 밖(노드 테스트·빌드 도구)에서는 **기계의 로케일을 따라가지 않는다.**
  // node 24 부터 navigator.language 가 있어서, 같은 코드가 개발기(ko-KR)에서는 한국어를,
  // CI 러너(en-US)에서는 영어를 냈다 — t() 의 출력을 문는 테스트가 기계마다 다른 답을
  // 물게 되고, 2026-08-25 실제로 로컬 초록·CI 빨강이 났다. 이 제품의 기준 언어는 한국어다.
  try {
    if (typeof process !== "undefined" && process.versions && process.versions.node) return "ko";
  } catch { /* 브라우저 */ }
  const n = (navigator.language || "").toLowerCase();
  if (n.startsWith("vi")) return "vi";
  if (n.startsWith("en")) return "en";
  return "ko";
}

let lang = (() => {
  try { const s = localStorage.getItem(STORE_KEY); if (LANGS.includes(s)) return s; } catch {}
  return detectLang();
})();

export function getLang() { return lang; }
export function languages() { return LANGS.slice(); }

// Translate a trimmed ko key. Returns ko itself when lang is ko or no entry exists.
function tr(ko) {
  if (lang === "ko") return ko;
  const e = DICT[ko];
  return e && e[lang] != null ? e[lang] : ko;
}

// Public: translate a (possibly space-padded) dynamic string, preserving surrounding
// whitespace. Supports {name} placeholders: t("점 {n}개", { n: 3 }). The ko key itself is
// the ko-language template, so params are substituted in every language (including ko).
export function t(s, params) {
  if (s == null) return s;
  const str = String(s);
  const core = str.trim();
  if (!core) return s;
  const lead = str.match(/^\s*/)[0];
  const trail = str.match(/\s*$/)[0];
  const e = DICT[core];
  let out = (lang === "ko" || !e || e[lang] == null) ? core : e[lang];
  if (params) out = out.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
  return lead + out + trail;
}

/**
 * 인라인 마크업이 든 문단 — 키로 부르고 innerHTML 로 심는다(`dangerouslySetInnerHTML`).
 *
 * 여기만 문자열이 아니라 마크업인 이유는 문장 안에 `<b>` 가 박혀 있기 때문이다. 조각으로
 * 쪼개 t() 로 잇는 방법도 있지만, 그러면 어순이 다른 언어에서 문장이 무너진다.
 */
export function i18nHtml(key) {
  const e = HTML[key];
  if (!e) return "";
  return e[lang] != null ? e[lang] : e.ko;
}

// ── 문서 수준 상태: 제목과 <html lang> ─────────────────────────────────────────
//
// **DOM 워커(applyI18n)는 없다.** 텍스트 노드를 찾아다니며 고치던 그 함수는 화면이 정적
// HTML 이던 시절의 것이고, 지금은 화면 전부를 React 가 그린다 — 워커가 고쳐 놓은 텍스트를
// 다음 렌더가 되돌리고, React 가 소유한 노드를 밖에서 갈아 끼우는 일 자체가 위험하다.
// 언어가 바뀌면 셸이 상태를 갈아 트리를 다시 그리고, 그때 t() 가 제 값으로 불린다.
export function setLang(l) {
  if (!LANGS.includes(l)) return;
  lang = l;
  try { localStorage.setItem(STORE_KEY, l); } catch {}
  document.documentElement.lang = l;
  document.title = tr(TITLE_KEY);
  // 명령형 위젯(프리뷰 모드 버튼 같은 것)은 React 트리 밖이라 이 신호로 제 문구를 고친다.
  window.dispatchEvent(new CustomEvent("langchange", { detail: l }));
}

export function initI18n() {
  document.documentElement.lang = lang;
  document.title = tr(TITLE_KEY);
}
