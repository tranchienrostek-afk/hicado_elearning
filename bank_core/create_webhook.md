# Tạo Webhooks

## Hướng dẫn tạo và giải thích cách hoạt động của Webhooks. Mỗi khi phát sinh giao dịch, SePay sẽ bắn WebHooks, ứng dụng bán hàng của bạn sẽ biết khách hàng đã thanh toán và chuyển trạng thái đơn hàng.

<Callout type="info" title="Môi trường Sandbox">
Nếu bạn cần 
môi trường thử nghiệm
, hãy đăng ký tài khoản tại 
my.dev.sepay.vn
. Tại đây bạn có thể tạo giao dịch giả lập, webhook để phục vụ mục đích phát triển phần mềm. Sau khi đăng ký, hãy 
liên hệ
 với SePay để được kích hoạt tài khoản.
</Callout>

---

#### Các bước tích hợp WebHooks

<Steps>
  <Step title="Truy cập WebHooks">
    Truy cập vào menu **[WebHooks](https://my.sepay.vn/webhooks)** trên dashboard SePay.
  </Step>

  `<Step title="Thêm WebHooks mới">`
    Chọn vào button `+ Thêm webhooks` ở phía trên, bên phải.

    `<Image src="/images/user-guide/webhook-add.png" alt="Thêm webhooks" caption="Thêm webhooks" />`
  `</Step>`

  `<Step title="Điền thông tin cấu hình">`
    Điền đầy đủ các thông tin sau:

    **1. Đặt tên:** Tên bất kỳ để nhận biết webhook.

    **2. Chọn sự kiện:** Chọn sự kiện kích hoạt webhook khi *có tiền vào*, *có tiền ra* hoặc *cả hai*.

    **3. Chọn điều kiện:**

    ***Khi tài khoản ngân hàng là:** Chọn tài khoản mà khi có giao dịch, webhook sẽ được gọi. Nếu bạn muốn chỉ định các tài khoản ảo (VA) cụ thể, tích vào **Lọc theo tài khoản ảo** và chọn các VA cần theo dõi.
    * **Bỏ qua nếu không có Code thanh toán:** Nếu chọn Có, SePay sẽ **KHÔNG** gọi webhook khi không nhận diện được code thanh toán trong nội dung chuyển khoản.

    `<Callout type="tip" title="Mẹo">`
    Cấu hình nhận diện code thanh toán tại
    Công ty → Cấu hình chung → Cấu trúc mã thanh toán
    .
    `</Callout>`

    **4. Thuộc tính WebHooks:**

    ***Gọi đến URL:** Đường dẫn nhận webhook. Nếu muốn lập trình website nhận webhook, xem **[hướng dẫn tại đây](/vi/sepay-webhooks/lap-trinh-webhooks/lap-trinh-webhook)**.
    * **Là WebHooks xác thực thanh toán?:** Chọn *Đúng* nếu webhook này dùng để xác thực thanh toán cho website/ứng dụng bán hàng.
    * **Gọi lại WebHooks khi:** SePay sẽ tự động gọi lại webhook nếu HTTP Status Code không nằm trong phạm vi `200` – `299`.

    **5. Cấu hình chứng thực:**

    ***OAuth 2.0:** Cần điền Access Token URL, Client ID, Client Secret. **[Xem hướng dẫn cấu hình](/vi/sepay-webhooks/oauth2-webhooks)**.
    * **API Key:** SePay gửi header `Authorization: Apikey API_KEY_CUA_BAN`. Cần chọn Request Content Type phù hợp.
    * **Không chứng thực:** SePay không gửi kèm header chứng thực. Cần chọn Request Content Type phù hợp.

    `<Callout type="info" title="Request Content Type hỗ trợ">`
    `application/json`
    ,
    `multipart/form-data`
    ,
    `application/x-www-form-urlencoded`
    `</Callout>`
  `</Step>`

  `<Step title="Hoàn tất">`
    Chọn **Thêm** để hoàn tất tích hợp.
  `</Step>`
`</Steps>`

---

#### Dữ liệu gửi qua WebHooks

SePay gửi một **POST request** với nội dung JSON như sau:

<Response title="JSON">
```json
{
  "id": 92704,
  "gateway": "Vietcombank",
  "transactionDate": "2023-03-25 14:02:37",
  "accountNumber": "0123499999",
  "code": null,
  "content": "chuyen tien mua iphone",
  "transferType": "in",
  "transferAmount": 2277000,
  "accumulated": 19077000,
  "subAccount": null,
  "referenceCode": "MBVCB.3278907687",
  "description": ""
}
```
</Response>

<ParamsTable
  rows={[
{ "name": "id", "type": "integer", "description": "ID giao dịch trên SePay" },
{ "name": "gateway", "type": "string", "description": "Brand name của ngân hàng" },
{ "name": "transactionDate", "type": "string", "description": "Thời gian xảy ra giao dịch phía ngân hàng" },
{ "name": "accountNumber", "type": "string", "description": "Số tài khoản ngân hàng" },
{ "name": "code", "type": "string", "description": "Mã code thanh toán. SePay tự nhận diện dựa vào cấu hình tại `<strong>`Công ty → Cấu hình chung`</strong>`. Có thể `<code>`null`</code>` nếu không nhận diện được." },
{ "name": "content", "type": "string", "description": "Nội dung chuyển khoản" },
{ "name": "transferType", "type": "string", "description": "Loại giao dịch: `<code>`in`</code>` = tiền vào, `<code>`out`</code>` = tiền ra" },
{ "name": "transferAmount", "type": "integer", "description": "Số tiền giao dịch (VND)" },
{ "name": "accumulated", "type": "integer", "description": "Số dư tài khoản (lũy kế)" },
{ "name": "subAccount", "type": "string", "description": "Tài khoản ngân hàng phụ (tài khoản định danh / VA). Có thể `<code>`null`</code>`." },
{ "name": "referenceCode", "type": "string", "description": "Mã tham chiếu của tin nhắn SMS" },
{ "name": "description", "type": "string", "description": "Toàn bộ nội dung tin nhắn SMS" }
]}
/>

---

#### Nhận diện WebHooks thành công

Khi nhận webhook từ SePay, website của bạn cần phản hồi đúng quy ước để SePay nhận diện kết quả thành công:

<EventList
  events={[
{ "name": "OAuth 2.0", "description": "Response body: `<code>`{\"success\": true}`</code>` — HTTP Status Code: `<code>`201`</code>`", "type": "success" },
{ "name": "API Key", "description": "Response body: `<code>`{\"success\": true}`</code>` — HTTP Status Code: `<code>`200`</code>` hoặc `<code>`201`</code>`", "type": "success" },
{ "name": "Không chứng thực", "description": "Response body: `<code>`{\"success\": true}`</code>` — HTTP Status Code: `<code>`200`</code>` hoặc `<code>`201`</code>`", "type": "success" }
]}
/>

<Callout type="warn" title="Lưu ý">
Nếu response không thỏa mãn các điều kiện trên, SePay sẽ xem webhook là 
thất bại
.
</Callout>

---

#### Kiểm tra hoạt động

1. **Tài khoản Demo:** Vào menu **[Giao dịch](https://my.sepay.vn/transactions)** → **Giả lập giao dịch** để tạo giao dịch thử. Xem hướng dẫn **[Giả lập giao dịch](/vi/tien-ich-khac/gia-lap-giao-dich)**.
2. **Tài khoản thật:** Chuyển một khoản tiền nhỏ vào tài khoản để tạo giao dịch thử nghiệm.
3. **Xem nhật ký:** Vào menu **Nhật ký → [Nhật ký webhooks](https://my.sepay.vn/webhookslog)** để xem danh sách webhook đã gọi.
4. **Xem theo giao dịch:** Vào **[Giao dịch](https://my.sepay.vn/transactions) → cột Tự động → chọn Pay** để xem webhook của từng giao dịch.

---

#### Retry WebHooks tự động

SePay tự động gọi lại webhook nếu kết nối mạng thất bại, hoặc khi thỏa mãn điều kiện retry mà bạn đã thiết lập. Thời gian giữa các lần gọi lại tăng dần theo dãy số **[Fibonacci](https://en.wikipedia.org/wiki/Fibonacci_sequence)**.
Thông số Retry:

<ParamsTable
  rows={[
{ "name": "Số lần gọi lại tối đa", "description": "7 lần" },
{ "name": "Thời gian retry tối đa", "description": "5 giờ — Kể từ lần gọi đầu thất bại" },
{ "name": "Connection timeout", "description": "5 giây" },
{ "name": "Response timeout", "description": "8 giây — Thời gian chờ phản hồi tối đa" }
]}
/>

<Callout type="info" title="Lưu ý">
SePay sẽ 
KHÔNG
 gọi lại webhook nếu kết nối mạng thành công nhưng trạng thái webhook là thất bại, trừ khi webhook đó được thiết lập điều kiện gọi lại.
</Callout>

---

#### Chống trùng lặp giao dịch

<Callout type="warn" title="Khuyến nghị">
Để tránh xử lý trùng lặp giao dịch khi cơ chế retry hoạt động, bạn cần kiểm tra tính duy nhất bằng trường 
`id`
, hoặc kết hợp thêm 
`referenceCode`
, 
`transferType`
, 
`transferAmount`
 từ dữ liệu webhook.
</Callout>

---

#### Retry WebHooks bằng tay

Bạn có thể gọi lại webhook thủ công bằng 2 cách:

* Vào **Chi tiết giao dịch → Webhooks đã bắn → Gọi lại**
* Vào **Nhật ký → [Nhật ký Webhooks](https://my.sepay.vn/webhookslog) → Gọi lại**

<Image src="/images/user-guide/webhook-log-show.png" alt="Gọi lại webhooks" caption="Gọi lại webhooks" />
