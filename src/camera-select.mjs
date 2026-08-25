// 헤더 CCTV 셀렉터 — 활성 카메라의 확인·전환. cctv/calibration 두 페이지가 공유한다.
//
// 활성 카메라는 서버 전역 상태다(POST /cctv/active). 브라우저 로컬 선호를 도입하면
// "이 페이지가 보는 카메라"와 "실제 스트리밍/캘리브레이션되는 카메라"가 조용히 갈라져
// 캘리브레이션 결과가 엉뚱한 기기에 저장되는 최악의 결함이 되므로, 반드시 서버만 믿는다.
// 그 대가로 다른 창이 전환하면 이쪽 표시가 낡는다 — refreshOnVisible 이 그 완화책이다.
import { api, getJson, postJson } from "./api.mjs";
import { t } from "./i18n/index.mjs";

// beforeChange(previous, next): 서버 활성을 바꾸기 **전에** 이전 카메라를 놓아줄 기회.
//   반드시 await 된다. 이걸 안 하고 활성만 먼저 바꾸면 이전 카메라로 열린 MJPEG 스트림이
//   그대로 남아 유령 시청자가 되고, 그 카메라는 유휴로 풀리지 않는다 — 홈 복귀가 안 되고
//   캡처 예산을 나눠 써 프레임이 급감한다(2026-08-04 실측: 연달아 전환하니 그렇게 됐다).
// onSettled(): 성공·실패와 무관하게 마지막에 불린다(전환 중 표시 해제용).
export function createCameraSelect({ select, onChange, beforeChange, onSettled, log = () => {}, refreshOnVisible = false }) {
  let cameras = [];
  let activeId = null;
  let enabled = true;         // setEnabled(false) 중엔 목록이 2대 이상이어도 잠근다

  function applyDisabled() {
    select.disabled = !enabled || cameras.length < 2;
  }

  function sync(list, active) {
    // 등록이 관문이다(2026-08-17 규정). 씬 카메라도 현실 어딘가에 설치된 카메라이고,
    // registered:false 는 아직 로스터에 기록되지 않았다는 뜻이다 — 그 카메라가 관제 셀렉터에
    // 서는 것 자체가 위반이며, 여기서 고르는 행위가 곧 영구 등록이 되는 부작용까지 있다.
    // 씬 카메라를 보는 곳은 시뮬레이터 화면이고, 등록은 설정 화면의 몫이다. 표식이 없는
    // 항목은 등록으로 취급한다(구 백엔드 호환). 단 서버가 active 로 지목한 기기는 등록
    // 여부와 무관하게 남긴다 — 실제로 몰고 있는 카메라를 숨기고 딴 것을 활성이라 말하는
    // 쪽이 더 나쁘다(아래 활성 판정과 같은 원칙).
    const roster = Array.isArray(list) ? list : [];
    cameras = roster.filter((d) => d.registered !== false || d.id === active).map((d) => ({ ...d }));
    // 활성이 목록에 없으면 접어서 딴 카메라를 활성이라 말하지 않는다 — 서버가 몰고 있는
    // 카메라는 서버(/cctv/devices)가 목록에 반드시 실어 보내므로, 여기 오는 것은 그 사실이다.
    activeId = cameras.some((d) => d.id === active) ? active : cameras[0]?.id || null;
    select.replaceChildren();
    if (!cameras.length) {
      select.appendChild(new Option(t("등록된 CCTV 없음"), ""));
      select.disabled = true;
      return;
    }
    // 남은(등록된) 카메라 목록은 **하나다.** 실기든 시뮬(mode:sim)이든 같은 줄에 같은
    // 모양으로 선다 — 어디에 기록돼 있는지는 백엔드의 내부 사정이고, 화면 구조로 새어
    // 나오면 안 된다. 등록 여부는 그 내부 사정이 아니라 관문이다(위 필터).
    for (const d of cameras) {
      select.appendChild(new Option(d.name || d.id, d.id));
    }
    select.value = activeId;
    applyDisabled();
  }

  async function load() {
    try {
      // 단 하나의 목록, 단 하나의 요청. 병합(등록 기기 + 씬에 세워진 카메라)과 활성 판정
      // (지금 몰고 있는 카메라 — config 의 접힌 active 가 아니라 런타임의 사실)은 전부
      // 서버가 끝내서 보낸다. 화면이 두 목록을 다시 합치면 그 봉합선이 반드시 보인다.
      const roster = await getJson(api("/cctv/devices"));
      sync(roster.list || [], roster.active || null);
    } catch (error) {
      select.replaceChildren(new Option(t("CCTV 로드 실패"), ""));
      select.disabled = true;
      select.title = t("CCTV 목록을 불러오지 못했습니다") + `: ${error.message}`;
    }
  }

  async function onSelectChange(event) {
    const id = event.target.value;
    const previous = activeId;
    if (!id || id === previous) return;
    select.disabled = true;
    try {
      // 놓아주기가 먼저다 — 순서를 바꾸면 이전 카메라가 점유된 채 남는다(위 주석 참조).
      // 전환이 실패해도 이미 놓아준 상태로 남는데, 그쪽이 안전한 방향이다(점유 유지보다 낫다).
      if (beforeChange) await beforeChange(previous, id);
      await postJson(api("/cctv/active"), { id });
      activeId = id;
      if (onChange) await onChange(id, previous);
      log(t("CCTV 전환: {id}", { id }));
    } catch (error) {
      select.value = previous || "";
      log(t("CCTV 전환 실패") + `: ${error.message}`);
    } finally {
      applyDisabled();
      if (onSettled) onSettled();
    }
  }
  select.addEventListener("change", onSelectChange);

  // 다른 창/페이지가 활성 카메라를 바꾼 뒤 이 탭으로 돌아오면 표시가 낡아 있다 —
  // "헤더엔 A 라고 쓰여 있는데 화면은 B" 를 막기 위해 보일 때마다 서버 상태를 재조회.
  function onVisibilityChange() {
    if (document.visibilityState === "visible") load();
  }
  if (refreshOnVisible) document.addEventListener("visibilitychange", onVisibilityChange);

  // 위젯을 버린다. document 에 건 재조회 리스너는 이 위젯보다 오래 사는 대상에 걸린
  // 것이라, 떼지 않으면 버린 인스턴스가 탭 복귀마다 목록을 다시 불러온다 — 화면 전환이
  // 페이지 로드 없이 일어나면(SPA) 왕복 횟수만큼 같은 요청이 겹쳐 나간다.
  function destroy() {
    select.removeEventListener("change", onSelectChange);
    if (refreshOnVisible) document.removeEventListener("visibilitychange", onVisibilityChange);
  }

  return {
    load,
    sync,
    destroy,
    list: () => cameras,
    activeId: () => activeId,
    setEnabled(on) { enabled = !!on; applyDisabled(); },
    el: select,
  };
}
