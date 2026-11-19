# Hướng dẫn NOIS Workday

NOIS Workday log giờ làm hằng ngày lên **TSC** (file Excel chung) và **HRM**, đồng thời gom ticket Jira, pull request, các
phiên Claude và thread Teams của bạn vào một cửa sổ.

## Đi lại trong app

- **Thanh bên** trái để chuyển trang: Ticket, Không gian làm việc, Bảng công, Thống kê, và Cài đặt ở dưới cùng. **Không gian làm việc** gom tab ticket vào
  một hàng tab ở trên cùng. Kéo một tab sang ngang (hoặc
  bấm Ctrl+Shift+Trái / Phải trên tab) để đổi chỗ nó trong nhóm của nó; thứ tự được giữ lại. Nút ☰ thu thanh bên chỉ
  còn icon.
- Góc trên bên phải: **chuông** chứa các thông báo, khi app đang chạy việc nền, chuông đổi thành vòng xoay; bấm vào để xem việc đang chạy, liệt kê ở mục **Đang chạy** trên đầu danh sách thông báo.
- Esc xóa nội dung ô đang gõ.

## Ticket: bảng ticket

Trang Ticket là các ticket của bạn. Thanh bên trái ô tìm kiếm chọn danh sách cần xem, kèm số lượng:
**Đang làm** (mặc định: **CẦN LÀM**, rồi **ĐANG LÀM** gồm cả ticket mới), **Có thể nhận**, **Xong** và **Đã ẩn**,
mỗi mục kèm số lượng trong ngoặc ("Đang làm (16)").
CẦN LÀM biến mất khi trống. Mỗi ticket chỉ nằm trên một dòng. Chấm đỏ ở Có thể nhận nghĩa là có ticket gấp để nhận
(High, hoặc hạn trong 2 ngày) mà bạn chưa xem.

- Ô tìm kiếm lọc mọi danh sách, các dòng việc cần làm và các ticket gợi ý (mỗi từ đều phải khớp); số lượng đổi theo, và nếu danh sách đang xem không có kết quả thì bảng tự chuyển sang danh sách đầu tiên có kết quả. Gõ hoặc dán mã ticket hay link Jira chưa có trên bảng thì nút **Thêm** sẽ đưa nó vào. Nhánh con của một ticket mà không có ticket Jira riêng thì gõ đúng tên nhánh (`MDP-9430-phase-2`) và thêm như vậy: dòng của nó lấy tiêu đề của ticket, Start và Open tạo worktree và tab riêng, còn giờ làm được log vào ticket.
- **Kiểm tra** (bên phải thanh tiêu đề, cạnh giờ kiểm tra lần cuối) đọc Jira và PR ngay; nếu không, app tự đọc sau mỗi vài phút
  (Cài đặt > Chung). Bên trái thanh tiêu đề là một câu nói ngắn về lập trình, đổi câu mới mỗi lần mở cửa sổ; bấm vào để xem câu khác.
- Mỗi dòng: mã ticket (mở Jira), tóm tắt, rồi STATUS, DUE, PR và FLOW. Rê chuột lên ô để xem chi tiết. ETA, P và giờ đã log nằm ở phần đầu của ticket trong Không gian làm việc.
  - PR: pull request vào `main` và `development`, mỗi nhánh một dấu: ✓ xanh lá đã merge, nửa vòng tròn là một số repo đã merge,
    ● xám đang chờ, ● xanh dương đã duyệt, ● cam cần sửa, ✕ đỏ bị chặn (build lỗi, conflict, bị từ chối), ✕ xám đã hủy, "–" chưa
    có. Tooltip liệt kê từng PR kèm trạng thái.
  - FLOW: ticket đang ở bước nào trong quy trình Claude (plan, code, review, push, PR, post); tooltip ghi bước tiếp theo.
- Việc đang chờ bạn hiện thành các dòng nhỏ có nút riêng ngay dưới dòng ticket: Claude đang chờ, tin Teams, thay đổi DB đã
  duyệt, trả lời bug QC, cập nhật trên Jira, Chờ test, PR bị chặn, comment PR mới, Xong trên Jira, quá hạn. Ticket có việc gấp
  (Claude đang chờ, bug QC, Teams nhắc tên, PR bị chặn, quá hạn) được đưa lên **CẦN LÀM** cùng các dòng đó; ticket khác giữ
  chúng dưới dòng của mình trong ĐANG LÀM. Việc không thuộc ticket bạn đang làm (Claude ở tab terminal, PR của đồng đội cần
  review, worktree cần dọn) nằm riêng trong CẦN LÀM.
- **Có thể nhận**: các ticket chưa ai nhận trong epic của tháng (epic hiện ở dòng đầu, bấm để mở), tốt nhất xếp trước. **Nhận**
  gán ticket cho bạn (có hỏi trước); **Ẩn** bỏ nó khỏi danh sách, **Hiện lại** đưa các ticket đã ẩn trở lại. Lúc đầu hiện 10 ticket tốt nhất; nút **Xem thêm 10** ở cuối hiện tiếp các ticket sau, còn khi tìm kiếm thì hiện mọi ticket khớp.
- Mỗi dòng có một nút:
  - **Bắt đầu** (MỚI): tạo worktree cho ticket, mở tab Ticket với Claude chạy `ship <KEY>`, và queue ticket cho hôm nay.
    Worktree của một sub-task đi từ nhánh của ticket cha; khi lead chưa push nhánh đó, Bắt đầu sẽ báo và không tạo worktree.
    Ticket mới được assign cho bạn sẽ tự Bắt đầu như vậy ở lần kiểm tra Jira kế tiếp; bug mới của QC cũng tự chạy Fix.
  - **Mở** (ĐANG LÀM): mở tab Ticket.
  - **Chờ test** (màu tím): PR dev đã merge, có thể chuyển ticket sang Ready to Test trên Jira. Có hỏi trước. Hiếm khi
    cần bấm: PR dev merge xong thì app tự chuyển ticket sang Deployed to Dev, và sang Ready to Test khi pipeline dev chạy
    xong (có thông báo; chuyển lỗi thì báo lý do).
  - **Xong** kèm mũi tên: Jira đã xong ticket này; chuyển nó sang XONG ở đây.
- Các thao tác còn lại là nút icon ngay cạnh (rê chuột để xem tên), mỗi nút luôn ở cùng một chỗ: **Mở**, **Xong** (dấu tích)
  hoặc **Mở lại** (mũi tên quay lại), **Đưa vào ô log** (đồng hồ: mở Bảng công với ticket đã điền sẵn; mờ đi khi ticket đã có trong
  ô log) và **Ẩn** (con mắt gạch chéo, có hỏi trước).

## Bảng công

Trang **Bảng công** là một cột: ô nhập ở trên cùng, rồi tới tuần, rồi một thẻ cho mỗi ngày. Số đỏ trên dòng của nó ở thanh bên đếm những ngày còn cần bạn:
ngày trong hàng đợi mà tự log chưa log được, hôm nay sau giờ tự log mà chưa có gì trong hàng đợi, và những ngày tuần này đánh dấu. Rê chuột lên dòng đó để xem từng ngày và lý do.

- Ô nhập: ngày, ô nhập ticket, rồi bấm **+** (hoặc Enter) để đưa vào hàng đợi; Esc xóa ô nhập. Hàng đợi tự log vào giờ
  auto-log (mặc định 6:00 PM, Cài đặt > Log giờ).
- **TUẦN NÀY** hiện khoảng ngày của tuần, hai nút mũi tên để chuyển tuần, nút mũi tên tròn đọc lại tuần, và bên phải là các
  tổng: **HRM 8h / 40h** (số giờ của tuần so với 8h mỗi ngày làm, không tính ngày nghỉ) và **TSC 1 / 1** (số ngày đã qua có trên TSC).
  Thứ Sáu app tự rà lại tuần và báo những ngày có vẻ sai.
- Bên dưới là **một thẻ cho mỗi ngày trong tuần**, Thứ 2 đến Thứ 6 nằm cạnh nhau (cửa sổ hẹp thì ít thẻ hơn mỗi hàng); ngày chưa tới ghi "chưa tới" kèm các ticket đang làm. Ngày đã log có thêm số commit và thời gian làm việc của ngày đó ("4 commit · 3h hoạt động").
- Dưới các thẻ, **Tuần này theo ticket** cộng giờ của từng ticket (đã log hoặc đang chờ log), và **Hôm nay** liệt kê các ticket bạn đã commit hoặc làm với Claude hôm nay, tô cam ticket chưa có trong log hôm nay. Trong lúc đang đọc tuần, một vòng xoay che các thẻ và chúng không bấm được.
  Bấm vào một thẻ để chọn ngày đó cho ô nhập (thẻ có khung xanh). Mỗi thẻ là một trong các loại:
  - **Đã log**: **✓ 8h** (màu cam khi thiếu hoặc bị đánh dấu), thanh 8h chia theo các ticket HRM đã log (mỗi phần ghi mã ticket
    và số giờ), dấu TSC kèm các ticket của nó và số ticket mà lần rà soát tuần đánh dấu. Rê chuột vào để xem cả hai trạng thái
    bằng lời, các ticket của ngày và kết quả rà soát.
  - **Đang chờ log**: trạng thái, số giờ của ngày và **Log ngay**, **thanh** 8h chia theo ticket, rồi các ticket. Kéo vạch giữa
    hai ticket để chuyển giờ qua lại (mỗi bước nửa giờ), kéo vạch cuối để dùng phần giờ còn trống. Mỗi dòng vẫn có ô giờ để gõ
    số chính xác (rê chuột vào ô để xem khung giờ).
  - **Đề xuất**: các ticket đang làm có commit hoặc phiên Claude trong ngày đó, mỗi ticket kèm lý do ("3 commits · Claude") và số
    giờ ước tính. **Đưa vào hàng đợi** thêm chúng vào hàng đợi, **Log ngay** log luôn, **Chỉnh** đưa chúng vào ô nhập với ngày đó.
  - **Nghỉ**, hoặc **Chưa log - gõ ticket ở trên**.
- Ticket đang gõ hiện trước, ngay dưới ô nhập ("chưa thêm"), kèm số giờ của ngày và **Log ngay**. Ngày trong hàng đợi nằm ngoài
  tuần đang xem (tuần khác, cuối tuần) là các thẻ dưới **ĐANG CHỜ LOG**.
- Mỗi ngày trong hàng đợi ghi rõ trạng thái: **Tự log lúc 6:00 PM (còn 2h 15m)**, hoặc màu cam **Đã quá giờ tự log, chưa log
  được** kèm nút **Thử lại**. Ngày đã log xong rời hàng đợi và hiện là Đã log.
- Chấm trước mỗi ticket là kết quả kiểm tra Jira: xanh lá là có, đỏ là không tìm thấy, vàng là không kiểm tra được. Dấu cảnh
  báo nghĩa là ticket không phải của bạn, kèm nút sửa thành mã bạn có thể định gõ. Bấm vào mã ticket để mở ticket trên Jira.
- **Log ngay** log luôn ngày đó (hoặc phần đang gõ) vào TSC + HRM. HRM không nhận giờ của hôm nay trước
  6:00 PM, nên với hôm nay nút bị tắt tới giờ đó ("(sau 6 giờ chiều)"); hãy đưa vào hàng đợi.
- Menu **...**: **Đánh dấu nghỉ (OFF)...** đánh dấu ngày nghỉ (ghi đè ngày đó và bỏ các entry đang queue của ngày đó),
  **Log ngay: chỉ TSC** và **Log ngay: chỉ HRM** cho phần đang gõ, và **Xóa hàng đợi...**. Đăng nhập TSC nằm ở
  **Cài đặt > Log giờ**; khi tự log phải giữ lại entry, bấm vào thông báo sẽ mở chỗ đó.
- Các đề xuất được đọc ngầm từ commit và phiên Claude của bạn trong ngày đó; ngày đã qua đọc một lần mỗi phiên, hôm nay tối đa
  một lần mỗi phút.
- Tới giờ auto-log mà hàng đợi trống vào ngày làm việc, cửa sổ sẽ mở ra nhắc bạn (trừ ngày đã gửi đơn nghỉ cả ngày, dù đã duyệt hay chưa).

## Thống kê

Trang **Thống kê** cho thấy bạn đã làm gì trong một khoảng ngày, theo từng ticket. Chọn khoảng ở trên cùng: **Tuần này**, **Tuần trước**,
**Tháng này**, **Tháng trước** hoặc **Tùy chọn** (hiện hai ô ngày: ngày đầu và ngày cuối). App nhớ khoảng bạn đã chọn.

- Dưới khoảng là một dòng tổng: **TICKET**, **GIỜ** (từ HRM), **TOKENS** (Claude), **COMMITS** và **FILE**.
- Tiếp theo là bốn biểu đồ: **Giờ theo ticket** và **Token theo ticket** (mười ticket đầu, phần còn lại gộp vào **Khác**), rồi **Giờ theo ngày** và
  **Token theo ngày**. Trỏ chuột vào cột để xem giá trị.
- Bảng có một dòng cho mỗi ticket: mã (bấm vào để mở Jira), tóm tắt, trạng thái, PR, FLOW, giờ, số phiên, lượt và thời gian Claude, token, commit,
  file và số dòng. Bấm vào một dòng để mở chi tiết Claude của ticket đó dưới bảng: **Skills**, **Tools**, **Subagents**, **Compacts** và
  **Lỗi API** trong khoảng đã chọn. Ticket không có hoạt động Claude sẽ ghi như vậy.
- **Làm mới** đọc lại; **Sao chép markdown** chép bảng vào clipboard; **Xuất CSV...** lưu bảng thành file CSV mở được bằng Excel.
- Khi không đọc được HRM, cột giờ hiện dấu gạch, hai biểu đồ giờ được ẩn và có một dòng phía trên bảng báo điều đó (lý do nằm trong log).
- Khoảng không có việc nào thì trang ghi "Không có việc trong khoảng này - chọn khoảng khác".
- Trang tự đọc khi bạn mở nếu chưa có báo cáo, đổi khoảng, hoặc báo cáo cũ hơn 5 phút. Thông báo Claude về context hay compact sẽ mở trang này tại dòng của ticket đó.

## Ticket

Tab ticket nằm đầu hàng tab của Không gian làm việc, mỗi ticket bạn mở (Bắt đầu hoặc Mở) là một tab. Đóng tab bằng dấu × hoặc bấm chuột giữa.

- Phần đầu chỉ một dòng: mã ticket (mở Jira), tóm tắt (dài thì cắt bằng "...", rê chuột để đọc đủ), rồi trạng thái, hạn, ETA và giờ
  đã log, mỗi ô có tên ("ETA Nov 13", "Đã log 1h"; ô trống thì ẩn), và các nhãn:
  - Nút PR ("PR 2 ●", chấm màu là trạng thái xấu nhất, sau đó là biểu tượng comment màu cam kèm số comment chưa xử lý nếu có) liệt kê
    từng PR với trạng thái và số comment chưa xử lý; bấm một PR để mở nó trên Azure DevOps. Khi lần kiểm tra thấy comment mới hoặc
    conflict mới, app tự giao việc cho Claude của ticket ngay khi Claude đó rảnh (sửa, push, trả lời trên PR và resolve thread;
    PR của bug QC thì giao cho Claude của ticket cha).
  - "2 bug · 1 ticket con" (chỉ hiện khi có; màu đỏ khi có bug mới) mở danh sách bug QC log cho ticket (**Sửa** để bắt đầu sửa, kèm PR
    của từng bug) và các ticket con (bấm vào để mở trên Jira).
  - **Jira đã cập nhật** hiện khi có người sửa ticket trên Jira (bấm vào để xem thay đổi).
  - Rồi **Ready to Test** (khi ticket chuyển sang đó được) và **VS Code**.
    Bấm ra ngoài popup hoặc nhấn Esc để đóng.
- Tab được chia đôi: Claude của ticket luôn ở bên phải, bên trái là một trong các view sau, lúc đầu là **File** (mở sẵn plan
  hoặc ticket để theo dõi Claude đang làm gì): **Thay đổi** (diff các nhánh của ticket và comment PR: danh sách Comment phía trên các file, comment còn mở lên trước, và dấu 💬 cạnh mỗi dòng có comment, đoạn được comment tô màu; bấm vào một trong hai để mở đúng file và comment đó thành thẻ ngay dưới dòng của nó, nút phóng to trên thẻ mở nó cỡ lớn phủ cả cửa sổ để dễ đọc (bấm ra ngoài, X hoặc Esc để quay lại); bấm lại dấu, X, Esc hoặc bấm ra ngoài thẻ để đóng; lúc đầu mọi thư mục đều mở và thư mục bạn đóng sẽ vẫn đóng ở lần sau; menu cạnh Làm mới cho xem riêng một PR, mỗi PR có dấu đã merge (check xanh lá) hoặc đang mở (chấm xanh dương),
  vd. "BE Backend-DotNet #55762: MDP-9379-dev -> development", chỉ kèm comment của PR đó), **File** (docs và file trong worktree của ticket, markdown được
  render), **Teams** (bài đăng và chat Teams của ticket: đọc, trả lời, và hỏi Claude về một tin nhắn (tin mới được tự phân tích khi Claude của ticket đang rảnh và có hoạt động trong 1 giờ qua); nút kẹp giấy, dán hoặc kéo thả để đính kèm file, tối đa 10 file, mỗi file 100 MB, file vào mục Files của kênh hoặc, trong chat, vào OneDrive của bạn và chia sẻ trong công ty; file trong tin nhắn là một nút bấm để mở). Các nút view và ◂ (ẩn nửa
  này) nằm ở đầu nửa trái, ▸ (ẩn Claude) ở bên trái các tab Claude. Lúc đầu nửa trái đủ rộng để hiện panel Claude suggests của view Teams; kéo đường kẻ giữa hai
  nửa để đổi độ rộng (nhấp đúp: về lại mặc định đó); ◂ / Ctrl+[ và ▸ / Ctrl+] dịch từng bậc (chỉ nửa trái, cả hai, chỉ
  Claude), nên khi một nửa đang ẩn thì nút còn thấy sẽ hiện lại cả hai (khi Claude đang ẩn, nút ◂ có chấm lúc Claude đang chờ). Mỗi tab nhớ riêng độ rộng và nửa bị ẩn.
- Phía trên Claude, nút **+** mở thêm một Claude trong cùng worktree (Claude 2, Claude 3, ...), mỗi cái một cuộc hội thoại riêng;
  bấm vào tab để chuyển, × để đóng (hỏi trước nếu đang chạy). Khi mở lại app, các tab này được mở lại và tiếp tục hội thoại cũ.
  Các bước tự động của board (bước tiếp theo, comment PR, Teams) luôn gửi vào **Claude** đầu tiên. **VS Code** mở thư mục worktree.
- Phần Claude của ticket đã dùng (token, skill, tool, subagent, compact) nằm ở trang Thống kê. Có thông báo khi context vượt 80%,
  sau mỗi lần compact và ở lần compact thứ 3; bấm vào để mở ticket đó trên trang Thống kê.

## Thông báo

- Mọi thông báo của app đều vào **chuông**. Số đỏ là số thông báo chưa đọc; mở chuông để xem tất cả và đánh dấu đã đọc
  tất cả. Thông báo đã đọc tự xóa sau 1 ngày, chưa đọc sau 7 ngày.
- Chuông hiện 10 thông báo mới nhất; nút **Xem thêm** ở cuối hiện thêm 10 cái (kèm số chưa đọc còn ở dưới).
- Một **toast** ngắn hiện dưới chuông khi cửa sổ đang mở. Bấm vào nó (hoặc dòng của nó trong chuông) để tới chỗ nó nói tới.
  Thông báo đi được tới đâu đó có dấu **›** bên phải và con trỏ hình bàn tay; thông báo không có dấu đó (như "Đã lưu cài đặt.")
  bấm vào chỉ đánh dấu đã đọc. Thông báo có "(xem log)" sẽ mở file log của ngày. Thông báo của Claude mở đúng view Claude của tab đó;
  thông báo về một ticket cuộn board tới dòng của nó. Thứ mà thông báo nói tới (dòng, tab, ô nhập hay tiêu đề tuần) sẽ nhấp nháy vài giây để bạn dễ thấy. Nếu chỗ đó không còn (tab đã đóng, ticket không còn
  trên board) thì một hộp thoại nhỏ báo lý do.
- Khi cửa sổ không nằm trên cùng, các chủ đề quan trọng còn hiện thông báo Windows.
- Cài đặt > Thông báo chọn cho từng chủ đề: thông báo Windows (Luôn, Chỉ lỗi, Tắt) và toast.
- Thông báo tự thành đã đọc khi bạn nhìn vào chỗ nó nói tới (trang, tab ticket hoặc cuộc trò chuyện).

## Màu và dấu hiệu

| Dấu hiệu              | Ý nghĩa                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Chữ đỏ                | Hỏng hoặc trễ: quá hạn, build lỗi, conflict, bị từ chối, QC trả về, review fail                                                   |
| Chữ cam               | Cần để ý sớm: sắp tới hạn, chưa log giờ, cần sửa, còn comment mở                                                                  |
| Xanh lá               | Đã xong hoặc đã merge                                                                                                             |
| Tím                   | Đường tới Ready to Test: nút **Chờ test**, chấm trước trạng thái đang chờ bạn, trạng thái đang review hoặc test                   |
| Trạng thái xanh dương | Ticket đang ở chỗ bạn (đang làm)                                                                                                  |
| Xám                   | Tạm dừng, đã xong, chưa rõ hoặc chưa đọc được                                                                                     |
| Số đỏ trên thanh bên  | Việc mới cần xử lý (Ticket), Claude đang chờ (Không gian làm việc), ngày cần log (Bảng công), lần quét knowledge bị lỗi (Cài đặt) |
| Chấm trên tab         | Claude trong tab đó đang chờ bạn                                                                                                  |

Độ ưu tiên (P) và ETA chỉ là thông tin, nên không bao giờ tô màu.

## Cài đặt

Các mục là các nút trên thanh tiêu đề; mục nào cần bạn xử lý có chấm đỏ.

- **Chung**: ngôn ngữ, giao diện sáng/tối, **Chế độ chat cho Claude**, bao lâu kiểm tra
  Jira một lần (PR thì tối đa 5 phút một lần), và thư mục dev repo.
- **Kết nối**: Jira, HRM, Azure DevOps và Teams. **Kiểm tra** thử thông tin đã lưu; **Lưu** kiểm tra trước rồi mới lưu.
  Khi không đọc được Teams (đã đăng xuất, hoặc Teams web kẹt ở một màn hình như đăng nhập tài khoản của trình duyệt), Teams hiện
  **Không đọc được** và **Đăng nhập Teams**: nút này mở Microsoft Edge, bạn đăng nhập hoặc bỏ qua màn hình đó, cửa sổ tự đóng.
  **Skill của Claude** chứa các secret chỉ skill dùng (mật khẩu dev DB, mật khẩu tài khoản test, MDP API token);
  bấm **Thay** để nhập giá trị mới rồi **Lưu**, không kiểm tra.
- **Log giờ**: giờ auto-log, các cột TSC của bạn, và phiên TSC (kiểm tra hoặc đăng nhập lại).
- **Thông báo**: theo từng chủ đề, xem ở trên.
- **Công cụ**: mở thư mục log, dọn worktree của ticket đã ship, các job theo lịch, **Xuất thông tin đăng nhập...** /
  **Nhập thông tin đăng nhập...** (xem bên dưới), và build lại app.
- **Hướng dẫn**: trang này.

## Chuyển sang máy khác

Cài trước: **Microsoft Edge** (TSC và Teams đăng nhập qua nó), **Claude Code** CLI (đã đăng nhập), **Git** và bản clone
dev repo. Rồi copy nguyên thư mục app đã publish; không cần cài .NET.

Lần chạy đầu, app hỏi:

- **Bắt buộc**: Jira URL (`https://newoceaninfosys.atlassian.net`), email Jira, Jira API token
  (id.atlassian.com > Security > API tokens) và HRM API key.
- **Thư mục dev repo**: thông tin đăng nhập được lưu ở `docs\local-config\tokens.env` trong đó.
- **Không bắt buộc**: Azure DevOps personal access token (theo dõi PR) và Teams webhook URL (đăng Teams); cột TSC và giờ
  auto-log giữ mặc định (`M, J`, 6:00 PM).

Các token trong `tokens.env` được mã hóa cho tài khoản Windows của bạn trên máy này, nên copy file sang máy khác sẽ không
mở được. Nhanh hơn gõ lại: ở máy cũ, **Cài đặt > Công cụ > Xuất thông tin đăng nhập...** lưu chúng ra file `.nwcred` khóa
bằng mật khẩu bạn chọn (từ 8 ký tự). Ở máy mới, chọn thư mục dev repo, rồi bấm **Nhập...** ở đầu cửa sổ thiết lập (hoặc
**Cài đặt > Công cụ > Nhập thông tin đăng nhập...**) và gõ mật khẩu đó. Giữ file và mật khẩu ở hai nơi riêng: ai có cả hai
đều đọc được token của bạn. Copy thêm `%AppData%\NoisWorkday\settings.json` để giữ giao diện, và vị trí
cửa sổ.

Phiên đăng nhập không đi theo file. Sau đó dùng **Log giờ > Đăng nhập lại TSC** và **Kết nối > Đăng nhập Teams**.

## Mẹo

- Khi có bản build mới được publish đè lên bản đang chạy, app báo một thông báo; bấm vào để khởi động lại sang bản mới.
- Tab ticket tự tiếp tục cuộc trò chuyện Claude của chúng sau khi khởi động lại.
- Chọn ngày gần nửa đêm khi ở ngoài Việt Nam có thể rơi vào một ngày khác theo giờ HCM: app tính mọi ngày theo giờ Việt Nam.
- **Ctrl+F** tìm chữ trong **Changes**, **Files** và một thread **Teams**: Enter tới kết quả sau, Shift+Enter kết quả trước, Esc
  để đóng. Chữ được chọn có nền xanh, dễ thấy khi copy.
