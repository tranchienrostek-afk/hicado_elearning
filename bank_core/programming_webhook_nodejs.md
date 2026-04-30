# Lập trình Webhooks (Node.js)

## Lập trình một webhooks url đơn giản bằng Node.js (Express) để nhận và lưu thông tin giao dịch từ SePay.

<Callout type="tip" title="PHP">
Nếu bạn sử dụng PHP, xem hướng dẫn 
Lập trình Webhooks (PHP)
.
</Callout>

Bài viết này sẽ hướng dẫn bạn lập trình một ứng dụng đơn giản bằng **[Node.js](https://nodejs.org/)** (Express) để nhận và lưu giao dịch từ SePay gọi đến, CSDL là **[MySQL](https://en.wikipedia.org/wiki/MySQL)**.

### Bước 1: Tạo database và phân quyền.

Tạo database tên `webhooks_receiver`, user mysql `webhooks_receiver` và mật khẩu `EL2vKpfpDLsz`

Vào giao diện MySQL Command line, thực hiện các lệnh:

<TextBlock title="MySQL">
```text
create database webhooks_receiver;
create user 'webhooks_receiver'@'localhost' identified by 'EL2vKpfpDLsz';
grant all privileges on webhooks_receiver.* to  'webhooks_receiver'@'localhost' identified by 'EL2vKpfpDLsz';
```
</TextBlock>

<Callout type="info" title="Chú ý">
Để bảo mật, bạn nên đổi 
EL2vKpfpDLsz
 thành mật khẩu khác nhé.
</Callout>

### Bước 2: Tạo table lưu thông tin giao dịch.

Thực hiện lệnh tạo table trên MySQL Command line

<TextBlock title="MySQL">
```text
use webhooks_receiver;
CREATE TABLE \`tb_transactions\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`gateway\` varchar(100) NOT NULL,
  \`transaction_date\` timestamp NOT NULL DEFAULT '0000-00-00 00:00:00',
  \`account_number\` varchar(100) DEFAULT NULL,
  \`sub_account\` varchar(250) DEFAULT NULL,
  \`amount_in\` decimal(20,2) NOT NULL DEFAULT 0.00,
  \`amount_out\` decimal(20,2) NOT NULL DEFAULT 0.00,
  \`accumulated\` decimal(20,2) NOT NULL DEFAULT 0.00,
  \`code\` varchar(250) DEFAULT NULL,
  \`transaction_content\` text DEFAULT NULL,
  \`reference_number\` varchar(255) DEFAULT NULL,
  \`body\` text DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (\`id\`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;
```
</TextBlock>

### Bước 3: Khởi tạo project và cài đặt package.

<TextBlock title="Terminal">
```text
mkdir webhooks-receiver && cd webhooks-receiver
npm init -y
npm install express mysql2
```
</TextBlock>

### Bước 4: Tạo file nhận webhook từ SePay.

Tạo file `receiver.js` với nội dung sau:

<Node title="receiver.js">
```js
const express = require('express');
const mysql = require('mysql2');

const app = express();
app.use(express.json());

// Ket noi den MySQL
const db = mysql.createConnection({
host: 'localhost',
user: 'webhooks_receiver',
password: 'EL2vKpfpDLsz',
database: 'webhooks_receiver'
});

db.connect((err) => {
if (err) {
  console.error('MySQL connection failed:', err.message);
  process.exit(1);
}
console.log('Connected to MySQL');
});

// Endpoint nhan webhook tu SePay
app.post('/webhook', (req, res) => {
const data = req.body;

if (!data || !data.gateway) {
  return res.json({ success: false, message: 'No data' });
}

const amountIn = data.transferType === 'in' ? data.transferAmount : 0;
const amountOut = data.transferType === 'out' ? data.transferAmount : 0;

const sql = \`INSERT INTO tb_transactions
  (gateway, transaction_date, account_number, sub_account,
   amount_in, amount_out, accumulated, code,
   transaction_content, reference_number, body)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\`;

const values = [
  data.gateway,
  data.transactionDate,
  data.accountNumber,
  data.subAccount,
  amountIn,
  amountOut,
  data.accumulated,
  data.code,
  data.content,
  data.referenceCode,
  data.description
];

db.query(sql, values, (err) => {
  if (err) {
    return res.json({
      success: false,
      message: 'Can not insert record to mysql: ' + err.message
    });
  }
  res.status(200).json({ success: true });
});
});

app.listen(3000, () => {
console.log('Webhook receiver running on port 3000');
});

```
</Node>

Chạy server:

<TextBlock title="Terminal">
```text
node receiver.js
```

</TextBlock>

### Bước 5: Thêm mới một WebHooks tại menu WebHooks.

Lưu ý các tham số:

* Gọi đến URL: **[https://web-site-cua-ban.tld:3000/webhook](https://web-site-cua-ban.tld:3000/webhook)**
* Kiểu chứng thực: **Không cần chứng thực**

### Bước 6: Tạo một giao dịch giả lập

Tạo một giao dịch giả lập bằng cách đăng nhập vào tài khoản *Demo*, tại menu **Giao dịch → Giả lập giao dịch**. Chọn đúng Tài khoản ngân hàng tương ứng với webhooks bạn đã tạo

### Bước 7: Xem kết quả

Sau khi tạo giả lập giao dịch xong, bạn có thể vào phần **Giao dịch** → Chọn vào biểu tượng **Pay** tại cột **Tự động** để xem kết quả bắn WebHooks. Hoặc vào phần **[Nhật ký WebHooks.](https://my.sepay.vn/webhookslog)**

### Bước 8: Kiểm tra dữ liệu

Kiểm tra xem dữ liệu đã được lưu tại database chưa bằng cách sử dụng các truy vấn sau:

<TextBlock title="MYSQL">
```text
use webhooks_receiver;
select * from tb_transactions \\G;
```
</TextBlock>

<Callout type="info" title="Chú ý">
Ví dụ trên không chứng thực nguồn gọi đến. Để an toàn bạn cần allowlist 
địa chỉ IP của SePay
 hoặc chọn một kiểu chứng thực.
Với API Key, bạn cần kiểm tra header 
`Authorization`
 trong request:
```javascript
app.post('/webhook', (req, res) => {
  const apiKey = req.headers['authorization'];
  if (apiKey !== 'Apikey YOUR_API_KEY') {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  // ... xu ly webhook
});
```
</Callout>
