# Desktop PWA: Workday như một app trên PC

**Ticket:** side project, slug `desktop-pwa`

**Goal:** Cài Workday (Edge / Chrome, `http://127.0.0.1:4870`) thành app trên PC dùng được hằng ngày:
- Có trang chờ khi server chưa chạy.
- Có shortcut ở icon taskbar.
- Thông báo desktop vẫn hiện khi đã đóng cửa sổ app.

**Expected outcome (acceptance criteria):**
- [ ] Service worker `/sw.js` đăng ký mỗi lần app mở (local và remote), không chỉ lúc bật push.
- [ ] Mở một trang khi server không trả lời (lỗi mạng, hoặc 502 / 503 / 504 / 530 qua tunnel): SW trả `offline.html`.
  - Trang này ghi "Workday server is not running, retrying..." theo cả hai ngôn ngữ, và hỏi `/api/health` mỗi 3 s.
  - Có trả lời thì tự tải lại `/`.
  - Không cache gì khác: API, asset và trang bình thường vẫn đi thẳng ra mạng.
- [ ] Manifest có `shortcuts` tới `/#/tickets`, `/#/workspace`, `/#/timesheet`, mỗi cái có icon.
- [ ] Trên PC (local), Settings > Notices có nút bật "thông báo cả khi đã đóng Workday", lưu một push subscription local.
  - Server gửi Web Push tới các subscription local cho mỗi notice có kênh `desktop`.
  - Khi trình duyệt đã có subscription local, client không tự hiện `new Notification` nữa (không hiện hai lần).
  - Bấm vào thông báo mở đúng target.
- [ ] Route subscription local là local-only (không có `config.access`); request remote bị 403.
- [ ] Push local chạy cả khi chưa cấu hình remote (`publicHost` null): VAPID subject là `https://localhost`.

**Assumptions:**
- Không có gói Electron / Tauri: PWA của Edge / Chrome là đủ, server vẫn là task logon.
- Nội dung thông báo đi qua push service của trình duyệt (FCM / WNS), đã mã hóa đầu-cuối theo Web Push, giống push điện thoại hiện có.
- Không làm icon ở khay hệ thống: PWA không có.

---

### Task 1: Service worker offline + shortcuts

**Files:**
- Modify: `packages/client/public/sw.js`
  - `install`: precache `/offline.html` + `/icons/icon-192.png` vào cache có version, rồi `skipWaiting()`.
  - `activate`: xóa cache cũ, `clients.claim()`.
  - `fetch`: chỉ xử lý `request.mode === 'navigate'`. Gọi mạng; lỗi mạng hoặc status thuộc {502, 503, 504, 530} thì trả `offline.html` từ cache. Mọi request khác không gọi `respondWith`.
- Create: `packages/client/public/offline.html`
  - Tự chứa (CSS inline, không import bundle), nền tối như theme.
  - Text song ngữ theo `navigator.language`.
  - Script inline: `fetch('/api/health', {cache:'no-store'})` mỗi 3 s, ok thì `location.replace('/')`.
- Create: `packages/client/src/registerServiceWorker.ts`
  - Đăng ký `/sw.js` khi có `navigator.serviceWorker`, nuốt lỗi (log `console.warn`).
  - Gọi từ `main.tsx`; `pushSubscription.ts` dùng lại hàm này.
- Modify: `packages/client/public/manifest.webmanifest`: thêm `shortcuts` (tên tiếng Anh, `url`, `icons` 192) và `"id": "/"`.
- Server: kiểm `/sw.js` và `/offline.html` được phục vụ khi build, không bị fallback `index.html`. Thêm header `Cache-Control: no-cache` cho `/sw.js` nếu static chưa có.

**Tests:**
- `the manifest shortcuts point at known pages` (client: parse manifest, `pageFromHash` của mỗi url khác default hoặc đúng `tickets`)
- `sw.js and offline.html are served, not index.html` (server, có client build giả trong temp như test cũ)
- Logic SW chỉ kiểm tay (ghi impl-notes); không thêm harness SW.

### Task 2: Push desktop local

**Files:**
- Create: `packages/server/src/notices/localPushStore.ts`
  - `local-push.json` = mảng `PushSubscriptionJSON` đã validate (endpoint https, keys p256dh / auth).
  - Bỏ trùng theo endpoint, tối đa 5 (mới nhất thắng).
- Modify: `packages/server/src/remote/pushService.ts`
  - `sendToLocal(message)` gửi tới mọi subscription local; 404 / 410 thì xóa subscription đó (như thiết bị).
  - `vapidDetails` dùng subject `https://localhost` khi không có public host.
- Modify: `packages/server/src/notices/noticeService.ts`: notice có kênh `desktop` thì push local với:
  - `tag: notice-<id>`;
  - `url` theo target đầy đủ (local mở được Workspace), không qua `pushUrl` của điện thoại;
  - lỗi chỉ log.
- Create route: `PUT /api/push/local` (body subscription) và `DELETE /api/push/local` (body `{endpoint}`), không có `config.access`.
  - `GET /api/push/key` phải dùng được từ local; nếu chưa được thì cho local gọi.
- Client:
  - `pushSubscription.ts`: thêm `subscribeLocalPush()`, `unsubscribeLocalPush()`, `localPushActive(): Promise<boolean>`.
  - `useNotices.ts`: bỏ qua `new Notification` khi `localPushActive` (đọc một lần lúc mount và sau khi bật / tắt).
  - `NoticesSection.tsx`: chỉ ở mode local, có nút bật / tắt "Notify even when Workday is closed" / "Thông báo cả khi đã đóng Workday", và báo khi bị từ chối quyền.
  - Text qua `t(en, vi)`.

**Tests:**
- `local push routes reject a remote request`
- `a desktop notice is pushed to local subscriptions with its tag`
- `a notice without the desktop channel is not pushed locally`
- `a gone local subscription is removed`
- `vapid subject falls back to https://localhost without a public host`
- `the store keeps at most 5 and dedupes by endpoint`
- `no in-window desktop notification while local push is active` (client)
