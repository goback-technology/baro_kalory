// 번역 사전 — **데이터만** 있는 파일이다. 읽고 쓰는 규칙은 ./index.mjs 에 있다.
//
// 둘을 가른 이유는 크기다. 사전은 900줄 가까이 되고 t() 하나를 고치려고 그것까지 열게
// 만들 이유가 없다. 반대로 번역 한 줄을 고치는 사람은 여기만 열면 된다.
//
// 키는 **한국어 원문 그 자체**다(이 앱의 원어). 그래서 화면은 리터럴을 t() 로 감싸는
// 것만으로 이미 키를 가진다 — 따로 키를 짓고 관리하는 표가 없다.
// ko source -> { en, vi }. ko is the key itself (returned as-is for lang "ko").
export const DICT = {
  // 백엔드 미연결 게이트 (page-chrome) — 이 UI 는 백엔드와 분리 배포되므로 첫 방문자가
  // "왜 아무것도 안 보이나"를 알 수 있어야 한다.
  "백엔드 API 주소가 설정되지 않았습니다":
    { en: "Backend API address is not configured", vi: "Chưa cấu hình địa chỉ API backend" },
  "백엔드에 연결할 수 없습니다":
    { en: "Cannot reach the backend", vi: "Không thể kết nối tới backend" },
  "이 화면은 UI 뿐입니다. 설정에서 백엔드 주소를 먼저 지정하세요.":
    { en: "This is the UI only. Set the backend address in Settings first.",
      vi: "Đây chỉ là giao diện. Hãy đặt địa chỉ backend trong Cài đặt trước." },
  "주소는 맞는데 응답이 없습니다 — 백엔드가 떠 있는지, 주소·포트가 맞는지 확인하세요.":
    { en: "The address is set but there is no answer — check that the backend is running and the host/port are right.",
      vi: "Đã đặt địa chỉ nhưng không có phản hồi — kiểm tra backend có đang chạy và host/cổng có đúng không." },
  "설정으로 이동": { en: "Go to Settings", vi: "Tới Cài đặt" },
  "미설정 — 백엔드 주소를 지정해야 나머지 화면이 동작합니다":
    { en: "Not set — the rest of the app needs a backend address",
      vi: "Chưa đặt — phần còn lại cần địa chỉ backend" },
  "연결됨": { en: "Connected", vi: "Đã kết nối" },
  "연결 테스트": { en: "Test connection", vi: "Kiểm tra kết nối" },
  "응답 없음": { en: "No response", vi: "Không có phản hồi" },
  "연결 실패": { en: "Connection failed", vi: "Kết nối thất bại" },
  "백엔드가 떠 있는지, 주소·포트가 맞는지 확인하세요":
    { en: "Check that the backend is running and the host/port are correct",
      vi: "Kiểm tra backend có đang chạy và host/cổng có đúng không" },
  "출처가 다르면 백엔드가 이 주소를 CORS 로 허용해야 합니다":
    { en: "If the origin differs, the backend must allow this origin via CORS",
      vi: "Nếu khác origin, backend phải cho phép origin này qua CORS" },
  "스크린샷": { en: "Screenshot", vi: "Ảnh màn hình" },
  "스크린샷 다운로드 — 원본은 카메라에서 새로 받고, 화면은 지금 보이는 프레임 그대로":
    { en: "Download a screenshot — 'original' pulls a fresh full-resolution frame from the camera, 'screen' saves exactly what you see",
      vi: "Tải ảnh chụp — 'gốc' lấy khung hình đầy đủ mới từ camera, 'màn hình' lưu đúng những gì bạn thấy" },
  "스크린샷 해상도": { en: "Screenshot resolution", vi: "Độ phân giải ảnh chụp" },
  "원본 해상도": { en: "Full resolution", vi: "Độ phân giải gốc" },
  "화면 해상도": { en: "Screen resolution", vi: "Độ phân giải màn hình" },
  // header / tabs
  "제어 · 모니터링": { en: "Control · Monitoring", vi: "Điều khiển · Giám sát" },
  "주차면 탐색": { en: "Spot Discovery", vi: "Khám phá chỗ đỗ" },
  "설정": { en: "Settings", vi: "Cài đặt" },

  // control: preview bar
  "프리뷰: 스트림": { en: "Preview: Stream", vi: "Xem trước: Luồng" },
  "프리뷰: 스냅샷": { en: "Preview: Snapshot", vi: "Xem trước: Ảnh chụp" },
  "스냅샷 간격": { en: "Snapshot interval", vi: "Khoảng chụp ảnh" },
  "(스트림=MJPEG 연속 · 스냅샷=폴링, 0=최대)": { en: "(Stream=MJPEG continuous · Snapshot=polling, 0=max)", vi: "(Luồng=MJPEG liên tục · Chụp=thăm dò, 0=tối đa)" },

  // control: cards
  "현재 PTZ": { en: "Current PTZ", vi: "PTZ hiện tại" },
  "중지": { en: "Stop", vi: "Dừng" },
  "Detector 테스트": { en: "Detector Test", vi: "Kiểm tra Detector" },
  "VPD 테스트": { en: "VPD Test", vi: "Kiểm tra VPD" },
  "LPD 테스트": { en: "LPD Test", vi: "Kiểm tra LPD" },
  "LPR 테스트": { en: "LPR Test", vi: "Kiểm tra LPR" },
  "3D Box 검출": { en: "3D Box Detection", vi: "Phát hiện hộp 3D" },
  "전체 테스트": { en: "Test All", vi: "Kiểm tra tất cả" },
  // 3D 판독 — 이 검출기가 재는 것은 픽셀이 아니라 미터다(앞/옆 거리·치수·방위).
  "· 앞 {x} m, 옆 {y} m · {l}×{w}×{h} m · 방위 {yaw}°":
    { en: "· {x} m ahead, {y} m to the side · {l}×{w}×{h} m · yaw {yaw}°",
      vi: "· {x} m phía trước, {y} m bên cạnh · {l}×{w}×{h} m · góc {yaw}°" },
  "기준 {id} · 설치높이 {h} m · {status}":
    { en: "Calibrated as {id} · mount height {h} m · {status}",
      vi: "Chuẩn theo {id} · độ cao lắp {h} m · {status}" },
  "미터 아님": { en: "not metric", vi: "không theo mét" },
  "현재 화면 스냅샷을 검출 API로 보내고 결과 박스를 영상 위에 표시합니다.": { en: "Sends the current snapshot to the detection API and draws result boxes on the video.", vi: "Gửi ảnh chụp hiện tại tới API phát hiện và vẽ khung kết quả lên video." },
  "로그": { en: "Log", vi: "Nhật ký" },

  // discovery
  "프리셋 (구도)": { en: "Presets (Framing)", vi: "Cài đặt sẵn (Bố cục)" },
  "프리셋 이름": { en: "Preset name", vi: "Tên cài đặt sẵn" },
  "현재 카메라 구도를 새 프리셋으로 저장": { en: "Save the current camera framing as a new preset", vi: "Lưu bố cục camera hiện tại thành cài đặt sẵn mới" },
  "아직 프리셋 없음": { en: "No presets yet", vi: "Chưa có cài đặt sẵn" },
  "주차면 점": { en: "Spot Points", vi: "Điểm chỗ đỗ" },
  "VLM 주차인식": { en: "VLM Parking Detect", vi: "VLM Nhận diện đỗ xe" },
  "대기 중": { en: "Idle", vi: "Đang chờ" },
  "프리셋을 선택하세요.": { en: "Select a preset.", vi: "Hãy chọn một cài đặt sẵn." },
  "점을 선택하세요.": { en: "Select a point.", vi: "Hãy chọn một điểm." },

  // homing replay modal
  "호밍 과정": { en: "Homing Process", vi: "Quá trình dò" },
  "닫기 ✕": { en: "Close ✕", vi: "Đóng ✕" },
  "◀ 이전": { en: "◀ Prev", vi: "◀ Trước" },
  "다음 ▶": { en: "Next ▶", vi: "Tiếp ▶" },
  "▶ 자동재생": { en: "▶ Autoplay", vi: "▶ Tự động phát" },
  "확인 불가": { en: "Unavailable", vi: "Không thể xác minh" },
  "보류": { en: "Uncertain", vi: "Chưa xác định" },
  "호밍 종료": { en: "Homing finished", vi: "Dò hoàn tất" },
  "번호판 확인 불가": { en: "Plate not visible", vi: "Không nhìn thấy biển số" },
  "판정 보류": { en: "Decision uncertain", vi: "Chưa thể kết luận" },
  "타깃 판정 보류": { en: "Target ambiguous", vi: "Mục tiêu chưa rõ" },
  "검출기 누락": { en: "Detector miss", vi: "Bộ phát hiện bỏ sót" },
  "검출기 오류": { en: "Detector error", vi: "Lỗi bộ phát hiện" },
  "타깃 추적 상실": { en: "Target lost", vi: "Mất mục tiêu" },
  "번호판 면이 보임": { en: "Plate face visible", vi: "Mặt biển số nhìn thấy được" },
  "번호판 영역이 가려짐": { en: "Plate area occluded", vi: "Vùng biển số bị che" },
  "번호판이 있는 면이 보이지 않음": { en: "Plate-bearing side not visible", vi: "Không thấy mặt có biển số" },
  "최종 가시성 판정:": { en: "Final visibility decision:", vi: "Kết luận khả năng quan sát:" },

  // simulator settings tab (씬 제어 = sim 기기 기반)
  "기기": { en: "Device", vi: "Thiết bị" },
  "＋ 추가": { en: "＋ Add", vi: "＋ Thêm" },
  "시뮬레이터(월드) 하나의 주소와 계정입니다. 제어 포트는 시뮬레이터 전체가 하나 가지며 stage 마다 있는 것이 아닙니다 — 활성 stage 도 이 포트로 고릅니다. 카메라와 무관하므로 카메라가 0 대여도 그대로 남습니다.":
    { en: "The address and account of the one simulator (world). The control port belongs to the simulator as a whole, not one per stage — the active stage is chosen over this same port. It is independent of cameras, so it stays put even with zero cameras.",
      vi: "Địa chỉ và tài khoản của một trình mô phỏng (thế giới) duy nhất. Cổng điều khiển thuộc về toàn bộ trình mô phỏng, không phải mỗi stage một cổng — stage đang hoạt động cũng được chọn qua chính cổng này. Nó độc lập với camera nên vẫn còn ngay cả khi không có camera nào." },
  "무카메라":
    { en: "no camera", vi: "không camera" },
  "고정형":
    { en: "fixed", vi: "cố định" },
  "MJPEG 포트": { en: "MJPEG port", vi: "Cổng MJPEG" },
  "제어 포트": { en: "Control port", vi: "Cổng điều khiển" },
  "시뮬레이터 주소": { en: "Simulator address", vi: "Địa chỉ trình mô phỏng" },
  "설정됨": { en: "Set", vi: "Đã đặt" },
  "시뮬레이터 주소 조회 실패": { en: "Could not read the simulator address", vi: "Không đọc được địa chỉ trình mô phỏng" },
  "시뮬레이터 주소가 없습니다 — 호스트와 제어 포트를 넣으세요.":
    { en: "No simulator address — enter the host and control port.",
      vi: "Chưa có địa chỉ trình mô phỏng — nhập host và cổng điều khiển." },
  "MJPEG 포트가 있으면 RTSP 대신 그 포트를 그대로 중계합니다. 시뮬레이터 주소는 기기가 아니라 시뮬레이터 화면의 「시뮬레이터 주소」에서 정합니다 — 월드 하나의 값이라 카메라와 함께 지워지면 안 됩니다.":
    { en: "With an MJPEG port the server relays that port instead of RTSP. The simulator address is not a device field — set it under 「Simulator address」 on the simulator page; it belongs to the one world and must not vanish with a camera.",
      vi: "Nếu có cổng MJPEG, máy chủ chuyển tiếp cổng đó thay cho RTSP. Địa chỉ trình mô phỏng không thuộc thiết bị — đặt ở 「Địa chỉ trình mô phỏng」 trên trang mô phỏng; nó thuộc về một thế giới duy nhất." },
  "저장": { en: "Save", vi: "Lưu" },
  "저장 중...": { en: "Saving...", vi: "Đang lưu..." },
  "연결 테스트 중...": { en: "Testing connection...", vi: "Đang kiểm tra kết nối..." },
  "연결 테스트 실패": { en: "Connection test failed", vi: "Kiểm tra kết nối thất bại" },
  "상태 확인 실패": { en: "Status check failed", vi: "Kiểm tra trạng thái thất bại" },
  "카메라 배치": { en: "Camera layout", vi: "Bố trí camera" },
  "카메라 컨트롤": { en: "Camera control", vi: "Điều khiển camera" },
  "조종 — 현재 PTZ": { en: "Drive — current PTZ", vi: "Điều khiển — PTZ hiện tại" },
  "설치를 고치는 중…": { en: "Updating the install…", vi: "Đang cập nhật lắp đặt…" },
  "설치로 굳힘: {id} — 이 방향이 팬 0 의 정면입니다":
    { en: "Rebased install: {id} — this bearing is now pan 0",
      vi: "Đã cố định lắp đặt: {id} — hướng này giờ là pan 0" },
  "설치": { en: "Install", vi: "Lắp đặt" },
  "주차장 평면도": { en: "Parking lot map", vi: "Sơ đồ bãi đỗ" },
  "씬 카메라": { en: "Scene cameras", vi: "Camera trong scene" },
  "＋ 카메라 세우기": { en: "＋ Place a camera", vi: "＋ Đặt camera" },
  "하향각": { en: "Tilt down", vi: "Góc chúc" },
  "방위": { en: "Bearing", vi: "Hướng" },
  "씬에서 받은 주차면·카메라가 없습니다.": { en: "The scene reported no slots or cameras.", vi: "Scene không báo chỗ đỗ hay camera nào." },
  "카메라를 세울 자리를 평면도에서 클릭하세요.": { en: "Click the map where the camera should stand.", vi: "Nhấp lên sơ đồ nơi đặt camera." },
  "이 카메라가 바라볼 지면 지점을 클릭하세요 (드래그해도 됩니다).":
    { en: "Click the ground point this camera should look at (dragging works too).",
      vi: "Nhấp điểm trên mặt đất mà camera sẽ nhìn (kéo cũng được)." },
  "높이를 확인하고 세우세요 — 하향각은 높이에서 다시 계산됩니다.":
    { en: "Check the height, then place it — the tilt is recomputed from the height.",
      vi: "Kiểm tra độ cao rồi đặt — góc chúc được tính lại theo độ cao." },
  "먼저 평면도에서 자리를 정하세요.": { en: "Pick a spot on the map first.", vi: "Hãy chọn vị trí trên sơ đồ trước." },
  "조준점은 평면도 안에서 찍어야 합니다.": { en: "The aim point has to be clicked inside the map.", vi: "Điểm ngắm phải được nhấp bên trong sơ đồ." },
  "높이를 입력하세요 (m).": { en: "Enter the height (m).", vi: "Nhập độ cao (m)." },
  "포트를 입력하세요.": { en: "Enter the ports.", vi: "Nhập cổng." },
  "이름을 입력하세요 — 누가 왜 세웠는지가 씬에 남는 유일한 기록입니다.":
    { en: "Enter a name — it is the only record in the scene of who placed this camera and why.",
      vi: "Nhập tên — đây là ghi chép duy nhất trong scene về ai đã dựng camera này và vì sao." },
  "세웠습니다 — 응답이 카메라를 싣지 않아 이름은 목록에서 확인하세요 (sim-cam-{port})":
    { en: "Placed — the response carried no camera, so check the name in the list (sim-cam-{port})",
      vi: "Đã dựng — phản hồi không kèm camera, hãy kiểm tra tên trong danh sách (sim-cam-{port})" },
  "이름 저장 실패 — 카메라는 세워졌습니다":
    { en: "Could not save the name — the camera was placed", vi: "Không lưu được tên — camera đã được dựng" },
  "카메라 포트 대역({from}~{to})이 가득 찼습니다 — 카메라를 지우거나 더 넓은 대역으로 시뮬레이터를 다시 띄우세요.":
    { en: "The camera port band ({from}~{to}) is full — delete a camera, or relaunch the simulator with a wider band.",
      vi: "Dải cổng camera ({from}~{to}) đã đầy — hãy xoá một camera, hoặc khởi động lại trình mô phỏng với dải rộng hơn." },
  "허용 포트 {hf}–{ht} · MJPEG {mf}–{mt}":
    { en: "Allowed ports {hf}–{ht} · MJPEG {mf}–{mt}", vi: "Cổng cho phép {hf}–{ht} · MJPEG {mf}–{mt}" },
  "포트 {p} 는 이 인스턴스의 허용 범위({from}~{to}) 밖입니다.":
    { en: "Port {p} is outside this instance's allowed range ({from}~{to}).",
      vi: "Cổng {p} nằm ngoài dải cho phép của phiên bản này ({from}~{to})." },
  "MJPEG 포트 {p} 는 이 인스턴스의 허용 범위({from}~{to}) 밖입니다.":
    { en: "MJPEG port {p} is outside this instance's allowed range ({from}~{to}).",
      vi: "Cổng MJPEG {p} nằm ngoài dải cho phép của phiên bản này ({from}~{to})." },
  "레벨 저작": { en: "Level-authored", vi: "Tạo trong level" },
  "포즈 없음": { en: "No camera", vi: "Không có camera" },
  "{id} · 기기 {dev}": { en: "{id} · device {dev}", vi: "{id} · thiết bị {dev}" },
  "카메라를 세우는 중…": { en: "Placing the camera…", vi: "Đang đặt camera…" },
  "세우는 중…": { en: "Placing…", vi: "Đang đặt…" },
  "카메라 세움: {id} :{port}": { en: "Camera placed: {id} :{port}", vi: "Đã đặt camera: {id} :{port}" },
  "세웠습니다: {id} · 기기 sim-cam-{port}":
    { en: "Placed: {id} — device sim-cam-{port}", vi: "Đã dựng: {id} — thiết bị sim-cam-{port}" },
  "{id} · 목록을 아직 못 읽었습니다 — 새로고침하세요.":
    { en: "{id} · the device list has not been read yet — refresh.",
      vi: "{id} · chưa đọc được danh sách thiết bị — hãy làm mới." },
  "카메라 '{name}' 를 씬에서 지울까요?":
    { en: "Remove camera '{name}' from the scene?", vi: "Xoá camera '{name}' khỏi cảnh?" },
  "세우기 실패": { en: "Could not place the camera", vi: "Không thể đặt camera" },
  "카메라 세우기 실패": { en: "Placing the camera failed", vi: "Đặt camera thất bại" },
  "카메라를 지우는 중…": { en: "Removing the camera…", vi: "Đang xóa camera…" },
  "지웠습니다: {id}": { en: "Removed: {id}", vi: "Đã xóa: {id}" },
  "카메라 삭제: {id}": { en: "Camera removed: {id}", vi: "Đã xóa camera: {id}" },
  // 저장된 씬 — 런타임에 세운 카메라의 유일한 내구 기록. 저장본은 서버에 남는다.
  "저장 이름": { en: "Save name", vi: "Tên bản lưu" },
  "한글·영숫자·공백과 ._()[]+- 만, 60자까지. 같은 이름으로 저장하면 덮어씁니다.":
    { en: "Hangul, alphanumerics, space and ._()[]+- only, up to 60 chars. The same name overwrites.",
      vi: "Chỉ Hangul, chữ và số, khoảng trắng và ._()[]+-, tối đa 60 ký tự. Cùng tên sẽ ghi đè." },
  "지금 씬(세운 카메라 + 차량)을 서버에 저장합니다":
    { en: "Save the current scene (placed cameras + cars) on the server",
      vi: "Lưu scene hiện tại (camera đã đặt + xe) trên máy chủ" },
  "저장된 씬이 없습니다.": { en: "No saved scenes.", vi: "Chưa có scene nào được lưu." },
  "차량": { en: "Cars", vi: "Xe" },
  "복원": { en: "Restore", vi: "Khôi phục" },
  "이름 바꾸기": { en: "Rename", vi: "Đổi tên" },
  "덮어쓰기": { en: "Overwrite", vi: "Ghi đè" },
  "이름만 바꿉니다 — 담긴 씬은 그대로입니다":
    { en: "Renames only — the saved scene itself is unchanged",
      vi: "Chỉ đổi tên — scene đã lưu giữ nguyên" },
  "이 저장본을 지금 씬으로 덮어씁니다":
    { en: "Overwrite this save with the scene as it is now",
      vi: "Ghi đè bản lưu này bằng scene hiện tại" },
  "이 저장본으로 씬을 되돌립니다":
    { en: "Restore the scene from this save", vi: "Khôi phục scene từ bản lưu này" },
  "'{name}' 저장본을 지금 씬으로 덮어쓸까요?":
    { en: "Overwrite the save '{name}' with the scene as it is now?",
      vi: "Ghi đè bản lưu '{name}' bằng scene hiện tại?" },
  "새 이름": { en: "New name", vi: "Tên mới" },
  "이름을 바꾸는 중…": { en: "Renaming…", vi: "Đang đổi tên…" },
  "이름을 바꿨습니다: {from} → {to}":
    { en: "Renamed: {from} → {to}", vi: "Đã đổi tên: {from} → {to}" },
  "씬 이름 변경: {from} → {to}":
    { en: "Scene save renamed: {from} → {to}", vi: "Đã đổi tên bản lưu scene: {from} → {to}" },
  "이름 바꾸기 실패": { en: "Rename failed", vi: "Đổi tên thất bại" },
  "저장 목록 실패": { en: "Could not list saved scenes", vi: "Không thể liệt kê scene đã lưu" },
  "읽을 수 없음": { en: "Unreadable", vi: "Không đọc được" },
  "저장할 이름을 적으세요.": { en: "Type a name to save under.", vi: "Nhập tên để lưu." },
  "'{name}' 저장본을 덮어쓸까요?": { en: "Overwrite the save '{name}'?", vi: "Ghi đè bản lưu '{name}'?" },
  "저장했습니다 — 카메라 {cams}대 · 차량 {cars}대":
    { en: "Saved — {cams} cameras, {cars} cars", vi: "Đã lưu — {cams} camera, {cars} xe" },
  "씬 저장: {name}": { en: "Scene saved: {name}", vi: "Đã lưu scene: {name}" },
  "씬 저장 실패": { en: "Could not save the scene", vi: "Không thể lưu scene" },
  "저장본 '{name}' 을 지울까요? (씬은 그대로입니다)":
    { en: "Delete the save '{name}'? (the scene itself is untouched)",
      vi: "Xóa bản lưu '{name}'? (scene vẫn giữ nguyên)" },
  "저장본을 지웠습니다: {name}": { en: "Save deleted: {name}", vi: "Đã xóa bản lưu: {name}" },
  "저장본을 읽지 못했습니다": { en: "Could not read the save", vi: "Không đọc được bản lưu" },
  "복원하면 차량이 전부 다시 배치되고, 저장본에 없는 카메라 {n}대가 지워집니다. 계속할까요? (카메라 {cams} · 차량 {cars})":
    { en: "Restoring re-places every car and removes {n} camera(s) missing from the save. Continue? ({cams} cameras · {cars} cars)",
      vi: "Khôi phục sẽ đặt lại toàn bộ xe và xóa {n} camera không có trong bản lưu. Tiếp tục? ({cams} camera · {cars} xe)" },
  "씬을 되돌리는 중…": { en: "Restoring the scene…", vi: "Đang khôi phục scene…" },
  "씬을 저장하는 중…": { en: "Saving the scene…", vi: "Đang lưu scene…" },
  "저장본을 지우는 중…": { en: "Deleting the save…", vi: "Đang xóa bản lưu…" },
  "복원 중…": { en: "Restoring…", vi: "Đang khôi phục…" },
  "이 저장본은 다른 레벨({level})의 것입니다. 그래도 이 레벨에 적용할까요?":
    { en: "This save is from another level ({level}). Apply it to this level anyway?",
      vi: "Bản lưu này thuộc level khác ({level}). Vẫn áp dụng vào level này?" },
  "복원을 취소했습니다.": { en: "Restore cancelled.", vi: "Đã hủy khôi phục." },
  "복원됨 — 카메라 +{sp}/이동 {mv}/삭제 {rm} · 차량 {cars}대{fail}":
    { en: "Restored — cameras +{sp}/moved {mv}/removed {rm} · {cars} cars{fail}",
      vi: "Đã khôi phục — camera +{sp}/di chuyển {mv}/xóa {rm} · {cars} xe{fail}" },
  " · 실패 {n}건": { en: " · {n} failed", vi: " · {n} thất bại" },
  "씬 복원: 카메라 +{sp}/{mv}/{rm} · 차량 {cars}":
    { en: "Scene restored: cameras +{sp}/{mv}/{rm} · {cars} cars",
      vi: "Đã khôi phục scene: camera +{sp}/{mv}/{rm} · {cars} xe" },
  "복원 실패": { en: "Restore failed", vi: "Khôi phục thất bại" },
  // 오라클 대조 — 렌더러의 정답과 우리 광학 모델을 나란히 놓는다.
  "오라클 대조": { en: "Check vs oracle", vi: "Đối chiếu với oracle" },
  "렌더러가 계산한 픽셀(그라운드-트루스)과 우리 광학 모델의 픽셀을 나란히 놓습니다":
    { en: "Puts the renderer's own pixel (ground truth) next to our optics model's pixel",
      vi: "Đặt pixel do trình kết xuất tính (chuẩn thật) cạnh pixel của mô hình quang học" },
  "대조 중…": { en: "Comparing…", vi: "Đang đối chiếu…" },
  "이 카메라의 포즈를 몰라 대조할 수 없습니다.":
    { en: "This camera's pose is unknown, so there is nothing to compare against.",
      vi: "Không biết tư thế của camera này nên không thể đối chiếu." },
  "대조할 주차면이 없습니다.": { en: "No parking slots to compare.", vi: "Không có chỗ đỗ nào để đối chiếu." },
  "모델과 오라클의 차이: {d} px": { en: "Model vs oracle: {d} px", vi: "Mô hình so với oracle: {d} px" },
  "프레임 안 {n}면 · 중앙 {med} px · 최대 {max} px (밖 {o} · 뒤 {b}) — 프레임 {w}×{h}":
    { en: "{n} in frame · median {med} px · max {max} px ({o} outside · {b} behind) — frame {w}×{h}",
      vi: "{n} trong khung · trung vị {med} px · tối đa {max} px ({o} ngoài khung · {b} phía sau) — khung {w}×{h}" },
  "프레임 안에 든 주차면이 없습니다 — 카메라를 주차면 쪽으로 돌리고 다시 재세요. (뒤 {b} · 밖 {o})":
    { en: "No slot landed inside the frame — aim the camera at the slots and measure again. ({b} behind · {o} outside)",
      vi: "Không chỗ đỗ nào nằm trong khung — hãy hướng camera về phía chỗ đỗ rồi đo lại. ({b} phía sau · {o} ngoài khung)" },
  "이 씬에는 렌더가 없어 오라클이 없습니다 (Fake 모드).":
    { en: "This scene has no renderer, so there is no oracle (fake mode).",
      vi: "Scene này không có trình kết xuất nên không có oracle (chế độ fake)." },
  "오라클 대조 실패": { en: "Oracle comparison failed", vi: "Đối chiếu oracle thất bại" },
  "오라클 대조 중…": { en: "Comparing against the oracle…", vi: "Đang đối chiếu với oracle…" },
  "이 씬의 지면 높이를 알 수 없습니다 — 주차면이나 카메라가 하나는 있어야 합니다.":
    { en: "This scene's ground level is unknown — it needs at least one parking slot or camera.",
      vi: "Không biết cao độ mặt đất của scene này — cần ít nhất một chỗ đỗ hoặc camera." },
  // 세워 둔 카메라의 설치 고치기(높이·방위·하향각)
  "그대로": { en: "unchanged", vi: "giữ nguyên" },
  "옮기기": { en: "Move it", vi: "Di chuyển" },
  "고칠 카메라를 찾지 못했습니다 — 목록을 다시 읽으세요.":
    { en: "The camera to edit was not found — reload the list.",
      vi: "Không tìm thấy camera cần sửa — hãy tải lại danh sách." },
  "높이는 0 보다 커야 합니다.": { en: "The height must be greater than 0.", vi: "Chiều cao phải lớn hơn 0." },
  "씬이 이 카메라의 설치 좌표를 주지 않았습니다.":
    { en: "The scene did not report this camera's installed coordinates.",
      vi: "Scene không cung cấp tọa độ lắp đặt của camera này." },
  "바뀐 값이 없습니다.": { en: "Nothing changed.", vi: "Không có gì thay đổi." },
  "카메라를 옮기는 중…": { en: "Moving the camera…", vi: "Đang di chuyển camera…" },
  "클릭 = 선택 · 끌기 = 자리 · 붉은 앵커 = 설치방위":
    { en: "Click = select · drag = move · red anchor = mount bearing",
      vi: "Nhấp = chọn · kéo = di chuyển · neo đỏ = hướng lắp đặt" },
  "붉은 앵커 = 조준 · 모서리 앵커 = 화각(줌)":
    { en: "Red anchor = aim · edge anchors = FOV (zoom)",
      vi: "Neo đỏ = ngắm · neo mép = góc nhìn (zoom)" },
  "씬 x (cm)": { en: "Scene x (cm)", vi: "x của scene (cm)" },
  "씬 y (cm)": { en: "Scene y (cm)", vi: "y của scene (cm)" },
  "설치 높이 — 지면 기준 m (씬 z = H×100 + 지면)":
    { en: "Mount height — metres above ground (scene z = H×100 + ground)",
      vi: "Độ cao lắp đặt — mét so với mặt đất (z của scene = H×100 + mặt đất)" },
  "하향":
    { en: "Tilt", vi: "Cúi" },
  "{name} · 기준기 — 설치는 시뮬 카메라만 고칩니다":
    { en: "{name} · reference rig — only sim cameras have an editable mount", vi: "{name} · giàn tham chiếu — chỉ camera sim mới sửa được lắp đặt" },
  "설치 높이 — 지면 기준 m":
    { en: "Mount height — metres above ground", vi: "Độ cao lắp đặt — mét so với mặt đất" },
  "Hucoms 제어 포트 — 기기 id 가 됩니다 (sim-cam-<포트>)":
    { en: "Hucoms control port — it becomes the device id (sim-cam-<port>)", vi: "Cổng điều khiển Hucoms — trở thành id thiết bị (sim-cam-<cổng>)" },
  "MJPEG 스트림 포트":
    { en: "MJPEG stream port", vi: "Cổng luồng MJPEG" },
  "세우기": { en: "Place", vi: "Dựng" },
  "적용했습니다: {id}":
    { en: "Applied: {id}", vi: "Đã áp dụng: {id}" },
  "적용 실패":
    { en: "Apply failed", vi: "Áp dụng thất bại" },
  "휴컴스 pan (0–35999)":
    { en: "Hucoms pan (0–35999)", vi: "Hucoms pan (0–35999)" },
  "휴컴스 tilt (−2000–9000, 클수록 아래)":
    { en: "Hucoms tilt (−2000–9000, higher = further down)", vi: "Hucoms tilt (−2000–9000, càng lớn càng cúi xuống)" },
  "휴컴스 zoom (0–65535)":
    { en: "Hucoms zoom (0–65535)", vi: "Hucoms zoom (0–65535)" },
  "비우면 높이로 자동":
    { en: "blank = auto from height", vi: "để trống = tự đặt theo độ cao" },
  "사람이 부르는 별명 — 씬에 저장됩니다. 비우면 설치 높이로 만든 이름이 쓰입니다.":
    { en: "A human-facing alias — stored in the scene. Blank falls back to a name made from the mount height.", vi: "Biệt danh cho người đọc — lưu trong scene. Để trống thì dùng tên tạo từ độ cao lắp đặt." },
  " · 레벨 저작(자세 고정)":
    { en: " · authored in level (pose fixed)", vi: " · tạo trong level (tư thế cố định)" },
  "끌어서 조준": { en: "Drag to aim", vi: "Kéo để ngắm" },
  "끌어서 설치방위": { en: "Drag to set the mount bearing", vi: "Kéo để đặt hướng lắp đặt" },
  "설치방위 {m}° — {a}° 돌려 달았습니다":
    { en: "Mount bearing {m}° — remounted {a}°", vi: "Hướng lắp đặt {m}° — đã xoay {a}°" },
  "설치방위: {id} → {m}°":
    { en: "Mount bearing: {id} → {m}°", vi: "Hướng lắp đặt: {id} → {m}°" },
  "설치 고치기 실패": { en: "Install update failed", vi: "Cập nhật lắp đặt thất bại" },
  "제어 :{c} · 프리뷰 :{m}": { en: "control :{c} · preview :{m}", vi: "điều khiển :{c} · xem trước :{m}" },
  "리셋 (PTZ 0)": { en: "Reset (PTZ 0)", vi: "Đặt lại (PTZ 0)" },
  "끌어서 틸트": { en: "Drag to tilt", vi: "Kéo để chỉnh tilt" },
  "끌어서 설치 하향각": { en: "Drag to set the install downtilt", vi: "Kéo để đặt góc chúc lắp đặt" },
  "틸트 {d}°": { en: "Tilt {d}°", vi: "Tilt {d}°" },
  "카메라 틸트: {id} → {d}°": { en: "Camera tilt: {id} → {d}°", vi: "Tilt camera: {id} → {d}°" },
  "설치 하향각 {d}°": { en: "Install downtilt {d}°", vi: "Góc chúc lắp đặt {d}°" },
  "설치 하향각: {id} → {d}°":
    { en: "Install downtilt: {id} → {d}°", vi: "Góc chúc lắp đặt: {id} → {d}°" },
  "설치 자세로 되돌리는 중…": { en: "Returning to the installed pose…", vi: "Đang về tư thế lắp đặt…" },
  "PTZ 0 — 설치 자세와 일치합니다": { en: "PTZ 0 — matches the installed pose", vi: "PTZ 0 — trùng với tư thế lắp đặt" },
  "PTZ 리셋: {id} → 0/0/0": { en: "PTZ reset: {id} → 0/0/0", vi: "Đặt lại PTZ: {id} → 0/0/0" },
  "끌어서 화각(줌)": { en: "Drag for field of view (zoom)", vi: "Kéo để đổi góc nhìn (zoom)" },
  "줌을 맞추는 중…": { en: "Setting the zoom…", vi: "Đang chỉnh zoom…" },
  "화각 {h}° (줌 {z})": { en: "FOV {h}° (zoom {z})", vi: "Góc nhìn {h}° (zoom {z})" },
  "카메라 줌: {id} → 화각 {h}° (줌 {z})":
    { en: "Camera zoom: {id} → FOV {h}° (zoom {z})", vi: "Zoom camera: {id} → góc nhìn {h}° (zoom {z})" },
  "줌 실패": { en: "Zoom failed", vi: "Zoom thất bại" },
  "줌을 바꿀 수 없습니다 — 지금은 다른 카메라를 몰고 있습니다.":
    { en: "Cannot zoom — another camera is being driven.",
      vi: "Không thể zoom — đang điều khiển camera khác." },
  "조준하는 중…": { en: "Aiming…", vi: "Đang ngắm…" },
  "조준했습니다 — {a}° 돌아 {y}°":
    { en: "Aimed — turned {a}° to {y}°", vi: "Đã ngắm — xoay {a}° tới {y}°" },
  "카메라 조준: {id} → {y}° (팬 {p})":
    { en: "Camera aimed: {id} → {y}° (pan {p})", vi: "Camera đã ngắm: {id} → {y}° (pan {p})" },
  "조준할 수 없습니다 — 지금은 다른 카메라를 몰고 있습니다.":
    { en: "Cannot aim — another camera is being driven.",
      vi: "Không thể ngắm — đang điều khiển camera khác." },
  "평면도 안에서 놓아야 조준됩니다.":
    { en: "Drop it inside the map to aim.", vi: "Hãy thả bên trong bản đồ để ngắm." },
  "고른 카메라가 없습니다.":
    { en: "No camera selected.", vi: "Chưa chọn camera nào." },
  "되돌리기": { en: "Revert", vi: "Khôi phục" },
  "씬": { en: "Scene", vi: "Scene" },
  "옮겼습니다 — {d} m":
    { en: "Moved — {d} m", vi: "Đã di chuyển — {d} m" },
  "카메라 이동: {id} → ({x}, {y})":
    { en: "Camera moved: {id} → ({x}, {y})", vi: "Camera đã dời: {id} → ({x}, {y})" },
  "평면도 안에서 놓아야 옮겨집니다.":
    { en: "Drop it inside the map to move it.", vi: "Hãy thả bên trong bản đồ để di chuyển." },
  "레벨에 저작된 카메라는 옮길 수 없습니다.":
    { en: "A level-authored camera cannot be moved.", vi: "Không thể di chuyển camera được tạo trong level." },
  "옮기는 중…": { en: "Moving…", vi: "Đang di chuyển…" },
  "설치 갱신: {id} · {h} m": { en: "Installation updated: {id} · {h} m", vi: "Đã cập nhật lắp đặt: {id} · {h} m" },
  "옮기기 실패": { en: "Move failed", vi: "Di chuyển thất bại" },
  "삭제 중…": { en: "Deleting…", vi: "Đang xóa…" },
  "삭제 실패": { en: "Delete failed", vi: "Xóa thất bại" },
  "제어 포트를 입력하세요 (시뮬레이터 제어 HTTP 포트, 기본 8095).":
    { en: "Enter the control port (the simulator's control HTTP port, default 8095).",
      vi: "Nhập cổng điều khiển (cổng HTTP điều khiển của trình mô phỏng, mặc định 8095)." },
  // settings
  "서비스 상태": { en: "Service Status", vi: "Trạng thái dịch vụ" },
  "상태 새로고침": { en: "Refresh status", vi: "Làm mới trạng thái" },
  "페이지를 열면 자동 확인합니다": { en: "Checked automatically when the page opens", vi: "Tự động kiểm tra khi mở trang" },
  "현재 연결": { en: "Current Connection", vi: "Kết nối hiện tại" },
  "불러오는 중…": { en: "Loading…", vi: "Đang tải…" },
  "기기 (장치)": { en: "Device", vi: "Thiết bị" },
  "활성 기기": { en: "Active device", vi: "Thiết bị đang dùng" },
  "기기 편집": { en: "Edit device", vi: "Sửa thiết bị" },
  // 기기 속성의 설치 높이 — 값은 config 가 아니라 발행본(프로파일)에 있다.
  "예: 6.00": { en: "e.g. 6.00", vi: "vd: 6.00" },
  "기기를 저장한 뒤에 넣을 수 있습니다.":
    { en: "Available once the device has been saved.", vi: "Có thể nhập sau khi đã lưu thiết bị." },
  "읽는 중…": { en: "Reading…", vi: "Đang đọc…" },
  "발행본 rev {rev} · {src}": { en: "Published rev {rev} · {src}", vi: "Bản phát hành rev {rev} · {src}" },
  "출처 없음": { en: "no source", vi: "không rõ nguồn" },
  "아직 없습니다 — 시공 때 잰 값을 넣으면 저장할 때 새 리비전으로 발행됩니다.":
    { en: "Not entered yet — put in the value measured at installation and saving publishes it as a new revision.",
      vi: "Chưa có — nhập giá trị đo lúc lắp đặt, khi lưu sẽ phát hành thành bản sửa đổi mới." },
  "발행된 프로파일이 없습니다 — 캘리브레이션을 먼저 발행해야 높이를 얹을 수 있습니다.":
    { en: "No published profile — publish a calibration first, then the height can sit on top of it.",
      vi: "Chưa có hồ sơ được phát hành — hãy phát hành hiệu chuẩn trước rồi mới đặt được chiều cao." },
  "설치 높이를 읽지 못했습니다": { en: "Could not read the installed height", vi: "Không đọc được chiều cao lắp đặt" },
  "설치 높이가 숫자가 아닙니다 — 발행하지 않았습니다":
    { en: "The installed height is not a number — nothing was published",
      vi: "Chiều cao lắp đặt không phải là số — chưa phát hành gì" },
  "설치 높이는 발행하지 않았습니다": { en: "The installed height was not published", vi: "Chưa phát hành chiều cao lắp đặt" },
  "설치 높이 {v} m 발행": { en: "Installed height {v} m published", vi: "Đã phát hành chiều cao lắp đặt {v} m" },
  "설치 높이 {v} m · rev {rev} 발행":
    { en: "Installed height {v} m published as rev {rev}",
      vi: "Đã phát hành chiều cao lắp đặt {v} m · rev {rev}" },
  "설치 높이 발행 실패": { en: "Publishing the installed height failed", vi: "Phát hành chiều cao lắp đặt thất bại" },
  "이름": { en: "Name", vi: "Tên" },
  "타입": { en: "Type", vi: "Loại" },
  "정문 CCTV": { en: "Front-gate CCTV", vi: "CCTV cổng chính" },
  "호스트": { en: "Host", vi: "Host" },
  "포트": { en: "Port", vi: "Cổng" },
  "계정": { en: "Account", vi: "Tài khoản" },
  "비밀번호": { en: "Password", vi: "Mật khẩu" },
  "삭제": { en: "Delete", vi: "Xóa" },
  "취소": { en: "Cancel", vi: "Hủy" },
  // 설정 화면 탭
  "서버": { en: "Server", vi: "Máy chủ" },
  "검출·판독": { en: "Detection & LPR", vi: "Phát hiện & LPR" },
  "검출기 (baro_detector_api)": { en: "Detector (baro_detector_api)", vi: "Detector (baro_detector_api)" },
  "검출기 URL": { en: "Detector URL", vi: "URL Detector" },
  "차량+번호판 통합 (vpd+lpd). 경로: /vpd/api/v2 · /lpd/api/v1": { en: "Vehicle+plate unified (vpd+lpd). Paths: /vpd/api/v2 · /lpd/api/v1", vi: "Gộp xe+biển số (vpd+lpd). Đường dẫn: /vpd/api/v2 · /lpd/api/v1" },
  "검출기 테스트": { en: "Test detector", vi: "Kiểm tra detector" },
  "LPR 판독 (외부 OCR)": { en: "LPR Reading (external OCR)", vi: "Đọc LPR (OCR ngoài)" },
  "번호판 문자 인식 — 검출기와 별개의 외부 서비스.": { en: "License-plate character recognition — a separate external service from the detector.", vi: "Nhận dạng ký tự biển số — dịch vụ ngoài, tách biệt với detector." },
  // LLM 접속점 카드 — 소비자(호밍)가 아니라 접속점 단위의 카드다.
  "LLM (추론 게이트웨이)": { en: "LLM (inference gateway)", vi: "LLM (cổng suy luận)" },
  "LLM URL": { en: "LLM URL", vi: "URL LLM" },
  "기본 모델": { en: "Default model", vi: "Mô hình mặc định" },
  "OpenAI 호환 접속점 하나 — 통과 프록시와 번호판 가시성 판정이 함께 씁니다. 모델은 이름이 아니라 별칭이며, 연결 테스트가 쓸 수 있는 별칭을 채워 줍니다.":
    { en: "One OpenAI-compatible endpoint — shared by the pass-through proxy and plate-visibility classification. The model is an alias, not a model name; the connection test fills in the usable aliases.",
      vi: "Một điểm cuối tương thích OpenAI — dùng chung cho proxy chuyển tiếp và phân loại tầm nhìn biển số. Mô hình là bí danh chứ không phải tên mô hình; kiểm tra kết nối sẽ điền các bí danh khả dụng." },
  "동작 테스트": { en: "Run test", vi: "Kiểm tra hoạt động" },
  "모델 목록만 읽습니다 — 추론을 돌리지 않습니다":
    { en: "Reads the model list only — runs no inference", vi: "Chỉ đọc danh sách mô hình — không chạy suy luận" },
  "합성 이미지 1장 + JSON 스키마로 실제 판정과 같은 모양을 한 번 돌립니다 (추론 1회)":
    { en: "Runs one call in the same shape as the real classification — a synthetic image plus a JSON schema (one inference)",
      vi: "Chạy một lần đúng dạng như phân loại thật — một ảnh tổng hợp kèm JSON schema (một lần suy luận)" },
  "이 주소는 옛 homing.visibilityVlm 에서 빌려 온 것입니다 — 저장하면 llm 항목으로 옮겨집니다":
    { en: "This address is borrowed from the old homing.visibilityVlm — saving moves it into the llm entry",
      vi: "Địa chỉ này mượn từ homing.visibilityVlm cũ — lưu lại sẽ chuyển vào mục llm" },
  "API 키 (VLM)": { en: "API Keys (VLM)", vi: "Khóa API (VLM)" },
  "sk-ant-… (비우면 기존 유지)": { en: "sk-ant-… (leave blank to keep current)", vi: "sk-ant-… (để trống để giữ nguyên)" },
  "sk-… (비우면 기존 유지)": { en: "sk-… (leave blank to keep current)", vi: "sk-… (để trống để giữ nguyên)" },
  "번호판 호밍": { en: "Plate Homing", vi: "Dò biển số" },
  "이 탭 저장 + 즉시 적용 (무중단)": { en: "Save this tab + apply now (no restart)", vi: "Lưu tab này + áp dụng ngay (không gián đoạn)" },

  // ── dynamic: shared / control ──
  "카메라 이동 중…": { en: "Moving camera…", vi: "Đang di chuyển camera…" },
  "읽기 실패": { en: "Read failed", vi: "Đọc thất bại" },
  "이 기기는 위치를 알려주지 않습니다 (상대 이동 전용)": { en: "This device does not report its position (relative move only)", vi: "Thiết bị này không báo vị trí (chỉ di chuyển tương đối)" },
  "상대 이동": { en: "Relative move", vi: "Di chuyển tương đối" },
  "기준기 (무카메라)": { en: "Reference (no camera)", vi: "Thiết bị chuẩn (không camera)" },
  "현재 {p}": { en: "Now {p}", vi: "Hiện tại {p}" },
  "센터링 ({x}, {y}) → {p}": { en: "Centering ({x}, {y}) → {p}", vi: "Căn giữa ({x}, {y}) → {p}" },
  "센터링 실패": { en: "Centering failed", vi: "Căn giữa thất bại" },
  "박스줌 ({x1},{y1})-({x2},{y2}) → {p}": { en: "Box-zoom ({x1},{y1})-({x2},{y2}) → {p}", vi: "Phóng khung ({x1},{y1})-({x2},{y2}) → {p}" },
  "박스줌 실패": { en: "Box-zoom failed", vi: "Phóng khung thất bại" },

  // ── dynamic: spots ──
  "이동": { en: "Go", vi: "Đi" },
  "이동 실패": { en: "Move failed", vi: "Di chuyển thất bại" },
  // ── dynamic: detector test ──
  "테스트 중…": { en: "Testing…", vi: "Đang kiểm tra…" },
  "{x} 테스트 중…": { en: "Testing {x}…", vi: "Đang kiểm tra {x}…" },
  "테스트 완료: {ok}/{total} 응답 · 영상 위 박스 {n}개": { en: "Test done: {ok}/{total} responded · {n} boxes on video", vi: "Kiểm tra xong: {ok}/{total} phản hồi · {n} khung trên video" },
  "Detector 테스트 완료: {ok}/{total} 응답, 박스 {n}개": { en: "Detector test done: {ok}/{total} responded, {n} boxes", vi: "Kiểm tra Detector xong: {ok}/{total} phản hồi, {n} khung" },
  "테스트 실패": { en: "Test failed", vi: "Kiểm tra thất bại" },
  "Detector 테스트 실패": { en: "Detector test failed", vi: "Kiểm tra Detector thất bại" },
  "HTTP {s} · {c}개 · {ms}ms": { en: "HTTP {s} · {c} items · {ms}ms", vi: "HTTP {s} · {c} mục · {ms}ms" },
  "실패 · {ms}ms": { en: "fail · {ms}ms", vi: "lỗi · {ms}ms" },
  "응답은 정상이나 검출 항목은 없습니다.": { en: "Response OK but no detections.", vi: "Phản hồi OK nhưng không có phát hiện." },

  // ── dynamic: LLM probe ──
  "✅ 응답 · 별칭 {n}개": { en: "✅ Responded · {n} aliases", vi: "✅ Có phản hồi · {n} bí danh" },
  "아직 추론 준비 안 됨": { en: "not ready to infer yet", vi: "chưa sẵn sàng suy luận" },
  "붙었지만 아직 추론할 수 없습니다": { en: "Connected but cannot infer yet", vi: "Đã kết nối nhưng chưa thể suy luận" },
  "동작 테스트 중… (추론 1회)": { en: "Running test… (one inference)", vi: "Đang kiểm tra hoạt động… (một lần suy luận)" },
  "✅ 응답 {ms}ms · 스키마 준수": { en: "✅ Responded in {ms}ms · schema honored", vi: "✅ Phản hồi {ms}ms · đúng schema" },
  "판독이 틀렸습니다 — 이미지가 모델에 제대로 닿지 않을 수 있습니다":
    { en: "wrong answer — the image may not be reaching the model",
      vi: "trả lời sai — ảnh có thể chưa tới được mô hình" },

  // ── dynamic: settings / devices ──
  "Hucoms PTZ (실물)": { en: "Hucoms PTZ (real)", vi: "Hucoms PTZ (thật)" },
  "시뮬레이터": { en: "Simulator", vi: "Trình mô phỏng" },
  "등록됨": { en: "registered", vi: "đã đăng ký" },
  "미등록": { en: "not set", vi: "chưa đặt" },
  "설정 로드 실패": { en: "Config load failed", vi: "Tải cấu hình thất bại" },
  "등록된 기기가 없습니다 — '＋ 추가'로 등록하세요.": { en: "No devices — add one with '＋ Add'.", vi: "Không có thiết bị — thêm bằng '＋ Thêm'." },
  "기기 없음": { en: "No devices", vi: "Không có thiết bị" },
  "편집": { en: "Edit", vi: "Sửa" },
  "(저장됨 · 변경 시에만 입력)": { en: "(saved · enter only to change)", vi: "(đã lưu · chỉ nhập khi đổi)" },
  "기기 편집: {id}": { en: "Edit device: {id}", vi: "Sửa thiết bị: {id}" },
  "ID를 입력하세요": { en: "Enter an ID", vi: "Nhập ID" },
  "host를 입력하세요": { en: "Enter a host", vi: "Nhập host" },
  "이미 있는 id: {id}": { en: "id already exists: {id}", vi: "id đã tồn tại: {id}" },
  "편집 중인 기기가 없습니다": { en: "No device being edited", vi: "Không có thiết bị đang sửa" },
  "새 기기": { en: "New device", vi: "Thiết bị mới" },
  "삭제할 기기를 먼저 선택하세요": { en: "Select a device to delete first", vi: "Hãy chọn thiết bị cần xóa trước" },
  "최소 1개 기기는 있어야 합니다": { en: "At least one device is required", vi: "Cần ít nhất một thiết bị" },
  "기기 '{id}' 를 삭제합니다. 되돌릴 수 없습니다.": { en: "Delete device '{id}'. This cannot be undone.", vi: "Xóa thiết bị '{id}'. Không thể hoàn tác." },
  "저장됨": { en: "Saved", vi: "Đã lưu" },
  "행을 눌러 오른쪽에서 편집하고, 끌어서 순서를 바꿉니다.":
    { en: "Click a row to edit it on the right; drag to reorder.",
      vi: "Nhấp một hàng để sửa bên phải; kéo để đổi thứ tự." },
  "기기 속성": { en: "Device properties", vi: "Thuộc tính thiết bị" },
  // 용도(mode) — 타입과 다른 축이다. 시뮬레이터 페이지가 이 값으로 기기를 고른다.
  "용도": { en: "Role", vi: "Vai trò" },
  "실기 — 실제 카메라": { en: "Real — physical camera", vi: "Thật — camera vật lý" },
  "시뮬레이터 페이지의 카메라 목록에 나타납니다.":
    { en: "Appears in the Simulator page's camera list.",
      vi: "Xuất hiện trong danh sách camera của trang Mô phỏng." },
  "시뮬레이터 페이지에는 나타나지 않습니다.":
    { en: "Does not appear on the Simulator page.",
      vi: "Không xuất hiện trên trang Mô phỏng." },
  // 접속 상세 — "붙긴 붙는데 화면이 안 나온다"를 푸는 값들.
  "스킴": { en: "Scheme", vi: "Giao thức" },
  "자동 (드라이버 기본)": { en: "Auto (driver default)", vi: "Tự động (mặc định driver)" },
  "프리뷰·전송 상세": { en: "Preview & transport details", vi: "Chi tiết xem trước & truyền" },
  "RTSP 경로": { en: "RTSP path", vi: "Đường dẫn RTSP" },
  "RTSP 포트": { en: "RTSP port", vi: "Cổng RTSP" },
  "프리뷰 fps": { en: "Preview fps", vi: "fps xem trước" },
  "상한 없음": { en: "no cap", vi: "không giới hạn" },
  "비우면 스냅샷 폴링으로 내려갑니다. 경로는 벤더 규약이고 번호가 무슨 코덱인지는 기기 설정이 정합니다 — ffprobe 로 확인한 값을 넣으세요. fps 는 기기 실제 fps 를 넣으면 중복 프레임이 사라집니다.":
    { en: "Leave blank to fall back to snapshot polling. The path is a vendor convention and which codec a number maps to is decided by the device — put in what ffprobe reports. Setting fps to the device's real rate removes duplicate frames.",
      vi: "Để trống sẽ quay về lấy ảnh tĩnh. Đường dẫn là quy ước của hãng và số nào ứng với codec nào do thiết bị quyết định — hãy nhập giá trị ffprobe báo. Đặt fps đúng tốc độ thật sẽ hết khung trùng." },
  "타임아웃": { en: "Timeout", vi: "Hết giờ" },
  "없음": { en: "none", vi: "không có" },
  "TLS 인증서 검증 안 함": { en: "Skip TLS certificate verification", vi: "Bỏ qua xác minh chứng chỉ TLS" },
  "공장 자체서명 인증서를 쓰는 HTTPS 기기에만. 이 기기 하나에만 적용됩니다.":
    { en: "Only for HTTPS devices with a factory self-signed certificate. Applies to this device alone.",
      vi: "Chỉ cho thiết bị HTTPS dùng chứng chỉ tự ký của hãng. Chỉ áp dụng cho thiết bị này." },
  "모듈": { en: "Module", vi: "Mô-đun" },
  "영상 채널": { en: "Video ch.", vi: "Kênh hình" },
  "PTZ 채널": { en: "PTZ ch.", vi: "Kênh PTZ" },
  "한 서버가 여러 카메라를 무는 기기에서 몇 번 채널인지. 비우면 0번으로 붙습니다 — 3번 카메라를 등록했는데 1번 화면이 나오면 이 값입니다.":
    { en: "Which channel, on devices where one server carries several cameras. Blank connects to channel 0 — if you registered camera 3 but see camera 1, this is the field.",
      vi: "Kênh số mấy, với thiết bị mà một máy chủ mang nhiều camera. Để trống sẽ nối kênh 0 — nếu đăng ký camera 3 mà thấy camera 1, đây là ô cần sửa." },
  // 가상 PTZ — 고정형 소스 위의 소프트웨어 팬틸트줌.
  "가상 PTZ (고정형 카메라)": { en: "Virtual PTZ (fixed camera)", vi: "PTZ ảo (camera cố định)" },
  "사용": { en: "Enable", vi: "Bật" },
  "소스 화각": { en: "Source HFOV", vi: "HFOV nguồn" },
  "최대 배율": { en: "Max zoom", vi: "Phóng tối đa" },
  "소스 폭": { en: "Source width", vi: "Rộng nguồn" },
  "소스 높이": { en: "Source height", vi: "Cao nguồn" },
  "소스 화각(수평, 0~180)만 있으면 켜집니다. 해상도는 첫 스냅샷의 실측값으로 자동 갱신되고, 최대 배율은 1 초과 64 이하입니다.":
    { en: "A source HFOV (horizontal, 0–180) is all it needs. Resolution is refreshed from the first snapshot; max zoom is above 1 and up to 64.",
      vi: "Chỉ cần HFOV nguồn (ngang, 0–180). Độ phân giải được cập nhật từ ảnh chụp đầu tiên; phóng tối đa lớn hơn 1 và tối đa 64." },
  "가상 PTZ 소스 화각은 0~180 사이여야 합니다":
    { en: "Virtual PTZ source HFOV must be between 0 and 180",
      vi: "HFOV nguồn của PTZ ảo phải trong khoảng 0–180" },
  "가상 PTZ 최대 배율은 1 초과 64 이하여야 합니다":
    { en: "Virtual PTZ max zoom must be above 1 and at most 64",
      vi: "Phóng tối đa của PTZ ảo phải lớn hơn 1 và tối đa 64" },
  "Hucoms CGI 를 평문 HTTP 로 확인한 결과입니다 — 다른 규약의 기기는 이 결과와 무관하게 스킴·RTSP 경로가 맞아야 화면이 나옵니다.":
    { en: "This checked a Hucoms CGI over plain HTTP — for devices on another protocol the scheme and RTSP path still have to be right before any picture appears.",
      vi: "Phép thử này gọi CGI Hucoms qua HTTP thường — với thiết bị dùng giao thức khác, vẫn phải đúng scheme và đường dẫn RTSP thì mới có hình." },
  "순서 저장 중…": { en: "Saving order…", vi: "Đang lưu thứ tự…" },
  "순서 저장됨": { en: "Order saved", vi: "Đã lưu thứ tự" },
  "순서 저장 실패": { en: "Failed to save order", vi: "Lưu thứ tự thất bại" },
  // 캘리브레이션 재사용 — 발행된 프로파일을 다른 기기에 빌려 붙인다.
  "캘리브레이션": { en: "Calibration", vi: "Hiệu chuẩn" },
  "보정 없음": { en: "No calibration", vi: "Không hiệu chuẩn" },
  "내장 프리셋": { en: "built-in preset", vi: "cài đặt sẵn" },
  "조준 곡선만 (구형식)": { en: "aiming curve only (legacy)", vi: "chỉ đường cong ngắm (cũ)" },
  "이 카메라 실측": { en: "measured on this camera", vi: "đo trên camera này" },
  "지정됨": { en: "set", vi: "đã đặt" },
  "발행본 rev {rev} 적용": { en: "published rev {rev} applied", vi: "đã áp dụng rev {rev}" },
  "유지": { en: "Keep", vi: "Giữ" },
  "의 실측값 빌리기": { en: "— borrow its measurements", vi: "— mượn số đo của nó" },
  "클릭 센터링이 보정 없이 동작합니다.": { en: "Click-to-center runs uncorrected.", vi: "Nhấp căn giữa chạy không hiệu chỉnh." },
  "프로파일을 읽지 못했습니다": { en: "Could not read the profile", vi: "Không đọc được hồ sơ" },

  // 프로파일 관리 창구(캘리브레이션 페이지) — 복사·수입·적용·퇴역.
  "복사": { en: "Copy", vi: "Sao chép" },
  "수입": { en: "Import", vi: "Nhập" },
  "적용": { en: "Apply", vi: "Áp dụng" },
  "퇴역": { en: "Retire", vi: "Cho nghỉ" },
  "발행": { en: "Publish", vi: "Phát hành" },
  "닫기": { en: "Close", vi: "Đóng" },
  "원본": { en: "Source", vi: "Nguồn" },
  "리비전": { en: "Revision", vi: "Bản sửa" },
  "메모": { en: "Note", vi: "Ghi chú" },
  "출처": { en: "Origin", vi: "Xuất xứ" },
  "앵커": { en: "Anchors", vi: "Điểm neo" },
  "실측": { en: "Measured", vi: "Đã đo" },
  // 출처를 모르는 문서를 "실측"이라 부르지 않기 위한 값 — provenance 가 막으려던 거짓말이다.
  "출처 미상": { en: "Provenance unknown", vi: "Không rõ nguồn gốc" },
  // "in use" 는 같은 사전의 「사용 중」(Active/Đang dùng)과 겹치고, 「발행본 rev {rev} 적용」의
  // en 이 applied 라 한 파일 안에서 두 말이 된다 — applied 로 통일한다.
  "적용중": { en: "applied", vi: "đang áp dụng" },
  "게이트 우회": { en: "gate bypassed", vi: "đã bỏ qua cổng" },
  "처리 중…": { en: "Working…", vi: "Đang xử lý…" },
  "메모 (선택)": { en: "Note (optional)", vi: "Ghi chú (tùy chọn)" },
  "리비전 {n}개": { en: "{n} revisions", vi: "{n} bản sửa" },
  "최초 실측 기기: {id}": { en: "First measured on: {id}", vi: "Đo lần đầu trên: {id}" },
  "조준 게인 곡선 포함": { en: "includes the aiming-gain curve", vi: "gồm đường cong hệ số ngắm" },
  "화각 곡선만 — 조준 보정 없음": { en: "FOV curve only — no aiming correction", vi: "chỉ đường cong FOV — không hiệu chỉnh ngắm" },
  "다른 카메라의 발행본을 이 카메라의 새 리비전으로 복사합니다.":
    { en: "Copies another camera's published profile into a new revision for this camera.",
      vi: "Sao hồ sơ đã phát hành của camera khác thành bản sửa mới cho camera này." },
  "복사할 수 있는 다른 카메라의 발행본이 없습니다.":
    { en: "No other camera has a published profile to copy.",
      vi: "Không có camera nào khác có hồ sơ để sao." },
  "캘리브레이션은 카메라 개체마다 다릅니다 — 복사한 뒤 검증을 돌려 이 개체에 맞는지 확인하세요. 곡선만 옮겨지고 기기 규격(줌 눈금·배선)은 이 카메라 것으로 다시 기록됩니다.":
    { en: "Calibration differs per unit — after copying, run Verify to confirm it fits this one. Only the curves move; the device spec (zoom scale, wiring) is re-stamped from this camera.",
      vi: "Hiệu chuẩn khác nhau theo từng máy — sau khi sao, hãy chạy Kiểm tra. Chỉ đường cong được chuyển; thông số thiết bị được ghi lại theo camera này." },
  "곡선을 직접 넣어 발행합니다. 스윕을 돌릴 수 없는 기기를 위한 문입니다.":
    { en: "Publish curves you type in. This is the door for devices that cannot be swept.",
      vi: "Phát hành đường cong bạn nhập. Đây là lối cho thiết bị không quét được." },
  "이 값의 출처 (예: 제조사 매뉴얼) — 권장":
    { en: "Where these numbers came from (e.g. vendor manual) — recommended",
      vi: "Nguồn của các số này (vd: sổ tay hãng) — nên ghi" },
  "zoomHfov 는 {z, h}(줌 눈금, 수평화각°) 를 z 오름차순으로 최소 2개. centeringGain 은 {z, k} 이며 없으면 조준 보정 없이 화각만 답합니다. 재지 않은 값이므로 문서에 '수입'으로 남고 잔차는 비어 있습니다.":
    { en: "zoomHfov takes at least two {z, h} pairs (zoom scale, horizontal FOV°) in ascending z. centeringGain takes {z, k}; without it the camera reports FOV but aims uncorrected. Nothing was measured here, so the document records 'import' and leaves the residual empty.",
      vi: "zoomHfov cần ít nhất hai cặp {z, h} theo z tăng dần. centeringGain là {z, k}; thiếu nó thì chỉ báo FOV mà không hiệu chỉnh ngắm. Không đo gì ở đây nên tài liệu ghi 'nhập' và bỏ trống phần dư." },
  "이 카메라에는 아직 발행본이 없습니다.":
    { en: "This camera has no published profile yet.", vi: "Camera này chưa có hồ sơ phát hành." },
  "발행본과 지금 쓰는 값이 다릅니다 — 조준과 화각이 발행본 기준으로 틀립니다.":
    { en: "The published profile and the values in use disagree — aim and FOV are wrong relative to the published profile.",
      vi: "Hồ sơ phát hành và giá trị đang dùng khác nhau — ngắm và FOV sai so với hồ sơ." },
  "발행본 적용": { en: "Apply published", vi: "Áp dụng bản phát hành" },
  // 「재시작해야 적용된다」 계열 항목 4개를 지웠다(2026-08-19). 백엔드 0.17.0 부터 발행이 곧
  // 적용이고 화면은 그 문장을 쓰지 않는다 — 사전에 남겨 두면 다시 집어 쓰기 쉽다.
  // 삭제한 키: "rev {rev} 을 적용했습니다 — …(pm2 restart baro-backend)" ·
  // "{from} 에서 복사해 rev {rev} 로 발행했습니다 — 백엔드 재시작 후 적용됩니다." ·
  // "rev {rev} 로 발행했습니다 — 백엔드 재시작 후 적용됩니다." ·
  // "rev {revs} 를 퇴역시켰습니다. 지금 쓰는 값은 그대로입니다."(퇴역→삭제 개명으로도 죽었다)
  "JSON 을 읽지 못했습니다": { en: "Could not parse the JSON", vi: "Không đọc được JSON" },
  "{from} 에서 복사해 rev {rev} 발행":
    { en: "copied from {from}, published rev {rev}", vi: "sao từ {from}, phát hành rev {rev}" },
  // vi 에서 "복사하다"는 sao chép — 사전의 다른 자리(「복사」)가 이미 그렇게 쓴다.
  "프로파일 복사 실패": { en: "Profile copy failed", vi: "Sao chép hồ sơ thất bại" },
  "프로파일 복사 중…": { en: "Copying profile…", vi: "Đang sao chép hồ sơ…" },
  "{from} 에서 복사 발행": { en: "copied and published from {from}", vi: "đã sao chép và phát hành từ {from}" },
  "실측 객체 · 리비전 표기 없음":
    { en: "measured values, no revision stamp", vi: "giá trị đo, không có dấu bản" },
  // 왼쪽 카탈로그
  "목록을 읽지 못했습니다": { en: "Could not read the list", vi: "Không đọc được danh sách" },
  "발행된 프로파일이 없습니다.": { en: "No published profiles.", vi: "Chưa có hồ sơ nào được phát hành." },
  "(이 카메라)": { en: "(this camera)", vi: "(camera này)" },
  "취소됨": { en: "Cancelled", vi: "Đã hủy" },
  "삭제됨: {id}": { en: "Deleted: {id}", vi: "Đã xóa: {id}" },
  "활성 적용 실패:": { en: "active apply failed:", vi: "áp dụng thiết bị đang dùng thất bại:" },
  "'{id}'(으)로 전환 중…": { en: "Switching to '{id}'…", vi: "Đang chuyển sang '{id}'…" },
  "✅ '{id}'(으)로 전환됨 (무중단)": { en: "✅ Switched to '{id}' (no restart)", vi: "✅ Đã chuyển sang '{id}' (không gián đoạn)" },
  "전환 실패": { en: "Switch failed", vi: "Chuyển thất bại" },
  "백엔드": { en: "Backend", vi: "Backend" },
  "카메라": { en: "Camera", vi: "Camera" },
  "검출기": { en: "Detector", vi: "Detector" },
  "프로브 중…": { en: "Probing…", vi: "Đang dò…" },
  "✅ 응답 · 모델 {model} · FW {fw}": { en: "✅ Responded · model {model} · FW {fw}", vi: "✅ Có phản hồi · model {model} · FW {fw}" },
  "❌ 응답 없음": { en: "❌ No response", vi: "❌ Không phản hồi" },
  "프로브 실패": { en: "Probe failed", vi: "Dò thất bại" },
  "✅ 응답 (status {s})": { en: "✅ Responded (status {s})", vi: "✅ Có phản hồi (status {s})" },
  "저장 중…": { en: "Saving…", vi: "Đang lưu…" },
  "✅ 저장됨.": { en: "✅ Saved.", vi: "✅ Đã lưu." },
  "✅ 저장 + 즉시 적용됨 (무중단).": { en: "✅ Saved + applied now (no restart).", vi: "✅ Đã lưu + áp dụng ngay (không gián đoạn)." },
  "✅ 저장됨 — 단, 활성 적용 실패:": { en: "✅ Saved — but active apply failed:", vi: "✅ Đã lưu — nhưng áp dụng thiết bị đang dùng thất bại:" },
  "저장 실패": { en: "Save failed", vi: "Lưu thất bại" },

  // ── dynamic: discovery ──
  "프리셋 로드 실패": { en: "Preset load failed", vi: "Tải cài đặt sẵn thất bại" },
  "아직 프리셋 없음 — 카메라 구도를 맞춘 뒤 추가하세요.": { en: "No presets yet — frame the camera, then add.", vi: "Chưa có cài đặt sẵn — chỉnh bố cục camera rồi thêm." },
  "{n}점": { en: "{n} pts", vi: "{n} điểm" },
  "점 없음": { en: "No points", vi: "Không có điểm" },
  "프리셋 구도에서 영상 위를 클릭하면 주차면 점이 추가됩니다.": { en: "Click the video in a preset framing to add a spot point.", vi: "Nhấp vào video ở bố cục cài đặt sẵn để thêm điểm chỗ đỗ." },
  "클릭하면 이 프리셋을 선택하고 그 구도로 이동합니다.": { en: "Click to select this preset and move to its framing.", vi: "Nhấp để chọn cài đặt sẵn này và di chuyển tới bố cục của nó." },
  "이 프리셋 구도로 카메라 이동": { en: "Move the camera to this preset's framing", vi: "Di chuyển camera tới bố cục của cài đặt sẵn này" },
  "프리셋 추가됨 (현재 카메라 위치를 저장).": { en: "Preset added (saved current camera position).", vi: "Đã thêm cài đặt sẵn (đã lưu vị trí camera hiện tại)." },
  "추가 실패": { en: "Add failed", vi: "Thêm thất bại" },
  "먼저 프리셋을 선택하세요.": { en: "Select a preset first.", vi: "Hãy chọn cài đặt sẵn trước." },
  "계산중…": { en: "Computing…", vi: "Đang tính…" },
  "VLM 주차인식 계산 중… (수십 초)": { en: "VLM parking detection… (tens of seconds)", vi: "VLM nhận diện đỗ xe… (vài chục giây)" },
  "VLM({prov}·{model}) 주차인식: 점 {c}개 {act}.": { en: "VLM({prov}·{model}) parking detect: {c} points {act}.", vi: "VLM({prov}·{model}) nhận diện đỗ xe: {c} điểm {act}." },
  "교체": { en: "replaced", vi: "thay thế" },
  "추가": { en: "added", vi: "thêm" },
  "VLM 인식 실패": { en: "VLM detection failed", vi: "VLM nhận diện thất bại" },
  "프리셋에 점이 없습니다 (먼저 점을 찍거나 VLM 자동 검출).": { en: "Preset has no points (place points or run VLM auto-detect first).", vi: "Cài đặt sẵn chưa có điểm (đặt điểm hoặc chạy VLM tự phát hiện trước)." },
  "번호판 호밍 시작 — 카메라가 점마다 줌인합니다.": { en: "Plate homing started — the camera zooms in on each point.", vi: "Bắt đầu dò biển số — camera phóng to từng điểm." },
  "호밍 시작 실패": { en: "Homing start failed", vi: "Bắt đầu dò thất bại" },
  "이 점은 과정 기록이 없습니다.": { en: "This point has no process record.", vi: "Điểm này không có bản ghi quá trình." },
  "점 '{name}' 번호판 호밍 과정 — {n}스텝": { en: "Plate-homing process for point '{name}' — {n} steps", vi: "Quá trình dò biển số điểm '{name}' — {n} bước" },
  "⏸ 정지": { en: "⏸ Pause", vi: "⏸ Tạm dừng" },
  "중지 실패": { en: "Stop failed", vi: "Dừng thất bại" },
  "완료": { en: "Done", vi: "Hoàn tất" },
  "중지됨": { en: "Stopped", vi: "Đã dừng" },
  // 프리뷰 정지 상태 — 화면 중앙에 글자로 뜬다(깨진 이미지 아이콘 대신).
  "정지됨": { en: "Paused", vi: "Đã tạm dừng" },
  "백그라운드 — 자동 정지": { en: "Background — stopped automatically", vi: "Nền — tự động dừng" },
  "이 점은 아직 번호판 호밍이 안 됐습니다.": { en: "This point hasn't been plate-homed yet.", vi: "Điểm này chưa được dò biển số." },
  "점 '{name}' 번호판으로 이동…": { en: "Moving to plate of point '{name}'…", vi: "Đang tới biển số của điểm '{name}'…" },
  "번호판 보기 실패": { en: "View plate failed", vi: "Xem biển số thất bại" },
  "이름 변경 실패": { en: "Rename failed", vi: "Đổi tên thất bại" },
  "프리셋으로 이동 중…": { en: "Moving to preset…", vi: "Đang tới cài đặt sẵn…" },
  "'{name}' 구도. 영상 위를 클릭해 주차면 점을 찍으세요.": { en: "'{name}' framing. Click the video to place spot points.", vi: "Bố cục '{name}'. Nhấp lên video để đặt điểm chỗ đỗ." },
  "점 로드 실패": { en: "Point load failed", vi: "Tải điểm thất bại" },
  "아직 점 없음 — 프리셋 구도에서 영상을 클릭하세요.": { en: "No points yet — click the video in a preset framing.", vi: "Chưa có điểm — nhấp video ở bố cục cài đặt sẵn." },
  "조준": { en: "Aim", vi: "Ngắm" },
  "처리중": { en: "Processing", vi: "Đang xử lý" },
  "성공": { en: "OK", vi: "OK" },
  "실패": { en: "Failed", vi: "Thất bại" },
  "미호밍": { en: "Not homed", vi: "Chưa dò" },
  "이 점을 화면 중앙으로 조준": { en: "Aim this point to the center of the view", vi: "Ngắm điểm này vào giữa màn hình" },
  "삭제할 점이 없습니다.": { en: "No points to delete.", vi: "Không có điểm để xóa." },
  "호밍": { en: "Homing", vi: "Dò" },
  "번호판": { en: "Plate", vi: "Biển số" },
  "과정": { en: "Process", vi: "Quá trình" },
  "전체 삭제": { en: "Delete all", vi: "Xóa tất cả" },
  "호밍 중": { en: "Homing", vi: "Đang dò" },
  "이 프리셋의 주차면 점 {n}개를 모두 삭제할까요?": { en: "Delete all {n} spot points of this preset?", vi: "Xóa toàn bộ {n} điểm chỗ đỗ của cài đặt sẵn này?" },
  "점 {n}개 삭제됨.": { en: "{n} points deleted.", vi: "Đã xóa {n} điểm." },
  "현재 프레임의 주차 차량을 VLM으로 자동 검출해 점으로 추가": { en: "Auto-detect parked cars in the current frame with a VLM and add them as points", vi: "Tự động phát hiện xe đỗ trong khung hiện tại bằng VLM và thêm làm điểm" },
  "자동 검출 시 기존 점을 지우고 교체": { en: "Replace existing points on auto-detect", vi: "Thay điểm hiện có khi tự động phát hiện" },
  "모든 점을 순회하며 번호판까지 줌인 호밍": { en: "Home every point, zooming in to each plate", vi: "Dò tất cả điểm, phóng to tới từng biển số" },
  "이 프리셋의 주차면 점 전체 삭제": { en: "Delete all spot points of this preset", vi: "Xóa toàn bộ điểm chỗ đỗ của cài đặt sẵn này" },
  "이 점만 다시 번호판 호밍": { en: "Re-home plate for this point only", vi: "Dò lại biển số chỉ điểm này" },
  "이 점만 번호판 호밍": { en: "Plate-home this point only", vi: "Dò biển số chỉ điểm này" },
  "번호판 확대 보기 (z{z})": { en: "Zoom in on plate (z{z})", vi: "Phóng to biển số (z{z})" },
  "호밍 줌인 과정 다시보기 ({n}스텝)": { en: "Replay homing zoom-in process ({n} steps)", vi: "Xem lại quá trình phóng to dò ({n} bước)" },
  "프리셋 구도에서만 점을 찍을 수 있습니다. (프리셋을 클릭해 이동)": { en: "You can only place points in the preset framing. (click a preset to move)", vi: "Chỉ có thể đặt điểm ở bố cục cài đặt sẵn. (nhấp cài đặt sẵn để di chuyển)" },
  "점 '{name}' 추가 ({x},{y}).": { en: "Point '{name}' added ({x},{y}).", vi: "Đã thêm điểm '{name}' ({x},{y})." },
  "점 추가 실패": { en: "Add point failed", vi: "Thêm điểm thất bại" },
  "이름 수정 (Enter로 저장)": { en: "Edit name (Enter to save)", vi: "Sửa tên (Enter để lưu)" },
  "조준 중…": { en: "Aiming…", vi: "Đang ngắm…" },
  "'{name}' 조준.": { en: "Aimed '{name}'.", vi: "Đã ngắm '{name}'." },
  "조준 실패": { en: "Aim failed", vi: "Ngắm thất bại" },

  // ── dynamic: settings detail + homing status + replay captions ──
  "활성": { en: "Active", vi: "Đang dùng" },
  "— '연결 테스트'로 실물/시뮬·모델 확인": { en: "— use 'Test connection' to verify real/sim·model", vi: "— dùng 'Kiểm tra kết nối' để xác nhận thật/mô phỏng·model" },
  "점": { en: "point", vi: "điểm" },
  "· 카메라 복귀 실패(수동 확인 필요)": { en: "· camera return failed (manual check needed)", vi: "· camera không về được (cần kiểm tra thủ công)" },
  "호밍 상태 조회 실패(재시도 중)": { en: "Homing status query failed (retrying)", vi: "Truy vấn trạng thái dò thất bại (đang thử lại)" },
  "기하 폴백": { en: "geometry fallback", vi: "dự phòng hình học" },
  "내 차 판 선택(#{i})": { en: "my-car plate selected (#{i})", vi: "đã chọn biển xe của tôi (#{i})" },
  "접근 시도(부분/소형 판 — 더 가까이)": { en: "approach attempt (partial/small plate — closer)", vi: "thử tiếp cận (biển một phần/nhỏ — gần hơn)" },
  "내 차 판 없음(드리프트 차단)": { en: "no my-car plate (drift blocked)", vi: "không có biển xe tôi (chặn trôi)" },
  "선비(VLM):": { en: "Scholar (VLM):", vi: "Học giả (VLM):" },
  "점 '{name}' 번호판 보기 — z{z} · {px}px (프리셋을 클릭하면 와이드 복귀).": { en: "Point '{name}' plate view — z{z} · {px}px (click a preset to return wide).", vi: "Điểm '{name}' xem biển — z{z} · {px}px (nhấp cài đặt sẵn để về rộng)." },
  "프리셋 '{name}'을(를) 삭제할까요? (그 안의 점들도 함께 삭제)": { en: "Delete preset '{name}'? (its points are deleted too)", vi: "Xóa cài đặt sẵn '{name}'? (các điểm bên trong cũng bị xóa)" },

  // ── shared browser modules: camera-preview + ptz-controls ──
  "프리뷰: 스트림(MJPEG)": { en: "Preview: Stream (MJPEG)", vi: "Xem trước: Luồng (MJPEG)" },
  "스트림": { en: "Stream", vi: "Luồng" },
  "스트림 연결 중…": { en: "Connecting stream…", vi: "Đang kết nối luồng…" },
  "MJPEG 스트림 사용 불가 → 스냅샷 폴링으로 전환": { en: "MJPEG stream unavailable → switching to snapshot polling", vi: "Không dùng được luồng MJPEG → chuyển sang chụp thăm dò" },
  "이동 → {p}": { en: "Move → {p}", vi: "Di chuyển → {p}" },
  "절대 이동 → {p}": { en: "Absolute move → {p}", vi: "Di chuyển tuyệt đối → {p}" },
  "절대 이동 실패": { en: "Absolute move failed", vi: "Di chuyển tuyệt đối thất bại" },
  "수동 조정 (이동량 step)": { en: "Manual control (step)", vi: "Điều khiển thủ công (bước)" },
  "속도": { en: "Speed", vi: "Tốc độ" },
  "절대 위치 이동": { en: "Absolute move", vi: "Di chuyển vị trí tuyệt đối" },
  "채우기": { en: "Fill", vi: "Điền" },

  // ── 스크린샷 ──
  "스크린샷 저장: {name}": { en: "Screenshot saved: {name}", vi: "Đã lưu ảnh chụp: {name}" },
  "스크린샷 실패": { en: "Screenshot failed", vi: "Chụp màn hình thất bại" },
  "스크린샷 실패: 표시 중인 영상 프레임이 없습니다": { en: "Screenshot failed: no video frame is being shown", vi: "Chụp màn hình thất bại: không có khung hình đang hiển thị" },
  "스크린샷 실패: 인코딩 오류": { en: "Screenshot failed: encoding error", vi: "Chụp màn hình thất bại: lỗi mã hóa" },

  // ── 설치 높이(측량) 축 ──
  // 이 축의 문구는 위상을 말한다: 정본은 시공 실측이고 자동 측정은 보조 출처다. 번역이
  // 그 위상을 뭉개면(예: measured 를 그냥 "measured height" 로) 화면이 자동을 정본처럼
  // 보이게 만든다 — 이 축이 가장 피해야 하는 오해다.
  "설치 높이": { en: "Installed height", vi: "Chiều cao lắp đặt" },
  "설치 높이 · 측량": { en: "Installed height · Survey", vi: "Chiều cao lắp đặt · Đo đạc" },
  "카메라가 지면에서 몇 미터에 달렸는가 — 시공 실측 입력(정본)과 영상 자동 측정(보조). 광학 곡선이 있어야 잴 수 있다.":
    { en: "How many metres above the ground the camera is mounted — the installer's tape measure (primary) and video measurement (secondary). Needs the optical curve first.",
      vi: "Camera được lắp cao bao nhiêu mét so với mặt đất — đo bằng thước khi lắp (nguồn chính) và đo qua video (phụ). Cần đường cong quang học trước." },
  "현재 설치 높이": { en: "Current installed height", vi: "Chiều cao lắp đặt hiện tại" },
  "시공 입력 (정본)": { en: "Installer entry (primary)", vi: "Nhập khi lắp đặt (nguồn chính)" },
  "자동 측정 (보조)": { en: "Automatic measurement (secondary)", vi: "Đo tự động (phụ)" },
  "측정 결과": { en: "Measurement result", vi: "Kết quả đo" },
  "설치 때 사람이 잰 값이 이 축의 정본입니다. 카메라를 옮기면 무효가 되고, 다른 카메라로 복사할 수 없습니다.":
    { en: "A person measuring at install time is the primary source here. Moving the camera voids the value, and it can never be copied from another unit.",
      vi: "Giá trị do người đo khi lắp đặt là nguồn chính. Di chuyển camera làm giá trị mất hiệu lực, và không thể sao chép từ camera khác." },
  "번호판이 미터를 들여오고 도장 격자가 기하를 줍니다. 둘 다 있어야 답이 나옵니다. 픽셀을 각으로 바꾸는 데 이 기기의 줌→화각 곡선을 씁니다.":
    { en: "The licence plate brings in metres and the painted grid brings in geometry. Both are required. Turning pixels into angles uses this device's zoom→HFOV curve.",
      vi: "Biển số mang lại đơn vị mét, còn lưới sơn mang lại hình học. Cần cả hai. Việc đổi pixel thành góc dùng đường cong zoom→HFOV của thiết bị này." },
  "이 기기에는 발행된 캘리브레이션이 없습니다 — 백엔드가 기본 곡선으로 대신 잽니다. 초점거리 오차가 높이에 그대로 배율로 곱해지므로 결과를 실측으로 쓰지 마세요.":
    { en: "This device has no published calibration — the backend measures with a default curve instead. A focal-length error scales the height directly, so do not treat the result as a measurement.",
      vi: "Thiết bị này chưa có hiệu chuẩn được phát hành — backend sẽ đo bằng đường cong mặc định. Sai số tiêu cự nhân thẳng vào chiều cao, nên đừng coi kết quả là số đo thực." },
  "영상에서 설치 높이를 잽니다 — 수 분간 카메라를 점유합니다":
    { en: "Measures the installed height from video — owns the camera for several minutes",
      vi: "Đo chiều cao lắp đặt từ video — chiếm camera trong vài phút" },
  "미측량": { en: "Unsurveyed", vi: "Chưa đo" },
  "설치 높이 있음": { en: "Height known", vi: "Đã biết chiều cao" },
  "측량됨": { en: "Surveyed", vi: "Đã đo đạc" },
  "빈칸은 결함이 아니라 정상 상태입니다. 높이를 모르면 월드 좌표를 광고하지 않습니다.":
    { en: "Blank is a normal state, not a defect. Without a height the camera does not advertise world coordinates.",
      vi: "Để trống là trạng thái bình thường, không phải lỗi. Không biết chiều cao thì không công bố tọa độ thế giới." },
  "지면까지의 거리를 줄 수 있습니다. 월드 좌표(위치·방위)는 아직 모릅니다.":
    { en: "It can give ground distance. World coordinates (position and bearing) are still unknown.",
      vi: "Có thể cho khoảng cách tới mặt đất. Tọa độ thế giới (vị trí, hướng) thì chưa biết." },
  "월드 자세까지 압니다.": { en: "World pose is known too.", vi: "Đã biết cả tư thế trong hệ tọa độ thế giới." },
  "시공 시 현장 실측": { en: "Measured on site at install", vi: "Đo tại hiện trường khi lắp đặt" },
  "도면 · 폴 규격": { en: "Drawing / pole spec", vi: "Bản vẽ / quy cách cột" },
  "영상 자동 측정 (보조)": { en: "Measured from video (secondary)", vi: "Đo tự động từ video (phụ)" },
  "높이": { en: "Height", vi: "Chiều cao" },
  "시각": { en: "Time", vi: "Thời điểm" },
  "측정자": { en: "Operator", vi: "Người đo" },
  "이름 또는 팀": { en: "Name or team", vi: "Tên hoặc nhóm" },
  "줄자 · 폴 도면 등": { en: "Tape measure, pole drawing, …", vi: "Thước dây, bản vẽ cột, …" },
  "프로파일": { en: "Profile", vi: "Hồ sơ" },
  "읽지 못했습니다": { en: "Could not read it", vi: "Không đọc được" },
  "활성 기기를 알 수 없습니다.": { en: "The active device is unknown.", vi: "Không xác định được thiết bị đang hoạt động." },
  "{id} 에 발행된 프로파일이 없습니다 — 캘리브레이션을 먼저 발행하세요.":
    { en: "No profile has been published for {id} — publish a calibration first.",
      vi: "Chưa có hồ sơ nào được phát hành cho {id} — hãy phát hành hiệu chuẩn trước." },
  "높이를 미터로 입력하세요.": { en: "Enter the height in metres.", vi: "Hãy nhập chiều cao theo mét." },
  "{v} 는 1~30 m 밖입니다 — cm 를 넣으신 건 아닌가요?":
    { en: "{v} is outside 1–30 m — did you enter centimetres?",
      vi: "{v} nằm ngoài khoảng 1–30 m — bạn có nhập nhầm đơn vị cm không?" },
  "{id} 의 설치 높이를 {v} m 로 발행합니다. 발행본은 불변이라 정정도 새 리비전으로 남습니다.":
    { en: "Publish {v} m as the installed height of {id}. Published documents are immutable, so a correction becomes another revision.",
      vi: "Phát hành {v} m làm chiều cao lắp đặt của {id}. Bản phát hành là bất biến, nên sửa lại sẽ tạo một phiên bản mới." },
  "발행 중…": { en: "Publishing…", vi: "Đang phát hành…" },
  "발행 실패": { en: "Publish failed", vi: "Phát hành thất bại" },
  "rev {rev} 로 발행했습니다.": { en: "Published as rev {rev}.", vi: "Đã phát hành thành rev {rev}." },
  "영상 처리": { en: "Image processing", vi: "Xử lý ảnh" },
  // "검출기" 는 이미 위(Detector 테스트)에 있다 — 같은 낱말이라 다시 넣지 않는다.
  "준비됨": { en: "Ready", vi: "Sẵn sàng" },
  "미설정": { en: "Not configured", vi: "Chưa cấu hình" },
  "사이드카 상태는 대기 중일 때만 보고됩니다.":
    { en: "Side-car readiness is reported only while the axis is idle.",
      vi: "Trạng thái side-car chỉ được báo khi trục đang rảnh." },
  "격자 재료": { en: "Grid material", vi: "Dữ liệu lưới" },
  "자 {n}": { en: "{n} rulers", vi: "{n} thước" },
  "지면선 {n}": { en: "{n} ground lines", vi: "{n} vạch mặt đất" },
  "측정 중": { en: "Measuring", vi: "Đang đo" },
  "측정 시작": { en: "Start measuring", vi: "Bắt đầu đo" },
  "{m}분 {s}초 경과": { en: "{m}m {s}s elapsed", vi: "Đã trôi qua {m} phút {s} giây" },
  "카메라가 원위치로 돌아가지 못했습니다 — 수동 확인이 필요합니다.":
    { en: "The camera did not return to where it started — check it manually.",
      vi: "Camera chưa quay lại vị trí ban đầu — cần kiểm tra thủ công." },
  "측정이 수 분 동안 이 카메라를 점유합니다. 그동안 수동 조작은 거절됩니다. 시작할까요?":
    { en: "The measurement owns this camera for several minutes and manual moves are refused meanwhile. Start?",
      vi: "Phép đo sẽ chiếm camera này trong vài phút và mọi thao tác thủ công bị từ chối. Bắt đầu chứ?" },
  "이 기기의 줌→화각 곡선이 없습니다 — 캘리브레이션을 먼저 발행하세요. (픽셀을 각으로 바꾸려면 초점거리가 필요합니다)":
    { en: "This device has no zoom→HFOV curve — publish a calibration first. (Pixels become angles only if the focal length is known.)",
      vi: "Thiết bị này chưa có đường cong zoom→HFOV — hãy phát hành hiệu chuẩn trước. (Pixel chỉ thành góc khi biết tiêu cự.)" },
  "이 백엔드에는 높이 측정 축이 구성돼 있지 않습니다 — 시공 입력은 그대로 쓸 수 있습니다.":
    { en: "This backend has no height axis configured — the installer entry still works.",
      vi: "Backend này chưa cấu hình trục chiều cao — phần nhập khi lắp đặt vẫn dùng được." },
  "상태 조회 실패": { en: "Status query failed", vi: "Truy vấn trạng thái thất bại" },
  "측정 중 — 결과는 끝나야 나옵니다": { en: "Measuring — the result comes when it finishes", vi: "Đang đo — kết quả chỉ có khi kết thúc" },
  "아직 측정하지 않았습니다": { en: "Not measured yet", vi: "Chưa đo lần nào" },
  "합격": { en: "Accepted", vi: "Đạt" },
  "거부": { en: "Refused", vi: "Bị từ chối" },
  "측정값": { en: "Measured value", vi: "Giá trị đo" },
  "값이 나오지 않았습니다 — 발행할 것이 없습니다.":
    { en: "No value came out — there is nothing to publish.",
      vi: "Không có giá trị nào — không có gì để phát hành." },
  "게이트가 거부한 값입니다 — 발행할 수 없습니다.":
    { en: "The gates refused this value — it cannot be published.",
      vi: "Các ngưỡng đã từ chối giá trị này — không thể phát hành." },
  "번호판 지상고": { en: "Plate height above ground", vi: "Chiều cao biển số so với mặt đất" },
  " (물리 대역 {lo}~{hi})": { en: " (physical band {lo}–{hi})", vi: " (dải vật lý {lo}–{hi})" },
  "판정 항목": { en: "Gate", vi: "Tiêu chí" },
  "문턱": { en: "Threshold", vi: "Ngưỡng" },
  "방향 퍼짐": { en: "Direction spread", vi: "Độ tản hướng" },
  "격자 잔차": { en: "Grid residual", vi: "Sai số lưới" },
  "번호판 수": { en: "Plates", vi: "Số biển số" },
  "군집 지지율": { en: "Cluster support", vi: "Tỷ lệ ủng hộ cụm" },
  "군집 산포": { en: "Cluster spread", vi: "Độ tản trong cụm" },
  "자들이 다 같은 방향이면 높이와 자세가 상쇄돼 어떤 높이든 맞아 보입니다.":
    { en: "When every ruler points the same way, height and pose cancel and any height fits.",
      vi: "Nếu mọi thước đều cùng hướng, chiều cao và tư thế triệt tiêu nhau nên chiều cao nào cũng có vẻ đúng." },
  "도장선을 잘못 읽은 것입니다. 판을 더 모아도 이건 못 고칩니다 — 기하가 틀리면 모든 판이 같이 틀리고 자기들끼리는 사이좋게 일치합니다.":
    { en: "The painted lines were read wrong. More plates cannot fix this — when the geometry is wrong every plate is wrong together and they agree with each other about it.",
      vi: "Các vạch sơn đã bị đọc sai. Thêm biển số cũng không sửa được — hình học sai thì mọi biển số cùng sai và chúng nhất trí với nhau." },
  "군집 투표가 성립하지 않습니다.": { en: "A cluster vote is not possible.", vi: "Không thể bỏ phiếu theo cụm." },
  "판들이 서로 다른 답을 말하고 있습니다.": { en: "The plates disagree with each other.", vi: "Các biển số cho ra kết quả khác nhau." },
  "군집 안에서도 값이 벌어져 있습니다.": { en: "The values spread out even inside the cluster.", vi: "Ngay trong cụm, các giá trị cũng phân tán." },
  "제안 발행": { en: "Publish proposal", vi: "Phát hành đề xuất" },
  "이 측정을 근거와 함께 발행본의 설치 높이로 올립니다 (source: measured)":
    { en: "Publishes this measurement, with its evidence, as the profile's installed height (source: measured)",
      vi: "Phát hành phép đo này kèm bằng chứng làm chiều cao lắp đặt của hồ sơ (source: measured)" },
  "자동 측정은 보조 출처입니다 — 근거(measurement)가 함께 문서에 실립니다.":
    { en: "Automatic measurement is a secondary source — the evidence rides along in the document.",
      vi: "Đo tự động là nguồn phụ — bằng chứng được ghi kèm trong tài liệu." },
  "측정값 {v} m 를 자동 측정(measured)으로 발행합니다. 정본은 시공 실측이며 이 값은 보조 출처로 남습니다.":
    { en: "Publish {v} m as an automatic measurement (source: measured). The primary source is still the installer's measurement; this stays secondary.",
      vi: "Phát hành {v} m dưới dạng đo tự động (source: measured). Nguồn chính vẫn là số đo khi lắp đặt; giá trị này là nguồn phụ." },
};

// Elements with inline markup: key -> full innerHTML per language (data-i18n-html="<key>").
export const HTML = {
  "replay.legend": {
    ko: '흰 박스=후보 LP · <span style="color:#16d05a">녹색=선택</span> · 빨강 십자=중앙',
    en: 'White box=candidate LP · <span style="color:#16d05a">green=selected</span> · red cross=center',
    vi: 'Khung trắng=LP ứng viên · <span style="color:#16d05a">xanh=được chọn</span> · chữ thập đỏ=tâm',
  },
  "height.normalRefusal": {
    ko: '이 축은 <b>답을 못 내는 것이 정상 출력</b>입니다. 합격한 측정만 발행할 수 있고, 게이트를 우회하는 문은 없습니다 — 조용히 틀린 높이는 없느니만 못하기 때문입니다.',
    en: 'For this axis, <b>not answering is a normal outcome</b>. Only an accepted measurement can be published and there is no door around the gates — a quietly wrong height is worse than none.',
    vi: 'Với trục này, <b>không đưa ra câu trả lời là kết quả bình thường</b>. Chỉ phép đo đạt ngưỡng mới được phát hành và không có cửa nào đi vòng — một chiều cao sai một cách âm thầm còn tệ hơn là không có.',
  },
};