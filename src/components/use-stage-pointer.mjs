// 영상 위의 클릭·끌기. 클릭은 그 지점을 가운데로(센터링), 끌기는 그 상자로 줌인(박스줌).
//
// 이 배선이 두 화면(제어·시뮬레이터)에 복붙돼 있었고, 시뮬레이터 쪽 주석은 스스로를
// 「제어 페이지 로직 이관」이라 부른다. 좌표 계산과 손떨림 판정은 actions 가 값으로 들고,
// 여기서는 이벤트 수명만 잇는다 — mouseup 은 **window** 에 걸어야 한다. 영상 밖에서 손을
// 떼는 일이 흔하고, 그때 끌기가 끝나지 않으면 러버밴드가 화면에 남는다.
import { useCallback, useEffect, useRef, useState } from "react";
import { framePoint, isDrag, boxOf } from "../pages/cctv/actions.mjs";

export function useStagePointer({ imgRef, onClick, onBox, enabled = true }) {
  const start = useRef(null);
  const [rubber, setRubber] = useState(null);   // { left, top, width, height } | null

  const pointOf = useCallback((e) => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return framePoint({
      clientX: e.clientX, clientY: e.clientY, rect,
      naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
    });
  }, [imgRef]);

  const onMouseDown = useCallback((e) => {
    if (!enabled || e.button !== 0) return;
    start.current = pointOf(e);
  }, [enabled, pointOf]);

  const onMouseMove = useCallback((e) => {
    if (!start.current) return;
    const p = pointOf(e);
    if (!p) return;
    const a = start.current;
    setRubber({
      left: Math.min(a.px, p.px), top: Math.min(a.py, p.py),
      width: Math.abs(p.px - a.px), height: Math.abs(p.py - a.py),
    });
  }, [pointOf]);

  useEffect(() => {
    const up = async (e) => {
      const a = start.current;
      if (!a) return;
      start.current = null;
      setRubber(null);
      const b = pointOf(e);
      if (!b) return;
      if (isDrag(a, b)) await onBox?.(boxOf(a, b), a);
      else await onClick?.(a);
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [pointOf, onBox, onClick]);

  return { rubber, handlers: { onMouseDown, onMouseMove, onDragStart: (e) => e.preventDefault() } };
}
