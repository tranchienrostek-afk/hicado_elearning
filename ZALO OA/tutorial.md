Read URL: https://developers.zalo.me/docs/zalo-notification-service/bat-dau/gioi-thieu-zalo-notification-service-api
Viewed content.md:1-82
Browser task: "Extracting Zalo ZNS API Documentation"
Viewed zns_api_intro_full_1775211890518.png

Chào bạn, tôi đã đọc hiểu kỹ tài liệu API của hệ thống Zalo Notification Service (ZNS). Để hệ thống Elearning của chúng ta có thể tương tác và gửi tin nhắn tự động qua Zalo cho học sinh/phụ huynh, dưới đây là bản tổng hợp và lộ trình tuỳ chỉnh (customise) dành riêng cho dự án của chúng ta:

### 📢 1. Mảnh ghép còn thiếu để dùng Zalo ZNS

ZNS không mở sẵn cho toàn bộ hệ thống ngay lập tức, mà bạn cần chuẩn bị 3 "chìa khóa" sau từ phía Zalo:

1. **Zalo Official Account (OA)**: Tài khoản doanh nghiệp (Trung tâm/Trường học) đã tick vàng hoặc được xác thực trên Zalo.
2. **Zalo App**: Tạo tại Zalo For Developers để lấy ID gọi API. Ở đây bạn sẽ thiết lập quyền `send_oa_msg`.
3. **Zalo Cloud Account (ZCA)**: Ví chứa tiền để trả phí cho tin nhắn ZNS (vì mỗi thông báo sẽ trừ phí theo đơn giá của Zalo).

### 🛠 2. Áp dụng vào hệ thống Elearning (Kịch bản Customize)

Dựa theo kiến trúc Backend (Node.js) và DB Prisma mà chúng ta đã xây dựng, tôi đề xuất 3 luồng chức năng tự động hoá qua ZNS rất hữu ích:

**A. Tin nhắn "Ting ting" - Xác nhận nộp học phí (Kết hợp SePay)**
Thay vì học sinh/phụ huynh nộp học phí qua QR Code xong phải tự lên web kiểm tra, hệ thống sẽ chớp nhoáng gửi ZNS:

> *"Chào anh/chị, quá trình đóng học phí tháng [Tháng] - [Số tiền] VNĐ cho học sinh [Tên Học Sinh] - Lớp [Tên Lớp] đã hoàn tất. Cảm ơn anh/chị!"*

- Lộ trình: Khi Webhook của SePay nổ về `backend/src/routes/webhook.ts` -> Lưu Database thành công -> Ngay lập tức gọi Zalo ZNS API gửi tin nhắn tới Số điện thoại gắn với Profile của học sinh đó.

**B. Tin nhắn Báo lịch học & Điểm danh**

> *"Trung tâm thông báo: Giờ học môn [Môn học] của lớp [Tên Lớp] sẽ diễn ra vào lúc [Giờ]. Rất mong các em tham gia đúng giờ."*

- Lộ trình: Thiết lập một `node-cron` job chạy ẩn ở backend mỗi 8h sáng, dò tìm các lớp có lịch học trong ngày để bắn API ZNS tới toàn bộ danh sách lớp (fetch từ bảng `students` -> mapping với `user.phone`). Khi giáo viên điểm danh Vắng, cũng có thể bắn thông báo real-time tới phụ huynh.

---

### 💻 3. Hướng dẫn Code chức năng Backend để đẩy ZNS đi

Sử dụng tài liệu bạn đưa, chuẩn gọi API gửi ZNS thông thường sẽ quy vào URL `https://business.openapi.zalo.me/message/template`.

Bạn có thể tạo một file là `backend/src/lib/zaloZNS.ts` như sau để làm công cụ chuyên dụng gửi tin nhắn toàn mạng lưới:

```typescript
import axios from 'axios';

// Dùng chung cho toàn hệ thống
export const sendZNSTuitionReceipt = async (phone: string, studentName: string, amount: number) => {
  const url = 'https://business.openapi.zalo.me/message/template';
  
  // Bearer Token này phải lấy từ Zalo App và refresh định kỳ
  const token = process.env.ZALO_ACCESS_TOKEN; 
  
  // Chuẩn hoá SĐT sang dạng 84xxx
  const normalizedPhone = phone.replace(/^0/, '84'); 

  try {
    const response = await axios.post(url, {
      "phone": normalizedPhone,
      "template_id": process.env.ZALO_TEMPLATE_RECEIPT_ID, // Xin duyệt mẫu này trên Zalo ZCA trước
      "template_data": {
        "student_name": studentName,
        "amount": `${amount} VND`,
        "time": new Date().toLocaleDateString('vi-VN')
      },
      "tracking_id": `TUITION_${Date.now()}` // Tracking đối soát
    }, {
      headers: {
        'access_token': token,
        'Content-Type': 'application/json'
      }
    });

    console.log("Gửi ZNS thành công:", response.data);
    return true;
  } catch (error) {
    console.error("Lỗi gửi ZNS:", error.response?.data || error.message);
    return false;
  }
}
```

### 🎯 4. Lời khuyên khi xin duyệt Template

Khi bạn xin Zalo cấp `template_id` (Mẫu tin nhắn), hãy đăng ký vào nhóm **Tin nhắn Giao dịch (Transaction)**. Loại tin này duyệt dễ nhất, chi phí cực kỳ rẻ (khoảng ~200đ/tin) và không bị giới hạn số lượng so với loại tin CSKH hoặc Khuyến mãi.

Nếu bạn muốn tôi trực tiếp tạo route code kết nối cho phần thông báo ZNS này vào kiến trúc Nodejs, hãy báo tin, tôi sẽ triển khai ngay nhé!
