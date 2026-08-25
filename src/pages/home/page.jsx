// 대문 — 화면 사이 이동의 정본. 내용은 cards.mjs 가 정하고 여기서는 그리기만 한다.
import { useBackend } from "../../app/backend-gate.jsx";
import { gateText } from "../../app/gate.mjs";
import { useOwnVersions } from "../../app/shell.jsx";
import { homeCards } from "./cards.mjs";

function Card({ card, reason }) {
  const body = (
    <>
      <div className="home-card-title">
        <h3>{card.title}</h3>
        <span className="ver" data-version-key={card.versionKey}>{card.version}</span>
      </div>
      <p>{card.blurb}</p>
      <span className="home-badge">{card.locked ? "잠김" : "열기"}</span>
    </>
  );
  // 잠긴 카드는 감추지 않고 이유를 단 채 남긴다(cards.mjs 의 주석 참조).
  if (card.locked) {
    return (
      <span className="home-card" aria-disabled="true" title={reason}
            style={{ opacity: 0.45, cursor: "not-allowed" }}>{body}</span>
    );
  }
  return <a className="home-card" href={card.href}>{body}</a>;
}

export default function HomePage() {
  const own = useOwnVersions();
  const { status, kind } = useBackend();
  const { headline, guide } = gateText(kind);
  const cards = homeCards({ own, backendDown: status === "down" });

  return (
    <main>
      <p className="hint" style={{ margin: "0 0 16px" }}>관리할 영역을 선택하세요.</p>
      <div className="home-grid">
        {cards.map((c) => <Card key={c.id} card={c} reason={`${headline} — ${guide}`} />)}
      </div>
    </main>
  );
}
