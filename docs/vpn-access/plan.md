# Workday VPN access Implementation Plan

> **For agentic workers:** Use impl-write to execute this plan task-by-task.

**Ticket:** side project, manual git (slug `vpn-access`)

**Frontend repo:** none -- client nằm cùng repo (`packages/client`)

**Goal:** Thêm chế độ truy cập từ xa qua VPN công ty như app WPF đã làm (server nghe thêm HTTPS trên IP tĩnh của PC, CA tự ký, tường lửa chỉ mở cho dải IP cho phép), chạy song song với chế độ Cloudflare hiện có (giữ nguyên để dùng lại sau), dùng chung ghép nối thiết bị, quyền theo vùng, push và nhật ký.

**Expected outcome (acceptance criteria):**
- [ ] Settings > Remote access có khối **VPN** mới: switch bật/tắt riêng, địa chỉ (chọn từ IPv4 của máy, gõ tay được), HTTPS port (mặc định 8443), setup port (mặc định 8444), dải IP cho phép (CIDR, mỗi dòng một dải), trạng thái listener, fingerprint CA, nút "Mở tường lửa".
- [ ] Khối **Cloudflare** vẫn còn đủ ô và chạy như trước (tunnel, Access JWT, tunnel token, `WORKDAY_TUNNEL_TOKEN`); config Cloudflare đã lưu đọc lại không đổi.
- [ ] Bật VPN + Save: server nghe `https://<address>:<httpsPort>` bằng cert do CA riêng ký (SAN = IP, hạn 397 ngày); trạng thái `running`, hoặc `failed` kèm lý do (IP không thuộc máy, cổng bận). Tắt VPN: listener HTTPS đóng và WebSocket của các thiết bị đang nối qua VPN bị đóng; Cloudflare không bị ảnh hưởng (và ngược lại).
- [ ] `http://127.0.0.1:<port>` trên PC vẫn chạy y như cũ, không cần ghép nối.
- [ ] Request vào listener VPN từ IP ngoài các dải cho phép bị 403 `forbidden`; Host khác `<address>:<httpsPort>` bị 403; trong dải nhưng chưa ghép nối gọi `/api/...` bị 401 `notPaired`; thiết bị View gọi action bị 403; POST có Origin khác `https://<address>:<httpsPort>` bị 403. Listener VPN không cần Access JWT.
- [ ] Bấm Pair: ngoài mã 6 ký tự còn hiện QR + link `http://<address>:<setupPort>/setup`, link HTTPS VPN (và link Cloudflare nếu bật). Setup port chỉ mở khi VPN bật và đang có cửa sổ ghép nối hoặc yêu cầu chờ duyệt; phục vụ đúng `/setup` (hướng dẫn cài + tin cậy CA trên iPhone, theo ngôn ngữ app) và `/ca.cer`.
- [ ] Nút "Mở tường lửa" chạy PowerShell elevated (UAC) tạo rule `Workday Remote` inbound TCP cho 2 cổng, `-RemoteAddress` = các dải cho phép; hủy UAC báo "Đã hủy", lỗi báo lỗi; dải không phải IPv4 CIDR không bao giờ lọt vào lệnh.
- [ ] Cert server được cấp lại khi IP đổi hoặc còn dưới 30 ngày (kiểm lúc bật và mỗi 24 giờ, đổi không cần restart listener); CA giữ nguyên nên điện thoại không phải cài lại. Khóa riêng của CA và server được mã hóa bằng `master.key`.
- [ ] Push dùng VAPID subject của Cloudflare (`https://<publicHost>`) khi Cloudflare bật, không thì `https://<address>:<httpsPort>`; IP thiết bị ghép nối qua VPN lấy từ socket.
- [ ] README, `docs/cutover/deploy.md` và luật trong `CLAUDE.md` mô tả cả hai chế độ.

**Architecture:** Instance Fastify hiện tại vẫn nghe HTTP trên `127.0.0.1` (local, hoặc remote qua tunnel Cloudflare như cũ). `LanServer` dựng thêm một instance bằng chính `createApp` với surface `vpn` (Fastify `https`), dùng chung service; mọi request vào đó là remote và qua cổng kiểm riêng (dải IP -> Host/Origin -> thiết bị -> quyền). `SetupServer` (node:http) chỉ mở khi đang ghép nối. Logic thuần (CIDR, kiểm dải) ở core; cert, mạng, tường lửa, listener ở server.

**Assumptions:**
- `WorkdayConfig.remote` (Cloudflare) giữ nguyên shape; VPN là field anh em mới `WorkdayConfig.vpn`, để config cũ không cần migrate.
- Cổng mặc định 8443 / 8444 như WPF; dải IP không có mặc định, phải có ít nhất 1 dải mới bật được.
- Thiết bị đã ghép nối với WPF không import (cookie khác tên): ghép nối lại một lần. Cookie gắn theo host, nên một điện thoại dùng cả Cloudflare lẫn VPN sẽ là 2 thiết bị.
- Thiết bị ghép nối qua VPN có `email: null` (không có Access).
- Khóa riêng mã hóa bằng `secretBox` + `master.key` thay cho DPAPI của WPF.
- Khi `npm run dev`, listener VPN phục vụ bản client đã build (`packages/client/dist`); điện thoại dùng bản `npm start` là chính.
- Chỉ Windows (lệnh tường lửa là `New-NetFirewallRule`); Linux để sau.

**Tech Stack:** Node 22, Fastify 5 (`https` option, `server.setSecureContext`), `@peculiar/x509` (mới, server: tạo CA + cert ECDSA P-256), `qrcode` (mới, client), React + HeroUI.

---

### Task 1: Core + config: kiểu VPN, CIDR, lưu cấu hình

**Files:**
- Modify: `packages/core/src/api.ts` -- thêm `VpnConfig`, `VpnStatusView`; `WorkdayConfig.vpn`, `SettingsUpdate.vpn`, `RemoteStatusView.vpn`; `AppError` thêm `firewallCancelled`, `firewallFailed`. `RemoteConfig`, tunnel, `accessRequired` giữ nguyên.
- Modify: `packages/core/src/remoteAccess.ts` -- `parseIpv4`, `isIpv4Cidr`, `isInRanges`
- Modify: `packages/server/src/config.ts` -- `parseVpn`, đọc / ghi `vpn` trong `config.json`
- Modify: `packages/server/src/settings/parseSettings.ts`, `settings/settingsService.ts` -- nhận `vpn` trong `PUT /api/settings`; dep `remote` thêm `configureVpn`; `apply` gọi `remote.configureVpn(vpn)` cạnh `remote.configure(remote)`
- Modify: `packages/server/src/remote/remoteService.ts` -- getter `vpnConfig` và `configureVpn(vpn)` chỉ lưu cấu hình (Task 3 thêm đóng socket, Task 4 gọi listener)
- Test: `packages/core/src/remoteAccess.test.ts`, `packages/server/src/config.test.ts`, test settings hiện có

**Shape:**
```ts
export interface VpnConfig {
  readonly enabled: boolean
  readonly address: string // the PC's static IPv4 on the VPN, "10.20.30.40"
  readonly httpsPort: number // 8443: the app and its API
  readonly setupPort: number // 8444: plain HTTP, the CA and the setup page while pairing
  readonly allowedRanges: readonly string[] // IPv4 CIDR, "10.20.0.0/16"
}

export interface VpnStatusView {
  readonly server: 'off' | 'starting' | 'running' | 'failed'
  readonly serverDetail: string | null // the error text, untranslated
  readonly addresses: readonly string[] // this PC's IPv4 addresses, for the address picker
  readonly httpsUrl: string | null // "https://10.20.30.40:8443" while configured
  readonly setupUrl: string | null // "http://10.20.30.40:8444/setup" while configured
  readonly caFingerprint: string | null // SHA-256 of the CA, "AB:CD:...", once the CA exists
}
// RemoteStatusView gains `vpn: VpnStatusView`; WorkdayConfig and SettingsUpdate gain `vpn: VpnConfig | null`.

export function parseIpv4(text: string): number | null // canonical dotted quad only, else null
export function isIpv4Cidr(range: string): boolean
export function isInRanges(address: string, ranges: readonly string[]): boolean
```

**Logic:**
- `parseIpv4`: đúng 4 số 0-255, không có số 0 đứng đầu ("010" sai), trả uint32. `isIpv4Cidr`: `a.b.c.d/n`, `n` 0-32, IP hợp lệ theo `parseIpv4`.
- `isInRanges`: bỏ tiền tố `::ffff:` (IPv4-mapped) trước khi so; dải sai dạng bị bỏ qua; `/0` khớp tất cả; dùng `>>> 0` để không ra số âm.
- `parseVpn(raw, appPort)`: `address` phải qua `parseIpv4`; cổng là số nguyên 1-65535, thiếu thì 8443 / 8444; hai cổng khác nhau và khác `appPort`; dải chỉ giữ cái hợp lệ (bỏ trùng, giữ thứ tự). Thiếu `address` hoặc cổng sai -> `null`. `enabled` chỉ `true` khi có ít nhất 1 dải.
- `PUT /api/settings` với `vpn` sai (cổng trùng, IP sai) -> 400 như các field khác, không lưu nửa vời.

**Tests:**
- `parseIpv4 accepts a dotted quad and rejects out-of-range or padded parts`
- `isIpv4Cidr accepts 10.0.0.0/8 and rejects a host name, an IPv6 range and /33`
- `isInRanges matches inside the range, an IPv4-mapped address, and nothing for an empty list`
- `parseVpn reads the shape with default ports and drops invalid ranges`
- `parseVpn returns null for a bad address or a port equal to the other or to the app port`
- `vpn stays disabled without an allowed range`
- `a saved Cloudflare remote config reads back unchanged next to vpn`
- `PUT /api/settings saves vpn and applies it`

### Task 2: Server: CA + cert, địa chỉ mạng, lệnh tường lửa, setup server

**Files:**
- Create: `packages/server/src/remote/lanCertificates.ts` -- tạo / đọc / gia hạn CA và cert server (port `MobileCertificates`)
- Create: `packages/server/src/remote/lanNetwork.ts` -- IPv4 của máy (port `MobileNetwork`)
- Create: `packages/server/src/remote/firewall.ts` -- dựng lệnh PowerShell và chạy elevated (port `MobileFirewall` + `SetUpMobileFirewallAsync`)
- Create: `packages/server/src/remote/setupServer.ts` -- node:http trên `address:setupPort`, chỉ `/setup` và `/ca.cer`
- Modify: `packages/server/package.json` -- thêm `@peculiar/x509`
- Test: `lanCertificates.test.ts`, `lanNetwork.test.ts`, `firewall.test.ts`, `setupServer.test.ts` cùng thư mục

**Shape:**
```ts
export interface LanTls {
  readonly key: string // server private key, PEM (PKCS#8)
  readonly cert: string // server certificate, PEM
  readonly caDer: Buffer // the CA the phone installs
  readonly caFingerprint: string // SHA-256 of caDer, "AB:CD:..."
  readonly renewed: boolean // true when this call issued a new server cert
}
export function loadOrCreateLanTls(dataDir: string, address: string, now: Date): Promise<LanTls>
export function readCaFingerprint(dataDir: string): string | null // null before the CA exists

export function localIpv4Addresses(interfaces?: NodeJS.Dict<os.NetworkInterfaceInfo[]>): readonly string[]

export const FIREWALL_RULE_NAME = 'Workday Remote'
export function firewallCommand(ports: readonly number[], allowedRanges: readonly string[]): string // throws on a bad range
export type FirewallResult = { readonly ok: true } | { readonly ok: false; readonly error: AppError }
export function openFirewall(command: string, run?: RunElevated): Promise<FirewallResult>

export interface SetupServerOptions {
  readonly address: string
  readonly port: number
  readonly httpsUrl: string
  readonly allowedRanges: readonly string[]
  readonly tls: () => Promise<LanTls> // the CA to serve
  readonly language: () => WorkdayConfig['language']
}
export class SetupServer {
  open(options: SetupServerOptions): Promise<void>
  close(): Promise<void>
  get isOpen(): boolean
}
```

**Logic:**
- Lưu một file `lan-tls.json` trong data dir qua `jsonFile` (parse kiểm runtime, ghi atomic, hỏng -> `.bad` rồi tạo mới): `caCert` (PEM), `caKey` (PKCS#8 PEM đã `sealSecret`), `serverCert` (PEM), `serverKey` (sealed). `openSecret` trả `null` (khác `master.key`) -> coi như chưa có, tạo lại cả CA.
- CA: `CN=Workday Remote CA`, ECDSA P-256 / SHA-256, `basicConstraints` CA critical, `keyUsage` keyCertSign + cRLSign critical, SKI, hạn 10 năm, `notBefore` = now - 1 ngày.
- Cert server: `CN=<address>`, SAN chỉ một IP = `address`, `basicConstraints` không phải CA, `keyUsage` digitalSignature critical, EKU serverAuth, SKI + AKI của CA, `notBefore` = now - 1 giờ, `notAfter` = now + 397 ngày (iOS từ chối > 398), serial 16 byte ngẫu nhiên, bit cao = 0, khác 0.
- Dùng lại cert server khi SAN có đúng `address` và còn >= 30 ngày; ngược lại cấp mới (`renewed: true`), CA giữ nguyên.
- `@peculiar/x509` chạy trên `globalThis.crypto` (`x509.cryptoProvider.set(crypto)`); tra API qua Context7 trước khi viết.
- `localIpv4Addresses`: bỏ `internal`, tên bắt đầu `vEthernet` (Hyper-V / WSL), `169.254.*`, mọi thứ không phải IPv4; giữ thứ tự `os.networkInterfaces()`.
- `firewallCommand`: rỗng hoặc có dải không qua `isIpv4Cidr` -> throw; cổng phải là số nguyên 1-65535. Lệnh: `Remove-NetFirewallRule -DisplayName '<RULE>' -ErrorAction SilentlyContinue; New-NetFirewallRule -DisplayName '<RULE>' -Direction Inbound -Protocol TCP -LocalPort <p1>,<p2> -RemoteAddress <r1>,<r2> -Profile Any -Action Allow`.
- `openFirewall`: chạy `powershell.exe -NoProfile -Command "Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-EncodedCommand','<base64 UTF-16LE của lệnh>'"` -- lệnh trong chỉ đi qua `-EncodedCommand`, không nối chuỗi vào dòng lệnh ngoài. Hủy UAC (stderr có `canceled by the user`) -> `firewallCancelled`; exit khác 0 vì lý do khác -> `firewallFailed`. `RunElevated` là port để test không chạy PowerShell thật.
- `SetupServer`: request từ IP ngoài `allowedRanges` -> 403; `/setup` trả HTML (UTF-8, `Cache-Control: no-store`, CSP `default-src 'none'; style-src 'unsafe-inline'`) gồm link `/ca.cer`, `httpsUrl`, fingerprint và các bước iPhone: tải profile -> Cài đặt > Cài đặt chung > VPN & Quản lý thiết bị > cài -> Cài đặt chung > Giới thiệu > Cài đặt tin cậy chứng nhận > bật -> mở `httpsUrl`; chữ theo `language()` (en / vi), mọi giá trị chèn vào HTML đều escape. `/ca.cer` trả `caDer` với `Content-Type: application/x-x509-ca-cert`. Đường dẫn khác 404. `open` khi đang mở với cùng tham số thì không làm gì; khác tham số thì đóng rồi mở lại.

**Tests:**
- `lanCertificates`: `issues a server cert for the IP signed by the CA` (kiểm bằng `crypto.X509Certificate`: `subjectAltName` = `IP Address:<ip>`, `checkIssued`, `verify(ca.publicKey)`, hạn <= 398 ngày) -- `reuses a current cert` -- `renews for a new address and keeps the CA` -- `renews 30 days before expiry` -- `keys are sealed in the file` -- `a file sealed with another master key creates a new CA`
- `lanNetwork`: `keeps physical IPv4 and skips loopback, vEthernet, link-local and IPv6`
- `firewall`: `builds the rule for both ports and every range` -- `rejects a range that is not IPv4 CIDR` -- `a cancelled UAC prompt reports firewallCancelled` -- `the command reaches PowerShell only as EncodedCommand`
- `setupServer`: `serves the CA and the setup page while open` -- `refuses an address outside the allowed ranges` -- `answers 404 for any other path` -- `escapes the values in the page` -- `close stops listening` (listen trên `127.0.0.1`, cổng 0, `allowedRanges: ['127.0.0.0/8']`)

### Task 3: Server: surface VPN trong `createApp` và cổng kiểm

**Files:**
- Modify: `packages/server/src/app.ts` -- `AppDeps.vpn?: VpnSurface`; có thì `Fastify({ https: vpn.tls })` và Host hợp lệ duy nhất là `vpn.host`
- Modify: `packages/server/src/remote/remoteGate.ts` -- `registerRemoteGate(app, remote, surface)`; tách phần chung (thiết bị, Origin, quyền) cho hai surface dùng; decorate thêm `remoteOrigin`, `remoteIp`
- Modify: `packages/server/src/routes/eventsRoute.ts` -- request remote so Origin với `request.remoteOrigin`
- Modify: `packages/server/src/routes/remoteRoutes.ts` -- `POST /api/pair` lấy IP từ `request.remoteIp`
- Modify: `packages/server/src/events.ts` -- socket nhớ surface; `closeAllDevices(surface?)` (không truyền = mọi surface, như cũ)
- Modify: `packages/server/src/remote/remoteService.ts` -- `configureVpn`: `null` hoặc tắt -> `events.closeAllDevices('vpn')`
- Test: `packages/server/src/remote/remoteGate.test.ts` (thêm các case VPN), `routes/remoteRoutes.test.ts`

**Shape:**
```ts
export type RemoteSurface = 'loopback' | 'vpn'

export interface VpnSurface {
  readonly host: string // "10.20.30.40:8443", the only Host header this instance accepts
  readonly origin: string // "https://10.20.30.40:8443"
  readonly tls: { readonly key: string; readonly cert: string }
}

declare module 'fastify' {
  interface FastifyRequest {
    remoteOrigin: string | null // the Origin a remote request must carry; null for a local one
    remoteIp: string | null // cf-connecting-ip through the tunnel, the socket address on the VPN
  }
}
```

**Logic:**
- Surface `loopback`: giữ nguyên `classifyRequest` + kiểm Access JWT như hiện tại; `remoteOrigin = https://<publicHost>`, `remoteIp = cf-connecting-ip`.
- Surface `vpn`: mọi request là remote, theo thứ tự: (1) `remote.vpnConfig` null hoặc tắt -> 403 `remoteDisabled`; (2) `request.socket.remoteAddress` không `isInRanges(remote.vpnConfig.allowedRanges)` -> 403 `forbidden`, kể cả file tĩnh; (3) không kiểm JWT, `accessEmail = null`; (4) từ đây như loopback: không phải `/api` -> cho qua; request không phải GET/HEAD phải có Origin bằng `vpn.origin`; `unpaired` -> cho qua; thiếu thiết bị -> 401; thiếu `config.access` hoặc thiếu quyền -> 403.
- Dải IP đọc trực tiếp từ `remote.vpnConfig` ở mỗi request, nên đổi dải không cần dựng lại listener.
- Host check của instance VPN chỉ nhận `vpn.host` (không nhận loopback, không nhận `publicHost`).
- WebSocket mở qua instance VPN được gắn surface `vpn`, để tắt VPN chỉ đóng chúng.

**Tests** (instance VPN dựng bằng `createApp` + cert thật từ `loadOrCreateLanTls` trong `beforeAll`, gọi bằng `app.inject({ remoteAddress })`):
- `a vpn request from outside the allowed ranges gets 403 even for the app shell`
- `a vpn request with a foreign Host gets 403`
- `vpn is refused while it is turned off`
- `an unpaired vpn api call gets 401 notPaired and needs no Access JWT`
- `a view device on the vpn cannot call a board action`
- `a vpn POST with an Origin other than the vpn origin gets 403`
- `pairing over the vpn records the socket address as the ip`
- `the loopback surface still refuses a tunnel request without an Access JWT` (case cũ phải vẫn xanh)

### Task 4: Server: vòng đời listener VPN, `RemoteService`, route tường lửa, wiring

**Files:**
- Create: `packages/server/src/remote/lanServer.ts` -- bật / tắt / dựng lại instance VPN, gia hạn cert, mở / đóng `SetupServer`, trạng thái
- Modify: `packages/server/src/remote/remoteService.ts` -- `vpnConfig`, `configureVpn`, `attachLan`, mở setup theo pairing, `status().vpn`
- Modify: `packages/server/src/remote/pushService.ts` -- dep `publicHost` đổi thành `origin: () => string | null`
- Modify: `packages/server/src/routes/remoteRoutes.ts` -- `POST /api/remote/firewall` (chỉ local)
- Modify: `packages/server/src/main.ts` -- dựng `LanServer` với factory `createApp({ ...appDeps, vpn })`, `remote.attachLan(lan)` trước `settings.start()`, tắt máy thì `lan.stop()`
- Modify: `README.md`, `docs/cutover/deploy.md`, `CLAUDE.md` (mục Rules) -- mô tả chế độ VPN cạnh Cloudflare
- Test: `remote/lanServer.test.ts`, `remote/remoteService.test.ts`, `routes/remoteRoutes.test.ts`

**Shape:**
```ts
export interface LanListener {
  apply(vpn: VpnConfig | null): Promise<void>
  setSetupOpen(open: boolean): Promise<void>
  status(): VpnStatusView
  stop(): Promise<void>
}

export interface LanServerDeps {
  readonly dataDir: string
  readonly now: () => Date
  readonly createApp: (surface: VpnSurface) => Promise<FastifyInstance>
  readonly setup?: SetupServer // tests pass a fake
  readonly language: () => WorkdayConfig['language']
  readonly onChange: () => void // broadcasts remote.changed
  readonly logError: (message: string, error: unknown) => void
}
```

**Logic:**
- `LanServer.apply` chạy nối tiếp qua một chuỗi `Promise` (như `BoardService`), không bao giờ hai lần cùng lúc.
- `null` hoặc tắt -> đóng app, đóng setup, `off`. Cùng `address` + `httpsPort` với listener đang chạy -> không làm gì (dải đổi thì gate tự đọc). Khác -> đóng cái cũ, `starting`, `loadOrCreateLanTls`, `createApp(surface)`, `listen({ host: address, port: httpsPort })` -> `running`; lỗi (vd `EADDRNOTAVAIL`, `EADDRINUSE`) -> `failed`, `serverDetail` = `error.message`, đóng app đã dựng, không tự thử lại tới lần `apply` sau. Mỗi lần đổi trạng thái gọi `onChange`.
- Gia hạn: timer 24 giờ khi `running` -> `loadOrCreateLanTls`; `renewed` -> `app.server.setSecureContext({ key, cert })`. Timer dừng khi tắt.
- `setSetupOpen(true)` chỉ mở khi đang `running`, với `httpsUrl` và dải hiện tại; `false` -> đóng.
- `RemoteService.configureVpn(vpn)` (Task 1 lưu, Task 3 đóng socket) thêm: gọi `lan.apply(vpn)` khi đã attach (lỗi chỉ log). `attachLan` gọi `apply` với cấu hình đang có. `configure` (Cloudflare) giữ nguyên.
- Setup theo pairing: `openPairing` -> `lan.setSetupOpen(true)` và một interval 10 giây; khi `pairing.isOpen(now)` sai và không còn yêu cầu chờ -> `setSetupOpen(false)` và dừng interval. `approvePairing` / `rejectPairing` kiểm lại ngay.
- `status().vpn`: `lan.status()`; chưa attach thì `off` với `addresses` từ `localIpv4Addresses()`, `caFingerprint` từ `readCaFingerprint`.
- `origin` cho push: Cloudflare bật -> `https://<publicHost>`, không thì VPN bật -> `https://<address>:<httpsPort>`, không thì `null`.
- `POST /api/remote/firewall`: không có `vpnConfig` hoặc không có dải -> 409 `{ ok: false, error: { code: 'remoteDisabled' } }`; còn lại `firewallCommand([httpsPort, setupPort], allowedRanges)` -> `openFirewall` (inject qua deps để test) -> trả nguyên `FirewallResult`. Route không khai báo `config.access` (chỉ local).
- `CLAUDE.md`: thêm luật "request qua VPN chỉ nhận từ dải IP cho phép, thiết bị đã ghép nối và đúng quyền của route; không cần Access JWT", giữ luật Cloudflare.

**Tests:**
- `lanServer`: `starts on the address and reports running` -- `a listen error reports failed with the message` -- `a new address restarts the listener` -- `a ranges-only change keeps the listener` -- `turning off closes the listener and the setup server` -- `a renewed cert is swapped in without a restart` (createApp giả: `listen`, `close`, `server.setSecureContext` ghi lại lời gọi)
- `remoteService`: `turning vpn off closes only vpn sockets` -- `the setup server opens with pairing and closes once it expires` -- `push origin prefers Cloudflare, then the vpn`
- `remoteRoutes`: `firewall builds the rule from the saved vpn config` -- `firewall without a vpn config answers 409` -- `firewall is local-only`

### Task 5: Client: khối VPN trong Settings, QR ghép nối

**Files:**
- Create: `packages/client/src/settings/VpnSettings.tsx` -- khối VPN: switch, địa chỉ, 2 cổng, dải IP, trạng thái, fingerprint, nút "Mở tường lửa"
- Create: `packages/client/src/settings/vpnForm.ts` -- form <-> `VpnConfig`, kiểm hợp lệ
- Modify: `packages/client/src/settings/RemoteSection.tsx` -- hai khối VPN (trên) và Cloudflare (dưới, giữ nguyên ô); Save gửi `vpn` cùng `remote` và `tunnelToken` như cũ
- Modify: `packages/client/src/settings/RemotePairing.tsx` -- QR + link `setupUrl` khi VPN `running`; liệt kê link HTTPS của VPN và Cloudflare đang bật
- Modify: `packages/client/src/api/remoteApi.ts` -- `openRemoteFirewall()`
- Modify: `packages/client/src/errors.ts`, `api/client.ts` -- mã `firewallCancelled`, `firewallFailed`
- Modify: `packages/client/package.json` -- thêm `qrcode` (+ `@types/qrcode` dev)
- Test: `packages/client/src/settings/RemoteSection.test.tsx`, `settings/vpnForm.test.ts`

**Shape:**
```ts
export interface VpnForm {
  readonly enabled: boolean
  readonly address: string
  readonly httpsPort: string
  readonly setupPort: string
  readonly allowedRanges: string // one CIDR per line
}
export function vpnFormOf(vpn: VpnConfig | null, addresses: readonly string[]): VpnForm
export function vpnFromForm(form: VpnForm): { readonly vpn: VpnConfig | null } | { readonly problem: string }
```

**Logic:**
- `vpnFormOf`: chưa có cấu hình -> địa chỉ = `addresses[0] ?? ''`, cổng `8443` / `8444`, dải rỗng, tắt.
- `vpnFromForm`: tắt và địa chỉ trống -> `{ vpn: null }`; tắt mà có địa chỉ -> lưu cấu hình tắt (dải có thể rỗng). IP sai, cổng không phải số nguyên 1-65535, hai cổng trùng, có dòng không qua `isIpv4Cidr`, hoặc bật mà không có dải -> `{ problem }` (chữ qua `t`); Save bị chặn và hiện dòng lỗi dưới khối. Dải: tách theo dòng, trim, bỏ dòng trống và dòng trùng.
- Ô địa chỉ là HeroUI `ComboBox` cho phép gõ giá trị ngoài danh sách `status.vpn.addresses`.
- Trạng thái: `running` -> "Đang nghe tại <httpsUrl>"; `failed` -> chữ đỏ + `serverDetail`; `starting` / `off` -> chữ muted. Fingerprint dạng mono, có `CopyButton`.
- "Mở tường lửa" chỉ bấm được khi cấu hình VPN đã lưu có dải; kết quả hiện một dòng: thành công / "Đã hủy" / lỗi.
- QR: `QRCode.toDataURL(setupUrl, { margin: 1, width: 180 })` trong `useEffect`; ảnh có `alt` = link. Không có `setupUrl` hoặc VPN không `running` -> không hiện QR.

**Tests:**
- `vpnForm`: `a blank form saves no vpn` -- `ranges are one per line, trimmed and deduplicated` -- `a bad range, a bad port, equal ports or no range while enabled are problems`
- `RemoteSection`: `Save sends the vpn block next to the untouched Cloudflare block` -- `a bad range blocks Save and shows why` -- `the firewall button reports a cancelled prompt` -- `the pairing card shows the setup QR and link while vpn runs` -- các test Cloudflare cũ vẫn xanh
