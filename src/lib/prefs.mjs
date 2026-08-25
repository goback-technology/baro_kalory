// 브라우저에 남기는 사용자 선호 — 테마·언어·프리뷰 켬끔·마지막 탭 같은 것.
//
// **localStorage 는 읽기만 해도 던진다.** 사생활 모드나 「사이트 데이터 차단」 설정에서는
// 접근 자체가 SecurityError 다. 그래서 이 저장소를 만지는 곳마다 try/catch 가 붙었고,
// 스물네 자리가 같은 세 줄을 각자 적고 있었다 — 그중 다섯 자리(카메라 프리뷰 위젯)는
// **try 를 빠뜨려서**, 저장소가 막힌 브라우저에서는 위젯 생성이 통째로 실패했다.
//
// 선호는 없어도 되는 값이다. 못 읽으면 기본값, 못 쓰면 조용히 넘긴다 — 저장에 실패했다고
// 화면이 멈추면 그게 더 나쁘다.

export function readPref(key, dflt = null) {
  try {
    const v = localStorage.getItem(key);
    return v ?? dflt;
  } catch {
    return dflt;
  }
}

export function writePref(key, value) {
  try { localStorage.setItem(key, String(value)); } catch { /* 저장소 사용 불가 */ }
}

export function removePref(key) {
  try { localStorage.removeItem(key); } catch { /* 저장소 사용 불가 */ }
}

// 켬/끔 하나를 기억하는 자리가 여러 화면에 있다(프리뷰). 문자열 "on"/"off" 규약을 각자
// 적으면 한쪽이 true/false 를 쓰기 시작하는 순간 저장된 선택이 조용히 무시된다.
export function readFlag(key, dflt = false) {
  if (!key) return dflt;
  const v = readPref(key);
  return v === null ? dflt : v === "on";
}

export function writeFlag(key, on) {
  if (!key) return;
  writePref(key, on ? "on" : "off");
}
