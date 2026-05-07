# Template Zalo OA - Thông báo học phí nhiều lớp (không dùng vòng lặp)

## 1) Cấu hình khi tạo template trên Zalo OA
- Loại: ZBS/ZNS (gửi qua số điện thoại)
- Mục đích: Thông báo học phí
- Tiêu đề: Thông báo học phí

Nội dung:

Trung tâm Hicado xin thông báo học viên <student_name> cần thanh toán học phí các lớp đang theo học như sau:

<class_breakdown_text>

Tổng cần thanh toán: <total_amount>
Hạn thanh toán: <due_date>
Chi tiết và QR thanh toán: <payment_link>

Nút thao tác:
- Nút 1: Hotline hỗ trợ (gọi điện)
- Số điện thoại: <hotline_phone>

## 2) Danh sách biến đề xuất
- student_name
- class_breakdown_text
- total_amount
- due_date
- payment_link
- hotline_phone

## 3) Quy ước build class_breakdown_text từ backend
Mỗi lớp 1 dòng, định dạng:
- [Tên lớp] | GV: [Tên giáo viên] | [Số buổi] buổi x [Học phí/buổi] = [Thành tiền]

Ghép nhiều lớp bằng ký tự xuống dòng (`\n`).

Ví dụ:
Toán 12 NC | GV: Trần Chiến | 8 buổi x 150.000đ = 1.200.000đ
Anh 11 | GV: Lê Thu Hà | 6 buổi x 180.000đ = 1.080.000đ

## 4) Quy tắc cắt ngắn khi quá dài
- Đặt giới hạn độ dài class_breakdown_text theo giới hạn template thực tế.
- Nếu vượt giới hạn: giữ các lớp có thành tiền cao hơn trước, cuối chuỗi thêm:
  - ... và N lớp khác
- total_amount luôn là tổng đầy đủ của tất cả lớp (không bị cắt).

## 5) Payload mẫu gửi ZNS
```json
{
  "phone": "84965389247",
  "template_id": "<TEMPLATE_ID>",
  "template_data": {
    "student_name": "Chiến Test ZNS",
    "class_breakdown_text": "Toán 12 NC | GV: Trần Chiến | 8 buổi x 150.000đ = 1.200.000đ\nAnh 11 | GV: Lê Thu Hà | 6 buổi x 180.000đ = 1.080.000đ",
    "total_amount": "2.280.000đ",
    "due_date": "10/05/2026",
    "payment_link": "https://hicado-elearning.onrender.com/pay/59896cde-3168-4d7d-923a-7c1d61529286",
    "hotline_phone": "0901234567"
  },
  "tracking_id": "CAMP_xxx"
}
```
