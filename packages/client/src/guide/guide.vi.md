# Hướng dẫn NOIS Workday

NOIS Workday log giờ làm hằng ngày lên **TSC** (file Excel chung) và **HRM**, đồng thời gom ticket Jira, pull request, các
phiên Claude và thread Teams của bạn vào một cửa sổ.

## Đi lại trong app

- **Thanh bên** trái để chuyển trang: Ticket, Không gian làm việc, Bảng công, Thống kê, và Cài đặt ở dưới cùng. Nút ☰ ở góc
  trên bên trái thu nó lại chỉ còn icon.
- **Thanh trên cùng** chứa các điều khiển riêng của từng trang (chuyển view, tìm kiếm, nút bấm, trạng thái) cạnh tên trang.
- Góc trên bên phải: **chuông** chứa các thông báo; khi có việc chạy nền, chuông thành vòng xoay, và việc đó được liệt kê
  dưới **Đang chạy** ở đầu danh sách thông báo.
- Esc xóa ô chữ bạn đang gõ.

## Ticket: bảng ticket

Thanh trên cùng của trang Ticket, từ trái sang phải: nút chuyển view, ô tìm kiếm, **Kiểm tra ngay**, rồi lần kiểm tra Jira
gần nhất. Các view, mỗi view kèm số lượng: **Đang làm** (mặc định), **Có thể nhận**, **Xong** và **Đã bỏ qua**. Chấm trên
Có thể nhận nghĩa là có ticket gấp để nhận (High, hoặc hạn trong 2 ngày) mà bạn chưa xem. **Việc cần làm** không phải một
view: nó là một dòng ngay dưới thanh trên cùng ở mọi view, bấm để thu gọn hoặc mở ra, hoặc hiện "Không có việc cần làm" khi trống (không có nút thu gọn); có từ 2 nhóm việc trở lên thì tự mở.

- Ô tìm kiếm lọc mọi view, các nhóm việc cần làm và các ticket có thể nhận (mỗi từ đều phải khớp); số lượng đổi theo, và nếu
  view đang xem không có kết quả thì bảng tự chuyển sang view đầu tiên có kết quả. Gõ hoặc dán mã ticket hay link Jira chưa
  có trên bảng thì nút **Thêm** sẽ đưa nó vào. Nhánh con của một ticket mà không có ticket Jira riêng thì gõ đúng tên nhánh
  (`MDP-9430-phase-2`) và thêm như vậy: dòng của nó lấy tiêu đề của ticket, Bắt đầu và Mở tạo worktree và tab riêng, còn
  giờ làm được log vào ticket.
- **Kiểm tra ngay** đọc Jira và PR ngay lập tức; nếu không thì app tự đọc vài phút một lần (Cài đặt > Công việc > Lịch chạy).
- **Đang làm** liệt kê ticket của bạn, hạn sớm nhất trước; **Xong** và **Đã bỏ qua** thì cập nhật gần nhất trước. Mỗi dòng:
  MÃ (mở Jira), TÓM TẮT, PR, TRẠNG THÁI, HẠN, ETA, ƯU TIÊN (dev priority), rồi menu ⋮. Rê chuột lên ô để xem chi tiết.
  - PR: một nút cho mọi PR của ticket, chấm và chữ là trạng thái tệ nhất: xanh lá đã merge, xanh dương đã approve, xám đang
    chờ, cam cần sửa, đỏ bị chặn (build lỗi, conflict, bị từ chối), xám đã hủy; dấu comment màu cam đếm số comment chưa
    xử lý. Bấm vào để xem từng PR (repo, nhánh, trạng thái) kèm link sang Azure DevOps.
  - Menu ⋮: **Bắt đầu** và **Mở** (Đang làm), **Ready to Test** (khi ticket chuyển được sang đó), **Hoàn thành**, **Mở lại**
    (Xong), **Bỏ qua**, **Khôi phục** (Đã bỏ qua).
- **Bắt đầu** tạo worktree của ticket, mở tab của nó trong Không gian làm việc với Claude chạy câu lệnh bắt đầu, và đưa ticket
  vào hàng đợi hôm nay. Worktree của sub-task đi ra từ nhánh của ticket cha; khi lead chưa push nhánh đó thì Bắt đầu báo vậy
  và không tạo worktree. Ticket mới được giao cho bạn sẽ tự được bắt đầu như vậy ở lần kiểm tra Jira kế tiếp.
- **Ready to Test** có hỏi trước. Hiếm khi cần: khi PR dev đã merge, app tự chuyển ticket theo đường Ready to Test đặt trong
  Cài đặt (có thông báo; chuyển lỗi thì báo lý do).
- **Việc cần làm** gom việc đang chờ bạn theo ticket, mỗi việc có nút riêng: Claude đang chờ, tin nhắn Teams, thay đổi DB
  đã duyệt, bug QC và phản hồi của chúng, cập nhật Jira, Ready to Test, PR bị chặn, comment PR mới, PR của đồng nghiệp cần
  review, ticket đã Done trên Jira, quá hạn.
- **Có thể nhận**: các ticket chưa ai nhận trong epic của tháng (mã epic ở đầu, bấm để mở), tốt nhất trước. **Nhận** gán
  ticket cho bạn (có hỏi trước); **Ẩn** bỏ nó khỏi danh sách. Hiện 10 ticket tốt nhất trước; nút **Xem thêm 10** ở cuối hiện
  tiếp các ticket sau.

## Bảng công

Trang **Bảng công**, từ trên xuống: **ĐÃ LÀM** (các ticket mà commit và phiên Claude cho thấy trong ngày đang chọn), ô nhập,
tuần, mỗi ngày một thẻ, rồi **Tuần này theo ticket**. Số đỏ trên dòng của nó ở thanh bên đếm số ngày cần bạn xử lý: ngày
trong hàng đợi mà auto-log không log được, hôm nay đã qua giờ auto-log mà chưa có gì trong hàng đợi, và những ngày tuần này
bị đánh dấu. Rê chuột lên dòng đó để xem từng ngày và lý do.

- **ĐÃ LÀM**: mỗi ticket kèm lý do ("3 commit - Claude") và phần giờ ước tính trong ngày; bấm một ticket để đưa vào hàng đợi,
  **Thêm tất cả** đưa tất cả vào với các phần giờ đó.
- Ô nhập: ngày, ô ticket, rồi **Thêm vào hàng đợi** (hoặc Enter). Ticket trong hàng đợi được log tự động vào giờ auto-log
  (mặc định 6:00 PM, Cài đặt > Công việc > Chấm công). Gõ một ticket sẽ hiện nó dưới ô nhập ("chưa thêm") kèm số giờ.
- Chấm trước mỗi ticket cho biết kết quả kiểm tra Jira: xanh là có, đỏ là không có, vàng là không kiểm tra được. Dấu cảnh
  báo nghĩa là ticket không phải của bạn, kèm nút sửa lỗi gõ nhầm có khả năng nhất. Bấm mã để mở ticket trên Jira.
- **Log ngay** log ngày đó (hoặc những gì bạn đang gõ) lên TSC + HRM cùng lúc. HRM không nhận giờ của hôm nay trước 6:00 PM,
  nên với hôm nay nút bị tắt tới lúc đó ("(sau 6 PM)"); hãy đưa vào hàng đợi.
- Menu **...**: **Log nghỉ...** đánh dấu ngày nghỉ (ghi đè ngày đó và bỏ các entry đang đợi của nó), **Log ngay: chỉ TSC**,
  **Log ngay: chỉ HRM** và **Xóa hàng đợi...**.
- Tuần: mũi tên để chuyển tuần và **Đọc lại**, rồi **HRM 8h / 40h** (giờ của tuần so với 8h mỗi ngày làm, không tính ngày
  nghỉ), **TSC 1 / 1** (số ngày đã qua mà TSC có) và số ngày làm bị nghỉ. Trong lúc đọc tuần, mỗi phần (Sheet TSC, Giờ HRM,
  Ngày nghỉ, Task HRM, Ticket Jira) có dấu riêng. Thứ Sáu app xem lại cả tuần và báo những ngày có vẻ sai.
- **Mỗi ngày làm một thẻ**, Thứ Hai tới Thứ Sáu (cửa sổ hẹp thì ít thẻ mỗi hàng hơn). Bấm một thẻ để chọn ngày đó cho ô
  nhập. Thẻ là một trong:
  - **Đã log** (✓ và số giờ HRM): các ticket HRM đã log kèm giờ, dòng TSC, và "ticket cần xem" khi lần xem lại tuần đánh dấu
    một số ticket (rê chuột để xem lý do).
  - **Trong hàng đợi**: tình trạng (**Tự log lúc 6:00 PM**, hoặc màu cam khi đã qua giờ auto-log), **Log ngay** hoặc **Thử
    lại**, rồi các ticket, mỗi ticket có ô giờ và nút xóa.
  - **Nghỉ phép** hoặc **Nghỉ lễ** (sọc tím, kèm tên ngày lễ, hoặc đơn nghỉ phép: "Đã được duyệt trên HRM" khi đã duyệt,
    còn lại là "Ngày nghỉ phép").
  - **chưa tới** cho ngày chưa đến, hoặc **Chưa log gì - hãy gõ ticket ở trên**.
- Các ngày trong hàng đợi nằm ngoài tuần đang xem (tuần khác, cuối tuần) là các thẻ dưới **HÀNG ĐỢI**.
- Tới giờ auto-log mà ngày làm việc chưa có gì trong hàng đợi, cửa sổ sẽ mở lên nhắc bạn (trừ ngày lễ và ngày bạn đã gửi
  đơn nghỉ cả ngày, đã duyệt hay chưa).

## Thống kê

Trang **Thống kê** cho thấy bạn đã làm gì trong một khoảng ngày, theo từng ticket. Thanh trên cùng của nó: khoảng ngày
(**Tuần này**, **Tuần trước**, **Tháng này**, **Tháng trước** hoặc **Tùy chọn**, thêm ô ngày đầu và ngày cuối), **Làm mới**,
**Sao chép markdown**, **Xuất CSV...**, rồi lúc báo cáo được đọc. Khoảng bạn chọn được nhớ lại.

- Bên dưới là một dòng tổng: **TICKET**, **GIỜ** (từ HRM), **TOKENS** (Claude), **COMMITS** và **FILE**.
- Tiếp theo là bốn biểu đồ: **Giờ theo ticket** và **Token theo ticket** (mười ticket đầu, phần còn lại gộp vào **Khác**),
  rồi **Giờ theo ngày** và **Token theo ngày**. Trỏ vào một cột để xem giá trị.
- Bảng có một dòng mỗi ticket: mã (bấm để mở Jira), tóm tắt, trạng thái, giờ, số phiên Claude, lượt và thời gian, token,
  commit, file và số dòng. Bấm một dòng để mở chi tiết Claude của ticket đó dưới bảng: **Skills**, **Tools**, **Subagents**,
  **Compacts** và **API errors** trong khoảng ngày. Ticket không có hoạt động Claude thì báo vậy.
- Khi không đọc được HRM, cột giờ hiện gạch ngang, biểu đồ giờ bị ẩn và một dòng trên bảng báo vậy (lý do có trong log).
- Không có việc nào trong khoảng thì trang báo "Không có việc trong khoảng này - chọn khoảng khác".
- Trang đọc lại khi bạn mở nếu chưa có báo cáo, khoảng ngày đã đổi hoặc báo cáo cũ hơn 5 phút. Thông báo Claude về context
  hoặc compact mở trang này ở đúng dòng của ticket đó.

## Ticket

Tab ticket nằm đầu hàng tab của Không gian làm việc, mỗi ticket bạn mở (Bắt đầu hoặc Mở) là một tab. Đóng tab bằng dấu × hoặc bấm chuột giữa.

- Dưới hàng tab là một dòng cho ticket: mã ticket (mở Jira), tóm tắt (rê chuột để đọc đủ), rồi trạng thái, hạn, ETA và giờ
  đã log, mỗi ô có tên ("ETA Nov 13", "Đã log 1h"; ô trống thì ẩn), rồi:
  - Nút PR ("PR 2 ●", chấm màu là trạng thái xấu nhất, sau đó là biểu tượng comment màu cam kèm số comment chưa xử lý nếu có)
    liệt kê từng PR với trạng thái; bấm một PR để mở nó trên Azure DevOps. Khi lần kiểm tra thấy comment mới hoặc conflict
    mới, app tự giao việc cho Claude của ticket ngay khi Claude đó rảnh (sửa, push, trả lời trên PR và resolve thread; PR
    của bug QC thì giao cho Claude của ticket cha).
  - Bên phải là **Ready to Test** (khi ticket chuyển sang đó được) và **VS Code**.
- Tab được chia đôi: Claude của ticket luôn ở bên phải, bên trái là một trong các view sau, lúc đầu là **File** (mở sẵn plan
  hoặc ticket để theo dõi Claude đang làm gì): **Thay đổi** (diff các nhánh của ticket và comment PR: danh sách Comment phía trên các file, comment còn mở lên trước, và dấu 💬 cạnh mỗi dòng có comment, đoạn được comment tô màu; bấm vào một trong hai để mở đúng file và comment đó thành thẻ ngay dưới dòng của nó, nút phóng to trên thẻ mở nó cỡ lớn phủ cả cửa sổ để dễ đọc (bấm ra ngoài, X hoặc Esc để quay lại); bấm lại dấu, X, Esc hoặc bấm ra ngoài thẻ để đóng; lúc đầu mọi thư mục đều mở và thư mục bạn đóng sẽ vẫn đóng ở lần sau; menu cạnh Làm mới cho xem riêng một PR, mỗi PR có dấu đã merge (check xanh lá) hoặc đang mở (chấm xanh dương),
  vd. "BE Backend-DotNet #55762: MDP-9379-dev -> development", chỉ kèm comment của PR đó), **File** (docs và file trong worktree của ticket, markdown được
  render), **Teams** (bài đăng và chat Teams của ticket: đọc, trả lời, và hỏi Claude về một tin nhắn (có tin mới của người khác thì Claude tự đề xuất câu trả lời khi Claude của ticket rảnh và có hoạt động trong 1 giờ qua); nút kẹp giấy, dán hoặc kéo thả để đính kèm file, tối đa 10 file, mỗi file 100 MB, file vào mục Files của kênh hoặc, trong chat, vào OneDrive của bạn và chia sẻ trong công ty; file trong tin nhắn là một nút bấm để mở). Các nút view và ◂ (ẩn nửa
  này) nằm ở đầu nửa trái, ▸ (ẩn Claude) ở bên trái các tab Claude. Lúc đầu nửa trái đủ rộng để hiện panel Claude suggests của view Teams; kéo đường kẻ giữa hai
  nửa để đổi độ rộng (nhấp đúp: về lại mặc định đó); khi một nửa đang ẩn thì nút còn thấy sẽ hiện lại cả hai (khi Claude đang ẩn, nút ◂ có chấm lúc Claude đang chờ). Mỗi tab nhớ riêng độ rộng và nửa bị ẩn.
- Phía trên Claude, nút **+** mở thêm một Claude trong cùng worktree (Claude 2, Claude 3, ...), mỗi cái một cuộc hội thoại riêng;
  bấm vào tab để chuyển, × để đóng (hỏi trước nếu đang chạy). Khi mở lại app, các tab này được mở lại và tiếp tục hội thoại cũ.
  Các bước tự động của board (bước tiếp theo, comment PR, Teams) luôn gửi vào **Claude** đầu tiên. **VS Code** mở thư mục worktree.
- Gõ `/` để chọn lệnh và skill của Claude, `@` để chọn file. `/resume` liệt kê các cuộc trò chuyện trước đó của thư mục, mới
  nhất trước (gõ thêm chữ phía sau để lọc); chọn một cái thì lịch sử hiện ra và tin nhắn kế tiếp sẽ tiếp tục nó. Tab thư mục
  đã đóng mà mở lại đúng thư mục đó thì tự lấy lại cuộc trò chuyện cũ.
- Phần Claude của ticket đã dùng (token, skill, tool, subagent, compact) nằm ở trang Thống kê. Có thông báo khi context vượt 80%,
  sau mỗi lần compact và ở lần compact thứ 3; bấm vào để mở ticket đó trên trang Thống kê.

## Thông báo

- Mọi thông báo của app đều vào **chuông**. Số đỏ là số thông báo chưa đọc; mở chuông để xem tất cả và đánh dấu đã đọc
  tất cả. Thông báo đã đọc tự xóa sau 1 ngày, chưa đọc sau 7 ngày.
- Một **toast** ngắn hiện dưới chuông khi cửa sổ đang mở. Bấm vào nó (hoặc dòng của nó trong chuông) để tới chỗ nó nói tới.
  Thông báo đi được tới đâu đó có dấu **›** bên phải và con trỏ hình bàn tay; thông báo không có dấu đó (như "Đã lưu cài đặt.")
  bấm vào chỉ đánh dấu đã đọc. Thông báo có "(xem log)" sẽ mở file log của ngày. Thông báo của Claude mở đúng view Claude của tab đó;
  thông báo về một ticket cuộn board tới dòng của nó. Thứ mà thông báo nói tới (dòng, tab, ô nhập hay tiêu đề tuần) sẽ nhấp nháy vài giây để bạn dễ thấy. Nếu chỗ đó không còn (tab đã đóng, ticket không còn
  trên board) thì một hộp thoại nhỏ báo lý do.
- Khi cửa sổ không nằm trên cùng, các chủ đề quan trọng còn hiện thông báo desktop, và điện thoại đã ghép nối cũng nhận được.
- **Cài đặt > Chung > Thông báo** chọn cho từng chủ đề: toast, thông báo desktop và điện thoại; **Điện thoại và PC** giữ
  thông báo gửi sang điện thoại lại trong lúc bạn đang ở PC.
- Thông báo tự thành đã đọc khi bạn nhìn vào chỗ nó nói tới (trang, tab ticket hoặc cuộc trò chuyện).

## Màu và dấu hiệu

| Dấu hiệu              | Ý nghĩa                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Chữ đỏ                | Hỏng hoặc trễ: quá hạn, build lỗi, conflict, bị từ chối, QC trả về, review fail                                                   |
| Chữ cam               | Cần để ý sớm: sắp tới hạn, chưa log giờ, cần sửa, còn comment mở                                                                  |
| Xanh lá               | Đã xong hoặc đã merge                                                                                                             |
| Tím                   | Đường tới Ready to Test: chấm trước trạng thái đang chờ bạn, trạng thái đang review hoặc test                                     |
| Trạng thái xanh dương | Ticket đang ở chỗ bạn (đang làm)                                                                                                  |
| Xám                   | Tạm dừng, đã xong, chưa rõ hoặc chưa đọc được                                                                                     |
| Số đỏ trên thanh bên  | Việc mới cần xử lý (Ticket), Claude đang chờ (Không gian làm việc), ngày cần log (Bảng công), lần quét knowledge bị lỗi (Cài đặt) |
| Chấm trên tab         | Claude trong tab đó đang chờ bạn                                                                                                  |

Độ ưu tiên (P) và ETA chỉ là thông tin, nên không bao giờ tô màu.

## Cài đặt

Các nhóm nằm bên trái trang Cài đặt:

- **Chung**: giao diện, mùa (hiệu ứng và con trỏ chuột theo mùa), ngôn ngữ; **Thông báo** theo từng chủ đề (xem ở trên); **Điện thoại và PC** (khi nào thông báo
  gửi sang điện thoại); **Sao lưu & chuyển máy** (xem bên dưới).
- **Tích hợp**: **Kết nối** (Jira; **Nâng cao** chứa các câu query của bảng, luồng trạng thái và các query của Có thể nhận),
  **Azure DevOps** (theo dõi PR) và **Teams** (kênh theo dõi, bài đăng, Database Review). **Kiểm tra** thử thông tin đã lưu;
  **Lưu** kiểm tra trước rồi mới lưu. Khi không đọc được Teams (đã đăng xuất, hoặc Teams web kẹt ở một màn hình như đăng
  nhập tài khoản của trình duyệt), Teams hiện **Đăng nhập Teams**: nút này mở Microsoft Edge, bạn đăng nhập hoặc bỏ qua
  màn hình đó, cửa sổ tự đóng.
- **Công việc**: **Chấm công** (giờ log, HRM, TSC và phiên TSC), **Ngày lễ**, **Không gian làm việc** (dev repo, các repo
  anh em, câu lệnh bắt đầu, dọn worktree) và **Lịch chạy** (bao lâu kiểm tra Jira và PR một lần, các job theo lịch).
- **Truy cập từ xa**: thiết bị này, truy cập qua VPN, Cloudflare và các thiết bị đã ghép nối.
- **Hướng dẫn**: trang này.

## Chuyển sang máy khác

Cài trước: **Microsoft Edge** (TSC và Teams đăng nhập qua nó), **Claude Code** CLI (đã đăng nhập), **Git**, **Node 22** và
bản clone dev repo.

Ở máy cũ, **Cài đặt > Chung > Sao lưu & chuyển máy > Xuất file** lưu mọi thứ (cài đặt, các secret đã mã hóa cùng khóa để mở
chúng, bảng ticket và lịch sử) vào một file `.wdbackup` khóa bằng mật khẩu bạn chọn (từ 8 ký tự). Ở máy mới, chọn file đó ở
cùng chỗ, gõ mật khẩu, bấm **Nhập file**, rồi **Khởi động lại ngay**. Các file bị thay được giữ lại trong thư mục
`before-import-<ngày>` trong `%AppData%\Workday`. Giữ file và mật khẩu ở hai nơi riêng: ai có cả hai đều đọc được token của bạn.

Nếu không có bản sao lưu, điền **Tích hợp > Kết nối** (Jira URL, email và API token lấy ở id.atlassian.com > Security >
API tokens) và **Công việc > Chấm công** (HRM key, TSC); phần còn lại giữ mặc định.

Phiên đăng nhập không đi theo file. Sau đó dùng **Công việc > Chấm công > Đăng nhập TSC** và **Tích hợp > Teams >
Đăng nhập Teams**.

## Dùng cho dự án hoặc công ty khác

Mọi thứ riêng của NOIS và MDP đều là cài đặt, nên hãy bắt đầu với `%AppData%\Workday` trống (đừng copy của người khác: app
sẽ tiếp tục đăng nhập vào hệ thống của họ) rồi điền:

- **Kết nối**: site Jira, email và token của bạn, tiền tố mã ticket; trong **Nâng cao**, tên các trạng thái theo workflow
  Jira đó. Để trống các query của Có thể nhận nếu không cần mục này.
- **Azure DevOps**: organization và project, hoặc để trống nếu không theo dõi PR.
- **Teams**: các kênh cần theo dõi, hoặc không kênh nào để tắt Teams.
- **Chấm công**: HRM và TSC là hệ thống của NOIS; ở nơi khác thì để trống.
- **Ngày lễ** của nước đó, và dev repo trong **Không gian làm việc**.

Múi giờ (mặc định giờ Việt Nam) chỉ có trong `config.json` (`"timeZone"`). Vài thứ vẫn cố định trong app: chỉ Jira và Azure
DevOps, hai PR cho mỗi ticket (`<KEY>` vào `main`, `<KEY>-dev` vào `development`), ghi chú ticket ở `<dev repo>/docs/<KEY>/`.
Dự án làm việc theo cách khác thì cần sửa app; README liệt kê các chỗ cần sửa.

## Mẹo

- Khi có bản build mới được publish đè lên bản đang chạy, app báo một thông báo; bấm vào để khởi động lại sang bản mới.
- Tab ticket tự tiếp tục cuộc trò chuyện Claude của chúng sau khi khởi động lại.
- App tính ngày theo múi giờ đã cấu hình (mặc định giờ Việt Nam), nên chọn ngày gần nửa đêm ở nơi khác có thể rơi vào ngày khác.
- **Ctrl+F** tìm chữ trong **Changes**, **Files** và một thread **Teams**: Enter tới kết quả sau, Shift+Enter kết quả trước, Esc
  để đóng. Chữ được chọn có nền xanh, dễ thấy khi copy.
