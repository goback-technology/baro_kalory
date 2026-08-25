// 셸 세 조각의 계약 — 부트(main) · 미연결 게이트(backend-gate) · 전면 잠금(busy-provider).
//
// **이 셋에는 그물이 하나도 없었다**(2026-08-25 전수 조사). 순수 판정인 `gate.mjs` 는
// 검사되고 있었지만 **그것을 쓰는 뷰**는 무방비였고, 이 저장소가 두 번 물린 사고
// (첫 방문이 벽돌이 되는 것)가 정확히 그 뷰에서 났다.
//
// 값이 아니라 원문을 문는 이유는 JSX 라서다 — 컴포넌트 렌더 인프라를 들이지 않았으므로
// (`inventory.md` 「Tests」), 뷰는 소스 원문을 앵커로 잡는다. 단언은 파일까지 지정한다.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (f) => readFile(new URL(`../src/app/${f}`, import.meta.url), "utf8");
// 주석은 걷고 본다 — 규칙을 설명하는 주석이 그 규칙의 반례를 인용하면 스스로 걸린다.
const code = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ── 부트 ────────────────────────────────────────────────────────────────────

test("부트 — 루트는 하나이고, 언어·테마는 그리기 전에 선다", async () => {
  const main = await read("main.jsx");
  // 테마·언어를 render **뒤에** 세우면 첫 프레임이 기본 테마로 그려졌다가 갈아 끼워진다
  // (테마 플래시). 사람이 그것을 「깜빡임」으로 본다.
  const iTheme = main.indexOf("setTheme(getTheme())");
  const iI18n = main.indexOf("initI18n()");
  const iRender = main.indexOf(".render(");
  assert.ok(iTheme > -1 && iI18n > -1 && iRender > -1, "부트 세 걸음을 못 찾았다");
  assert.ok(iI18n < iRender, "언어는 그리기 전에 정해져야 한다");
  assert.ok(iTheme < iRender, "테마는 그리기 전에 걸려야 한다 — 아니면 첫 프레임이 깜빡인다");
  // dev 에서 같은 파일이 두 URL(`/web/…` 별칭 · `/@fs/…` 정규 경로)로 평가될 수 있다.
  // createRoot 를 두 번 부르면 React 가 경고를 내고 트리가 두 벌이 된다.
  assert.match(main, /window\.__baroBoot \|\|= \{\}/, "루트는 전역에 한 번만 만든다");
  assert.match(main, /if \(!BOOT\.root\) BOOT\.root = createRoot\(/, "이미 있으면 다시 만들지 않는다");
  assert.equal(main.match(/createRoot\(/g)?.length, 1, "createRoot 는 한 자리에서만 불린다");
});

// ── 미연결 게이트 ───────────────────────────────────────────────────────────

// 이 저장소가 **두 번 물린** 자리다. 미연결일 때 설정으로 갈 문까지 잠그면 사용자는 주소를
// 넣을 방법을 잃는다 — 화면은 멀쩡히 떠 있는데 아무것도 할 수 없는 상태가 된다.
test("게이트 — 미연결이어도 설정으로 갈 문이 반드시 남는다", async () => {
  const gate = await read("backend-gate.jsx");
  // 본문을 그리지 않는 화면에도 배너와 카드 **양쪽**에 설정 링크가 있어야 한다.
  assert.equal(gate.match(/href=\{pageHref\("settings"\)\}/g)?.length, 2,
    "배너와 게이트 카드 둘 다 설정으로 가는 링크를 가져야 한다");
  // **href 를 손으로 짓지 않는다.** 문자열을 직접 만들면 배포 형태(해시·서브패스)가 바뀔 때
  // 그 자리만 어긋나고, 어긋난 href 를 비교하던 잠금이 설정 카드까지 잠갔다(두 번).
  assert.doesNotMatch(code(gate), /href="[^"]*settings/, "설정 주소를 문자열로 지으면 안 된다");
  assert.match(gate, /import \{ pageHref \} from "\.\/routes\.mjs"/, "주소는 화면 표에서 온다");
  // 설정 화면 자신에게 「설정으로 이동」을 보여 주지 않는다 — 제자리를 가리키는 링크다.
  assert.match(gate, /pageId !== "settings" && \(/);
  // 다시 확인할 문도 있어야 한다. 백엔드가 늦게 뜨는 경우가 흔하고, 그때 새로고침 말고는
  // 방법이 없으면 사용자는 무엇이 바뀌었는지 모른 채 F5 를 친다.
  assert.match(gate, /onClick=\{retry\}/, "재시도 버튼이 있어야 한다");
});

test("게이트 — 어느 화면이 본문을 그리는지는 gate.mjs 가 정한다", async () => {
  const gate = await read("backend-gate.jsx");
  // 판정을 뷰가 다시 계산하면 두 벌이 되고, 두 벌은 언젠가 다른 답을 낸다.
  assert.match(gate, /openWithoutBackend\(pageId\) \? children :/);
  assert.doesNotMatch(code(gate), /pageId === "home"|pageId === "settings" \|\|/,
    "어느 화면을 열지 뷰가 직접 판정하면 안 된다 — gate.mjs 의 몫이다");
  assert.match(gate, /gateKind\(\{/, "게이트 종류도 판정 모듈에서 온다");
  assert.match(gate, /gateText\(kind\)/, "문구도 마찬가지다");
});

test("게이트 — 확인은 /version 한 번이고, 늦으면 끊는다", async () => {
  const gate = await read("backend-gate.jsx");
  // 헬스체크를 따로 더 치면 부팅마다 왕복이 두 번이 되고, 두 결과가 어긋나는 상태가 생긴다.
  // 버전 배지와 연결 판정은 **같은 응답**에서 나와야 한다.
  assert.equal(gate.match(/fetch\(/g)?.length, 1, "probe 는 한 번뿐이다");
  assert.match(gate, /api\("\/version"\)/);
  // 응답이 영영 안 오면 화면이 probing 에 갇힌다 — probing 은 children 을 그리므로,
  // 사용자는 「연결됐다」로 오해한 채 빈 화면을 보게 된다.
  assert.match(gate, /AbortSignal\.timeout\(\d+\)/, "무한 대기를 두지 않는다");
  // 200 이어도 우리 백엔드가 아닐 수 있다(정적 호스트의 index.html 이 200 으로 온다).
  assert.match(gate, /if \(!version\) throw new Error/, "버전을 못 읽으면 연결로 치지 않는다");
  // 첫 왕복 동안 화면을 깜빡이지 않는다.
  assert.match(gate, /if \(status === "probing"\) return children;/);
  // 언마운트 뒤 setState 를 막는다 — 라우트를 빠르게 오가면 죽은 컴포넌트에 쓰게 된다.
  assert.match(gate, /let alive = true;/);
  assert.match(gate, /return \(\) => \{ alive = false; \};/);
  assert.equal(gate.match(/if \(alive\)/g)?.length, 2, "성공·실패 양쪽에서 확인해야 한다");
});

// 주소가 없으면 **부르지 않는다.** 부르면 그 요청이 지금 오리진의 /api/… 로 나가 엉뚱한
// 서버(정적 호스트면 404 HTML)를 만나고, 첫 방문자는 파싱 오류를 보게 된다.
test("게이트 — 주소가 없으면 아예 묻지 않는다", async () => {
  const gate = await read("backend-gate.jsx");
  assert.match(gate, /if \(!API_BASE_EXPLICIT\) \{ setState\(\{ status: "down"[^}]*\}\); return; \}/);
});

// ── 전면 잠금 ───────────────────────────────────────────────────────────────

// 옛 방식은 화면마다 `querySelectorAll("button")` 을 돌며 disabled 를 세웠다(네 벌). 그러면
// **잠금 중에도 눌려야 하는 버튼**(중지·취소)까지 잠겨서, 페이지마다 우회로가 생겼다.
test("잠금 — 버튼을 건드리지 않는다. 덮개 한 장으로 막는다", async () => {
  const busy = await read("busy-provider.jsx");
  assert.doesNotMatch(code(busy), /querySelectorAll|getElementsByTagName|\.disabled\s*=/,
    "버튼을 훑어 잠그는 방식으로 돌아가면 우회로가 다시 생긴다");
  assert.match(busy, /position: "fixed", inset: 0/, "덮개는 화면 전체를 덮는다");
  assert.match(busy, /data-role="busy"/, "덮개를 찾을 표식");
  // 잠금 중에도 살아야 하는 것은 덮개보다 **위**에 선다. 같거나 아래면 그 예외가 무의미하다.
  const cover = Number(busy.match(/zIndex: (\d+), cursor: "progress"/)?.[1]);
  const exempt = Number(busy.match(/position: "relative", zIndex: (\d+)/)?.[1]);
  assert.ok(Number.isFinite(cover) && Number.isFinite(exempt), "두 z-index 를 못 읽었다");
  assert.ok(exempt > cover, `면제(${exempt})가 덮개(${cover})보다 위에 있어야 한다`);
});

test("잠금 — 겹쳐 도는 작업을 세어, 먼저 끝난 것이 남의 잠금을 풀지 않게", async () => {
  const busy = await read("busy-provider.jsx");
  assert.match(busy, /depth\.current \+= 1;/);
  // finally 여야 한다 — 작업이 던지면 잠금이 영영 남고, 그때 화면은 통째로 죽는다.
  assert.match(busy, /\} finally \{\s*\n\s*depth\.current -= 1;/, "실패해도 잠금은 풀려야 한다");
  // 0 이 될 때만 푼다. 그리고 음수로 내려가지 않게 바닥을 둔다 — 한 번 음수가 되면 그 뒤의
  // 잠금이 전부 즉시 풀린다.
  assert.match(busy, /if \(depth\.current <= 0\) \{ depth\.current = 0; setLabel\(null\); \}/);
  // 프로바이더 밖에서 부르면 조용히 안 잠기는 대신 **터져야** 한다 — 안 잠긴 채 도는 작업은
  // 사용자가 그 사이 다른 버튼을 누를 수 있다는 뜻이다.
  assert.match(busy, /throw new Error\("useBusy 는 BusyProvider 안에서만 쓴다"\)/);
});
