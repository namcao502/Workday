# Remote full access - implementation notes

## Task 1: Server + core - thiết bị đã ghép đôi qua mọi route
- **Lệch:** viết lại các test "local-only, paired bị 403" (cleanup, insights, schedules, teams, workspace, workspace files, firewall, test-push, local push) thành test được phép. Test đổi quyền ở `remoteRoutes.test.ts` thay bằng test đổi tên + push mà socket vẫn mở.
- **Quyết định:** `devices.json` cũ có `rights` vẫn load được (có test); lần ghi sau sẽ bỏ trường này.

## Task 2: Client - từ xa thấy mọi thứ như local
- **Lệch:** bỏ thêm cổng `mode === 'local'` trong `useWorkspace`, nếu không thì Workspace không bao giờ tải trên điện thoại. `pageVisible`/`visiblePages` bị xóa hẳn, `Shell` dùng `PAGE_IDS`.
- **Lệch:** Settings từ xa giờ là `SettingsPage` đầy đủ. Thẻ thiết bị cũ chuyển thành entry `thisDevice` (`settings/ThisDeviceSection.tsx`), chỉ hiện khi truy cập từ xa; `remote/DevicePage.tsx` bị xóa. TodoView hiện Open/Seen cả khi từ xa; chấm báo của Schedules bật luôn.
- **Quyết định:** NoticeBell/useNotices giữ nhánh remote, vì điện thoại đã nhận push thay cho thông báo desktop.

## Task 3: CLAUDE.md -- không lệch

Kiểm tra: typecheck, lint, convention-lint sạch; core 607, server 837 (1 skip), client 400 test PASS.
