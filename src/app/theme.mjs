// 테마 교체 — 토큰 오버라이드(tailwind.css 의 :root[data-theme="…"])를 <html> 에 적용하고
// localStorage 로 지속한다. 컴포넌트가 전부 var(--color-*) 토큰을 참조하므로 data-theme 하나만
// 바꾸면 전 페이지가 런타임(무빌드)으로 교체된다. 새 테마 추가 = tailwind.css 에 블록 하나 +
// 아래 THEMES 에 한 줄.
const KEY = "baro-theme";
const DEFAULT = "terminal";

export const THEMES = [
  { id: "terminal", label: "green" },   // 기본(@theme): phosphor green CRT
  { id: "amber", label: "amber" },      // 대체: 앰버 모노크롬 CRT
];

export function getTheme() {
  try { return localStorage.getItem(KEY) || DEFAULT; } catch { return DEFAULT; }
}

export function setTheme(name) {
  const id = THEMES.some((t) => t.id === name) ? name : DEFAULT;
  document.documentElement.dataset.theme = id;
  try { localStorage.setItem(KEY, id); } catch { /* 무시 */ }
  return id;
}

// 페이지 로드시 1회 호출. data-role="theme" <select> 가 있으면 옵션을 채우고 배선한다.
export function initTheme() {
  const cur = setTheme(getTheme());
  const sel = document.querySelector('[data-role="theme"]');
  if (sel) {
    if (!sel.options.length) {
      for (const t of THEMES) { const o = document.createElement("option"); o.value = t.id; o.textContent = t.label; sel.appendChild(o); }
    }
    sel.value = cur;
    sel.addEventListener("change", () => setTheme(sel.value));
  }
}
