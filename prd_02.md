**TÀI LIỆU YÊU CẦU SẢN PHẨM (PRD)**

**Tên sản phẩm:** Hệ thống Quản lý Trung tâm Bồi dưỡng

### I. TỔNG QUAN SẢN PHẨM

Mục tiêu của dự án là xây dựng một hệ thống phần mềm quản lý toàn diện cho các trung tâm bồi dưỡng giáo dục (bao gồm TT Giáo dục Quốc tế Hicado, TT Giáo dục Vạn Xuân). Phần mềm tập trung giải quyết và số hóa các nghiệp vụ cốt lõi: Quản lý thông tin (Giáo viên, Học sinh, Thời khóa biểu), Điểm danh, Quản lý tài chính (Thu học phí tự động, Tính lương giáo viên) và Báo cáo lợi nhuận.

### II. CHI TIẾT YÊU CẦU CHỨC NĂNG (Functional Requirements)

**1. Module Phân quyền và Bảo mật (Role-Based Access Control)**

- **Quản trị viên (Admin/Quản lý Trung tâm):** Có toàn quyền xem và thao tác trên dữ liệu của trung tâm mình quản lý (Hicado hoặc Vạn Xuân).
- **Giáo viên:** Chỉ được phép xem thông tin liên quan trực tiếp đến mình, bao gồm: Lớp đang giảng dạy, Sĩ số, Thời khóa biểu và Danh sách học sinh của lớp đó. Không được phép xem dữ liệu của giáo viên/lớp học khác.

**2. Module Quản lý Thời khóa biểu và Lớp học**

- **Tạo và quản lý lịch học:** Cho phép xếp lịch học, gán giáo viên vào lớp (có thể import/đính kèm link Google Sheets hiện tại).
- **Cập nhật sĩ số tự động:** Sĩ số của từng lớp phải được hệ thống tự động tính toán và cập nhật theo thời gian thực (Real-time) mỗi khi có biến động trong danh sách học sinh (thêm mới, nghỉ học, chuyển lớp).

**3. Module Quản lý Dữ liệu Nội bộ**

- **Quản lý Hồ sơ Giáo viên:** Hệ thống cần lưu trữ các trường dữ liệu sau: Mã GV, Họ và tên, Trình độ chuyên môn & Chuyên ngành đào tạo, Chứng chỉ/Bằng cấp liên quan, Đơn vị công tác, Ngày sinh, Giới tính, Số CCCD (kèm ngày cấp, nơi cấp), Số điện thoại, Địa chỉ (Thường trú & Liên hệ), File hồ sơ đính kèm, Số tài khoản ngân hàng và Ghi chú.
- **Quản lý Hồ sơ Học sinh:** Lưu trữ các trường dữ liệu: Mã HS, Họ & Tên, Ngày sinh (Hỗ trợ bộ lọc tìm kiếm theo năm sinh), Địa chỉ, CCCD/Mã định danh.

**4. Module Điểm danh và Quản lý Thu học phí (Core Module)**

- **Điểm danh:** Tính năng ghi nhận học sinh có mặt/vắng mặt theo từng ca học để làm cơ sở đối soát học phí.
- **Thanh toán học phí tự động:** Tích hợp API ngân hàng (Open Banking) hoặc cổng thanh toán. Khi Phụ huynh chuyển khoản/nộp tiền với đúng cú pháp, hệ thống tự động gạch nợ và cập nhật trạng thái "Đã nộp" trên phần mềm mà không cần nhân sự đối soát thủ công.
- **Quản lý công nợ:** Ghi nhận và theo dõi các khoản "Học phí thu sau của tháng trước" (nếu có).

**5. Module Tính lương Giáo viên**

Hệ thống tự động hóa quá trình tính thù lao cho giáo viên dựa trên số ca dạy và chính sách phân chia doanh thu theo từng lớp.

- **Công thức chung:** `Thành tiền (Lương GV) = (Học phí 1 lớp / Số buổi học trong tháng) x Tỷ lệ % chiết khấu của lớp đó`.
- **Ví dụ tham chiếu:** Giáo viên A dạy 3 lớp (H1, H2, H3).
  - Lớp H1: GV nhận 80%, Trung tâm nhận 20%.
  - Lớp H2: GV nhận 75%, Trung tâm nhận 25%.
  - Lớp H3: GV nhận 30%, Trung tâm nhận 70%.
- **Tổng hợp:** Phiếu lương cuối tháng của giáo viên sẽ hiển thị tổng "Học phí gửi thầy" cộng với các khoản "Học phí thu sau" (nếu có) từ tháng trước.

**6. Module Báo cáo Doanh thu & Lợi nhuận**

Cung cấp báo cáo tài chính tổng quan cho Ban quản lý trung tâm.

- **Báo cáo THU:** Thống kê chi tiết dưới dạng bảng với các thông số:
  - Mã lớp / Họ tên GV.
  - Tổng học phí CẦN thu / Tổng học phí ĐÃ nộp.
  - Tỷ lệ % phân chia.
  - Số tiền chi trả Lương GV.
  - Số tiền giữ lại cho Trung tâm (Lợi nhuận).
  - Học phí trung bình / Ca học.
  - Ghi chú.

### III. YÊU CẦU PHI CHỨC NĂNG (Non-Functional Requirements)

1. **Tính tích hợp:** Phải liên kết được với hệ thống báo có (Webhook) của Ngân hàng để giải quyết bài toán tự động hóa thanh toán (Mục 4).
2. **Khả năng mở rộng:** Kiến trúc phần mềm cần cho phép bổ sung không giới hạn số lượng cơ sở (như Hicado, Vạn Xuân,...) với data riêng biệt.
3. **Giao diện & Trải nghiệm (UI/UX):** Bố cục hiển thị màn hình Điểm danh và Thu học phí phải được thiết kế tối giản, dễ thao tác nhất để tiết kiệm thời gian cho nhân viên giáo vụ. Màn hình quản lý danh sách (GV, HS) cần có tính năng Lọc (Filter) và Xuất/Nhập (Export/Import) dữ liệu Excel.
