# Tạo QR và Form thanh toán

## Hướng dẫn tạo mã QR chuyển khoản ngân hàng và xây dựng form thanh toán tích hợp QR + Webhooks để tự động xác nhận thanh toán.

Bài viết này hướng dẫn bạn kết hợp **QR Code chuyển khoản** với **SePay Webhooks** để xây dựng luồng thanh toán tự động: khách hàng quét mã QR → chuyển khoản → hệ thống tự động xác nhận đơn hàng.

<Callout type="info" title="Trước khi bắt đầu">
Đảm bảo bạn đã:
Liên kết tài khoản ngân hàng trên 
my.sepay.vn
Tạo webhook nhận thông báo giao dịch — xem 
Bắt đầu nhanh
Cấu hình 
mã thanh toán
 tại 
Công ty → Cấu hình chung → Cấu trúc mã thanh toán
</Callout>

---

### Tạo QR Code chuyển khoản

SePay cung cấp API tạo ảnh QR Code tại **[qr.sepay.vn](https://qr.sepay.vn/)**. Khi khách hàng quét mã bằng app ngân hàng, toàn bộ thông tin chuyển khoản (ngân hàng, số tài khoản, số tiền, nội dung) sẽ được tự động điền sẵn.

#### Cấu trúc URL

```
https://qr.sepay.vn/img?acc={SO_TAI_KHOAN}&bank={NGAN_HANG}&amount={SO_TIEN}&des={NOI_DUNG}
```

<ParamsTable
  rows={[
{ "name": "acc", "type": "string", "required": true, "description": "Số tài khoản ngân hàng thụ hưởng" },
{ "name": "bank", "type": "string", "required": true, "description": "Tên ngắn của ngân hàng. Xem danh sách tại `<a href='https://qr.sepay.vn/banks.json' target='_blank'>`qr.sepay.vn/banks.json`</a>`" },
{ "name": "amount", "type": "integer", "required": false, "description": "Số tiền chuyển khoản (VND)" },
{ "name": "des", "type": "string", "required": false, "description": "Nội dung chuyển khoản (URL-encoded)" }
]}
/>

#### Ví dụ

```
https://qr.sepay.vn/img?acc=0010000000355&bank=Vietcombank&amount=100000&des=DH12345
```

<Image src="/images/user-guide/qr-1.png" alt="QR Code thanh toán" caption="QR Code thanh toán mẫu" />

<Callout type="tip" title="QR Code động">
Bạn có thể tạo QR động bằng cách thay đổi 
`amount`
 và 
`des`
 cho từng đơn hàng. Mỗi đơn hàng sẽ có một mã QR riêng với nội dung chuyển khoản chứa 
mã đơn hàng
 để SePay tự nhận diện.
</Callout>

Chi tiết đầy đủ về tạo QR: **[Tạo và nhúng QR Code](/vi/tien-ich-khac/tao-qr-code)**

---

### Xây dựng Form thanh toán với QR

Dưới đây là hướng dẫn tạo form thanh toán đơn giản: hiển thị thông tin đơn hàng, ảnh QR và tự động cập nhật trạng thái khi khách hàng thanh toán.

#### Luồng hoạt động

1. Khách hàng đặt hàng → hệ thống tạo đơn hàng với **mã thanh toán** duy nhất (ví dụ: `DH12345`)
2. Trang thanh toán hiển thị QR Code chứa mã thanh toán trong nội dung chuyển khoản
3. Khách hàng quét QR → chuyển khoản
4. SePay nhận giao dịch → gửi webhook đến server của bạn với `code = "DH12345"`
5. Server cập nhật đơn hàng thành **Đã thanh toán**
6. Trang thanh toán tự động hiển thị **Thanh toán thành công** (polling hoặc WebSocket)

---

#### Frontend: Trang thanh toán

<!-- No code tabs available -->

---

#### Backend: Tạo đơn hàng và nhận Webhook

<!-- No code tabs available -->

---

#### Database schema mẫu

```sql
-- Bảng đơn hàng
CREATE TABLE `orders` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `code` varchar(50) NOT NULL COMMENT 'Mã thanh toán (nội dung CK)',
    `amount` int(11) NOT NULL COMMENT 'Số tiền (VND)',
    `status` enum('pending','paid','expired','cancelled') NOT NULL DEFAULT 'pending',
    `paid_at` datetime DEFAULT NULL,
    `created_at` datetime NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Bảng log webhook (chống trùng lặp)
CREATE TABLE `webhook_logs` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `transaction_id` int(11) NOT NULL COMMENT 'ID giao dịch trên SePay',
    `body` text NOT NULL,
    `created_at` datetime NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_transaction_id` (`transaction_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### Lưu ý quan trọng

<Callout type="warn" title="Bảo mật mã thanh toán">
Mã thanh toán (trường 
`code`
) phải 
duy nhất
 cho mỗi đơn hàng và 
khó đoán
. Tránh dùng số thứ tự tăng dần (
`1, 2, 3...`
). Nên kết hợp prefix + timestamp hoặc random string (ví dụ: 
`DH1709123456`
, 
`ORD-A7X9K2`
).
</Callout>

<Callout type="warn" title="Kiểm tra số tiền">
Luôn so sánh 
`transferAmount`
 từ webhook với số tiền đơn hàng. Chỉ xác nhận thanh toán khi số tiền chuyển khoản 
≥
 số tiền đơn hàng. Điều này tránh trường hợp khách chuyển thiếu.
</Callout>

<Callout type="info" title="Phản hồi nhanh">
Webhook có 
response timeout 8 giây
. Nếu xử lý nghiệp vụ phức tạp (gửi email, gọi API bên thứ ba), hãy phản hồi 
`{"success": true}`
 ngay rồi xử lý bất đồng bộ qua queue.
</Callout>

---

### Bước tiếp theo

1. **[Tạo và nhúng QR Code](/vi/tien-ich-khac/tao-qr-code)** — Chi tiết tham số QR và danh sách ngân hàng
2. **[Tạo Webhooks](/vi/sepay-webhooks/tich-hop-webhook)** — Cấu hình chi tiết webhook (sự kiện, điều kiện, retry, chứng thực)
3. **[Đối soát giao dịch](/vi/sepay-webhooks/doi-soat-giao-dich)** — Bổ sung cơ chế đối soát để không bỏ sót giao dịch
