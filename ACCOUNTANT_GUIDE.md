# Hicado E-Learning - Hướng Dẫn Vận Hành Cho Kế Toán

Chào mừng bạn đến với hệ thống quản trị **Hicado Learning Ops**. Tài liệu này giúp bạn nắm vững các thao tác nghiệp vụ tài chính và quản lý học sinh trên nền tảng.

---

## 1. Tổng Quan Tài Chính (Finance)
Trang **Lương thưởng** là trung tâm điều hành của kế toán.

### 📊 Các chỉ số quan trọng:
- **Dự thu:** Tổng số tiền học phí dự kiến dựa trên số buổi học sinh đã điểm danh.
- **Thực thu:** Số tiền thực tế đã được hạch toán qua Webhook hoặc cập nhật thủ công.
- **Công nợ:** Số tiền còn thiếu cần thu hồi.
- **Lương GV:** Chi phí thù lao cho giáo viên (tính theo % doanh thu của lớp).

### 📑 Báo Cáo Chi Tiết:
- Hệ thống tự động phân tách tài chính theo từng lớp học.
- Bạn có thể nhấn **"Xuất Excel"** để lấy dữ liệu báo cáo định kỳ.

---

## 2. Quản Lý Thu Học Phí (Webhook Simulator)
Hicado hỗ trợ gạch nợ tự động thông qua giả lập Webhook ngân hàng.

- **Bước 1:** Lấy Mã học sinh (VD: `S1`, `S2`) hoặc Tên học sinh.
- **Bước 2:** Nhập vào ô "Mã HS hoặc tên" trong phần **Bank Webhook Simulator**.
- **Bước 3:** Nhấn **"BẮN WEBHOOK"**. Hệ thống sẽ tự động chuyển trạng thái học sinh sang **ĐÃ THANH TOÁN** và cập nhật doanh thu thực tế.

---

## 3. Quản Lý Hồ Sơ (Users)
Kế toán có quyền quản lý hồ sơ học sinh và giáo viên.

- **Thêm mới:** Nhấn "Thêm mới" để nhập thông tin cơ bản.
- **Import Sheets:** Nếu có danh sách từ Google Sheets, dán link vào phần Import để đồng bộ nhanh.
- **Xóa hồ sơ:** Sử dụng nút xóa (biểu tượng thùng rác). Hệ thống sẽ yêu cầu xác nhận qua Modal an toàn.

---

## 4. Theo Dõi Điểm Danh (Attendance)
Mặc dù giáo viên là người trực tiếp điểm danh, kế toán cần theo dõi để:
- Kiểm tra tính trung thực của dữ liệu.
- Làm căn cứ tính học phí (vì học phí tính theo số buổi thực tế đi học).

---

## 5. Phím Tắt & Mẹo (Tips)
- **Mobile:** Bạn có thể sử dụng điện thoại để kiểm tra nhanh doanh thu thông qua thanh điều hướng dưới cùng (Bottom Nav).
- **Tìm kiếm:** Sử dụng ô tìm kiếm ở trang Hồ sơ để lọc nhanh theo tên hoặc năm sinh.
- **Trạng thái:** Các màu sắc giúp bạn nhận diện nhanh:
    - 🟢 **Xanh:** Đã thanh toán / Có mặt.
    - 🔴 **Đỏ:** Dư nợ / Vắng mặt.
    - 🟡 **Vàng:** Đang đối soát / Xin nghỉ.

---
*Mọi thắc mắc kỹ thuật vui lòng gửi yêu cầu hỗ trợ tại Banner cuối trang chủ.*
