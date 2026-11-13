# HeroUI foundation -- impl notes

Ghi lại chỗ code lệch plan, quyết định plan không nói, đánh đổi. Mỗi task một mục `## Task N`.

## Task 1: Nền HeroUI + Tailwind, CSS cũ thành `legacy`
- **Lệch:** `.legacy-page` bọc cả đoạn lỗi tải settings trong `AppContent` (cùng loại với `BootError`).
- **Quyết định:** đổi tên class / biến bằng script chạy một lần (đã xóa); peer `react-aria-components` v.v. do npm tự cài.
- **Phát hiện:** server dev đang chạy không nạp lại `vite.config.ts` khi thêm plugin Tailwind, nên CSS dev chưa được biên dịch (body ra Times New Roman). Phải restart `npm run dev`; bản build không bị.
- **Ảnh trước / sau** (bản build trên 4870, 6 trang x 2 theme): phần trang giống trước; khác ở sidebar / thanh trên (Task 2 làm lại) và ô nhập mặc định của trình duyệt ở theme tối giờ nền tối (HeroUI đặt `color-scheme: dark`) -- chấp nhận.
- Build PASS, client 156/156 PASS, typecheck + lint + convention lint sạch.

## Task 2: Khung app bằng HeroUI (sidebar, tab bar, thanh trên, chuông, toast)
- **Quyết định:** icon `ListCheck`, `Terminal`, `Clock`, `ChartColumn`, `Calendar`, `Gear`, `Bell` (`@gravity-ui/icons`). Badge số trong sidebar `aria-hidden` để tên nút vẫn là nhãn trang.
- **Lệch:** test chấm Timesheet / badge số đổi từ class `.nav-dot` / `.nav-badge` sang `data-testid` (`nav-dot`, `nav-badge`). `.nav-dot` / `.nav-badge` vẫn giữ trong CSS vì `WorkspaceTabs` còn dùng. `notices.css` chỉ còn `.visually-hidden`.
- **Lệch (sửa ở main thread):** toast dùng `min-[720px]:bottom-4` thay `md:` để trùng mốc 720px của `useNarrow`; rút comment `useAvailableDot.ts` dưới 25 từ (convention lint).
- **Đánh đổi:** trong giai đoạn chuyển, vùng trang cũ có nền `--window-bg` riêng nên quanh nó lộ nền `bg-background` của HeroUI (dải thanh trên) -- hết khi trang được chuyển sang HeroUI.
- Không cần polyfill; `fireEvent.click` chạy được với react-aria. Convention lint chỉ còn 4 lỗi FE-STYLE / FE-TH trong `docs/ui-mockup/compare.html` (rule Angular, không áp cho mockup tĩnh).
- Build PASS, client 161/161 PASS, typecheck + lint sạch. Ảnh chụp: sidebar, chuông (sáng / tối), Workspace đầy chiều cao, tab bar < 720px đúng.
