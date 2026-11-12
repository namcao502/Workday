# Workday Remote access (GĐ 3) Implementation Plan

> **For agentic workers:** Use impl-write to execute this plan task-by-task.

**Ticket:** side project, manual git

**Frontend repo:** none -- frontend nằm trong cùng repo (`packages/client`)

**Goal:** Mở Workday cho điện thoại từ xa qua Cloudflare Tunnel + Cloudflare Access, mỗi thiết bị phải được ghép nối từ PC và chỉ làm được trong vùng mình có quyền (Off / View / Act); secret được mã hóa khi lưu, app cài được như PWA và nhận Web Push; port từ `MobilePairing`, `MobileDeviceStore`, `MobileAccessRules`, `MobilePush`, `MobileActivityLog` của NoisWorkday.

**Expected outcome (acceptance criteria):**

- [ ] Server vẫn chỉ listen `127.0.0.1`. Request đi qua tunnel (Host = `publicHost`, hoặc có header `cf-ray` / `cf-connecting-ip` / `cf-access-jwt-assertion`) là request **từ xa**; request từ chính máy (Host loopback, không có header `cf-*`) vẫn dùng được mọi thứ như GĐ 1-2.
- [ ] Remote chưa bật hoặc chưa cấu hình Cloudflare Access: mọi request từ xa bị 403. Request từ xa không có JWT Access hợp lệ (chữ ký RS256 theo certs của team, `aud`, `iss`, `exp`) bị 403.
- [ ] Điện thoại mở `https://<publicHost>` lần đầu (đã qua Access) thấy màn ghép nối: nhập mã 6 ký tự đang hiện trên PC + tên máy; PC hiện yêu cầu (tên, email Access, IP) với Approve / Reject; Approve xong điện thoại vào app và từ đó nhớ thiết bị (cookie `wd_device` HttpOnly, Secure, SameSite=Strict).
- [ ] Cửa sổ ghép nối mở 5 phút, mã dùng một lần, sai 5 lần thì đóng; mỗi lúc chỉ một yêu cầu chờ duyệt.
- [ ] Thiết bị mới có quyền: Tickets View, Timesheet Act. Settings > Remote access trên PC đổi được quyền từng vùng, đổi tên, bật / tắt push, thu hồi; thu hồi hoặc hạ quyền thì WebSocket của thiết bị đó bị đóng ngay.
- [ ] Từ xa: vùng Off thì trang bị ẩn và API trả 403; vùng View thì xem được nhưng mọi nút ghi bị ẩn / tắt và API ghi trả 403. Settings (đổi config, secret, ghép nối, quản lý thiết bị) chỉ dùng được từ PC.
- [ ] Đọc tuần Timesheet từ xa không bao giờ mở Chrome (`allowSniff` luôn `false`).
- [ ] Mỗi request ghi (POST / PUT / DELETE) từ xa được ghi vào nhật ký hoạt động (thiết bị, method, route, kết quả); Settings hiện 50 dòng mới nhất.
- [ ] `secrets.json` không còn giá trị dạng rõ: mỗi secret lưu dạng `enc:v1:...` (AES-256-GCM, khóa trong `master.key`); file cũ dạng rõ được mã hóa lại ở lần khởi động đầu; mất `master.key` thì secret coi như chưa có, server không crash.
- [ ] Điện thoại thêm app vào màn hình chính được (manifest + icon); bật thông báo trong trang thiết bị thì nhận được push thử; lời nhắc 18:00 của Timesheet và lần drain có ngày bị giữ lại cũng được push tới thiết bị có Timesheet >= View và đã bật push.
- [ ] Có `tunnelToken` và `cloudflaredPath`: server tự chạy `cloudflared tunnel run` (token qua biến môi trường, không trên command line), tự khởi động lại khi nó thoát; Settings hiện trạng thái tunnel.
- [ ] `npm test`, `npm run typecheck`, `npm run lint` sạch.

**Architecture:** Server vẫn bind loopback; `cloudflared` (do app chạy hoặc người dùng tự chạy) đưa `https://<publicHost>` về `127.0.0.1:<port>`, Cloudflare Access lo đăng nhập người, app lo ghép nối thiết bị và quyền. Một hook `onRequest` phân loại local / remote rồi kiểm JWT Access, cookie thiết bị và quyền khai báo trên từng route (`config.access`); route không khai báo quyền là chỉ-local (đóng mặc định). Logic thuần (quyền, mã ghép nối) ở core; store, JWT, push, tunnel ở server.

**Assumptions:**

- Theo lộ trình: Cloudflare Tunnel + Access thay cho LAN + CA tự ký của bản WPF; không port `MobileCertificates`, `MobileFirewall`, `MobileNetwork`, `MobileAllowedRanges`.
- "Đăng nhập" là Cloudflare Access (email OTP / SSO do người dùng đặt policy trên Cloudflare); app không có mật khẩu riêng. Truy cập từ chính máy không cần đăng nhập, như GĐ 1-2.
- Chỉ có hai vùng ở GĐ 3: `board` (trang Tickets) và `timesheet`; vùng của Workspace, Insights, Notices thêm ở giai đoạn của chúng. `GET /api/settings` (theme, ngôn ngữ, múi giờ, project key mà client cần) mở cho mọi thiết bị đã ghép nối; mọi route khác của Settings chỉ-local.
- Mã hóa secret là AES-256-GCM với khóa ngẫu nhiên 32 byte trong `<dataDir>/master.key` (Linux `0600`), hoặc `WORKDAY_MASTER_KEY` (base64) thắng file. Chống lộ `secrets.json` riêng lẻ (backup, copy), không chống người đã đọc được cả data dir.
- Token thiết bị chỉ lưu SHA-256; so sánh bằng `timingSafeEqual`.
- Push dùng thư viện `web-push`; khóa VAPID tạo một lần (public trong `remote.json`, private trong `secrets.json`); subject là `https://<publicHost>`.
- Service worker chỉ xử lý `push` và `notificationclick`, không cache offline.
- Truy cập từ xa dùng bản build (`npm start` hoặc server dev có `packages/client/dist`): tunnel trỏ vào port của server, không vào Vite.
- Không port: keep-awake, watchdog, Teams / Claude / Code socket (giai đoạn sau), push theo khóa màn hình Windows (chưa có trung tâm thông báo, GĐ 5).

**Tech Stack:** như GĐ 2, thêm `web-push` (server); `node:crypto` cho AES-GCM, SHA-256, kiểm JWT RS256 (không thêm thư viện JWT).

---

### Task 1: Core quyền + server mã hóa secret và config remote

**Files:**

- Create: `packages/core/src/remoteAccess.ts` -- vùng, mức quyền, `allows`, quyền mặc định, `parseRights`
- Modify: `packages/core/src/api.ts` -- `RemoteConfig`, `WorkdayConfig.remote`, các view / request của remote (Shape dưới), mã `AppError` mới
- Modify: `packages/core/src/index.ts`
- Create: `packages/server/src/security/secretBox.ts` -- khóa chủ, `sealSecret` / `openSecret`
- Modify: `packages/server/src/config.ts` -- `parseRemote`; `Secrets` thêm `tunnelToken`, `vapidPrivateKey`; đọc / ghi `secrets.json` qua `secretBox`, mã hóa lại file dạng rõ; env `WORKDAY_TUNNEL_TOKEN`
- Test: `packages/core/src/remoteAccess.test.ts`, `packages/server/src/security/secretBox.test.ts`, `packages/server/src/config.test.ts` (thêm)

**Shape:**

```ts
export type RemoteArea = 'board' | 'timesheet'
export const REMOTE_AREAS: readonly RemoteArea[] = ['board', 'timesheet']
export type AccessLevel = 'off' | 'view' | 'act'
export type DeviceRights = Readonly<Record<RemoteArea, AccessLevel>>
export const DEFAULT_DEVICE_RIGHTS: DeviceRights // board: 'view', timesheet: 'act'
export function allows(rights: DeviceRights, area: RemoteArea, needed: 'view' | 'act'): boolean
export function parseRights(raw: unknown): DeviceRights // unknown areas dropped, missing or invalid -> 'off'

export interface RemoteConfig {
  readonly enabled: boolean
  readonly publicHost: string // "workday.example.com", no scheme
  readonly accessTeamDomain: string // "myteam.cloudflareaccess.com"
  readonly accessAud: string
  readonly cloudflaredPath: string | null // null = the user runs cloudflared
}
// WorkdayConfig gains `remote: RemoteConfig | null` (null until publicHost, accessTeamDomain and accessAud are all set).
// SettingsUpdate gains `remote?: RemoteConfig | null` and `tunnelToken?: string`; SettingsView gains `tunnelTokenSource`.

export interface PushSubscriptionJson {
  readonly endpoint: string
  readonly keys: { readonly p256dh: string; readonly auth: string }
}
export interface RemoteDevice {
  readonly id: string
  readonly name: string
  readonly email: string | null // the Cloudflare Access identity that paired it
  readonly rights: DeviceRights
  readonly pushEnabled: boolean
  readonly hasPushSubscription: boolean
  readonly createdAt: string
  readonly lastSeenAt: string | null
}
export type MeView =
  | { readonly mode: 'local' }
  | { readonly mode: 'remote'; readonly device: RemoteDevice }
  | { readonly mode: 'unpaired' }
export interface PairingView {
  readonly code: string | null // shown on the PC only
  readonly expiresAt: string | null
  readonly pending: { readonly name: string; readonly email: string | null; readonly ip: string | null; readonly at: string } | null
}
export interface ActivityEntry {
  readonly at: string
  readonly deviceId: string
  readonly deviceName: string
  readonly method: string
  readonly route: string // the route pattern, never the body
  readonly status: number
}
export interface RemoteStatusView {
  readonly tunnel: 'off' | 'starting' | 'running' | 'failed'
  readonly tunnelDetail: string | null
  readonly devices: readonly RemoteDevice[]
  readonly pairing: PairingView
  readonly activity: readonly ActivityEntry[] // newest first, at most 50
  readonly vapidPublicKey: string | null
}
// AppError gains: remoteDisabled, accessRequired, notPaired, forbidden, pairingClosed, wrongCode.
// ServerEvent gains { type: 'remote.changed' } (PC Settings refetches RemoteStatusView).
```

```ts
// security/secretBox.ts
export function loadMasterKey(dataDir: string): Buffer // env WORKDAY_MASTER_KEY wins; creates master.key (32 random bytes) when missing
export function sealSecret(key: Buffer, plain: string): string // "enc:v1:" + base64(iv 12 | tag 16 | ciphertext)
export function openSecret(key: Buffer, sealed: string): string | null // null when the value will not decrypt
```

**Logic:**

- `allows`: `act` bao gồm `view`; `off` không cho gì.
- `readFileSecrets`: giá trị bắt đầu `enc:v1:` thì `openSecret`, mở không được -> `null` + một dòng log (không in giá trị); giá trị không có tiền tố là dạng rõ cũ: dùng được, và `loadConfig` / lần đọc đầu ghi lại cả file ở dạng mã hóa (một lần, khi có ít nhất một giá trị dạng rõ). `saveSecrets` luôn ghi dạng mã hóa, `mode 0o600` như cũ.
- `master.key`: tạo bằng `randomBytes(32)`, ghi `0o600` (bỏ qua trên Windows), không bao giờ log. `WORKDAY_MASTER_KEY` không phải base64 của đúng 32 byte -> thoát lúc khởi động với thông báo rõ.
- `parseRemote`: thiếu `publicHost`, `accessTeamDomain` hoặc `accessAud` -> `null`; `publicHost` viết thường, bỏ `https://` và `/` cuối nếu người dùng dán cả URL; `enabled` mặc định `false`.
- Thêm vào `CLAUDE.md` mục Rules: thay câu "Keep that until sign-in exists" bằng luật mới: request từ xa phải qua Access JWT + thiết bị đã ghép nối + quyền của route; route không khai báo `config.access` là chỉ-local.

**Tests:**

- `allows grants view to act and nothing to off`; `parseRights drops unknown areas and turns a missing one off`
- `sealSecret round-trips and openSecret returns null for another key`; `two seals of the same text differ` (IV ngẫu nhiên)
- `a plain-text secrets.json is rewritten sealed on load`; `a value sealed with a lost key loads as null without throwing`
- `the master key is created once and reused`; `a remote config without accessAud loads as null`; `publicHost drops the scheme and trailing slash`

### Task 2: Server: thiết bị, ghép nối, cổng truy cập từ xa và nhật ký

**Files:**

- Create: `packages/server/src/remote/deviceStore.ts` -- `devices.json` (từ `MobileDeviceStore.cs`)
- Create: `packages/server/src/remote/pairing.ts` -- `Pairing` (từ `MobilePairing.cs`), thời gian truyền vào
- Create: `packages/server/src/remote/accessJwt.ts` -- `AccessVerifier`: tải certs của team, kiểm JWT RS256
- Create: `packages/server/src/remote/remoteGate.ts` -- `classifyRequest`, hook `onRequest` / `onResponse` của Fastify
- Create: `packages/server/src/remote/activityLog.ts` -- `remote-activity.json`, 300 dòng mới nhất (từ `MobileActivityLog.cs`)
- Create: `packages/server/src/remote/remoteService.ts` -- giữ store, pairing, log, verifier; dựng `RemoteStatusView`; `configure(remote)`
- Create: `packages/server/src/routes/remoteRoutes.ts` -- `/api/me`, ghép nối, quản lý thiết bị
- Modify: `packages/server/src/security/allowedHosts.ts` -- thêm `publicHost:443` / `publicHost` vào danh sách Host, Origin `https://<publicHost>`
- Modify: `packages/server/src/events.ts`, `routes/eventsRoute.ts` -- socket gắn `deviceId` (null = local); `closeDevice(id)`
- Modify: `packages/server/src/routes/boardRoutes.ts`, `timesheetRoutes.ts`, `settingsRoutes.ts` -- khai báo `config.access` cho route được dùng từ xa; `timesheet/week` từ xa ép `allowSniff: false`
- Modify: `packages/server/src/app.ts`, `services.ts` -- đăng ký gate + route
- Modify: `packages/server/src/settings/parseSettings.ts`, `settings/settingsService.ts` -- nhận `remote` và `tunnelToken` trong `PUT /api/settings` (lưu token như key HRM, giữ nguyên secret khác trong file); `view()` trả `tunnelTokenSource`; `apply` gọi `remote.configure(remote)`. Trước Task 3, `RemoteStatusView.tunnel` luôn `off`, `vapidPublicKey` `null`.
- Test: `remote/deviceStore.test.ts`, `remote/pairing.test.ts`, `remote/accessJwt.test.ts`, `remote/remoteGate.test.ts`, `routes/remoteRoutes.test.ts`

**Shape:**

```ts
// Declared on each route that a paired device may call; a route without it is local-only.
export type RouteAccess =
  | { readonly area: RemoteArea; readonly level: 'view' | 'act' }
  | { readonly area: 'any' } // any paired device: /api/events, GET /api/settings, the device's own push routes
  | { readonly area: 'unpaired' } // no device needed: /api/me, /api/pair, /api/pair/status, /api/health
declare module 'fastify' {
  interface FastifyContextConfig {
    access?: RouteAccess
  }
  interface FastifyRequest {
    remoteDevice: StoredDevice | null // set by the gate; null for a local request
    isRemote: boolean
  }
}

export interface StoredDevice extends RemoteDevice {
  readonly tokenHash: string // hex SHA-256 of the cookie token
  readonly pushSubscription: PushSubscriptionJson | null
}
export function classifyRequest(headers: IncomingHttpHeaders, publicHost: string | null): 'local' | 'remote'
```

```text
GET    /api/me                          unpaired  -> MeView
POST   /api/pair      { code, name }    unpaired  -> { requestId } | 409 { error: pairingClosed | wrongCode }
GET    /api/pair/status?id=             unpaired  -> { status: 'waiting' | 'rejected' | 'approved' } (approved sets the cookie, once)
GET    /api/remote                      local     -> RemoteStatusView
POST   /api/remote/pairing              local     -> PairingView (opens a 5 minute window, new code)
POST   /api/remote/pairing/approve|reject  local  -> RemoteStatusView
PUT    /api/remote/devices/:id  { name?, rights?, pushEnabled? }  local -> RemoteStatusView
DELETE /api/remote/devices/:id          local     -> RemoteStatusView (revoke)
```

**Logic:**

- Thứ tự trong hook `onRequest` (sau kiểm Host): `classifyRequest` = `remote` khi Host (bỏ port) bằng `publicHost` hoặc có một trong các header `cf-ray`, `cf-connecting-ip`, `cf-access-jwt-assertion`; còn lại `local` (đi tiếp như cũ, `remoteDevice = null`). Remote: (1) `config.remote` null hoặc `enabled` false -> 403 `remoteDisabled`; (2) JWT trong header `cf-access-jwt-assertion` (không có thì cookie `CF_Authorization`) không qua `AccessVerifier` -> 403 `accessRequired`; (3) URL không bắt đầu `/api/` -> cho qua (file tĩnh + SPA, để hiện màn ghép nối); (4) route `area: 'unpaired'` -> cho qua; (5) cookie `wd_device` không khớp thiết bị -> 401 `notPaired`; (6) route không có `config.access` -> 403 `forbidden`; có thì `allows(rights, area, level)` sai -> 403 `forbidden`; (7) method khác GET / HEAD mà `Origin` khác `https://<publicHost>` -> 403 `forbidden`. Lỗi trả dạng `{ ok: false, error: AppError }`.
- `AccessVerifier`: `GET https://<accessTeamDomain>/cdn-cgi/access/certs`, lấy `keys` (JWK), cache 1 giờ, tải lại một lần khi gặp `kid` lạ. Kiểm: header `alg === "RS256"`, chữ ký bằng `crypto.verify('RSA-SHA256', ...)` với `createPublicKey({ key: jwk, format: 'jwk' })`, `aud` (chuỗi hoặc mảng) chứa `accessAud`, `iss === "https://<accessTeamDomain>"`, `exp` > now (lệch đồng hồ cho phép 60s), `nbf` nếu có. Trả `{ email: string | null }` hoặc `null`. Lỗi mạng khi tải certs -> từ chối (đóng mặc định).
- Khai báo quyền: `GET /api/board` board/view; `POST /api/board/check`, `/add`, `/:key/:action` board/act. `GET /api/timesheet`, `POST /api/timesheet/week`, `POST /api/timesheet/tickets/check` timesheet/view; mọi route ghi khác của `/api/timesheet` timesheet/act. `/api/events`, `GET /api/settings` area `any`. Mọi route `/api/settings/*` khác và `/api/remote*` không khai báo (chỉ-local).
- `/api/timesheet/week` với `request.isRemote` -> gọi service với `allowSniff: false` dù body nói gì.
- Ghép nối: `Pairing` port đúng `MobilePairing` (bảng chữ `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, 6 ký tự, `randomInt`, 5 phút, sai 5 lần đóng, mã dùng một lần, một yêu cầu chờ, so mã bằng `timingSafeEqual`). Yêu cầu giữ tên (cắt 40 ký tự, trống -> "Phone"), email từ JWT, IP từ `cf-connecting-ip`. Approve: `deviceStore.add` với `DEFAULT_DEVICE_RIGHTS`, token = `randomBytes(32)` base64url; `GET /api/pair/status` của đúng `requestId` lấy token **một lần** và đặt cookie `wd_device=<token>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=31536000`. Mọi thay đổi pairing / thiết bị broadcast `remote.changed`.
- `deviceStore`: `readJson` (hỏng -> `.bad`, rỗng); `rights` qua `parseRights`; `findByToken` băm token rồi so `timingSafeEqual` với từng `tokenHash`; `lastSeenAt` chỉ ghi khi cũ hơn 60s (không ghi file mỗi request). Thu hồi hoặc hạ bất kỳ quyền nào -> `events.closeDevice(id)`.
- Nhật ký: hook `onResponse` ghi mỗi request từ xa có method khác GET / HEAD: thiết bị, method, `request.routeOptions.url` (mẫu route, không phải URL thật, không body), status. Giữ 300 dòng mới nhất, ghi qua chuỗi tuần tự.

**Tests:**

- `MobilePairingTests` (5 test) -> `pairing.test.ts`
- `MobileDeviceStoreTests` trừ `Load_MapsLegacyAreas_*` -> `deviceStore.test.ts` (thêm `lastSeenAt is written at most once a minute`)
- `accessJwt`: `accepts a token signed by the team key with the right aud`; `rejects a wrong aud, a wrong iss, an expired token and a bad signature`; `refetches the certs once for an unknown kid`; `rejects when the certs cannot be fetched` (khóa RSA sinh trong test bằng `generateKeyPairSync`)
- `remoteGate`: `a loopback request without cf headers stays local`; `a request with cf-ray is remote even with a loopback Host`; `remote is refused while remote access is off`; `a remote request without a valid Access JWT gets 403`; `the SPA shell loads remotely without a device`; `an unpaired remote api call gets 401 notPaired`; `a view device cannot call a board action`; `a remote call to a route without access config gets 403`; `a remote POST with a foreign Origin gets 403`
- `routes`: `pairing sets the device cookie once after approve`; `a remote week read never sniffs`; `revoking a device closes its event socket`; `a remote write is recorded in the activity log without its body`; `GET /api/remote is refused remotely`

### Task 3: Server: Web Push và cloudflared

**Files:**

- Create: `packages/server/src/remote/pushService.ts` -- khóa VAPID, gửi push (từ `MobilePush.cs`, `WebPushSender.cs`)
- Create: `packages/server/src/remote/tunnelSupervisor.ts` -- chạy và giữ `cloudflared`
- Create: `packages/server/src/routes/pushRoutes.ts`
- Modify: `packages/server/src/timesheet/timesheetService.ts` -- dep mới `onRun(summary: RunSummary)`, gọi sau mỗi `lastRun` mới
- Modify: `packages/server/src/remote/remoteService.ts` -- `RemoteStatusView.tunnel` / `tunnelDetail` / `vapidPublicKey`; `configure` khởi động lại tunnel khi config hoặc token đổi
- Modify: `packages/server/src/services.ts`, `main.ts` -- nối `onRun` vào push; dừng tunnel khi tắt server
- Modify: `packages/server/package.json` -- thêm `web-push` (+ `@types/web-push` nếu thư viện không kèm type)
- Test: `remote/pushService.test.ts`, `remote/tunnelSupervisor.test.ts`, `routes/pushRoutes.test.ts`

**Shape:**

```ts
export interface PushMessage {
  readonly title: string
  readonly body: string
  readonly url: string // "/#/timesheet"
  readonly tag: string // a repeat with the same tag replaces the earlier one
}
// The seam the tests fake; the default wraps web-push's sendNotification.
export type SendPush = (subscription: PushSubscriptionJson, payload: string, vapid: VapidKeys) => Promise<{ readonly statusCode: number }>
export class PushService {
  sendToArea(area: RemoteArea, message: PushMessage): Promise<void> // never rejects
  sendToDevice(deviceId: string, message: PushMessage): Promise<{ ok: boolean }>
}

// The seam the tests fake; the default is child_process.spawn.
export type SpawnTunnel = (path: string, args: readonly string[], env: NodeJS.ProcessEnv) => TunnelProcess
export class TunnelSupervisor {
  start(path: string, token: string): void
  stop(): Promise<void>
  status(): { readonly state: 'off' | 'starting' | 'running' | 'failed'; readonly detail: string | null }
}
```

```text
GET    /api/push/key                  any  -> { publicKey }
PUT    /api/push  { subscription }    any  -> 204 (this device's subscription; also turns pushEnabled on)
DELETE /api/push                      any  -> 204
POST   /api/push/test                 any  -> { ok }
POST   /api/remote/devices/:id/test-push   local -> { ok }
```

**Logic:**

- VAPID: lần đầu cần thì `webpush.generateVAPIDKeys()`; public key lưu `remote.json` (`{ vapidPublicKey }`), private key lưu `secrets.json` (mã hóa, Task 1). Subject `https://<publicHost>`; chưa có `publicHost` thì không gửi.
- `sendToArea`: mọi thiết bị có `pushEnabled`, có subscription và `allows(rights, area, 'view')`. Status 404 / 410 -> xóa subscription của thiết bị đó (lưu store); lỗi khác ghi log một dòng, không retry. Payload là JSON của `PushMessage`.
- `PUT /api/push`: subscription phải có `endpoint` là URL `https:` và `keys.p256dh`, `keys.auth` là chuỗi; sai -> 400.
- Nội dung push (text theo `config.language`, server tự dịch ở đây vì push không đi qua client): `lastRun.kind === "reminder"` -> "Nothing is queued for today - log your work before you leave.", tag `log-reminder-<date>`; `drained` có `kept` khác rỗng -> "Auto-log: N logged, M kept for retry.", tag `log-drain-<date>`. Cả hai gửi tới vùng `timesheet`, url `/#/timesheet`. Kết quả khác không push.
- Tunnel chỉ chạy khi `remote.enabled`, có `cloudflaredPath` và token (`WORKDAY_TUNNEL_TOKEN` thắng `secrets.json`). Chạy `[path, 'tunnel', '--no-autoupdate', 'run']` với `TUNNEL_TOKEN` trong env (không bao giờ trên command line, không log). `starting` -> `running` khi một dòng stdout / stderr chứa `Registered tunnel connection`; thoát -> `failed`, `detail` = dòng cuối (cắt 300 ký tự, bỏ mọi chuỗi trùng token), khởi động lại sau 5s, 15s, 60s rồi giữ 60s; chạy ổn 5 phút thì về lại 5s. `spawn` lỗi (không có file) -> `failed` "cloudflared not found at <path>", không thử lại tới lần `configure` sau. `stop` gửi kill và chờ thoát (tối đa 5s). Đổi trạng thái thì broadcast `remote.changed`.

**Tests:**

- `MobilePushTests` (4 test) -> `pushService.test.ts` ("Notice access" thành `allows(rights, area, 'view')`)
- `the reminder run pushes to timesheet devices in the configured language`; `a drain without kept days pushes nothing`
- `PUT /api/push rejects a subscription whose endpoint is not https`; `POST /api/push/test sends only to the calling device`
- `tunnelSupervisor`: `passes the token in TUNNEL_TOKEN, never in the arguments`; `turns running on the registered-connection line`; `restarts after 5s, 15s then 60s when the process keeps exiting`; `a missing binary fails without retrying`; `stop kills the process and does not restart it` (fake spawn + fake timers)

### Task 4: Client: chế độ từ xa, ghép nối, PWA

**Files:**

- Create: `packages/client/public/manifest.webmanifest` -- `name` "Workday", `start_url` "/", `display` "standalone", màu theo `tokens.css`, icon 192 / 512
- Create: `packages/client/public/icons/icon-180.png`, `icon-192.png`, `icon-512.png` -- copy từ `C:\Project\NoisWorkday\Assets\mobile\icons\`
- Create: `packages/client/public/sw.js` -- chỉ `push` (hiện notification từ `PushMessage`) và `notificationclick` (focus tab đang mở hoặc mở `url`)
- Modify: `packages/client/index.html` -- `<link rel="manifest">`, `apple-touch-icon`, `apple-mobile-web-app-capable`, `theme-color`
- Create: `packages/client/src/api/useMe.ts` -- query `GET /api/me`; `useAccess()` trả `{ mode, canSee(area), canAct(area) }` (local: mọi thứ `true`)
- Create: `packages/client/src/remote/PairPage.tsx` -- màn ghép nối
- Create: `packages/client/src/remote/DevicePage.tsx` -- Settings của thiết bị từ xa: tên, quyền (chỉ đọc), nút bật thông báo, push thử
- Create: `packages/client/src/remote/pushSubscription.ts` -- đăng ký service worker, `subscribe` / `unsubscribe` với VAPID key
- Modify: `packages/client/src/App.tsx` -- gọi `/api/me` trước `/api/settings`: `unpaired` -> `PairPage`; lỗi `accessRequired` / `remoteDisabled` -> một dòng giải thích thay cho app
- Modify: `packages/client/src/shell/Shell.tsx`, `Sidebar.tsx`, `TabBar.tsx`, `pages.ts` -- từ xa: ẩn trang mà `canSee` sai (Workspace, Insights cũng ẩn), Settings -> `DevicePage`; hash tới trang bị ẩn thì về trang hiện đầu tiên
- Modify: `packages/client/src/board/BoardPage.tsx`, `RowMenu.tsx` -- `canAct('board')` sai: ẩn Add, Check now, menu dòng
- Modify: `packages/client/src/timesheet/TimesheetPage.tsx`, `LogInput.tsx`, `DayCard.tsx`, `TicketRows.tsx`, `HoursBar.tsx` -- `canAct('timesheet')` sai: ẩn ô nhập và menu, ẩn Log now / Retry / [X], ô giờ và thanh giờ chỉ đọc
- Modify: `packages/client/src/api/client.ts`, `errors.ts` -- route `/api/me`, `/api/pair*`, `/api/push*`; text cho mã lỗi mới
- Test: `remote/PairPage.test.tsx`, `shell/Shell.test.tsx` (thêm), `board/BoardPage.test.tsx` (thêm), `timesheet/TimesheetPage.test.tsx` (thêm), `remote/DevicePage.test.tsx`

**Logic:**

- `PairPage`: ô mã (6 ký tự, tự viết hoa, bỏ khoảng trắng), ô tên (mặc định đoán từ user agent: "iPhone", "Android", "iPad", còn lại "Phone", như `guessDeviceName` của PWA cũ), nút **Pair**. Gửi xong hiện "Waiting for approval on the PC..." và hỏi `GET /api/pair/status` mỗi 2s; `approved` -> `location.reload()`; `rejected` hoặc hết 5 phút -> báo và cho nhập lại. Ngôn ngữ của trang này theo `navigator.language` (`vi*` -> Tiếng Việt) vì chưa đọc được settings.
- `useAccess` là lớp hiển thị; server (Task 2) mới là chỗ chặn thật. Không có `canAct` thì ẩn nút, không chỉ disable, để màn hình hẹp gọn (riêng ô giờ hiện dạng chữ).
- `DevicePage`: nút **Turn on notifications** gọi `Notification.requestPermission()`, đăng ký `/sw.js`, `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` với key từ `/api/push/key`, rồi `PUT /api/push`; đã bật thì nút **Turn off** (`unsubscribe` + `DELETE /api/push`) và **Send test**. Trình duyệt không có `PushManager` (iOS ngoài Home Screen) -> dòng "Add Workday to the Home Screen first to get notifications".
- Hai tab / máy: `remote.changed` không gửi tới thiết bị (chỉ PC cần); thiết bị bị thu hồi thì socket đóng, lần gọi API kế tiếp nhận 401 `notPaired` -> client chuyển về `PairPage`.

**Tests:**

- `the pair page sends the code and the name, then reloads once approved`
- `a rejected pairing lets the user try again`
- `remotely a page without the right is hidden and its hash falls back to the first visible page`
- `a board view device sees no Add, Check now or row menu`
- `a timesheet view device sees no input, no Log now and read-only hours`
- `the device page offers Add to Home Screen when push is not available`
- `a 401 notPaired from any call shows the pair page`
- `locally every page and action stays available`

### Task 5: Client: Settings > Remote access (trên PC)

**Files:**

- Create: `packages/client/src/settings/RemoteSection.tsx` -- khối Remote access: cấu hình, tunnel, ghép nối, thiết bị, nhật ký
- Create: `packages/client/src/settings/RemoteDevices.tsx` -- bảng thiết bị (quyền từng vùng bằng `Segmented` Off / View / Act, push, đổi tên, thu hồi)
- Create: `packages/client/src/settings/remoteForm.ts` -- form state <-> `RemoteConfig`
- Create: `packages/client/src/api/useRemote.ts` -- query `GET /api/remote`, refetch khi có `remote.changed`; mutation cho các route `/api/remote/*`
- Modify: `packages/client/src/settings/SettingsPage.tsx` -- thêm khối sau Timesheet (chỉ khi `mode === 'local'`)
- Modify: `packages/client/src/api/useEvents.ts` -- `remote.changed`
- Test: `settings/RemoteSection.test.tsx`

**Logic:**

- Cấu hình: switch **Allow remote access** (`enabled`), Public host (placeholder `workday.example.com`), Access team domain (`myteam.cloudflareaccess.com`), Access AUD tag, đường dẫn `cloudflared` (để trống = tự chạy ngoài app), tunnel token (`TokenField`, khóa khi lấy từ `WORKDAY_TUNNEL_TOKEN`). **Save** gửi `remote` (nhóm trống hết -> `null`) và `tunnelToken` chỉ khi gõ mới. Dòng gợi ý: "Point the tunnel's public hostname at http://127.0.0.1:<port> and protect it with a Cloudflare Access application."
- Trạng thái tunnel: chấm màu + chữ (`off` / `starting` / `running` / `failed` kèm `tunnelDetail`).
- **Pair a device**: mở cửa sổ, hiện mã to, đếm ngược tới `expiresAt`, link `https://<publicHost>` (bấm copy); có `pending` thì hiện tên, email, IP với **Approve** / **Reject**. Không bật remote hoặc chưa có cấu hình thì nút tắt kèm lý do.
- Thiết bị: mỗi dòng tên (bấm để sửa, Enter lưu), email, lần thấy cuối (12 giờ, theo `timeZone`), hàng `Segmented` cho từng vùng, switch push (tắt khi chưa có subscription), **Send test push**, **Revoke** (hỏi `ConfirmDialog` trước). Đổi quyền gửi ngay `PUT`.
- Nhật ký: 50 dòng mới nhất (giờ, thiết bị, method + route, status; status >= 400 màu cảnh báo).

**Tests:**

- `Save sends the remote block and leaves out an untouched tunnel token`
- `Pair a device shows the code and approves the waiting request`
- `changing a right sends the device's new rights at once`
- `Revoke asks before removing the device`
- `the remote section is not shown on a remote device`

---

## Kiểm tra cuối giai đoạn

Chạy tay sau Task 5 (ghi vào `impl-notes.md`): tạo tunnel trên Cloudflare (Zero Trust > Networks > Tunnels) trỏ `https://<publicHost>` về `http://127.0.0.1:4870`, tạo Access application cho host đó với policy chỉ email của anh; điền Settings > Remote access, Save, thấy tunnel `running`; trên iPhone mở `https://<publicHost>`, qua Access, ghép nối, Approve trên PC; thêm vào Home Screen, mở từ Home Screen (cookie riêng: ghép nối lại nếu cần), bật thông báo, Send test; đổi Tickets về View thấy nút ghi biến mất; thu hồi thấy điện thoại về màn ghép nối; mở `https://<publicHost>/api/remote` từ điện thoại bị 403; kiểm `secrets.json` không còn giá trị dạng rõ.
