# Impl notes: vpn-access

## Task 1: Core + config: kiểu VPN, CIDR, lưu cấu hình
- **Lệch:** `parseSettingsUpdate(raw, currentPort)` nhận thêm cổng hiện tại (và `SettingsService.port`) để kiểm cổng VPN khác cổng app; dùng `port` trong chính update nếu có.
- **Quyết định:** `enabled` chỉ `true` khi đúng là `true` và có ít nhất 1 dải (như `parseRemote`); `enabled` không phải boolean trong PUT -> cả `vpn` sai -> 400.
- **Quyết định:** thêm `firewallCancelled` / `firewallFailed` vào `client/src/errors.ts` ngay task này vì switch trên `AppError` không còn typecheck.
- Build PASS, core 6/6, server 116 pass. 3 test `worktreeService` timeout khi chạy cả suite nặng, chạy riêng 8/8 PASS.

## Task 2: Server: CA + cert, địa chỉ mạng, lệnh tường lửa, setup server
- **Lệch:** thêm dependency `reflect-metadata` (import đầu `lanCertificates.ts`): `@peculiar/x509` 3.1.0 kéo `tsyringe`, thiếu polyfill thì throw lúc import.
- **Lệch (sửa ở gate):** `openFirewall` dùng `Start-Process -PassThru` + `exit $elevated.ExitCode` và tiền tố `$ErrorActionPreference = 'Stop'` trong lệnh mã hóa; bản đầu luôn exit 0 nên `New-NetFirewallRule` lỗi vẫn báo thành công.
- **Quyết định:** dùng `webcrypto` của `node:crypto` (tsconfig server không có DOM lib nên không có kiểu `CryptoKey` global).
- **Quyết định:** thêm 3 test ngoài danh sách (firewallFailed, trang tiếng Việt, open cùng / khác tham số) cho các luật plan đã nêu.
- Context7 không có trong subagent; API x509 đọc từ `index.d.ts` đã cài.
- Build PASS, `src/remote` 74/74 PASS.

## Task 3: Server: surface VPN trong `createApp` và cổng kiểm
- **Lệch:** test pairing qua VPN đặt ở `remoteGate.test.ts` (cần helper dựng instance VPN) thay vì `remoteRoutes.test.ts`; `testApp.ts` / `remoteTestApp.ts` thêm option `vpn` / `surface`.
- **Lệch (quy trình):** implementer viết code và test cùng lượt, không thấy test đỏ trước.
- **Quyết định:** `Fastify<https.Server>({ https })` + annotate `FastifyInstance`, vì overload mặc định suy ra HTTP/2 và vỡ kiểu.
- **Quyết định:** gate bỏ tiền tố `::ffff:` khỏi socket address trước `isInRanges`, nên `remoteIp` là IPv4 trần.
- Build PASS, `src/remote` + `src/routes` + `app.test.ts` 193/193 PASS.

## Task 4: Server: vòng đời listener VPN, `RemoteService`, route tường lửa, wiring
- **Lệch:** `LanServerDeps.setup` là `Pick<SetupServer, 'open' | 'close'>` để test truyền fake không cần cast.
- **Lệch:** push origin giờ yêu cầu Cloudflare `enabled`; trước đây dùng `publicHost` cả khi remote tắt.
- **Quyết định:** setup server mở lỗi (cổng bận) chỉ log, listener VPN vẫn chạy; `apply` cùng địa chỉ vẫn đồng bộ setup để trang setup thấy dải mới.
- **Quyết định:** `lan.stop()` = `apply(null)`, nên tắt máy cũng phát `remote.changed`.
- **Quyết định:** luật CLAUDE.md "chỉ nghe 127.0.0.1" thêm ngoại lệ listener HTTPS của VPN; `deploy.md` ghi nút tường lửa chỉ cho Windows.
- Thêm 1 test ngoài danh sách (setup chỉ mở khi `running`). Build PASS, 206/206 PASS.

## Task 5: Client: khối VPN trong Settings, QR ghép nối
- **Lệch (sửa ở gate):** form dựng trước khi status về nên địa chỉ mặc định trống; thêm effect điền `addresses[0]` khi chưa lưu cấu hình VPN và ô còn trống.
- **Quyết định:** lỗi form chỉ hiện khi bấm Save, xóa khi sửa lại ô VPN; không kiểm trực tiếp.
- **Quyết định:** `ComboBox` dùng `allowsCustomValue` + `onInputChange` (không dùng `onSelectionChange` đã deprecated).
- **Quyết định:** tiêu đề "Cloudflare" không dịch (tên thương hiệu); nút tường lửa disabled kèm chữ "Lưu dải IP trước".
- **Đánh đổi:** ô dải IP dùng `TextField` multiline chung, cao cố định 10 dòng.
- Settings 44/44 PASS.
