// 설정 탭 — 시뮬레이터(월드) 하나의 주소와 계정.
//
//   시뮬레이터 = 월드 하나 → stage 여럿(한 번에 하나 활성) → 그 stage 의 카메라들
//
// 제어 포트는 맨 왼쪽의 것이다. 예전에는 이 값들이 카메라 기기마다 복사돼 있어서, 카메라를
// 전부 지우면 백엔드가 시뮬을 잃고 조용히 인메모리 더블로 내려갔다(2026-08-11 회귀).
// 그래서 이 폼은 카메라와 무관하고, 카메라가 0 대여도 그대로 남는다.
//
// **상태줄은 이 패널의 것이 아니다.** 「지금 시뮬레이터에 닿는가」는 주기적 상태 확인도
// 쓰는 자리라 부모가 들고, 여기서는 저장·테스트의 결과만 거기에 적는다.
import { useCallback, useEffect, useState } from "react";
import { getJson, postJson, reqJson, api } from "../../lib/api.mjs";
import { t } from "../../i18n/index.mjs";
import { endpointPayload, statusTextFromSimulatorState } from "./actions.mjs";

const BLANK = { host: "", controlPort: "", timeoutMs: "", username: "", password: "" };

export function EndpointPanel({ locked, status, setStatus, onSaved }) {
  const [form, setForm] = useState(BLANK);
  const [configured, setConfigured] = useState(null);
  const [hasPassword, setHasPassword] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await getJson(api("/simulator/endpoint"));
      const ep = r.endpoint || {};
      setForm({
        host: ep.host || "", controlPort: ep.controlPort ?? "", timeoutMs: ep.timeoutMs ?? "",
        // 비밀번호는 **받아 오지 않는다** — 빈 칸이 "모른다"이고, 그 사실을 자리표시가 말한다.
        username: ep.username || "", password: "",
      });
      setHasPassword(!!ep.hasPassword);
      setConfigured(!!r.configured);
      setStatus(r.configured
        ? `${ep.host}:${ep.controlPort}`
        : t("시뮬레이터 주소가 없습니다 — 호스트와 제어 포트를 넣으세요."));
    } catch (e) {
      setStatus(t("시뮬레이터 주소 조회 실패") + ": " + e.message);
    }
  }, [setStatus]);

  // 탭을 열면 서버에서 다시 읽는다 — 이 패널은 설정 탭에서만 마운트되므로 마운트가 곧 열림이다.
  useEffect(() => { load(); }, [load]);

  const probe = useCallback(async () => {
    try {
      const d = endpointPayload(form);
      if (!d.host || !d.controlPort) throw new Error(t("제어 포트를 입력하세요 (시뮬레이터 제어 HTTP 포트, 기본 8095)."));
      setStatus(t("연결 테스트 중..."));
      setStatus(statusTextFromSimulatorState(await postJson(api("/simulator/probe"), d)));
    } catch (e) { setStatus(t("연결 테스트 실패") + ": " + e.message); }
  }, [form, setStatus]);

  const save = useCallback(async () => {
    try {
      setStatus(t("저장 중..."));
      // 저장과 연결은 다른 말이다 — 백엔드가 실제 연결 결과를 함께 준다.
      const r = await reqJson("PUT", api("/simulator/endpoint"), endpointPayload(form));
      setStatus(statusTextFromSimulatorState(r.status || {}));
      setConfigured(!!r.configured);
      // 주소가 바뀌면 씬이 통째로 바뀐다 — 목록·레벨·주차면·카탈로그·포즈·포트 대역까지.
      // 그 되읽기는 부모의 일이다(여기서 하면 이 패널이 화면 전체를 알게 된다).
      await onSaved();
      await load();   // 비밀번호 칸을 비우고 "(저장됨)" 표시를 되돌린다
    } catch (e) { setStatus(t("저장 실패") + ": " + e.message); }
  }, [form, onSaved, load, setStatus]);

  return (
    <div id="sim-settings-panel" className="sim-tab-panel" data-sim-tab-panel="settings">
      <section className="sim-scene-endpoint" aria-label="시뮬레이터 주소">
        <div className="sim-pane-head">
          <strong>시뮬레이터 주소</strong>
          <span id="sim-endpoint-state" className="sim-mode-badge">
            {configured === null ? "—" : configured ? t("설정됨") : t("미설정")}
          </span>
        </div>
        <div className="hint" style={{ margin: "0 0 7px" }}>
          시뮬레이터(월드) 하나의 주소와 계정입니다. 제어 포트는 시뮬레이터 전체가 하나 가지며 stage 마다 있는 것이 아닙니다 — 활성 stage 도 이 포트로 고릅니다. 카메라와 무관하므로 카메라가 0 대여도 그대로 남습니다.
        </div>
        <div className="row">
          <label>호스트</label>
          <input id="sim-endpoint-host" type="text" placeholder="192.0.2.60" style={{ width: 150 }}
                 value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} />
          <label>제어 포트</label>
          <input id="sim-endpoint-port" type="number" min="1" max="65535" placeholder="8095" style={{ width: 80 }}
                 value={form.controlPort} onChange={(e) => setForm((f) => ({ ...f, controlPort: e.target.value }))} />
          <label>Timeout</label>
          <input id="sim-endpoint-timeout" type="number" min="1000" max="120000" step="1000" placeholder="8000" style={{ width: 90 }}
                 value={form.timeoutMs} onChange={(e) => setForm((f) => ({ ...f, timeoutMs: e.target.value }))} />
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <label>계정</label>
          <input id="sim-endpoint-user" type="text" autoComplete="username" placeholder="admin" style={{ width: 120 }}
                 value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          <label>비밀번호</label>
          {/* 빈 칸은 "모른다"이지 "지워라"가 아니다 — 자리표시가 그 사실을 말한다. */}
          <input id="sim-endpoint-pass" type="password" autoComplete="new-password" style={{ width: 150 }}
                 placeholder={hasPassword ? t("(저장됨 · 변경 시에만 입력)") : t("비밀번호")}
                 value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          <button id="sim-endpoint-probe" type="button" disabled={locked} onClick={probe}>연결 테스트</button>
          <button id="sim-endpoint-save" type="button" disabled={locked} onClick={save}>저장</button>
        </div>
        <div id="sim-endpoint-status" className="hint" style={{ marginTop: 7 }}>{status}</div>
      </section>
    </div>
  );
}
