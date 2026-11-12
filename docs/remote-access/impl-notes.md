# Impl notes: remote-access

Ghi lại chỗ code lệch plan, quyết định plan không nói, đánh đổi. Mỗi task một mục `## Task N`.

## Task 1: Core quyền + server mã hóa secret và config remote
- **Lệch:** mã hóa lại `secrets.json` dạng rõ nằm trong `readFileSecrets` (lần đọc đầu lúc `SettingsService` khởi tạo), không phải `loadConfig`; kết quả như nhau: xảy ra ở lần khởi động đầu.
- **Lệch:** `runUpdate` tạm bỏ `remote` / `tunnelToken` khỏi update (kèm một `eslint-disable`) để `tunnelToken` không lọt vào `config.json`; Task 2 xử lý thật và bỏ dòng disable.
- **Quyết định:** `NO_SECRETS` dùng chung cho mọi chỗ gọi `saveSecrets`; test đọc secret qua `readFileSecrets` vì file đã mã hóa. `WORKDAY_MASTER_KEY` sai dạng throw ở lần đọc secret đầu tiên (chưa có thông báo riêng trong `main.ts`).
- **Đánh đổi:** test được viết trước nhưng không chạy đỏ trước.
- Test core 200, server 211 + 1 skipped, client 50 PASS; typecheck, lint, convention lint sạch.

## Task 2: Server: thiết bị, ghép nối, cổng truy cập từ xa và nhật ký
- **Lệch:** thêm `request.accessEmail` (email từ JWT) để `POST /api/pair` ghi email mà không kiểm JWT hai lần; thêm `testing/remoteTestApp.ts` cho test dùng chung.
- **Lệch (vá lỗ):** bước "URL không bắt đầu `/api/` thì cho qua" trong plan để lọt `/%61pi/board` (khớp route `/api/board`). Cổng xét cả mẫu route đã khớp, có test.
- **Quyết định:** cookie thiết bị được đọc cả trên route `unpaired` để `/api/me` trả `remote`. `Pairing.submit` trả `pairingClosed` / `wrongCode` thay cho null của C#. Approve / reject khi không có gì chờ -> 409; id thiết bị lạ -> 404. Chỉ ghi nhật ký cho request ghi từ thiết bị đã biết. `publicHost` được đọc lại mỗi request vì đổi khi lưu settings.
- **Review (task-reviewer opus, PASS):** đã sửa: certs chỉ tải lại vì `kid` lạ tối đa mỗi phút; kiểm `Origin` chạy trước lối `unpaired` (nên `POST /api/pair` Origin lạ -> 403 `forbidden` thay vì 401); hai lần Approve cùng lúc chỉ tạo một thiết bị (yêu cầu vẫn `waiting` trong lúc lưu); tắt remote đóng mọi socket của thiết bị (`EventHub.closeAllDevices`); `/api/pair/status` có `cache-control: no-store`. Không sửa: socket mở đúng lúc thu hồi có thể sống thêm (khe vài ms, chỉ nhận tên sự kiện).
- Chưa kiểm được với tunnel thật: `cloudflared` có luôn gửi `cf-ray` / `cf-connecting-ip` không, dạng thật của certs và claim của Access.
- Test server 252 + 1 skipped, core 200, client 50 PASS; typecheck, lint, convention lint sạch.

## Task 4: Client: chế độ từ xa, ghép nối, PWA
- **Lệch:** các hàm `/api/me`, `/api/pair*`, `/api/push*` nằm trong file mới `api/remoteApi.ts` (vì `client.ts` đã ~330 dòng); `client.ts` export thêm `send`, `hasOkFlag`, `isPlainCode`. `eslint.config.js` cho `public/sw.js` global `self`.
- **Quyết định:** 401 bất kỳ đâu -> `QueryCache` / `MutationCache` `onError` trong `App` đặt cache `/api/me` thành `unpaired`, hiện màn ghép nối; không retry 401 / 403. `ApiError` có thêm `code` để hiện một dòng cho `accessRequired` / `remoteDisabled`.
- **Quyết định:** `useAccess()` đọc context do `App` điền từ `/api/me`; không có provider thì coi là local (test cũ không đổi). Từ xa ẩn Workspace và Insights; Board giữ ô search, ẩn Add / Check now / menu dòng khi không có act.
- **Quyết định:** `PairPage` nhận `onApproved`, `pollMs`, `timeoutMs` làm prop để test không phải chờ / reload. Payload `sw.js` đọc `{ title, body, url, tag }` khớp `PushMessage` của server.
- Chưa thử trên trình duyệt thật: đăng ký push (`pushSubscription.ts`) chỉ được test gián tiếp qua `DevicePage`. File tĩnh của PWA (`/manifest.webmanifest`, `/sw.js`, `/icons/*`) không bắt đầu `/api/` nên cổng cho qua khi chưa ghép nối (Task 2, bước 3).
- Test client 67/67 PASS, typecheck client và lint sạch.

## Task 3: Server: Web Push và cloudflared
- **Lệch:** thêm `timesheet/runNotification.ts` (text push Anh / Việt và tag theo ngày) và `remote/remoteService.test.ts` (3 test nối tunnel). `remoteService` giữ `TunnelSupervisor` và `push`; thêm `setPushSubscription`, `shutdown` (gọi trong `main.ts` khi tắt).
- **Quyết định:** request local tới `PUT` / `DELETE /api/push`, `POST /api/push/test` -> 409 (không có thiết bị); body sai -> 400. `test-push` cho id lạ -> `{ ok: false }` thay vì 404. Cặp khóa VAPID tạo ở lần đầu gọi `GET /api/push/key`.
- **Quyết định:** tunnel đang `failed` được khởi động lại ở mỗi lần `configure`, kể cả khi path / token không đổi (đó là "thử lại ở lần configure sau" cho trường hợp thiếu file).
- **Đánh đổi:** test của `pushService` không chạy đỏ trước. Chưa chạy `cloudflared` thật.
- Test server 280 + 1 skipped PASS; typecheck server và lint sạch.

## Task 5: Client: Settings > Remote access (trên PC)
- **Lệch:** tách thêm `settings/RemotePairing.tsx`, `settings/RemoteActivity.tsx`, `api/remoteSettingsApi.ts` để mỗi file dưới 300 dòng và không sửa file của Task 4.
- **Quyết định:** trạng thái tunnel là chữ ("Tunnel running"...), đỏ khi `failed`, `tunnelDetail` trong tooltip (không có chấm màu). Nút Pair dựa trên config remote đã lưu (bật), không theo form chưa lưu. Sau `POST /api/remote/pairing` client tải lại `GET /api/remote` thay vì dùng `PairingView` trả về.
- **Đánh đổi:** lỗi của pairing / thiết bị / push hiện một câu chung "Could not reach the Workday server", kể cả 409 `pairingClosed`. `levelLabel` / `areaLabel` lặp lại với `DevicePage.tsx`.
- Test client 72/72 PASS.

## Kiểm tra cuối (luồng chính)
- `npm test` (core 200, server 280 + 1 skipped, client 72), typecheck, lint, convention lint, `npm run build` sạch; `dist` có `manifest.webmanifest`, `sw.js`, `icons/`.
- Chạy bản build với data dir tạm và config remote bật: local `/api/me` -> `mode: local`, `/api/remote` 200; Host = `publicHost` không JWT, header `cf-ray` từ loopback, JWT giả -> đều 403 `accessRequired`; file PWA phục vụ đúng content type; `master.key` được tạo.
- Chưa thử với Cloudflare thật (tunnel, Access JWT, certs thật, ghép nối iPhone, push): người dùng làm theo mục "Kiểm tra cuối giai đoạn" của plan.
