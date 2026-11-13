# HeroUI foundation Implementation Plan

> **For agentic workers:** Use impl-write to execute this plan task-by-task.

**Ticket:** side project, manual git

**Frontend repo:** none -- client là `packages/client` trong repo này

**Goal:** Cài HeroUI v3 + Tailwind 4 vào client và dựng lại khung app (sidebar, tab bar dưới, thanh trên, chuông, toast) bằng HeroUI, trong khi các trang cũ vẫn chạy trên CSS hiện tại và trông như cũ.

**Expected outcome (acceptance criteria):**
- [ ] `npm run dev`, `npm run build`, `npm test`, `npm run typecheck`, `npm run lint`, convention lint sạch; client dùng `@heroui/react` 3.2.7 + `tailwindcss` 4 qua `@tailwindcss/vite`.
- [ ] Sidebar theo kiểu HeroUI (như `docs/ui-mockup/compare.html`, khung HeroUI): tên app, icon + nhãn cho từng trang, mục đang chọn là nền accent nhạt + chữ accent, Settings ở đáy; số đếm Tickets / Workspace là Badge, chấm Timesheet / Schedules là Badge dạng chấm. Mục đang chọn vẫn có `aria-current="page"`.
- [ ] Màn hình < 720px: tab bar dưới đáy (icon + nhãn) thay sidebar, cùng badge / chấm như hiện nay.
- [ ] Thanh trên: nút chuông chỉ có icon (`aria-label` "Notices" / "Thông báo"), Badge số chưa đọc (99+); bấm mở Popover danh sách mới nhất trước (chấm chưa đọc, giờ, chữ theo ngôn ngữ), bấm một dòng -> đi tới đích + đánh dấu đã đọc, nút Mark all read.
- [ ] Toast góc dưới phải bằng HeroUI (card bo tròn, bóng mềm, màu theo tone): tối đa 3, tự đóng sau 6 s không đánh dấu đọc, bấm chữ -> mở đích, nút đóng -> đánh dấu đọc (giữ nguyên hành vi `NoticeAlerts`).
- [ ] Theme sáng / tối trong Settings áp dụng ngay cho khung HeroUI lẫn trang cũ, giữ sau reload, không nháy màu lúc tải.
- [ ] Các trang cũ (Tickets, Workspace, Timesheet, Insights, Schedules, Settings, trang ghép nối, DevicePage) trông như trước: cùng font Segoe UI, khoảng cách, nút, ô nhập, menu. So ảnh chụp trước / sau từng trang ở cả hai theme.
- [ ] Vùng markdown (Files, Chat, Insights) và HTML Teams vẫn có heading, danh sách, code, bảng.
- [ ] Từ xa: trang không có quyền vẫn ẩn, Settings vẫn là DevicePage, trang ghép nối không đổi.

**Architecture:** Một file CSS gốc (`src/styles/app.css`) khai báo thứ tự layer `theme, base, legacy, components, utilities`, import Tailwind + HeroUI; CSS cũ đổi tên phần trùng với HeroUI (tiền tố `wd-`) và được bọc trong `.legacy-page`, nơi một luật ở layer `legacy` gỡ preflight của Tailwind (`all: revert`) cho các thẻ HTML. Khung app (`shell/`, `notices/`) viết lại bằng component HeroUI + class Tailwind; trang cũ không đổi logic.

**Assumptions:**
- Theme vẫn đặt bằng `data-theme` trên `<html>` (HeroUI nhận `data-theme="dark"`); `dark:` của Tailwind khai báo bằng `@custom-variant dark` theo `data-theme`, không thêm class `dark`.
- Font khung mới là Inter qua `@fontsource-variable/inter` (gói trong bản build, không tải mạng); trang cũ giữ Segoe UI.
- Icon: `@gravity-ui/icons` (bộ icon trong tài liệu HeroUI).
- Toast tự dựng bằng `Card` + `CloseButton` của HeroUI, không dùng `toast()` toàn cục: hàng đợi của HeroUI không phân biệt "đóng = đã đọc" với "hết giờ", và logic `useNotices` đã có test.
- Mục sidebar / tab bar là `<button>` thường với class từ `buttonVariants` + Tailwind (`Button` của react-aria không chắc truyền `aria-current` xuống DOM).
- Trang cũ chưa có tiêu đề trên thanh trên; mỗi trang vẫn tự vẽ `h1` của nó ở GĐ này.

**Tech Stack:** `@heroui/react` 3.2.7, `@heroui/styles` 3.2.7, `tailwindcss` 4 + `@tailwindcss/vite`, `@gravity-ui/icons`, `@fontsource-variable/inter`.

---

## File structure

- Create `packages/client/src/styles/app.css` -- layer order, Tailwind + HeroUI, font, dark variant, luật `legacy`.
- Modify `packages/client/src/main.tsx` -- import `app.css` trước CSS cũ; import font Inter.
- Modify `packages/client/vite.config.ts` -- thêm `tailwindcss()` (vitest không cần: CSS không được xử lý trong test).
- Modify CSS cũ + TSX dùng class trùng -- đổi tên (Task 1).
- Rewrite `packages/client/src/shell/Shell.tsx`, `Sidebar.tsx`, `TabBar.tsx`; create `shell/pageIcons.tsx`, `shell/TopBar.tsx`.
- Rewrite `packages/client/src/notices/NoticeBell.tsx`, `NoticeToasts.tsx`; thu gọn `notices.css`, `styles/shell.css`.

### Task 1: Nền HeroUI + Tailwind, CSS cũ thành `legacy`

**Files:**
- Modify: `packages/client/package.json` -- thêm `@heroui/react`, `@heroui/styles` (3.2.7), `tailwindcss`, `@tailwindcss/vite`, `@gravity-ui/icons`, `@fontsource-variable/inter` (peer `react-aria-components` v.v. do npm tự cài; ghi impl-notes nếu phải thêm tay).
- Modify: `packages/client/vite.config.ts` -- plugin `tailwindcss()` trước `react()`.
- Create: `packages/client/src/styles/app.css`
- Modify: `packages/client/src/main.tsx` -- import `@fontsource-variable/inter` và `./styles/app.css` trước `tokens.css`.
- Modify: `packages/client/src/styles/controls.css` -- luật `body` cũ chuyển thành `.legacy-page` (font, màu chữ, nền); `body` không còn style cũ.
- Modify: mọi CSS / TSX dùng class hoặc biến trùng (bảng dưới).
- Modify: `packages/client/src/shell/Shell.tsx` -- bọc `<PageContent>` trong `<div className="legacy-page">`.
- Modify: `packages/client/src/App.tsx` -- `PairPage` và `BootError` cũng nằm trong `.legacy-page`.
- Modify: `packages/client/index.html` -- màu nền trước khi vẽ lấy theo `--background` của HeroUI (sáng `oklch(0.9702 0 0)`, tối: đọc từ `@heroui/styles/dist/themes/default/variables.css`).
- Test: `packages/client/src/shell/Shell.test.tsx`, `packages/client/src/App.test.tsx`

**Shape** -- `app.css`:
```css
@layer theme, base, legacy, components, utilities;

@import 'tailwindcss';
@import '@heroui/styles';

@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *));

@theme {
  --font-sans: 'Inter Variable', system-ui, sans-serif;
}

body {
  @apply bg-background text-foreground font-sans antialiased;
}

@layer legacy {
  /* Old pages were drawn on browser defaults; undo Tailwind's preflight inside them. */
  .legacy-page
    :where(h1, h2, h3, h4, h5, h6, p, ul, ol, li, dl, dd, blockquote, figure, pre, code, kbd,
      table, th, td, hr, img, a, button, input, select, textarea, fieldset, legend, summary) {
    all: revert;
  }
}
```

**Logic:**
- Đổi tên (CSS cũ là unlayered nên luôn thắng layer của HeroUI; trùng tên thì nút HeroUI ăn style cũ và ngược lại):

  | Cũ | Mới | Chỗ dùng |
  | --- | --- | --- |
  | class `button` | `wd-button` | ~194 trong TSX + `controls.css` (cả `.button.primary` ...) |
  | class `input` | `wd-input` | ~25 |
  | class `menu`, `menu-item` | `wd-menu`, `wd-menu-item` | ~24, `board.css` |
  | class `spinner` | `wd-spinner` | 3, `board.css` |
  | biến `--accent`, `--accent-hover`, `--danger`, `--muted`, `--success`, `--warning` | thêm tiền tố `--wd-` | `tokens.css` + mọi `var(...)` |

  Chỉ đổi token trùng đúng tên (một class `button-row` hay `notice-dot` không đổi). Kiểm sau khi đổi: `grep -rnE "className=[^>]*\bbutton\b" src` và `grep -rn "var(--accent)" src` không còn kết quả.
- `.legacy-page` trong Shell cao đầy vùng trang (`height: 100%; min-height: 0`): `.workspace-page` dựa vào `height: 100%` của cha.
- Không đặt `.legacy-page` lên `<html>` / `<body>`: luật `all: revert` chỉ áp trong vùng trang cũ, khung HeroUI ngoài vùng đó giữ preflight.
- Thứ tự layer khai báo trước mọi `@import`, nên `legacy` nằm giữa `base` (preflight) và `components` (HeroUI) dù `@heroui/styles` tự khai báo lại.
- Chụp ảnh trước / sau (kiểm tay, không commit script): trước khi sửa, script `playwright-core` (Chrome, viewport 1400x900) chụp `#/tickets`, `#/workspace`, `#/timesheet`, `#/insights`, `#/schedules`, `#/settings` ở cả `light` và `dark` vào `%TEMP%\heroui-before\`; sau Task 1 chụp lại vào `heroui-after\` và so từng cặp. Khác biệt chấp nhận: chỉ sidebar / thanh trên (Task 2 làm lại). Ghi kết quả vào `impl-notes.md`.

**Tests:**
- `the page content renders inside .legacy-page` (Shell.test) -- trang Tickets nằm trong phần tử `.legacy-page`, sidebar thì không.
- `the pair page renders inside .legacy-page` (App.test) -- thiết bị chưa ghép nối.
- Toàn bộ test client cũ vẫn pass sau khi đổi tên class.

### Task 2: Khung app bằng HeroUI (sidebar, tab bar, thanh trên, chuông, toast)

**Files:**
- Create: `packages/client/src/shell/pageIcons.tsx` -- icon cho từng `PageId`.
- Create: `packages/client/src/shell/TopBar.tsx` -- thanh trên, hiện chứa `NoticeBell` bên phải.
- Modify: `packages/client/src/shell/Shell.tsx` -- layout bằng Tailwind: sidebar + cột nội dung (TopBar trên, trang dưới); hẹp thì tab bar dưới.
- Modify: `packages/client/src/shell/Sidebar.tsx`, `packages/client/src/shell/TabBar.tsx` -- vẽ lại, props giữ nguyên.
- Modify: `packages/client/src/notices/NoticeBell.tsx`, `packages/client/src/notices/NoticeToasts.tsx` -- vẽ lại, logic giữ nguyên.
- Modify: `packages/client/src/styles/shell.css`, `packages/client/src/notices/notices.css` -- xóa luật của sidebar / tab bar / thanh trên / chuông / toast đã thay; giữ luật trang cũ còn dùng (`.status`, `.form-field`, `.visually-hidden`...).
- Test: `packages/client/src/shell/Shell.test.tsx`, `packages/client/src/notices/NoticeBell.test.tsx`, `packages/client/src/notices/useNotices.test.tsx`

**Shape:**
```tsx
// shell/pageIcons.tsx
export function PageIcon({ page }: { readonly page: PageId }): React.JSX.Element
// shell/TopBar.tsx
export function TopBar(): React.JSX.Element
```
`Sidebar` / `TabBar` / `NoticeBell` / `NoticeToasts` giữ export và props hiện tại; `badgeText` và `TOAST_MS` giữ nguyên.

**Logic:**
- Icon (`@gravity-ui/icons`, chọn tên có thật trong gói): tickets = danh sách việc, workspace = terminal / code, timesheet = đồng hồ, insights = biểu đồ cột, schedules = lịch, settings = bánh răng.
- Sidebar (giống khung HeroUI trong `docs/ui-mockup/compare.html`): nền `bg-surface`, bo `rounded-2xl`, bóng nhẹ, rộng ~210px, có lề với cạnh cửa sổ; mục là `<button>` dùng `buttonVariants({ variant: 'ghost' })` + `w-full justify-start`; mục chọn thêm nền accent nhạt + chữ accent. Số đếm: `Badge` (`color="danger"`, `size="sm"`) đặt cuối mục; chấm: `Badge` không children. Giữ `aria-label` "Pages" / "Trang" và tên nút = nhãn trang (badge không lọt vào tên: badge số đặt `aria-hidden`, dùng `aria-label` của nút nếu cần).
- Tab bar: `fixed` đáy, nền `bg-surface` + viền trên, mỗi mục icon trên nhãn dưới, chia đều chiều ngang; badge / chấm góc trên phải icon (`Badge.Anchor`).
- Chuông: `Popover` với trigger là `Button` (`isIconOnly`, `variant="ghost"`, `aria-label` "Notices" / "Thông báo") bọc trong `Badge.Anchor`; số chưa đọc nằm trong phần tử có `data-testid="notice-unread"`. Nội dung: `Popover.Dialog` rộng ~360px, đầu có tiêu đề + nút Mark all read (tắt khi `unread === 0`), danh sách cuộn tối đa ~420px. Dòng chưa đọc có chấm accent; tone `error` chữ đỏ nhạt / `success` xanh như hiện nay. Bấm dòng: đóng popover, `openNoticeTarget`, `read(id)` (y như bây giờ).
- Toast: vùng `fixed bottom-4 right-4` (hẹp: trên tab bar), cột tối đa 3 `Card` rộng ~320px, viền trái màu theo tone (`info` accent, `success` success, `error` danger); chữ bấm được -> `alerts.open`, `CloseButton` (`aria-label` "Dismiss" / "Đóng") -> `alerts.dismiss`; hẹn giờ `TOAST_MS` -> `alerts.expire` như cũ. Vùng giữ `role="status"`.
- Thanh trên: cao ~56px, trong suốt (nền là `bg-background`), chuông bên phải; không có tiêu đề trang ở GĐ này.
- Layout: `Shell` dùng `flex h-dvh`; cột nội dung `flex-1 min-w-0 flex flex-col`; vùng trang `flex-1 overflow-auto`. Workspace cần chiều cao đầy đủ: giữ class nào `WorkspacePage` đang dựa vào (`.shell-content` / `height: 100%`), kiểm trang Workspace sau khi đổi.

**Tests** (giữ toàn bộ test Shell / NoticeBell / useNotices hiện có; react-aria bấm bằng `fireEvent.click` được, nếu không thì thêm `@testing-library/user-event` và ghi impl-notes):
- `the selected sidebar item has aria-current and an accent background` -- `aria-current="page"` trên Timesheet khi đang ở Timesheet.
- `the bell opens a popover listing notices newest first` -- 3 notice, thứ tự trong popover là 3, 2, 1.
- `opening a notice from the bell navigates and marks it read` -- hash đổi theo đích, gọi `/api/notices/<id>/read`.
- `a toast closes itself after TOAST_MS without reading the notice` (fake timers).
- `the toast close button reads the notice`.
