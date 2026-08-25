// 검출·판독 탭 — 검출기·LPR·LLM 접속점과 API 키.
//
// 이 탭의 값은 **입력칸의 것을 그대로 시험한다.** 저장 전에 확인할 수 없으면 설정 화면이
// 아니라 저장 버튼일 뿐이다(백엔드는 빈 값을 저장된 값으로 대신한다).
import { useState } from "react";
import { postJson, api } from "../../api.mjs";
import { t } from "../../i18n.mjs";
import { llmConfigOf, probeDetectorText, probeLprText, probeLlmText, runLlmText } from "./actions.mjs";

// id 를 유지한다 — 이 넷은 각각 다른 사실을 말하는 칸이고, 그 구분이 화면의 계약이다
// (한 칸을 공유하던 때는 나중 것이 앞의 것을 지웠다).
function Out({ id, msg }) {
  return <span id={id} className="hint">{msg}</span>;
}

export function DetectPanel({ detect, setDetect, keys, setKeys, keyHint, llmNote, onSaved }) {
  const [detOut, setDetOut] = useState("");
  const [lprOut, setLprOut] = useState("");
  const [llmOut, setLlmOut] = useState("");
  const [saveOut, setSaveOut] = useState("");
  const [aliases, setAliases] = useState([]);
  const [running, setRunning] = useState(false);

  const field = (k) => ({
    value: detect[k],
    onChange: (e) => setDetect({ ...detect, [k]: e.target.value }),
  });

  const probeDetector = async () => {
    setDetOut(t("테스트 중…"));
    try {
      const r = await postJson(api("/cctv/probe-detection"), { detector: detect.detector.trim(), lpr: "" });
      setDetOut(probeDetectorText(r));
    } catch (e) { setDetOut(t("테스트 실패") + ": " + e.message); }
  };

  const probeLpr = async () => {
    setLprOut(t("테스트 중…"));
    try {
      const r = await postJson(api("/cctv/probe-detection"), { detector: "", lpr: detect.lpr.trim() });
      setLprOut(probeLprText(r));
    } catch (e) { setLprOut(t("테스트 실패") + ": " + e.message); }
  };

  // 연결 확인 — 별칭 목록만 읽어 값싸다. 추론 슬롯을 쓰지 않는다.
  const probeLlm = async () => {
    setLlmOut(t("테스트 중…"));
    try {
      const r = await postJson(api("/cctv/probe-llm"), { url: detect.llmUrl.trim() });
      if (!r.reachable) { setLlmOut("❌ " + (r.error || "unreachable")); return; }
      // 쓸 수 있는 별칭을 입력칸의 후보로 채워 준다 — 별칭은 모델명이 아니라 외워서 칠 수 없다.
      setAliases(r.models || []);
      setLlmOut(probeLlmText(r));
    } catch (e) { setLlmOut(t("테스트 실패") + ": " + e.message); }
  };

  // 이 버튼만 추론을 실제로 쓴다. 게이트웨이는 한 번에 하나만 돌리므로, 연타가 대기열을
  // 채워 진짜 판정을 밀어내지 않게 누르는 동안 잠근다.
  const runLlm = async () => {
    setRunning(true);
    setLlmOut(t("동작 테스트 중… (추론 1회)"));
    try {
      const cfg = llmConfigOf({ url: detect.llmUrl, model: detect.llmModel, timeoutRaw: "" });
      const r = await postJson(api("/cctv/probe-llm"), { url: cfg.url, model: cfg.model, mode: "run" });
      setLlmOut(runLlmText(r));
    } catch (e) {
      setLlmOut(t("테스트 실패") + ": " + e.message);
    } finally { setRunning(false); }
  };

  const save = async () => {
    setSaveOut(t("저장 중…"));
    try {
      // 기기는 여기서 저장하지 않는다 — 기기 탭의 추가·저장·삭제가 각자 즉시 반영한다.
      // 백엔드의 config 저장이 항목별 부분 갱신이라 이 탭의 값만 보내면 기기는 그대로 남는다.
      const payload = {
        detection: { detector: { url: detect.detector.trim() } },
        lpr: { url: detect.lpr.trim() },
        llm: llmConfigOf({ url: detect.llmUrl, model: detect.llmModel, timeoutRaw: detect.llmTimeout }),
      };
      const keyA = keys.anthropic.trim(), keyO = keys.openai.trim();
      if (keyA || keyO) {
        payload.apikey = {};
        if (keyA) payload.apikey.anthropic = keyA;
        if (keyO) payload.apikey.openai = keyO;
      }
      await postJson(api("/cctv/config"), payload);
      setKeys({ anthropic: "", openai: "" });
      setSaveOut(await onSaved());
    } catch (e) { setSaveOut(t("저장 실패") + ": " + e.message); }
  };

  return (
    <section data-panel="detect" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="card">
        <h2>검출기 (baro_detector_api)</h2>
        <div className="row" style={{ marginBottom: 6 }}>
          <label style={{ width: 84 }}>검출기 URL</label>
          <input id="set-detector" style={{ width: 240 }} placeholder="http://127.0.0.1:9080" {...field("detector")} />
        </div>
        <div className="hint" style={{ marginBottom: 8 }}>차량+번호판 통합 (vpd+lpd). 경로: /vpd/api/v2 · /lpd/api/v1</div>
        <div className="row"><button id="set-probe-det" onClick={probeDetector}>검출기 테스트</button> <Out id="set-det-out" msg={detOut} /></div>
      </div>

      <div className="card">
        <h2>LPR 판독 (외부 OCR)</h2>
        <div className="row" style={{ marginBottom: 6 }}>
          <label style={{ width: 84 }}>LPR URL</label>
          <input id="set-lpr" style={{ width: 300 }} placeholder="http://<LPR-호스트>:8124/v1/plate-reader/" {...field("lpr")} />
        </div>
        <div className="hint" style={{ marginBottom: 8 }}>번호판 문자 인식 — 검출기와 별개의 외부 서비스.</div>
        <div className="row"><button id="set-probe-lpr" onClick={probeLpr}>LPR 테스트</button> <Out id="set-lpr-out" msg={lprOut} /></div>
      </div>

      {/* LLM 은 호밍 전용이 아니다. 통과 프록시(/api/llm/v1/*)와 번호판 가시성 판정이 같은
          접속점을 먹으므로 카드도 소비자가 아니라 **접속점** 단위로 둔다. */}
      <div className="card">
        <h2>LLM (추론 게이트웨이)</h2>
        <div className="row" style={{ marginBottom: 6 }}>
          <label style={{ width: 84 }}>LLM URL</label>
          <input id="set-llm-url" style={{ width: 240 }} placeholder="http://127.0.0.1:9090" {...field("llmUrl")} />
        </div>
        <div className="row" style={{ marginBottom: 6 }}>
          <label style={{ width: 84 }}>기본 모델</label>
          <input id="set-llm-model" list="set-llm-aliases" style={{ width: 240 }}
                 placeholder="plate-visibility-primary" {...field("llmModel")} />
          <datalist id="set-llm-aliases">
            {aliases.map((m) => <option key={m.id} value={m.id} label={m.resolvedModel || undefined} />)}
          </datalist>
          <label style={{ width: 64 }}>타임아웃</label>
          <input id="set-llm-timeout" type="number" min="1000" step="1000" style={{ width: 90 }} placeholder="ms" {...field("llmTimeout")} />
        </div>
        <div className="hint" style={{ marginBottom: 8 }}>OpenAI 호환 접속점 하나 — 통과 프록시와 번호판 가시성 판정이 함께 씁니다. 모델은 이름이 아니라 별칭이며, 연결 테스트가 쓸 수 있는 별칭을 채워 줍니다.</div>
        <div className="hint" id="set-llm-note" style={{ marginBottom: 8 }}>{llmNote}</div>
        {/* 두 버튼은 다른 것을 묻는다. 연결은 별칭 목록만 읽어 값싸고, 동작은 추론을 1회 쓴다 —
            제목만으로는 그 차이를 알 수 없으므로 tooltip 으로 붙인다(라벨을 늘리지 않는다). */}
        <div className="row">
          <button id="set-probe-llm" title="모델 목록만 읽습니다 — 추론을 돌리지 않습니다" onClick={probeLlm}>연결 테스트</button>
          <button id="set-run-llm" disabled={running}
                  title="합성 이미지 1장 + JSON 스키마로 실제 판정과 같은 모양을 한 번 돌립니다 (추론 1회)"
                  onClick={runLlm}>동작 테스트</button>
          <Out id="set-llm-out" msg={llmOut} />
        </div>
      </div>

      <div className="card">
        <h2>API 키 (VLM)</h2>
        <div className="row" style={{ marginBottom: 6 }}>
          <label style={{ width: 96 }}>Anthropic</label>
          <input id="set-key-anthropic" type="password" autoComplete="off" style={{ width: 300 }}
                 placeholder="sk-ant-… (비우면 기존 유지)" value={keys.anthropic}
                 onChange={(e) => setKeys({ ...keys, anthropic: e.target.value })} />
        </div>
        <div className="row" style={{ marginBottom: 6 }}>
          <label style={{ width: 96 }}>OpenAI</label>
          <input id="set-key-openai" type="password" autoComplete="off" style={{ width: 300 }}
                 placeholder="sk-… (비우면 기존 유지)" value={keys.openai}
                 onChange={(e) => setKeys({ ...keys, openai: e.target.value })} />
        </div>
        <div className="hint" id="set-key-hint">{keyHint}</div>
      </div>

      <div className="card">
        {/* 이 버튼은 이 탭의 값만 저장한다. 기기는 각자의 조작이 즉시 반영하므로 여기 없다. */}
        <div className="row"><button id="set-save" onClick={save}>이 탭 저장 + 즉시 적용 (무중단)</button> <Out id="set-save-out" msg={saveOut} /></div>
      </div>
    </section>
  );
}
