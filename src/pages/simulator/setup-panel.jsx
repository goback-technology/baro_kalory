// 오른쪽 단 — 주차면을 고르고, 그 자리에 차를 놓는다.
//
// 주차면 목록과 평면도는 **같은 슬롯을 두 방식으로 그린 것**이라 고르는 행위도 하나다.
// 그래서 선택(어느 슬롯·어느 차)은 여기가 아니라 부모가 들고, 이 패널은 그것을 받아
// 그리고 되돌려 준다 — 평면도를 클릭하든 이 목록을 클릭하든 같은 자리가 켜져야 한다.
//
// 상태줄(sim-status)도 부모의 것이다. 씬을 다시 읽을 때와 「전체 초기화」(씬 탭)도 같은
// 줄에 적기 때문이다 — 차량 동작만의 줄이 아니다.
import { useCallback, useEffect, useRef, useState } from "react";
import { getJson, postJson, reqJson, api } from "../../lib/api.mjs";
import { t } from "../../i18n/index.mjs";
import { slotName, slotNameById, plateText } from "./actions.mjs";

const enc = encodeURIComponent;

const BLANK_CAR = { carType: 0, color: 0, plateType: 0, city: "", prefix: "", kor: "", number: "" };

export function SetupPanel({
  locked, slots, catalog, carById,
  selectedSlot, selectedCar, onPickSlot, setSelectedCar,
  status, setStatus, onSceneChanged,
}) {
  const [form, setForm] = useState(BLANK_CAR);
  const [force, setForce] = useState(false);
  // 연달아 다른 슬롯을 찍으면 느린 응답이 나중에 도착해 폼을 되덮는다 — 마지막 요청만 이긴다.
  const reqSeq = useRef(0);

  const carsOf = catalog?.cars || [];
  const carCount = carsOf.length || catalog?.carCount || 0;

  const loadCarIntoForm = useCallback(async (id) => {
    const req = ++reqSeq.current;
    try {
      const { car } = await getJson(api("/simulator/cars/") + enc(id));
      if (req !== reqSeq.current) return;
      setForm({
        carType: car.carType, color: car.color, plateType: car.plate.type,
        city: car.plate.city || "", prefix: car.plate.prefix || "",
        kor: car.plate.kor || "", number: car.plate.number || "",
      });
    } catch (e) {
      if (req !== reqSeq.current) return;
      // 무언으로 삼키면 직전 차량의 값이 방금 고른 차량의 것처럼 남는다 — 이어지는
      // 「선택 차량에 적용」이 그 낡은 값으로 PATCH 하므로, 실패는 말한다.
      setStatus(t("차량 조회 실패") + ": " + e.message);
    }
  }, [setStatus]);

  // 고른 차가 바뀌면 그 차의 값을 폼에 올린다. 부모는 「무엇을 골랐는가」만 말하고, 그것을
  // 읽어 오는 일은 폼을 가진 이쪽이 한다.
  useEffect(() => {
    if (selectedCar) loadCarIntoForm(selectedCar);
  }, [selectedCar, loadCarIntoForm]);

  const carBody = useCallback(() => ({
    carType: Number(form.carType), color: Number(form.color),
    plate: {
      type: Number(form.plateType), city: form.city.trim(), prefix: form.prefix.trim(),
      kor: form.kor, number: form.number.trim(),
    },
  }), [form]);

  const simSpawn = useCallback(async () => {
    if (!selectedSlot) { setStatus(t("먼저 슬롯을 선택하세요.")); return; }
    try {
      const r = await postJson(api("/simulator/cars"), { slotId: selectedSlot, force, ...carBody() });
      // 카메라 스폰과 같은 방어 — 2xx 인데 본문이 비면 스폰은 됐는데 화면만 「실패」라고 말한다.
      const car = r.car || null;
      await onSceneChanged();   // 재적재가 status 를 비우므로, 성공 보고는 그 뒤에 한다
      setStatus(car?.id ? t("스폰됨: {id}", { id: car.id }) : t("스폰됨 — 응답이 차량 정보를 싣지 않았습니다"));
    } catch (e) { setStatus(t("스폰 실패") + ": " + e.message); }
  }, [selectedSlot, force, carBody, onSceneChanged, setStatus]);

  const simApply = useCallback(async () => {
    if (!selectedCar) { setStatus(t("편집할 차량을 선택하세요.")); return; }
    try {
      const applied = selectedCar;
      await reqJson("PATCH", api("/simulator/cars/") + enc(applied), carBody());
      await onSceneChanged();
      setStatus(t("적용됨: {id}", { id: applied }));
    } catch (e) { setStatus(t("적용 실패") + ": " + e.message); }
  }, [selectedCar, carBody, onSceneChanged, setStatus]);

  const simDelete = useCallback(async () => {
    if (!selectedCar) { setStatus(t("삭제할 차량을 선택하세요.")); return; }
    const id = selectedCar;
    try {
      await reqJson("DELETE", api("/simulator/cars/") + enc(id));
      setSelectedCar(null);   // 씬 재적재가 빈 슬롯에서 재확인하지만, 즉시 선점 해제
      await onSceneChanged();
      setStatus(t("삭제됨: {id}", { id }));
    } catch (e) { setStatus(t("삭제 실패") + ": " + e.message); }
  }, [selectedCar, setSelectedCar, onSceneChanged, setStatus]);

  return (
    <div id="sim-panel">
      <div id="slot-card" className="card">
        <h2>주차면 (슬롯)</h2>
        <div id="sim-slots">
          {slots.length === 0
            ? <span className="hint">주차면이 없습니다. sim 레벨에 BP_ParkingSlot 배치가 필요합니다.</span>
            : slots.map((s) => {
              const car = s.carId ? carById.get(s.carId) : null;
              const plate = car ? plateText(car.plate) : "";
              return (
                <button key={s.id} type="button" data-slot={s.id}
                        className={"sim-slot" + (s.occupied ? " occ" : "") + (s.id === selectedSlot ? " sel" : "")}
                        title={s.label && s.label !== s.id ? s.id : ""}
                        onClick={() => onPickSlot(s)}>
                  <b className="slot-name">{slotName(s)}</b>
                  <span className="slot-type">{s.type || ""}</span>
                  {s.occupied && <em className="slot-car">{s.carId || t("점유")}</em>}
                  {s.occupied && plate && <span className="slot-plate" title={plate}>{plate}</span>}
                </button>
              );
            })}
        </div>
      </div>

      <div className="card">
        <h2>차량 배치 / 편집</h2>
        <div className="row" style={{ marginBottom: 6 }}>
          <label>대상 슬롯</label>
          <span id="sim-sel-slot" className="hint" style={{ margin: 0 }}>
            {selectedSlot ? slotNameById(slots, selectedSlot) + (selectedCar ? ` (${selectedCar})` : "") : t("— 슬롯을 선택하세요")}
          </span>
        </div>
        <div className="row" style={{ marginBottom: 6 }}>
          <label>차종</label>
          <select id="sim-cartype" style={{ width: "auto", padding: 5 }} value={form.carType}
                  onChange={(e) => setForm((f) => ({ ...f, carType: e.target.value }))}>
            {Array.from({ length: carCount }, (_, i) => (
              <option key={i} value={i}>{carsOf[i]?.name || `${t("차종")} ${i}`}</option>
            ))}
          </select>
          <label>색상</label>
          <select id="sim-color" style={{ width: "auto", padding: 5 }} value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}>
            {(catalog?.colors || []).map((c) => <option key={c.index} value={c.index}>{c.name}</option>)}
          </select>
          <span id="sim-color-chip" style={{
            width: 20, height: 20, borderRadius: 4, border: "1px solid #3a414c", display: "inline-block",
            background: (() => {
              const c = (catalog?.colors || [])[Number(form.color) || 0];
              return c?.rgb ? `rgb(${c.rgb.map((v) => Math.round(v * 255)).join(",")})` : undefined;
            })(),
          }} />
        </div>
        <div className="row" style={{ marginBottom: 8 }}>
          <label>번호판</label>
          <select id="sim-platetype" style={{ width: "auto", padding: 5 }} value={form.plateType}
                  onChange={(e) => setForm((f) => ({ ...f, plateType: e.target.value }))}>
            {(catalog?.plateTypes || []).map((p) => <option key={p.index} value={p.index}>{p.name}</option>)}
          </select>
          <input id="sim-plate-city" style={{ width: 52 }} placeholder="서울" title="도시(선택)"
                 value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          <input id="sim-plate-prefix" style={{ width: 48 }} placeholder="123" title="앞 3자리 (한국 신형)"
                 value={form.prefix} onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value }))} />
          <select id="sim-plate-kor" style={{ width: "auto", padding: 5 }} title="한글" value={form.kor}
                  onChange={(e) => setForm((f) => ({ ...f, kor: e.target.value }))}>
            {(catalog?.korList || []).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <input id="sim-plate-number" style={{ width: 62 }} placeholder="4567" title="뒤 4자리"
                 value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} />
        </div>
        <div className="row">
          <button id="sim-spawn" disabled={locked} onClick={simSpawn}>이 슬롯에 스폰</button>
          <button id="sim-apply" disabled={locked} onClick={simApply}>선택 차량에 적용</button>
          <button id="sim-delete" disabled={locked} onClick={simDelete}>선택 차량 삭제</button>
          <label style={{ marginLeft: 8 }}>
            <input type="checkbox" id="sim-force" style={{ width: "auto" }} checked={force}
                   onChange={(e) => setForce(e.target.checked)} />
            {" "}점유 덮어쓰기
          </label>
        </div>
        <div className="row sim-status-row"><span id="sim-status" className="hint" style={{ margin: 0 }}>{status}</span></div>
      </div>
    </div>
  );
}
