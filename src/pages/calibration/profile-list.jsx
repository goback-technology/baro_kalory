// 프로파일 목록 (왼쪽 단) — 저장소에 발행돼 있는 것 전량. 카메라 선택과 무관한 카탈로그라,
// 오른쪽 단이 어느 카메라를 보고 있든 목록 자체는 바뀌지 않는다 — 바뀌는 것은 "어느 줄이
// 이 카메라 것인가"와 그 줄을 눌렀을 때 열리는 창뿐이다. 쓰기는 전부 오른쪽 창구를 지난다
// (여기서 따로 부르지 않는다 — 두 벌이 되면 한쪽만 고쳐진다).
import React from "react";
import { t } from "../../i18n/index.mjs";
import { fmtWhen } from "../../lib/format.mjs";
import { provText } from "./actions.mjs";

export function ProfileList({ catalog, error, mine, onPickMine, onPickOther }) {
  if (error) {
    return <span className="hint">{t("목록을 읽지 못했습니다") + ": " + error}</span>;
  }
  if (!catalog.length) {
    return <span className="hint">{t("발행된 프로파일이 없습니다.")}</span>;
  }
  return (
    <>
      {catalog.map((p) => (
        <button type="button" key={p.profileId}
          className={"prof-row" + (p.profileId === mine ? " mine" : "")}
          data-id={p.profileId}
          // 이 카메라 것이면 적용(되돌리기), 남의 것이면 그 원본으로 복사창을 연다.
          onClick={() => (p.profileId === mine ? onPickMine() : onPickOther(p.profileId))}>
          <span className="prof-id">{p.profileId + (p.profileId === mine ? "  " + t("(이 카메라)") : "")}</span>
          <span className="prof-meta">{`rev ${p.revision} · ${fmtWhen(p.issuedAt)}`}</span>
          {/* 출처를 목록에서부터 말한다 — 어느 것이 실측이고 어느 것이 베낀 것인지가 곧
              "이걸 깔아도 되나"의 답이라, 문서를 열어야 알 수 있으면 늦다. */}
          <span className="prof-meta">{provText(p.provenance)}</span>
        </button>
      ))}
    </>
  );
}
