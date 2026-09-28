// **저장소에 남의 것이 섞여 들어오는 것을 막는 그물.**
//
// 2026-09-23, 구글 Apps Script 의 오류 페이지가 `body.txt` 라는 이름으로 저장소 **루트에**
// 떨어져 한 달을 있었다. 이 저장소와 무관한 남의 응답 본문이었고, 커밋되지 않은 것은
// 순전히 `git add <경로>` 를 손으로 적는 습관 덕이었다 — `git add -A` 한 번이면 들어갔다.
//
// 그래서 두 가지를 못 박는다: **임시 파일이 떨어질 자리**(`.localfiles/`)가 실제로 ignore
// 되는가, 그리고 **루트에 파일이 몰래 늘지 않는가**. 둘 다 규칙의 문장이 아니라 git 의
// 실제 판정으로 묻는다 — `.gitignore` 원문을 정규식으로 읽으면 「적혀 있지만 안 듣는 규칙」
// 을 통과시킨다.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cwd = fileURLToPath(new URL("../", import.meta.url));

// check-ignore 는 **종료 코드로** 답한다: 0 = 무시됨, 1 = 무시되지 않음. 그 외는 진짜 오류다.
//
// `--no-index` 가 없으면 **이미 추적 중인 파일은 무조건 「무시되지 않음」** 으로 답한다(git 의
// 규칙이 추적 파일에 안 걸리므로). 그러면 규칙이 아니라 추적 상태를 묻는 셈이라, `*.jsx` 같은
// 넓은 규칙이 소스를 삼켜도 초록이 된다(실측 2026-09-28 — 이 그물이 처음엔 그걸 놓쳤다).
// 우리가 묻는 것은 **규칙이 무엇을 삼키는가** 이므로 언제나 --no-index 로 묻는다.
function isIgnored(path) {
  try {
    execFileSync("git", ["check-ignore", "-q", "--no-index", path], { cwd, stdio: "pipe" });
    return true;
  } catch (e) {
    if (e.status === 1) return false;
    // git 이 없거나 저장소가 아니면 이 검사는 **조용히 비는** 대신 터진다 —
    // 통과만 보면 그물이 있는지 알 수 없다.
    throw new Error(`git check-ignore 를 쓸 수 없다(${e.status}): ${e.message}`);
  }
}

const tracked = (pathspec) =>
  execFileSync("git", ["ls-files", "--", pathspec], { cwd, encoding: "utf8" })
    .split("\n").map((s) => s.trim()).filter(Boolean);

test("임시 파일의 자리(.localfiles/)는 실제로 ignore 된다 — README 만 빼고", () => {
  // 여기로 경로를 주는 한, 무엇을 받아 적든 저장소에 딸려 들어가지 않는다.
  for (const f of [".localfiles/resp.html", ".localfiles/out.txt", ".localfiles/a/b/deep.tmp"]) {
    assert.ok(isIgnored(f), `${f} 가 ignore 되지 않는다 — 임시 파일의 자리가 새고 있다`);
  }
  // README 는 예외로 추적된다. 그래야 clone 직후에도 그 디렉터리가 있고(쓰는 쪽이 mkdir 을
  // 신경 쓰지 않는다), 규칙이 그 자리에서 스스로를 설명한다. 예외가 사라지면 지금 여기 있는
  // 파일은 추적된 채 남아 **아무 증상도 없다가**, 다음 clone 에서 자리가 통째로 없어진다.
  assert.ok(!isIgnored(".localfiles/README.md"),
    "README 예외(!.localfiles/README.md)가 사라졌다 — clone 하면 이 자리가 없다");
  assert.deepEqual(tracked(".localfiles/"), [".localfiles/README.md"],
    "이 디렉터리에서 추적되는 것은 README 하나여야 한다 — 임시 파일이 커밋됐거나, 자리가 사라졌다");
});

test("비밀·산출물은 계속 ignore 된다", () => {
  // .env 가 한 번이라도 추적되면 이력에 남는다. 규칙을 손볼 때 같이 무너지지 않게 못 박는다.
  for (const f of [".env", "dist/index.html", "node_modules/x/index.js", "public/app.css"]) {
    assert.ok(isIgnored(f), `${f} 가 ignore 되지 않는다`);
  }
  assert.deepEqual(tracked(".env"), [], ".env 는 추적되면 안 된다");
});

// 위 검사들의 반대편. ignore 규칙을 넓게 쓰다 보면 소스를 삼키는 일이 생기는데, 그때
// 증상은 「빌드는 되는데 clone 한 쪽에서만 파일이 없다」라 원인에 닿기까지 오래 걸린다.
test("ignore 규칙이 소스를 삼키지 않는다", () => {
  for (const f of ["src/app/main.jsx", "src/pages/simulator/page.jsx", "test/repo-hygiene.test.mjs",
                   "styles/tailwind.css", "package.json"]) {
    assert.ok(!isIgnored(f), `${f} 가 ignore 되고 있다 — 규칙이 너무 넓다`);
  }
});

// 루트는 이 저장소의 현관이다. 여기 파일이 느는 것은 드물고, 늘 때는 이유가 있어야 한다.
// 목록으로 잠가 두면 남의 응답 본문·덤프·에디터 부산물이 `git add -A` 에 쓸려 들어올 때
// **그 커밋에서** 걸린다. (디렉터리는 대상이 아니다 — 새 디렉터리는 그 자체로 눈에 띈다.)
const ROOT_FILES = [
  ".env.example",
  ".gitignore",
  ".nojekyll",
  "ecosystem.config.cjs",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "readme.md",
  "vite.config.mjs",
];

test("루트에 파일이 몰래 늘지 않는다", () => {
  const atRoot = tracked(".").filter((f) => !f.includes("/")).sort();
  assert.deepEqual(atRoot, [...ROOT_FILES].sort(),
    "루트의 추적 파일이 달라졌다. 일부러 늘린 것이면 이 목록에 **같은 커밋에서** 추가한다."
    + " 임시·덤프 파일이면 자리는 `.localfiles/` 다.");
});

// 형제 저장소들이 `_localfiles`(baro_unreal)·`__localfiles`(mzok)를 쓰고, 문서의
// `localfiles/profiles/camera/`(보드 #76)는 백엔드 **기계**의 경로다. 셋 다 여기 것이 아니다.
// 다른 철자로 만들면 ignore 되지 않아 git status 에 드러나고, 커밋되면 여기서 걸린다.
test("임시 파일의 철자는 하나다 — 옛 이름이 저장소로 들어오지 않는다", () => {
  for (const legacy of ["localfiles", "_localfiles", "__localfiles"]) {
    assert.deepEqual(tracked(`${legacy}/`), [],
      `${legacy}/ 가 추적되고 있다 — 이 저장소의 임시 파일 자리는 .localfiles/ 하나다`);
  }
});
