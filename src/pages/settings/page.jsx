// 설정 화면 — 세 탭(기기·서버·검출·판독)의 조립부. 설정 로드는 여기 한 곳이고, 탭들은
// 그 값을 받아 쓴다(인라인 시절에는 세 탭이 같은 GET 을 각자 알아서 읽었다).
//
// **탭이 주소에 실린다**(#/settings/server). 예전에는 localStorage 에만 있어서, "서버 탭을
// 보세요" 라고 말하려면 「설정 열고 두 번째 탭」이라고 설명해야 했다. 주소가 없는 상태는
// 저장값으로 떨어지고, 저장값도 없으면 기기 탭이다.
import { useCallback, useEffect, useState } from "react";
import { getJson, postJson, api } from "../../api.mjs";
import { t } from "../../i18n.mjs";
import { hrefFor } from "../../app/router.mjs";
import { keyHintText } from "./actions.mjs";
import { DevicesPanel } from "./devices-panel.jsx";
import { ServerPanel } from "./server-panel.jsx";
import { DetectPanel } from "./detect-panel.jsx";
import "./settings.css";

const TABS = [
  { id: "devices", label: "기기" },
  { id: "server", label: "서버" },
  { id: "detect", label: "검출·판독" },
];
const TAB_KEY = "settings:tab.v1";

// 기기 타입 표는 서버가 준다. 못 받았을 때만 이 최소 두 줄로 버틴다 — 없으면 타입 셀렉트가
// 비어 새 기기를 아예 만들 수 없다.
const FALLBACK_TYPES = [
  { type: "hucoms", label: "Hucoms PTZ (실물)", needsHost: true },
  { type: "reference", label: "Baro Reference CCTV", needsHost: false },
];

function readStoredTab() {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    return TABS.some((x) => x.id === saved) ? saved : null;
  } catch { return null; }
}

export default function SettingsPage({ sub }) {
  const [cfg, setCfg] = useState({ devTypes: FALLBACK_TYPES, devices: [], activeId: null, profiles: [] });
  const [detect, setDetect] = useState({ detector: "", lpr: "", llmUrl: "", llmModel: "", llmTimeout: "" });
  const [keys, setKeys] = useState({ anthropic: "", openai: "" });
  const [keyHint, setKeyHint] = useState("…");
  const [llmNote, setLlmNote] = useState("");
  const [loadError, setLoadError] = useState("");
  const [statusTick, setStatusTick] = useState(0);

  const tab = TABS.some((x) => x.id === sub) ? sub : (readStoredTab() || "devices");
  useEffect(() => { try { localStorage.setItem(TAB_KEY, tab); } catch { /* 저장소 사용 불가 */ } }, [tab]);
  // 주소에 탭이 없으면 저장값으로 채워 넣는다 — 그래야 지금 보는 화면과 주소가 같은 말을 한다.
  useEffect(() => { if (!sub) location.replace(hrefFor("settings", tab)); }, [sub, tab]);

  const load = useCallback(async () => {
    try {
      const c = await getJson(api("/cctv/config"));
      const devTypes = (c.deviceTypes && c.deviceTypes.length) ? c.deviceTypes : FALLBACK_TYPES;
      // 발행된 프로파일 목록 — 없거나 못 읽어도 설정 화면 자체는 열려야 한다.
      let profiles = [];
      try { profiles = (await getJson(api("/profiles"))).camera || []; } catch { profiles = []; }
      const d = c.devices || { active: null, list: [] };
      const devices = (d.list || []).map((x) => ({ ...x }));
      setCfg({
        devTypes, devices, profiles,
        activeId: devices.some((x) => x.id === d.active) ? d.active : (devices[0] && devices[0].id) || null,
      });
      const llm = c.llm || {};
      setDetect({
        detector: (c.detection && c.detection.detector && c.detection.detector.url) || "",
        lpr: (c.lpr && c.lpr.url) || "",
        llmUrl: llm.url || "", llmModel: llm.model || "", llmTimeout: llm.timeoutMs ? String(llm.timeoutMs) : "",
      });
      // 저장한 적 없는 주소가 왜 떠 있는지를 화면이 설명해야 한다 — 옛 배포는 아직 호밍
      // 블록에서 주소를 빌린다. 저장을 한 번 누르면 llm 항목으로 옮겨진다.
      setLlmNote(llm.legacy ? t("이 주소는 옛 homing.visibilityVlm 에서 빌려 온 것입니다 — 저장하면 llm 항목으로 옮겨집니다") : "");
      setKeyHint(keyHintText(c.apikey));
      setKeys({ anthropic: "", openai: "" });
      setLoadError("");
      setStatusTick((n) => n + 1);   // 폼이 채워진 뒤에 서비스 상태를 확인한다
    } catch (e) {
      setLoadError(t("설정 로드 실패") + ": " + e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 검출·판독 탭의 저장 뒤 무중단 적용: 활성 기기를 방금 저장한 값으로 재빌드(재시작 불필요).
  // 기기가 하나도 없으면 재빌드할 대상이 없다 — 저장만 하고 끝낸다.
  const applyAfterSave = useCallback(async () => {
    await load();
    if (!cfg.activeId) return t("✅ 저장됨.");
    try {
      await postJson(api("/cctv/active"), { id: cfg.activeId, force: true });
      return t("✅ 저장 + 즉시 적용됨 (무중단).");
    } catch (e) {
      return t("✅ 저장됨 — 단, 활성 적용 실패:") + " " + (e.message || e);
    }
  }, [cfg.activeId, load]);

  return (
    <main className="set-main">
      {/* 기기 탭이 2단(목록 300px + 편집)이 되면서 폭이 늘었다. 편집 단은 720px 는 있어야
          ID·이름·타입이 한 줄에 들어간다 — 580px 이던 때는 타입 셀렉트가 다음 줄로 밀려
          폼이 깨져 보였고, 2단에서 같은 일이 벌어지지 않게 그만큼을 오른쪽 단에 남긴다. */}
      <div id="set-panel" style={{ display: "flex", flexDirection: "column", gap: 14, width: 1040, maxWidth: "100%" }}>
        <nav className="tabs" role="tablist">
          {TABS.map((x) => (
            <a key={x.id} className={"tab" + (x.id === tab ? " sel" : "")} data-tab={x.id} role="tab"
               href={hrefFor("settings", x.id)}>{x.label}</a>
          ))}
        </nav>
        {loadError && <div className="card"><span className="hint">{loadError}</span></div>}
        {tab === "devices" && <DevicesPanel cfg={cfg} reload={load} />}
        {tab === "server" && <ServerPanel detect={detect} statusTick={statusTick} />}
        {tab === "detect" && (
          <DetectPanel detect={detect} setDetect={setDetect} keys={keys} setKeys={setKeys}
                       keyHint={keyHint} llmNote={llmNote} onSaved={applyAfterSave} />
        )}
      </div>
    </main>
  );
}
