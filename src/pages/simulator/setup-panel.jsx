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

const BLANK_CAR = { kind: "car", carType: 0, color: 0, plateType: 0, city: "", prefix: "", kor: "", number: "" };

// 카탈로그 색은 0..1 실수 RGB 다. 폼의 색 견본과 슬롯 목록의 색 점이 **같은 계산**을 쓴다 —
// 두 벌이 되면 언젠가 같은 차를 다른 색으로 보여준다.
const rgbCss = (c) => (c?.rgb ? `rgb(${c.rgb.map((v) => Math.round(v * 255)).join(",")})` : undefined);

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
  // 차량과 오토바이는 카탈로그부터 딴 목록이다(cars/motorcycles) — 한 셀렉트에 섞으면
  // 스물아홉 줄에서 여섯 대를 눈으로 골라내야 한다. 목록이 따로 오면 화면도 따로 보인다.
  const bikesOf = catalog?.motorcycles || [];
  const isBike = form.kind === "motorcycle";

  const loadCarIntoForm = useCallback(async (id) => {
    const req = ++reqSeq.current;
    try {
      const { car } = await getJson(api("/simulator/cars/") + enc(id));
      if (req !== reqSeq.current) return;
      setForm({
        // 구분은 인덱스가 말한다 — 오토바이는 카탈로그의 motorcycles 인덱스 대역에 산다.
        kind: (catalog?.motorcycles || []).some((m) => m.index === car.carType) ? "motorcycle" : "car",
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
  }, [setStatus, catalog]);

  // 고른 차가 바뀌면 그 차의 값을 폼에 올린다. 부모는 「무엇을 골랐는가」만 말하고, 그것을
  // 읽어 오는 일은 폼을 가진 이쪽이 한다.
  useEffect(() => {
    if (selectedCar) loadCarIntoForm(selectedCar);
  }, [selectedCar, loadCarIntoForm]);

  const carBody = useCallback(() => ({
    carType: Number(form.carType), color: Number(form.color),
    // 오토바이 번호판은 레코드가 아니라 시뮬레이터가 정한다(팀 결정 — #300, 베트남식 자동).
    // 폼에 남은 한국식 조각을 실어 보내면 「그 값이 차에 붙었다」로 읽히므로 빈 판을 보낸다.
    plate: form.kind === "motorcycle"
      ? { type: 0, city: "", prefix: "", kor: "", number: "" }
      : {
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
              // 목록의 번호판은 차에 실제 그려진 문자열(plateRendered)이다 — 레코드 조립은
              // 그려지지 않는 city 를 섞어 차와 다른 글자를 보여줄 수 있고(#309), 오토바이는
              // 레코드와 무관하게 붙는다(#300). 그 키가 없는 옛 시뮬에서만 조립으로 물러난다.
              const plate = car ? (car.plateRendered ?? plateText(car.plate)) : "";
              // 점의 색은 그 차의 레코드에서 온다 — 목록에서 색으로 차를 찾을 수 있게.
              const color = car ? (catalog?.colors || [])[Number(car.color) || 0] : null;
              return (
                <button key={s.id} type="button" data-slot={s.id}
                        className={"sim-slot" + (s.occupied ? " occ" : "") + (s.id === selectedSlot ? " sel" : "")}
                        title={s.label && s.label !== s.id ? s.id : ""}
                        onClick={() => onPickSlot(s)}>
                  <b className="slot-name">{slotName(s)}</b>
                  <span className="slot-type">{s.type || ""}</span>
                  {s.occupied && color?.rgb && <span className="slot-color" title={color.name} style={{
                    width: 10, height: 10, borderRadius: 3, border: "1px solid #3a414c",
                    display: "inline-block", flex: "none", background: rgbCss(color),
                  }} />}
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
          {bikesOf.length > 0 && <>
            <label>구분</label>
            <select id="sim-kind" style={{ width: "auto", padding: 5 }} value={form.kind}
                    onChange={(e) => {
                      const kind = e.target.value;
                      // 목록이 바뀌면 인덱스도 그 목록의 첫 칸으로 — 남의 목록 인덱스를 들고
                      // 있으면 화면에 보이는 이름과 전송되는 값이 갈린다.
                      setForm((f) => ({ ...f, kind, carType: kind === "motorcycle" ? (bikesOf[0]?.index ?? 0) : 0 }));
                    }}>
              <option value="car">차량</option>
              <option value="motorcycle">오토바이</option>
            </select>
          </>}
          <label>차종</label>
          <select id="sim-cartype" style={{ width: "auto", padding: 5 }} value={form.carType}
                  onChange={(e) => setForm((f) => ({ ...f, carType: e.target.value }))}>
            {isBike
              ? bikesOf.map((m) => <option key={m.index} value={m.index}>{m.name}</option>)
              : Array.from({ length: carCount }, (_, i) => (
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
            background: rgbCss((catalog?.colors || [])[Number(form.color) || 0]),
          }} />
        </div>
        <div className="row" style={{ marginBottom: 8 }}>
          <label>번호판</label>
          {isBike ? (
            // 오토바이에 한국식 입력칸을 보여주면 그 값이 차에 붙는 것처럼 읽힌다 — 실제로는
            // 시뮬레이터가 정한다(#300). 실제 붙은 문자열은 슬롯 목록이 보여준다.
            <span className="hint" style={{ margin: 0 }}>시뮬레이터가 자동 부여합니다 — 실제 문자열은 슬롯 목록에 표시됩니다</span>
          ) : <>
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
            {/* 초기값은 빈 값이다. 빈 항목이 목록에 없으면 브라우저는 첫 옵션(가)을 그려 놓고
                빈 값을 보낸다 — 보이는 것과 보내는 것이 갈린다. 빈 항목을 실제로 둔다. */}
            <option value="">—</option>
            {(catalog?.korList || []).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <input id="sim-plate-number" style={{ width: 62 }} placeholder="4567" title="뒤 4자리"
                 value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} />
          </>}
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
