# Impl notes: desktop-pwa

## Task 1: Service worker offline + shortcuts
- **Quyết định:** cache `workday-offline-v1` chỉ chứa `offline.html` + icon; fetch chỉ xử lý `navigate`. `Cache-Control: no-cache` cho `sw.js` đặt trong static plugin của `app.ts`.
- Gate: eslint báo `caches` / `fetch` / `Response` chưa khai báo trong `sw.js`; thêm vào globals của `eslint.config.js`.

## Task 2: Push desktop local
- **Lệch:** store local nằm trong `PushService` (`push.local`), không phải wiring mới ở `remoteService.ts`. `parsePushSubscription` dùng chung với `pushRoutes.ts`.
- **Quyết định:** chỉ `sendToLocal` dùng subject `https://localhost`; push điện thoại vẫn cần public host. Ở mode remote, `useNotices` không xét push local. Toast trong app vẫn hiện; chỉ bỏ `new Notification`. Target `board` mở `/#/tickets`.
- Test client 149, core 573, server 658 + 1 skip PASS; typecheck, lint, build, convention lint sạch.

## Kiểm tra cuối
- Server build: `/sw.js` 200 + `no-cache`, `/offline.html` phục vụ đúng file, manifest có 3 shortcut, `PUT /api/push/local` body sai -> 400, request remote -> 403.
- Chưa test live: cài PWA, trang offline khi tắt server, jump list, push khi đã đóng cửa sổ qua FCM / WNS với subject `https://localhost`.
