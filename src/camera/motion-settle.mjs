// 표시 영상의 프레임 차분(diff) 시계열에서 "움직임이 보였다가 잠잠해진" 시점을
// 판정하는 I/O 없는 상태기계. 카메라 텔레메트리의 정착(settle)은 실제 카메라 기준이라,
// RTSP→ffmpeg→MJPEG 지연(실측 ~2초)이 있는 프리뷰 화면과는 시점이 어긋난다 —
// 마커류 UI가 "화면에서 보이는 이동"의 종료를 기다리려면 이 판정을 쓴다.
//
// 규칙: diff ≥ high 면 모션 시작. 모션을 본 뒤 diff ≤ low 샘플이 quietSamples 연속이면
// 정착. low~high 사이(정지 직전 꼬리 진동, OSD 시계 갱신 등)는 quiet 연속을 끊는다.
// 기본 임계값은 64×36 그레이 다운샘플의 픽셀당 평균 절대차 기준 실측치
// (유휴 0.1~0.9, OSD 시계 틱 ≤2.4, 팬 피크 34.5).
export function createMotionSettleTracker({ high = 5, low = 3, quietSamples = 3 } = {}) {
  let seenMotion = false;
  let quietRun = 0;
  return {
    // 새 diff 샘플 하나를 반영하고, 이 샘플로 정착이 완성됐으면 true.
    push(diff) {
      const v = Number(diff);
      if (!Number.isFinite(v)) return false;
      if (v >= high) { seenMotion = true; quietRun = 0; return false; }
      if (v > low) { quietRun = 0; return false; }
      if (!seenMotion) return false;
      quietRun += 1;
      return quietRun === quietSamples; // 정착이 '완성되는' 샘플에서만 true
    },
    get seenMotion() { return seenMotion; },
    get settled() { return seenMotion && quietRun >= quietSamples; },
  };
}
