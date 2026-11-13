# HeroUI pages -- impl notes

Ghi lại chỗ code lệch plan, quyết định plan không nói, đánh đổi. Mỗi task một mục `## Task N`.

## Task 1: Bộ UI dùng chung + bỏ `.legacy-page` theo từng trang
- **Quyết định:** `ConfirmDialog` đặt `role="dialog"` trên `AlertDialog.Dialog` (mặc định `alertdialog`) để 5 test đang hỏi `dialog` khỏi đổi; bật `isKeyboardDismissDisabled={false}` vì AlertDialog của HeroUI mặc định chặn Escape.
- **Quyết định:** `Card.Title` mặc định là `h3`, render thành `h2` qua `render`.
- **Lệch:** `BoardPage.test` đổi selector `.view-dot` -> `[data-testid="view-dot"]` (đã có trong quy ước chung).
- Client 165/165 PASS, typecheck + lint sạch.

## Task 2: Settings, trang ghép nối, trang thiết bị, lỗi khởi động
- **Lệch:** `DevicePage` nằm trong `Shell` nên dùng `Page` + `Section`, không phải card canh giữa như plan ghi. `BootError` và lỗi tải settings dùng chung `CenteredAlert` trong `App.tsx`.
- **Quyết định:** thêm `settings/AdvancedDisclosure.tsx` (một `Disclosure` đóng sẵn) cho Connections và TSC. Nhãn `Switch` đặt trong `Switch.Content`, vì `aria-label` ở gốc không tới được input; ma trận Notices dùng span `sr-only`.
- **Quyết định:** `Button` của HeroUI không có prop `title`, nên "Click to rename" / "Click to copy" bọc trong `<span title>`. Dòng nguồn env của `TokenField` thành `Chip`, không còn là `aria-describedby`.
- **Lệch (sửa ở main thread sau khi xem ảnh):** ô nhập trong `Card` ở theme tối mất nền, nên thêm `variant="secondary"` (`ui/TextField`, `TokenField`, `RemoteDevices`, `PairPage`) và ghi thành quy ước chung. Tiêu đề `Section` đổi sang `text-base font-semibold`.
- Client 166/166 PASS, typecheck + lint sạch; ảnh Settings sáng / tối ổn.

## Task 3: Board (Tickets)
- **Quyết định:** `dueClassName` (trả class CSS) thay bằng `dueUrgencyOf(row)` trong `boardView.ts` + component mới `DueDate.tsx` (`text-danger` / `text-warning` + `data-overdue`). `chipColor(tone)` trong `todoText.ts` map tone sang màu `Chip`.
- **Quyết định:** chip có link (PR, key gợi ý) là `<a>` bọc `Chip`; `KeyPill` là `<button>` bọc `Chip`; link trong `TodoRow` dùng `buttonVariants`.
- **Lệch:** `Shell.test` "renders inside .legacy-page" chuyển sang trang `timesheet` vì `tickets` đã ra khỏi `LEGACY_PAGES`. Test `due-overdue` đổi sang `data-overdue`.
- **Lệch (sửa ở main thread sau khi xem ảnh):** cột Key / Status / Due / ETA thêm `whitespace-nowrap` (mã ticket và ngày bị ngắt dòng).
- Client 166/166 PASS, typecheck + lint sạch; ảnh Tickets sáng / tối ổn.

## Task 4: Timesheet
- **Quyết định:** tách `WeekNav` (nhãn tuần, hai nút chevron, "Read again") ra khỏi `WeekHeader` để đặt vào `Page actions`. `WeekHeader` còn hàng HRM / TSC / trạng thái.
- **Quyết định:** guard bấm trong `DayCard` đổi `closest('.hours-bar')` -> `[data-hours-bar]`. Chip trạng thái ngày: logged `success`, queued `accent`, off / future `default`, empty không có chip.
- **Quyết định:** banner qua helper `Banner` (bọc `Alert` + nút ghost "Open Settings"); nhắc log và giữ lại để thử `warning`, TSC / HRM chưa nối `danger`. `LogInput` nằm trong `Card`, nút Add là icon `Plus`. Trang dùng `wide` + `max-w-[1300px]`, giữ độ rộng cũ.
- **Lệch:** test `.legacy-page` của Shell chuyển sang trang `insights`.
- Client 166/166 PASS, typecheck + lint sạch; ảnh Timesheet sáng / tối ổn (lưới ngày mờ khi đang đọc TSC, như trước).

## Task 5: Insights + Schedules
- **Lệch:** `ScanForm` dùng thẳng `TextField` / `Input` / `TextArea` của HeroUI, không dùng `ui/TextField`, vì form lưu khi `onBlur` và `ui/TextField` bắt buộc `hint`. `Select` giờ bắt đầu dùng `value` / `onChange` (`selectedKey` bị lint báo deprecated).
- **Quyết định:** trạng thái run / job là `Chip` thay chấm màu. `JobsCard` thêm chữ "Finished" / "Failed" cạnh giờ chạy cuối.
- **Lệch (sửa ở main thread sau khi xem ảnh):**
  - Biểu đồ cột theo ngày bị phóng theo `viewBox`, nên chữ to gấp ~3 lần (lỗi có từ trước). Giờ SVG có `width` thật + `max-w-full`, `COLUMN_W` 34 -> 52 để nhãn ngày khỏi dính nhau.
  - `JobsCard` bỏ dấu `:` thừa khi run không có summary.
  - `KeyPill` thêm `whitespace-nowrap` (mã ticket bị ngắt dòng trong bảng Insights).
- Client 166/166 PASS, typecheck + lint sạch; ảnh Insights / Schedules sáng / tối ổn.

## Task 6: Workspace (tab ticket, pane trái Changes / Files)
- **Quyết định:** wrapper `.legacy-page` của `ClaudePane` mang luôn `min-h-0 min-w-0 flex-[1_1_50%] flex-col` + `flex` / `hidden` theo `active`; wrapper trần làm pane Claude co lại. Pane vẫn mount và ẩn như cũ.
- **Lệch:**
  - Test thay thế đặt ở `WorkspacePage.test.tsx` (ở đó đã mock sẵn `TerminalView`); test `.legacy-page` cũ trong `Shell.test` bị xóa.
  - Teams đang chờ là boolean, nên dùng `Badge` chấm (`role="img"`, "New messages") thay `Chip`.
  - Ô đường dẫn thư mục hiện cạnh nút `+` thay vì nằm trong menu, vì input trong `Menu` react-aria tranh phím với typeahead; đóng khi blur.
- **Quyết định:**
  - Tab pane trái tự style, không dùng `Segmented`, để giữ `role="tab"`.
  - Ô lọc cây dùng variant mặc định vì nằm trên nền trang, không trên card.
  - Chấm tab dùng `data-testid="tab-dot"`. `FileTree` dùng icon chevron cho thư mục. Xóa `.nav-badge` khỏi CSS.
- **Đánh đổi:** khung Claude vẫn vẽ kiểu cũ (dải tab "Claude +" nền trắng ở theme sáng) cho tới phase SDK.
- Client 166/166 PASS, typecheck + lint sạch; ảnh Workspace sáng / tối ổn, cây file rồi tới viewer xếp dọc như trước.

## Task 7: Teams trong Workspace
- **Lệch:** không đưa emoji vào `Popover`. Nút thả cảm xúc nhanh ở thanh hover mà test tìm trực tiếp vẫn nằm ngay trong dòng (`Button isIconOnly`); `TeamsEmoji` chỉ vẽ một ảnh.
- **Quyết định:**
  - Nhóm "Chats" của `<select>` cũ thành `ListBox.Section` + `Header` trong `Select`.
  - Giữ class `teams-content` (test dùng) và `teams-mention` (`teamsComposerDom.ts` tạo); luật của chúng chuyển vào `workspace.css`.
  - Nút toolbar bỏ `title` (Button HeroUI không có prop này), còn `aria-label`.
- **Chưa kiểm bằng ảnh:** bản build trên 4870 đang đăng xuất Teams nên chỉ thấy màn đăng nhập; danh sách tin nhắn và composer để anh test live.
- Client 166/166 PASS, typecheck + lint sạch.

## Task 8: Dọn CSS cũ + kiểm toàn bộ
- **Quyết định:**
  - Xóa `shell.css` và import của nó.
  - `controls.css` chỉ giữ `*` (box-sizing, cần cho `all: revert`), `.legacy-page`, `.muted`, `.wd-button` (base / ghost) và `.segmented` mà khung Claude còn dùng.
  - `tokens.css` bỏ 27 biến không còn ai đọc.
- **Lệch (sửa ở main thread):** luật `.wd-spinner` nằm trong `board.css` đã xóa ở Task 3, nên spinner "Claude is working..." trong `ChatView` mất style. Đã đổi sang `Spinner` của HeroUI.
- Build PASS; `npm test` client 166, core 573, server 660 (+1 skipped) PASS; typecheck + lint + convention lint sạch (chỉ còn 4 lỗi đã biết ở `compare.html`). Ảnh 6 trang x sáng / tối ổn.
