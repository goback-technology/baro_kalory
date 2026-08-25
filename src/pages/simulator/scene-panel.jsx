// 씬 탭 — 지금 씬이 무엇인지(레벨·플러그인), 그리고 **저장본**.
//
// 저장본이 리그의 유일한 내구 기록이다. 런타임에 세운 카메라는 시뮬 프로세스 안에만 살고,
// 시뮬이 꺼지면 카메라도 기기도 함께 사라진다 — 목록이 씬에서 파생되니 남을 것이 없고,
// 되살릴 것은 씬 하나뿐이다. 저장본은 **서버**에 남는다(브라우저가 받아 둔 파일은 받은
// 사람의 다운로드 폴더 밖에서는 없는 것과 같았다).
//
// 이 패널은 씬을 **읽고 저장하고 되돌린다.** 되돌린 뒤 화면을 다시 채우는 일은 부모의
// 몫이다(onRestored) — 복원은 카메라도 차량도 바꾸므로 리그·씬·슬롯을 전부 다시 읽어야
// 하는데, 그것을 여기서 하면 이 탭 하나가 화면 전체를 알게 된다.
import { useCallback, useEffect, useState } from "react";
import { getJson, postJson, reqJson, api } from "../../lib/api.mjs";
import { t } from "../../i18n/index.mjs";
import { doomedCameraCount, restoreSummaryText, sceneMetaText, saveSceneText } from "./actions.mjs";

const enc = encodeURIComponent;

export function ScenePanel({ locked, catalog, cameras, setBusy, log, onRefresh, onReset, onRestored }) {
  const [savedScenes, setSavedScenes] = useState([]);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("—");

  const level = catalog?.level || "";

  const loadSavedScenes = useCallback(async () => {
    let list = [];
    try { list = (await getJson(api("/simulator/scenes"))).scenes || []; }
    catch (e) { setStatus(t("저장 목록 실패") + ": " + e.message); }
    setSavedScenes(list);
  }, []);

  // 탭을 열면 다시 읽는다 — 저장본은 다른 브라우저에서도 늘어난다. 이 패널은 씬 탭에서만
  // 마운트되므로 마운트가 곧 「탭을 열었다」다.
  useEffect(() => { loadSavedScenes(); }, [loadSavedScenes]);

  // 빈 칸에는 레벨 이름을 넣어 둔다. 저장되는 것은 카메라 하나가 아니라 **이 월드**인데,
  // 이름 칸이 비어 있으면 눈앞의 카메라 별명을 적게 된다.
  useEffect(() => {
    if (!level) return;
    setName((prev) => (prev.trim() ? prev : level));
  }, [level]);

  const putScene = useCallback(async (sceneName) => {
    setBusy(true, "씬을 저장하는 중…");
    setStatus(t("저장 중…"));
    try {
      // 본문을 싣지 않는다 — 서버가 시뮬에서 직접 읽어 저장한다(브라우저가 씬을 실어 나르면
      // 화면이 낡은 사이에 저장을 누른 만큼 옛 씬이 저장된다).
      const r = await reqJson("PUT", api(`/simulator/scenes/${enc(sceneName)}`));
      setStatus(saveSceneText(r));   // 요약이 없으면 0 을 지어내지 않는다
      log(t("씬 저장: {name}", { name: sceneName }));
      await loadSavedScenes();
    } catch (e) { setStatus(t("씬 저장 실패") + ": " + e.message); }
    finally { setBusy(false); }
  }, [setBusy, loadSavedScenes, log]);

  const saveSceneAs = useCallback(async () => {
    const n = name.trim();
    if (!n) { setStatus(t("저장할 이름을 적으세요.")); return; }
    // 같은 이름은 덮어쓴다. 저장본이 이름마다 쌓이면 어느 것이 지금 리그인지 알 수 없다.
    if (savedScenes.some((s) => s.name === n) && !confirm(t("'{name}' 저장본을 덮어쓸까요?", { name: n }))) return;
    await putScene(n);
  }, [name, savedScenes, putScene]);

  // 이름만 바꾼다 — 담긴 씬은 서버에서 그대로 옮겨진다. 여기서 "새 이름으로 저장 후 삭제"를
  // 하면 그 사이 달라진 씬이 저장본에 옮겨 붙어, 이름을 고친 사람이 내용을 바꾸게 된다.
  const renameSavedScene = useCallback(async (scene) => {
    const next = (prompt(t("새 이름"), scene.name) || "").trim();
    if (!next || next === scene.name) return;
    const taken = savedScenes.some((s) => s.name === next);
    if (taken && !confirm(t("'{name}' 저장본을 덮어쓸까요?", { name: next }))) return;
    setBusy(true, "이름을 바꾸는 중…");
    try {
      await postJson(api(`/simulator/scenes/${enc(scene.name)}/rename`), { to: next, overwrite: taken });
      setStatus(t("이름을 바꿨습니다: {from} → {to}", { from: scene.name, to: next }));
      log(t("씬 이름 변경: {from} → {to}", { from: scene.name, to: next }));
      await loadSavedScenes();
    } catch (e) { setStatus(t("이름 바꾸기 실패") + ": " + e.message); }
    finally { setBusy(false); }
  }, [savedScenes, setBusy, loadSavedScenes, log]);

  const deleteSavedScene = useCallback(async (scene) => {
    if (!confirm(t("저장본 '{name}' 을 지울까요? (씬은 그대로입니다)", { name: scene.name }))) return;
    setBusy(true, "저장본을 지우는 중…");
    try {
      await reqJson("DELETE", api(`/simulator/scenes/${enc(scene.name)}`));
      setStatus(t("저장본을 지웠습니다: {name}", { name: scene.name }));
      await loadSavedScenes();
    } catch (e) { setStatus(t("삭제 실패") + ": " + e.message); }
    finally { setBusy(false); }
  }, [setBusy, loadSavedScenes]);

  const restoreSavedScene = useCallback(async (scene) => {
    const path = api(`/simulator/scenes/${enc(scene.name)}/restore`);
    // 복원은 되돌릴 수 없다: 차량은 전량 리셋 후 재배치되고, 저장본에 없는 스폰 카메라는
    // 지워진다. 무엇이 사라지는지 세어서 보여준 뒤에 묻는다.
    let snap;
    try { snap = await getJson(api(`/simulator/scenes/${enc(scene.name)}`)); }
    catch (e) { setStatus(t("저장본을 읽지 못했습니다") + ": " + e.message); return; }
    const doomed = doomedCameraCount(cameras, snap);
    if (!confirm(t("복원하면 차량이 전부 다시 배치되고, 저장본에 없는 카메라 {n}대가 지워집니다. 계속할까요? (카메라 {cams} · 차량 {cars})",
      { n: doomed, cams: (snap.cameras || []).length, cars: (snap.cars || []).length }))) return;
    setBusy(true, "씬을 되돌리는 중…");
    setStatus(t("복원 중…"));
    try {
      let r;
      try { r = await postJson(path, {}); }
      catch (e) {
        // 레벨이 다르면 409 다. 강행 여부는 사람이 정한다 — 다른 주차장의 좌표를 이 레벨에
        // 쏟아붓는 일이라 조용히 force 를 붙이면 안 된다.
        if (e.status !== 409) throw e;   // 상태코드로 가른다 — 본문 문구는 서버마다 다르다
        if (!confirm(t("이 저장본은 다른 레벨({level})의 것입니다. 그래도 이 레벨에 적용할까요?", { level: snap.level || "?" }))) {
          setStatus(t("복원을 취소했습니다."));
          return;
        }
        r = await postJson(path, { force: true });
      }
      setStatus(restoreSummaryText(r));
      const c = r.cameras || {};
      log(t("씬 복원: 카메라 +{sp}/{mv}/{rm} · 차량 {cars}",
        { sp: c.spawned ?? 0, mv: c.moved ?? 0, rm: c.removed ?? 0, cars: r.cars?.restored ?? 0 }));
      // 복원은 카메라도 차량도 바꾼다 — 씬·기기 목록·슬롯을 전부 다시 읽는 일은 부모의 몫이다.
      await onRestored();
    } catch (e) { setStatus(t("복원 실패") + ": " + e.message); }
    finally { setBusy(false); }
  }, [cameras, setBusy, log, onRestored]);

  return (
    <div id="sim-info-panel" className="sim-tab-panel" data-sim-tab-panel="info">
      <div className="sim-info-grid">
        <span className="sim-info-label">레벨</span>
        <span id="sim-level" className="sim-info-value">{catalog?.level || "—"}</span>
        <span className="sim-info-label">플러그인 버전</span>
        <span id="sim-plugin-version" className="sim-info-value">{catalog?.pluginVersion ? "v" + catalog.pluginVersion : "—"}</span>
      </div>
      <div className="sim-info-actions">
        <button id="sim-refresh" type="button" disabled={locked} onClick={onRefresh}>새로고침</button>
        <button id="sim-reset" type="button" disabled={locked} onClick={onReset}>전체 초기화</button>
      </div>
      {/* 저장된 씬은 **씬 전체**(세운 카메라 + 차량)의 것이라 카메라 옆에 둘 수 없다.
          거기 두면 "이 카메라를 저장한다"로 읽힌다. 초기화와 복원은 같은 축의 양끝이라
          나란히 있는 자리가 여기다. */}
      <div className="sim-scene-snapshot">
        <div className="sim-scene-save">
          <input id="sim-scene-name" type="text" maxLength={60} placeholder="저장 이름"
                 title="한글·영숫자·공백과 ._()[]+- 만, 60자까지. 같은 이름으로 저장하면 덮어씁니다."
                 value={name} onChange={(e) => setName(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveSceneAs(); } }} />
          <button id="sim-scene-save" type="button" disabled={locked} onClick={saveSceneAs}
                  title="지금 씬(세운 카메라 + 차량)을 서버에 저장합니다">저장</button>
        </div>
        <div id="sim-scene-list" className="sim-scene-list">
          {savedScenes.length === 0
            ? <div className="hint">저장된 씬이 없습니다.</div>
            : savedScenes.map((scene) => (
              <div key={scene.name} className="sim-scene-row">
                <span className="name" title={scene.level || ""}>{scene.name}</span>
                <span className="meta">{sceneMetaText(scene)}</span>
                {/* 이름을 고치는 것과 내용을 고치는 것은 다른 일이다. 한 버튼으로 묶으면
                    이름만 고치려던 사람이 그 사이 달라진 씬까지 저장하게 된다. */}
                <button type="button" disabled={locked} title="이름만 바꿉니다 — 담긴 씬은 그대로입니다"
                        onClick={() => renameSavedScene(scene)}>이름 바꾸기</button>
                <button type="button" disabled={locked} title="이 저장본을 지금 씬으로 덮어씁니다"
                        onClick={() => { if (confirm(t("'{name}' 저장본을 지금 씬으로 덮어쓸까요?", { name: scene.name }))) putScene(scene.name); }}>덮어쓰기</button>
                <button type="button" disabled={locked} title="이 저장본으로 씬을 되돌립니다"
                        onClick={() => restoreSavedScene(scene)}>복원</button>
                <button type="button" className="danger" disabled={locked}
                        onClick={() => deleteSavedScene(scene)}>삭제</button>
              </div>
            ))}
        </div>
        <div id="sim-scene-status" className="hint" style={{ margin: "6px 0 0" }}>{status}</div>
      </div>
    </div>
  );
}
