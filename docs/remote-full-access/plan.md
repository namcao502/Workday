# Remote full access - plan

**Ticket:** side project (slug `remote-full-access`)
**Goal:** Một thiết bị đã ghép đôi, đi qua Cloudflare Access hoặc VPN, dùng được mọi thứ như ngồi tại PC: Workspace/Claude, Insights, Settings, mọi API. Bỏ hẳn quyền theo vùng (board/timesheet, off/view/act).
**Assumptions:**
- "Toàn quyền" gồm cả Settings, VPN/Cloudflare, quản lý thiết bị (ghép đôi, thu hồi). Điều kiện bảo vệ còn lại là Access JWT/dải IP VPN + cookie thiết bị + kiểm Origin cho request ghi.
- `devices.json` cũ còn trường `rights`: parse bỏ qua, không cần migrate.
- Push gửi tới mọi thiết bị đã bật push (không lọc theo vùng nữa).

**Expected outcome (acceptance criteria):**
- [ ] Request từ xa của thiết bị đã ghép đôi qua được mọi route `/api`, kể cả route không có `config.access` trước đây (workspace, insights, settings, remote).
- [ ] Thiết bị chưa ghép đôi vẫn chỉ gọi được route `area: 'unpaired'`; thiếu JWT/sai IP/sai Origin vẫn bị chặn như cũ.
- [ ] Không còn `DeviceRights`, `allows`, `parseRights`, PATCH `rights`, UI chọn quyền, dòng quyền trong trang thiết bị.
- [ ] Client từ xa thấy đủ mọi trang và mọi nút như local (Workspace, Insights, các card VPN/Cloudflare/Devices).
- [ ] CLAUDE.md mô tả luật mới.
- [ ] `npm test`, `npm run typecheck`, `npm run lint` sạch.

**Files:** core `remoteAccess.ts`, `api.ts`; server `remote/remoteGate.ts`, `remote/remoteService.ts`, `remote/deviceStore.ts`, `remote/pushService.ts`, `notices/noticeService.ts`, `events.ts`, `routes/*.ts` có `config.access`, `services.ts`; client `api/useMe.ts`, `api/remoteSettingsApi.ts`, `shell/pages.ts`, `board/BoardPage.tsx`, `settings/{VpnSection,CloudflareSection,RemoteSection,RemoteDevices}.tsx`, `remote/DevicePage.tsx`, `i18n/en.ts`, `vi.ts`; `CLAUDE.md`. Cùng các test tương ứng.

### Task 1: Server + core - thiết bị đã ghép đôi qua mọi route

**Files:** như trên phần core/server.

- `RouteAccess` chỉ còn `{ readonly area: 'unpaired' }`. Xóa mọi `config: { access: ... }` khác trên route (board, timesheet, work, notice, push, settings, events `'any'`, remote...). Giữ `'unpaired'` ở các route ghép đôi hiện có.
- `checkDevice`: thứ tự giữ nguyên (api check -> Origin cho request ghi -> unpaired exit -> device null 401 -> markSeen) rồi `return undefined`. Không còn 403 theo route.
- core `remoteAccess.ts`: xóa `RemoteArea`, `REMOTE_AREAS`, `AccessLevel`, `DeviceRights`, `DEFAULT_DEVICE_RIGHTS`, `allows`, `parseRights` (giữ phần IPv4/CIDR). Bỏ khỏi export index.
- `MeView` / `DeviceView`: bỏ `rights`. `deviceStore`: không đọc/ghi `rights`. `remoteService.updateDevice`: chỉ `name`/`pushEnabled`; bỏ `isDowngrade` và việc ngắt socket khi hạ quyền (thu hồi thiết bị vẫn ngắt như cũ). PATCH body: `{ name?, pushEnabled? }`.
- `pushService.sendToArea(area, msg)` -> `sendToDevices(msg)`: mọi thiết bị `pushEnabled` có subscription. `noticeService` deps `push: (message) => Promise<void>`; cập nhật chỗ gọi và `services.ts`.
- Comment ở `events.ts` về "downgraded" sửa cho đúng.
- Tests (sửa test cũ theo luật mới, thêm):
  - `paired device reaches a route without access config` (vd. một route workspace hoặc settings, qua tunnel và qua VPN).
  - `unpaired device is refused on a former local-only route` (401 notPaired).
  - `write without matching Origin is refused` vẫn pass.
  - `push goes to every device with push enabled`.
  - Xóa test của `allows`/`parseRights`/rights PATCH/downgrade.

### Task 2: Client - từ xa thấy mọi thứ như local

**Files:** phần client như trên.

- `accessFor`: `remote` -> `canSee`/`canAct` luôn `true`; `unpaired` giữ `false`. Kiểu `Access` giữ nguyên để khỏi sửa 45 chỗ gọi; tham số đổi từ `RemoteArea` sang một union cục bộ `'board' | 'timesheet'` trong `useMe.ts` (core không còn export).
- `pages.ts`: bỏ `PAGE_AREAS`; `pageVisible` trả `true` trừ `mode === 'unpaired'` (giữ hành vi unpaired hiện có nếu có, kiểm tra `App.tsx`).
- Bỏ điều kiện `access.mode === 'local'` ở `BoardPage` (workspace) và ba card VPN/Cloudflare/Devices.
- `RemoteDevices.tsx`: bỏ select quyền; `DevicePage.tsx`: bỏ khối hiển thị quyền; `remoteSettingsApi.ts`: bỏ `rights`. Xóa key i18n chỉ dùng cho quyền ở cả `en.ts` và `vi.ts`.
- Tests:
  - `remote access can see and act everywhere` (useMe).
  - `remote mode shows every page` (pages).
  - Cập nhật test của RemoteDevices/DevicePage không còn quyền.

### Task 3: CLAUDE.md

- Sửa hai luật remote: thiết bị đã ghép đôi (qua Access JWT hoặc dải IP VPN) được gọi mọi route; route chỉ khai `config.access = { area: 'unpaired' }` cho luồng ghép đôi. Bỏ câu "A route with no `config.access` is local-only" và "the right the route declares".
