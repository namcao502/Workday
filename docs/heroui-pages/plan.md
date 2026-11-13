# HeroUI cho các trang bên trong -- Implementation Plan

> **For agentic workers:** Use impl-write to execute this plan task-by-task.

**Ticket:** side project, manual git

**Frontend repo:** none -- client nằm trong repo này (`packages/client`)

**Goal:** Vẽ lại toàn bộ trang bên trong (Board, Timesheet, Insights, Schedules, Settings + remote, Workspace trừ khung Claude) bằng HeroUI để đồng nhất với khung app đã làm ở `heroui-foundation`.

**Expected outcome (acceptance criteria):**
- [ ] Board, Timesheet, Insights, Schedules, Settings, trang ghép nối (PairPage), trang thiết bị (DevicePage) và lỗi khởi động không còn nằm trong `.legacy-page`; nút, ô nhập, menu, hộp xác nhận, chip, khung section là component HeroUI.
- [ ] Workspace: thanh tab ticket, pane trái (Changes / Files / Teams) và mọi thứ trong Teams là HeroUI; chỉ `ClaudePane` (chat transcript + terminal) còn bọc `.legacy-page` cho tới phase SDK.
- [ ] `grep -rn "wd-button\|wd-input\|wd-menu\|wd-spinner\|\"segmented\"\|page-title\|section-title" packages/client/src --include=*.tsx` chỉ còn kết quả trong `ClaudePane.tsx`, `ChatView.tsx`, `ChatRows.tsx`, `TerminalView.tsx`.
- [ ] `board.css`, `timesheet.css`, `insights.css`, `schedules.css`, `teams.css` bị xóa; `controls.css` / `shell.css` / `tokens.css` / `workspace.css` chỉ còn luật mà khung Claude còn dùng.
- [ ] Theme sáng và tối đều đúng (chụp 6 trang x 2 theme), không còn dải nền `--window-bg` lệch với `bg-background`.
- [ ] Mọi test client cũ vẫn pass (chỉ được đổi selector khi class làm móc test bị bỏ, assertion giữ nguyên); typecheck, lint, convention lint sạch.

**Architecture:** Thêm `packages/client/src/ui/` chứa vài component dùng chung bọc HeroUI (Page, Section, Segmented, TextField, ConfirmDialog). `Shell` chỉ bọc `.legacy-page` cho trang còn trong `LEGACY_PAGES`; mỗi task chuyển xong trang nào thì bỏ trang đó khỏi tập, xóa CSS riêng của trang.

**Assumptions:**
- Không đổi hành vi, dữ liệu, i18n `t(en, vi)` hay quyền (`useAccess`): chỉ đổi phần vẽ.
- Bảng dùng `<table>` thường + Tailwind, không dùng `Table` của HeroUI (đó là grid react-aria, cần collection key và đổi role mà test đang hỏi `table` / `row`).
- Thanh tab ticket (`WorkspaceTabs`) và tab pane trái giữ markup `role="tab"` tự viết, chỉ đổi style: tab ticket có nút đóng lồng trong, `Tabs` của react-aria không cho phần tử bấm được lồng trong tab.
- Không có test hình ảnh tự động; chụp ảnh trước / sau bằng script `playwright-core` ngoài repo (`%TEMP%\heroui-shots.mjs`, bản build trên 4870) để kiểm tay.

**Tech Stack:** React 19, HeroUI v3.2.7 (`@heroui/react`, react-aria), Tailwind 4, `@gravity-ui/icons`, Vitest + Testing Library.

---

## Quy ước chung (mọi task)

Đối chiếu cũ -> mới; task nào gặp mẫu cũ thì đổi theo bảng này:

| Cũ | Mới |
| --- | --- |
| `wd-button primary / secondary / ghost / danger` | `Button` `variant` `primary` / `secondary` / `ghost` / `danger`; `size="sm"` trong dòng bảng, thanh công cụ, thẻ |
| `wd-input`, `<textarea>` | `Input` / `TextArea` của HeroUI; có nhãn + gợi ý thì `ui/TextField` |
| ô tìm kiếm | `SearchField` (giữ `role="searchbox"` mà test đang hỏi) |
| checkbox bật / tắt cấu hình | `Switch`; chọn trong danh sách thì `Checkbox` |
| `<select>` | `Select` của HeroUI |
| `segmented` | `ui/Segmented` |
| `pill`, `key-pill`, pill PR, trạng thái dạng nhãn | `Chip` (`size="sm"`, màu theo tone) |
| `page` + `page-title` | `ui/Page` |
| `section` + `section-title` / `section-subtitle` | `ui/Section` |
| `status`, `status danger / success`, `muted`, `field-hint` | Tailwind `text-sm text-muted` / `text-danger` / `text-success` |
| `banner` | `Alert` |
| `wd-spinner` | `Spinner size="sm"` |
| `wd-menu` + `wd-menu-item` | `Dropdown` (`Dropdown.Trigger` / `.Popover` / `.Menu` / `.Item`), giữ `aria-label` của nút mở và nhãn từng mục |
| `ConfirmDialog` | `ui/ConfirmDialog` |
| `<details>` | `Disclosure` |
| `button-row`, `field-row`, `inline-row` | `flex flex-wrap items-center gap-2` |
| `var(--wd-*)`, `--text-secondary`, `--window-bg`... trong CSS trang | token HeroUI qua Tailwind: `text-muted`, `text-accent`, `bg-surface`, `bg-surface-secondary`, `bg-accent-soft`, `border-separator`, `text-danger`, `bg-warning-soft`... |

- Ô nhập nằm trên nền `Card` / `Section` (`Input`, `TextArea`, `SearchField`, `Select`) đặt `variant="secondary"`: biến thể mặc định trùng màu `bg-surface` nên ở theme tối ô nhập biến mất. Tiêu đề trong card dùng `text-base font-semibold`.
- Style viết bằng class Tailwind trong TSX; không thêm file CSS mới. Ngoại lệ: thứ Tailwind không viết gọn được (keyframes, nội dung HTML render sẵn như markdown / diff / tin Teams) thì giữ luật trong CSS của trang đó, đổi màu sang biến HeroUI (`var(--muted)`...).
- Class đang làm móc cho test (`due-overdue`, `view-dot`, `code-line`, `teams-content`, `rect.bar`) đổi thành `data-*` / `data-testid` và chỉ sửa selector trong test; hoặc giữ nguyên tên class nếu phần tử vẫn cần nó (vd `rect.bar` trong SVG).
- Tra API HeroUI (tên prop, sub-component) bằng Context7 `/heroui-inc/heroui` hoặc file `.d.ts` trong `node_modules/@heroui/react/dist/components/<name>/`; không đoán.
- Bấm trong test: `fireEvent.click` chạy được với react-aria (đã thấy ở foundation). Popover / Dropdown render qua portal, tìm bằng `screen`, không bằng `container`.
- Mỗi task: bỏ id trang khỏi `LEGACY_PAGES` trong `Shell.tsx`, xóa import + file CSS riêng của trang, chạy test của thư mục trang, rồi chụp trang đó sáng / tối và xem ảnh.

## File structure

- Create `packages/client/src/ui/`: `Page.tsx`, `Section.tsx`, `Segmented.tsx` (chuyển từ settings), `TextField.tsx` (chuyển từ settings), `ConfirmDialog.tsx` (chuyển từ timesheet) + test.
- Modify từng thư mục trang (Task 2-7), `shell/Shell.tsx`, `App.tsx`.
- Delete CSS trang (`board.css`, `timesheet.css`, `insights.css`, `schedules.css`, `teams.css`); thu gọn `styles/*.css`, `workspace.css` (Task 8).

### Task 1: Bộ UI dùng chung + bỏ `.legacy-page` theo từng trang

**Files:**
- Create: `packages/client/src/ui/Page.tsx`, `ui/Section.tsx`
- Move + rewrite: `settings/Segmented.tsx` -> `ui/Segmented.tsx`, `settings/TextField.tsx` -> `ui/TextField.tsx`, `timesheet/ConfirmDialog.tsx` -> `ui/ConfirmDialog.tsx`; sửa mọi import (13 file dùng `ConfirmDialog` / `Segmented`, các section settings dùng `TextField`)
- Modify: `packages/client/src/shell/Shell.tsx` -- `LEGACY_PAGES`
- Test: `ui/Segmented.test.tsx`, `ui/ConfirmDialog.test.tsx`, `ui/TextField.test.tsx`, `shell/Shell.test.tsx`

**Shape:**
```tsx
// ui/Page.tsx -- a page body under the TopBar: title + a column of blocks.
export function Page(props: {
  readonly title: string
  readonly actions?: React.ReactNode // right of the title
  readonly wide?: boolean // Board / Insights tables use the full width
  readonly className?: string
  readonly children: React.ReactNode
}): React.JSX.Element

// ui/Section.tsx -- a HeroUI Card with a title row.
export function Section(props: {
  readonly title: string
  readonly description?: string
  readonly actions?: React.ReactNode
  readonly children: React.ReactNode
}): React.JSX.Element
```
`Segmented`, `TextField`, `ConfirmDialog` giữ nguyên props và export hiện tại (chỉ đổi đường dẫn).

**Logic:**
- `Page`: `<section>` với `mx-auto flex w-full flex-col gap-5 px-6 pb-8`, `max-w-4xl` (bỏ khi `wide`); tiêu đề `<h1>` `text-2xl font-semibold tracking-tight`, `actions` cùng hàng bên phải.
- `Section`: `Card` (`Card.Header` có `Card.Title` là `<h2>` + `Card.Description`, `Card.Content`). Tiêu đề phải là heading thật: test đang tìm section theo heading.
- `Segmented`: `ToggleButtonGroup` `selectionMode="single"` `disallowEmptySelection`, mỗi option một `ToggleButton`; react-aria cho `role="radiogroup"` / `role="radio"` + `aria-checked` như bây giờ (`aria-label` = `label`). `dot` -> chấm accent nhỏ `aria-hidden` có `data-testid="view-dot"`.
- `TextField`: `TextField` của HeroUI + `Label` + `Input` (hoặc `TextArea` khi có `rows`) + `Description` cho `hint`; `getByLabelText(label)` phải trả về đúng ô nhập, `id` vẫn đặt lên ô nhập.
- `ConfirmDialog`: `AlertDialog` mở sẵn (`isOpen`), `onOpenChange(false)` -> `onCancel`; nút Cancel (`t('Cancel', 'Hủy')`) và nút xác nhận (`confirmLabel`, `variant="danger"` nếu hiện đang là nút danger, xem bản cũ). Escape đóng = `onCancel` (react-aria tự lo, bỏ listener `keydown` tay). Giữ `role` dialog / alertdialog sao cho test cũ tìm được (đổi query sang `alertdialog` nếu cần, ghi impl-notes).
- `Shell`: `const LEGACY_PAGES: ReadonlySet<PageId>` gồm cả 6 trang; `<main>` bọc `.legacy-page` chỉ khi `LEGACY_PAGES.has(page)`. Task trang nào bỏ id đó; task làm rỗng tập thì xóa luôn tập và nhánh bọc.

**Tests:**
- `Segmented exposes a radiogroup and reports the picked value` -- bấm option 2 gọi `onChange('b')`, option đang chọn có `aria-checked="true"`.
- `Segmented shows the dot only on the flagged option`.
- `TextField links the label, the input and the hint` -- `getByLabelText` ra input, input có `aria-describedby` trỏ tới hint.
- `ConfirmDialog confirms and cancels` -- bấm nút xác nhận gọi `onConfirm`; Escape gọi `onCancel`.
- Test Shell hiện có `the page content renders inside .legacy-page` giữ nguyên ở Task 1 (cả 6 trang còn trong tập); Task 2 thêm test ngược lại cho Settings.

### Task 2: Settings, trang ghép nối, trang thiết bị, lỗi khởi động

**Files:**
- Modify: `packages/client/src/settings/*.tsx` (15 file còn lại sau khi `Segmented` / `TextField` chuyển đi)
- Modify: `packages/client/src/remote/DevicePage.tsx`, `remote/PairPage.tsx`, `packages/client/src/App.tsx` (`BootError`, lỗi tải settings, nhánh PairPage)
- Modify: `shell/Shell.tsx` -- bỏ `settings` khỏi `LEGACY_PAGES`
- Modify: `styles/shell.css` -- xóa luật chỉ Settings / remote dùng (`device-*`, `pairing-code`, `activity-table`, `boot-error`, `advanced`...)
- Test: các `settings/*.test.tsx`, `remote/*.test.tsx`, `App.test.tsx`, `shell/Shell.test.tsx`

**Logic:**
- `SettingsPage` = `Page`; mỗi `*Section` = `Section` (tiêu đề cũ thành `title`).
- Checkbox cấu hình (`NoticesSection`, `RemoteSection`, `WorkspaceSection`, `RemoteDevices`) -> `Switch`, nhãn giữ nguyên để `getByLabelText` / `getByRole('switch')` tìm được; test nào đang hỏi `checkbox` thì đổi role sang `switch`.
- `TokenField`: ô mật khẩu + nút Save / Clear thành `InputGroup` hoặc `Input` + `Button size="sm"` cùng hàng; dòng nguồn (file / env) là `Chip`.
- `AdvancedFields` / `TscAdvancedFields`: `Disclosure` ("Advanced" / "Nâng cao"), đóng mặc định như bây giờ.
- `RemoteDevices` / `RemoteActivity`: danh sách thiết bị là các dòng `flex` có `border-b border-separator`; bảng hoạt động là `<table>` Tailwind (`text-sm`, đầu cột `text-xs text-muted uppercase`, dòng lỗi `text-danger`).
- Mã ghép nối (`RemotePairing`): chữ `font-mono text-2xl tracking-widest`, khung `bg-surface-secondary rounded-xl`.
- `PairPage` / `DevicePage` / `BootError`: không nằm trong `Shell`, nên tự canh giữa: `min-h-dvh grid place-items-center p-6` + một `Card` rộng tối đa `max-w-md`. Bỏ ba chỗ bọc `.legacy-page` trong `App.tsx`; `BootError` thành `Alert` `status="danger"`.

**Tests:**
- `the settings page is not wrapped in .legacy-page` (Shell.test).
- `the pair page is not wrapped in .legacy-page` (App.test) -- thay test `the pair page renders inside .legacy-page` cũ.
- Mọi test settings / remote cũ pass (chỉ đổi role checkbox -> switch nếu có).

### Task 3: Board (Tickets)

**Files:**
- Modify: `packages/client/src/board/*.tsx` (`BoardPage`, `BoardTable`, `BoardCard`, `KeyPill`, `PrPills`, `RowMenu`, `SuggestionsCard`, `TodoRow`, `TodoView`, `useReadyToTest`)
- Delete: `packages/client/src/board/board.css`
- Modify: `shell/Shell.tsx` -- bỏ `tickets`
- Test: `board/*.test.tsx`

**Logic:**
- `BoardPage` = `Page wide`; thanh trên: `Segmented` view + `SearchField` + trạng thái poll (`text-sm text-muted`, lỗi `text-danger`) trên cùng một hàng `flex-wrap`.
- `BoardTable`: `<table>` Tailwind trong một `Card` (`p-0`, `overflow-hidden`); đầu cột `text-xs text-muted`, dòng hover `bg-surface-secondary`; ngày quá hạn `text-danger` + `data-overdue` (thay class `due-overdue`, sửa selector trong test).
- `KeyPill` / `PrPills` -> `Chip size="sm"` (PR: màu theo trạng thái build / review như hiện tại, map sang `success` / `warning` / `danger` / `default`).
- `RowMenu` -> `Dropdown`: nút mở `Button isIconOnly variant="ghost" size="sm"` (icon `EllipsisVertical`), giữ `aria-label` "Actions for <key>"; mục `disabled` -> `isDisabled`; bỏ listener mousedown tự viết. Không `canAct` thì vẫn trả `null`.
- `BoardCard` (màn hẹp) -> `Card` gọn; `SuggestionsCard` -> `Section` hoặc `Card` có danh sách nút.
- `TodoView` / `TodoRow`: nhóm là tiêu đề nhỏ `text-xs font-medium text-muted uppercase`, dòng `flex` + `border-b border-separator`.
- Hộp xác nhận / Ready to Test (`useReadyToTest`) dùng `ui/ConfirmDialog` hoặc `Modal` nếu nó có nội dung riêng (giữ nguyên luồng).

**Tests:** mọi test board cũ pass; `view-dot` / `due-overdue` đổi selector như quy ước chung.

### Task 4: Timesheet

**Files:**
- Modify: `packages/client/src/timesheet/*.tsx` (`TimesheetPage`, `WeekHeader`, `WeekTotals`, `DayCard`, `TicketRows`, `LogInput`, `HoursBar`, `ActionMenu`, `TimesheetBanners`)
- Delete: `packages/client/src/timesheet/timesheet.css`
- Modify: `shell/Shell.tsx` -- bỏ `timesheet`
- Test: `timesheet/*.test.tsx`

**Logic:**
- `TimesheetPage` = `Page` (`actions` = điều hướng tuần của `WeekHeader`: hai `Button isIconOnly variant="ghost"` `ChevronLeft` / `ChevronRight` + nhãn tuần).
- `DayCard` -> `Card`; trạng thái ngày (đã log / thiếu / nghỉ) là `Chip` màu `success` / `warning` / `default`.
- `TimesheetBanners` -> `Alert` (`warning` / `danger` theo loại hiện tại).
- `ActionMenu` -> `Dropdown` như `RowMenu` của Task 3.
- `HoursBar` giữ logic kéo thả; chỉ đổi style sang Tailwind: thanh `h-8 rounded-lg bg-surface-secondary`, đoạn `bg-accent-soft text-accent-soft-foreground`, tay cầm `w-1.5 bg-accent rounded-full cursor-col-resize`.
- `TicketRows` / `LogInput`: ô giờ là `Input` nhỏ (`w-16 text-right`), dòng cảnh báo `text-warning`, nút xóa dòng `Button isIconOnly variant="ghost" size="sm"` (icon `Xmark`, giữ `aria-label`).

**Tests:** mọi test timesheet cũ pass.

### Task 5: Insights + Schedules

**Files:**
- Modify: `packages/client/src/insights/*.tsx`, `packages/client/src/schedules/*.tsx`
- Delete: `insights/insights.css`, `schedules/schedules.css`
- Modify: `shell/Shell.tsx` -- bỏ `insights`, `schedules`
- Test: `insights/*.test.tsx`, `schedules/*.test.tsx`

**Logic:**
- `InsightsPage` = `Page wide`; `ReportHeader` (chọn báo cáo / khoảng) = `Segmented` + `Input`; `ReportTable` = `<table>` Tailwind trong `Card`; `ReportDetail` = `Card`.
- `BarChart`: SVG giữ nguyên cấu trúc (`rect.bar`, `<title>` mà test đọc); màu lấy từ biến HeroUI (`fill: var(--accent)`, trục / chữ `var(--muted)`, lưới `var(--separator)`).
- `SchedulesPage` = `Page`; `JobsCard` / `ScanCard` = `Section`; trạng thái job là `Chip` (`success` / `danger` / `default`); `ScanRuns` là danh sách dòng hoặc `<table>` Tailwind.
- `ScanForm`: checkbox -> `Switch`, `<select>` -> `Select` (giữ nhãn để `getByLabelText` còn chạy; nếu test đang `fireEvent.change` trên select thì đổi sang mở `Select` rồi bấm option, ghi impl-notes), `<textarea>` -> `ui/TextField rows`.

**Tests:** mọi test insights / schedules cũ pass.

### Task 6: Workspace (tab ticket, pane trái Changes / Files)

**Files:**
- Modify: `packages/client/src/workspace/WorkspacePage.tsx`, `WorkspaceTabs.tsx`, `LeftPane.tsx`, `ChangesView.tsx`, `GroupTrees.tsx`, `FilesView.tsx`, `FileTree.tsx`, `FileViewer.tsx`, `DiffView.tsx`
- Modify: `workspace/ClaudePane.tsx` -- chỉ bọc gốc trong `<div className="legacy-page h-full">`, không đổi gì khác
- Modify: `workspace/teams/TeamsView.tsx` -- tạm bọc gốc trong `.legacy-page` (Task 7 gỡ)
- Modify: `workspace/workspace.css` -- xóa luật của phần đã chuyển; giữ luật `claude-*`, `chat-*`, `terminal-*` và luật nội dung render sẵn (`markdown-view`, `code-view`, `diff-*`) với màu đổi sang biến HeroUI
- Modify: `shell/Shell.tsx` -- bỏ `workspace`; `LEGACY_PAGES` rỗng thì xóa tập và nhánh bọc
- Test: `workspace/*.test.tsx`, `shell/Shell.test.tsx`

**Logic:**
- `WorkspacePage` tự cao đầy vùng trang (`h-full min-h-0 flex flex-col`): trước đây nó dựa vào `height: 100%` của `.legacy-page`.
- `WorkspaceTabs`: giữ markup `role="tablist"` / `role="tab"` (test hỏi `getByRole('tab', { name: 'MDP-2' })`); tab là nút `rounded-lg px-3 h-8 text-sm`, tab chọn `bg-surface shadow-sm`, nút đóng `CloseButton` nhỏ có `aria-label` cũ; chấm / badge chờ dùng lại `Badge` như sidebar (giữ `data-testid="nav-dot"` / `"nav-badge"` nếu test đang dùng). Menu repo của tab -> `Dropdown`; ô đường dẫn -> `Input`.
- `LeftPane`: tab Changes / Files / Teams giữ `role="tab"`, style như `Segmented` (nền `bg-surface-secondary`, mục chọn `bg-surface`); số Teams đang chờ là `Chip size="sm"`.
- `ChangesView` / `GroupTrees` / `FileTree`: dòng cây `h-7 text-sm rounded-md hover:bg-surface-secondary`, dòng chọn `bg-accent-soft text-accent-soft-foreground`; trạng thái file (M / A / D) là chữ `font-mono` màu `text-warning` / `text-success` / `text-danger`; ô lọc là `SearchField` (giữ `role="searchbox"`).
- `FileViewer`: chọn chế độ xem = `ui/Segmented`; `DiffView` / code / markdown giữ luật CSS cho nội dung, `code-line` giữ class (test đếm).
- Hộp xác nhận đóng tab dùng `ui/ConfirmDialog` (đã đổi import ở Task 1).

**Tests:**
- `the workspace page is not wrapped in .legacy-page but the Claude pane is` (Shell.test hoặc WorkspacePage.test).
- Mọi test workspace cũ pass.

### Task 7: Teams trong Workspace

**Files:**
- Modify: `packages/client/src/workspace/teams/*.tsx` (`TeamsView`, `TeamsPanels`, `TeamsThread`, `TeamsMessageRow`, `TeamsPostCard`, `TeamsComposer`, `TeamsComposerToolbar`, `TeamsComposeParts`, `TeamsEmoji`)
- Delete: `packages/client/src/workspace/teams/teams.css` (luật cho HTML tin nhắn render sẵn, nếu còn cần, chuyển vào `workspace.css` dưới `.teams-content`)
- Test: `workspace/teams/*.test.tsx`

**Logic:**
- Gỡ `.legacy-page` tạm của Task 6 khỏi `TeamsView`.
- `TeamsPostCard` / tin nhắn -> `Card` gọn (`p-3`), người gửi `text-sm font-medium`, giờ `text-xs text-muted`; nội dung HTML giữ class `teams-content` (test dùng) và luật CSS của nó.
- `TeamsComposer`: ô soạn `contenteditable` giữ nguyên logic (mention, paste, không `b` / `i`); khung `rounded-xl border border-field-border bg-field-background p-2 focus-within:border-field-border-focus`. Danh sách mention giữ markup tự viết (test dựa `span[data-mention]`), style như menu HeroUI (`bg-overlay shadow-overlay rounded-xl`). Ô tiêu đề -> `Input`; chọn kênh `<select>` -> `Select`.
- `TeamsComposerToolbar` / `TeamsEmoji`: nút `Button isIconOnly variant="ghost" size="sm"`, bảng emoji trong `Popover`.

**Tests:** mọi test Teams cũ pass.

### Task 8: Dọn CSS cũ + kiểm toàn bộ

**Files:**
- Modify: `packages/client/src/styles/controls.css`, `styles/shell.css`, `styles/tokens.css`, `styles/app.css`, `workspace/workspace.css`
- Modify: `CLAUDE.md` (một dòng: UI là HeroUI + Tailwind, `src/ui/` là component dùng chung, CSS tay chỉ còn cho khung Claude và nội dung render sẵn)

**Logic:**
- Với từng class / biến trong `controls.css`, `shell.css`, `tokens.css`: grep trong `src`; không còn ai dùng thì xóa. Phần chỉ khung Claude dùng thì giữ (khung Claude bị thay ở phase SDK, lúc đó xóa nốt). File rỗng thì xóa file và import.
- Luật `.legacy-page` trong `app.css` / `controls.css` giữ vì `ClaudePane` còn dùng; comment ghi rõ nó chỉ còn cho khung Claude.
- Chạy `npm run build`, `npm test -w @workday/client`, `npm run typecheck`, `npm run lint`, convention lint; chụp 6 trang x sáng / tối (+ một ảnh 600px cho tab bar) bằng `%TEMP%\heroui-shots.mjs` trên bản build 4870 và xem từng ảnh; ghi kết quả một dòng vào `impl-notes.md`.

**Tests:** cả 3 workspace (`npm test`) pass; tiêu chí grep ở phần acceptance đúng.
