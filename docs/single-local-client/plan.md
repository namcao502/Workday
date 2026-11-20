# Một màn hình trên PC, app được ưu tiên - plan

**Ticket:** side project (slug `single-local-client`)
**Goal:** Trên PC chỉ một màn hình dùng Workday cùng lúc: app desktop, hoặc một tab web. App luôn thắng. Thiết bị từ xa (điện thoại) không bị giới hạn. Thông báo khi đang dùng app không mở Edge nữa.
**Assumptions:**
- "Local" = request/socket không đi qua tunnel hay VPN (`request.isRemote === false`). Client tự khai loại qua `?client=app|web` trên `/api/events` và header `X-Workday-Client: app|web` trên mọi fetch; app = `isDesktopShell()`.
- Request local không có header (curl, test) vẫn được chấp nhận; giới hạn chỉ để chặn tab web khi app đang mở, không phải ranh giới bảo mật.
- Push local (service worker của Edge, `local-push.json`) bị bỏ qua khi app đang kết nối; app tự hiện thông báo qua WebView2 rồi balloon ở khay.

**Expected outcome (acceptance criteria):**
- [ ] App kết nối: mọi tab web local nhận `session.takenByApp`, socket đóng, tab hiện màn che "Workday đang mở trong app" và ngừng gọi API, không tự kết nối lại.
- [ ] Tab web mở khi app đang kết nối: bị từ chối ngay như trên; REST từ tab web local trả 409 `sessionInApp`.
- [ ] Hai tab web: tab mới thắng; tab cũ nhận `session.takenByTab`, hiện màn che kèm nút "Dùng ở tab này" (kết nối lại và giành quyền).
- [ ] Điện thoại và mọi socket remote không bị ảnh hưởng.
- [ ] Khi app đang kết nối, `sendToLocal` không gửi push tới Edge.
- [ ] Test, typecheck, lint sạch.

### Task 1: Server + core
**Files:** `server/src/events.ts`, `routes/eventsRoute.ts`, `app.ts` (hook REST), `remote/pushService.ts` hoặc chỗ gọi `pushLocal` trong `services.ts`, core `api.ts` (2 event + mã lỗi) + test.
- `EventHub.add(socket, deviceId, surface, client: 'app' | 'web' | null)`; `client` chỉ có nghĩa với socket local (deviceId null).
  - Thêm app: gửi `session.takenByApp` rồi đóng mọi socket local `web`.
  - Thêm web khi có app: gửi `session.takenByApp` cho chính nó rồi đóng.
  - Thêm web khi có web khác: gửi `session.takenByTab` cho các web cũ rồi đóng chúng.
  - `hasLocalApp(): boolean`.
- Đọc `client` từ query `client` của `/api/events`; giá trị lạ = `null` (không áp luật).
- Hook `onRequest` cho `/api/*` local (không phải `/api/events`): header `x-workday-client: web` và `hasLocalApp()` -> 409 `{ ok: false, error: { code: 'sessionInApp' } }`.
- `pushLocal`: không gửi khi `hasLocalApp()`.
- `ServerEvent` thêm `{ type: 'session.takenByApp' }`, `{ type: 'session.takenByTab' }` (không mang dữ liệu); AppError thêm `sessionInApp`.
- Tests: `an app closes local web sockets with takenByApp`, `a web socket is refused while an app is connected`, `a newer web tab replaces the older one`, `remote sockets are never closed by local clients`, `web REST is 409 while an app is connected`, `REST without the header passes`, `local push is skipped while an app is connected`.

### Task 2: Client
**Files:** `api/useEvents.ts`, `api/client.ts` (header), một component màn che (vd `shell/SessionTakenOverlay.tsx`), `App.tsx`, `i18n/en.ts` + `vi.ts`, `errors.ts` + test.
- Socket mở `/api/events?client=app|web`; mọi fetch gắn `X-Workday-Client`.
- Nhận `session.takenByApp` / `session.takenByTab`: ngừng kết nối lại, đặt state toàn app -> màn che phủ toàn trang, react-query dừng refetch (vd `queryClient.cancelQueries()` + không render nội dung).
  - takenByApp: chỉ câu "Workday đang mở trong app desktop."
  - takenByTab: câu "Workday đang mở ở tab khác." + nút "Dùng ở tab này" (kết nối lại; server cho tab này thắng).
- Mã lỗi `sessionInApp` dịch ở `errors.ts`; nhận nó từ REST cũng bật màn che takenByApp.
- Tests: `takenByApp shows the overlay and stops reconnecting`, `takenByTab offers use here and reconnects on click`, `fetch sends the client header`, `socket url carries the client kind`.
