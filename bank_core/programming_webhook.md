# Lập trình Webhooks (PHP)

## Lập trình một webhooks url đơn giản bằng PHP để nhận và lưu thông tin giao dịch từ SePay.

<Callout type="info" title="Thông tin">
Nếu bạn đang sử dụng Laravel. Hãy sử dụng package được đóng gói sẵn cho SePay 
tại đây
</Callout>

Bài viết này sẽ hướng dẫn bạn lập trình một website đơn giản để nhận và lưu giao dịch từ SePay gọi đến. Ngôn ngữ lập trình sử dụng là **[PHP](https://www.php.net/)**, CSDL là **[MySQL](https://en.wikipedia.org/wiki/MySQL)**.

<Callout type="tip" title="Node.js">
Nếu bạn sử dụng Node.js, xem hướng dẫn 
Lập trình Webhooks (Node.js)
.
</Callout>

### Bước 1: Tạo database và phân quyền.

Tạo database tên `webhooks_receiver`, user mysql `webhooks_receiver` tên và mật khẩu `EL2vKpfpDLsz`

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

### Bước 3: Tạo file PHP SePay gọi tới.

Nội dung file `receiver.php` như sau:

`<Php title="Webhook Receiver">`

```php
<?php
  $servername = 'localhost';
  $username = 'webhooks_receiver';
  $password = 'EL2vKpfpDLsz';
  $dbname = 'webhooks_receiver';

  // Ket noi den MySQL
  $conn = new mysqli($servername, $username, $password, $dbname);
  // Kiem tra ket noi
  if ($conn->connect_error) {
      echo json_encode(['success'=>FALSE, 'message' => 'MySQL connection failed: '. $conn->connect_error]);
      die();
  }

  // Lay du lieu tu webhooks
  $data = json_decode(file_get_contents('php://input'));

  if(!is_object($data)) {
      echo json_encode(['success'=>FALSE, 'message' => 'No data']);
      die();
  }

  // Khoi tao cac bien
  $gateway = $data->gateway;
  $transaction_date = $data->transactionDate;
  $account_number = $data->accountNumber;
  $sub_account = $data->subAccount;

  $transfer_type = $data->transferType;
  $transfer_amount = $data->transferAmount;
  $accumulated = $data->accumulated;

  $code = $data->code;
  $transaction_content = $data->content;
  $reference_number = $data->referenceCode;
  $body = $data->description;

  $amount_in = 0;
  $amount_out = 0;

  if($transfer_type == 'in')
      $amount_in = $transfer_amount;
  else if($transfer_type == 'out')
      $amount_out = $transfer_amount;

  $sql = "INSERT INTO tb_transactions (gateway, transaction_date, account_number, sub_account, amount_in, amount_out, accumulated, code, transaction_content, reference_number, body) VALUES ('{$gateway}', '{$transaction_date}', '{$account_number}', '{$sub_account}', '{$amount_in}', '{$amount_out}', '{$accumulated}', '{$code}', '{$transaction_content}', '{$reference_number}', '{$body}')";

  if ($conn->query($sql) === TRUE) {
      echo json_encode(['success'=>TRUE]);
  } else {
      echo json_encode(['success'=>FALSE, 'message' => 'Can not insert record to mysql: ' . $conn->error]);
  }
?>
```

</Php>

### Bước 4: Thêm mới một WebHooks tại menu WebHooks.

Lưu ý các tham số:

* Gọi đến URL: **[https://web-site-cua-ban.tld/receiver.php](https://web-site-cua-ban.tld/receiver.php)**
* Kiểu chứng thực: **Không cần chứng thực**

### Bước 5: Tạo một giao dịch giả lập

Tạo một giao dịch giả lập bằng cách đăng nhập vào tài khoản *Demo*, tại menu **Giao dịch → Giả lập giao dịch**. Chọn đúng Tài khoản ngân hàng tương ứng với webhooks bạn đã tạo

### Bước 6: Xem kết quả

Sau khi tạo giả lập giao dịch xong, bạn có thể vào phần **Giao dịch** → Chọn vào biểu tượng **Pay** tại cột **Tự động** để xem kết quả bắn WebHooks. Hoặc vào phần **[Nhật ký WebHooks.](https://my.sepay.vn/webhookslog)**

### Bước 7: Kiểm tra dữ liệu

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
Với API Key, bạn cần kiểm tra xem SePay có gửi API Key đúng trong header hay không.
</Callout>
