# Hướng dẫn tích hợp WebHooks

Tích hợp WebHooks giúp SePay bắn thông tin giao dịch đến ứng dụng bán hàng của bạn. Mỗi khi phát sinh giao dịch, SePay sẽ bắn WebHooks, ứng dụng bán hàng của bạn sẽ biết khách hàng đã thanh toán và chuyển trạng thái đơn hàng.

![Image Description](https://docs.sepay.vn/assets/svg/illustrations/oc-megaphone.svg)

Nếu bạn cần  **môi trường thử nghiệm (sandbox)** , hãy đăng ký tài khoản tại [my.dev.sepay.vn](https://my.dev.sepay.vn/register). Tại đây bạn có thể tạo giao dịch giả lập, webhook để phục vụ mục đích phát triển phần mềm. Sau khi đăng ký, hãy [liên hệ](https://sepay.vn/lien-he.html) với SePay để được kích hoạt tài khoản nhé.

**Bước 1:** Truy cập vào menu [WebHooks](https://my.sepay.vn/webhooks)

**Bước 2:** Chọn vào button  ở phía trên, bên phải

![](https://docs.sepay.vn/assets/img/others/webhook-add.png?v=3)

**Bước 3:** Điền đầy đủ thông tin, bao gồm:

* **Đặt tên:** Bạn đặt tên bất kỳ
* **1**  **Chọn sự kiện** : Bạn có thể chọn sự kiện **Bắn WebHooks khi** `Có tiền vào`, `Có tiền ra` hoặc `Cả hai`
* **2**  **Chọn điều kiện** : Bao gồm:
  * **Khi tài khoản ngân hàng là** : Chọn tài khoản mà khi có giao dịch, webhooks sẽ bắn. Trong trường hợp bạn muốn chỉ định các tài khoản ảo (VA) cụ thể để nhận thông báo, tích vào hộp kiểm **Lọc theo tài khoản ảo** và chọn các tài khoản ảo cần theo dõi.
  * **Bỏ qua nếu nội dung giao dịch không có Code thanh toán?** : Nếu bạn chọn Có, SePay sẽ KHÔNG bắn webhooks nếu không nhận diện được code thanh toán trong nội dung thanh toán.
    TIP: Cấu hình nhận diện code thanh toán tại phần **Công ty** -> **Cấu hình chung** -> **Cấu trúc mã thanh toán**
* **3**  **Thuộc tính WebHooks** : Bao gồm:
  * **Gọi đến URL** : Đường link mà bạn muốn gọi WebHooks. Nếu muốn lập trình website nhận webhooks, xem hướng dẫn [tại đây](https://docs.sepay.vn/lap-trinh-webhooks.html).
  * **Là WebHooks xác thực thanh toán?** : Chọn Đúng nếu webhooks này dùng để xác thực thanh toán cho website/ ứng dụng bán hàng.
  * **Gọi lại WebHooks khi?** : Hiện tại SePay hỗ trợ một số điều kiện để bạn có thể gọi lại Webhooks tự động:
  * HTTP Status Code không nằm trong phạm vi từ 200 đến 299.
* **4**  **Cấu hình chứng thực WebHooks** : Bao gồm:
  * **Kiểu chứng thực** : Hiện SePay hỗ trợ chứng thực với  **OAuth 2.0** , **API Key** hoặc  **Không cần chứng thực** .
  * Nếu chọn  **OAuth 2.0** , bạn cần điền đầy đủ thông tin như OAuth 2.0 Access Token URL, OAuth 2.0 Client Id, OAuth 2.0 Client Secret
  * Nếu chọn **Không chứng thực** hoặc  **Api Key** , bạn cần chọn Request Content type là  **application/json** , **multipart/form-data** hoặc **application/x-www-form-urlencoded** tùy theo ứng dụng nhận webhooks của mình.

**Bước 4:** Chọn **Thêm** để hoàn tất tích hợp.

### Dữ liệu gửi qua webhooks

SePay sẽ gửi một request với phương thức là  **POST** , với nội dung gửi như sau:

```
{
    "id": 92704,                              // ID giao dịch trên SePay
    "gateway":"Vietcombank",                  // Brand name của ngân hàng
    "transactionDate":"2023-03-25 14:02:37",  // Thời gian xảy ra giao dịch phía ngân hàng
    "accountNumber":"0123499999",              // Số tài khoản ngân hàng
    "code":null,                               // Mã code thanh toán (sepay tự nhận diện dựa vào cấu hình tại Công ty -> Cấu hình chung)
    "content":"chuyen tien mua iphone",        // Nội dung chuyển khoản
    "transferType":"in",                       // Loại giao dịch. in là tiền vào, out là tiền ra
    "transferAmount":2277000,                  // Số tiền giao dịch
    "accumulated":19077000,                    // Số dư tài khoản (lũy kế)
    "subAccount":null,                         // Tài khoản ngân hàng phụ (tài khoản định danh),
    "referenceCode":"MBVCB.3278907687",         // Mã tham chiếu của tin nhắn sms
    "description":""                           // Toàn bộ nội dung tin nhắn sms
}
```

Với chứng thực là  **API Key** , SePay sẽ gửi với header là `"Authorization":"Apikey API_KEY_CUA_BAN"`

**Danh sách IP gửi webhook của SePay** (thêm vào whitelist nếu hệ thống của bạn có giới hạn IP):* `172.236.138.20`

* `172.233.83.68`
* `171.244.35.2`
* `151.158.108.68`
* `151.158.109.79`
* `103.255.238.139`

### Kiểm tra hoạt động

Nếu sử dụng tài khoản Demo, bạn vào menu [Giao dịch](https://my.sepay.vn/transactions) -> Giả lập giao dịch để thêm một giao dịch mới. Xem thông tin về Giả lập giao dịch [tại đây](https://docs.sepay.vn/gia-lap-giao-dich.html)

Nếu không sử dụng tài khoản demo, bạn có thể thử chuyển một khoản tiền nhỏ vào để có giao dịch thử nghiệm.

Sau đó vào menu **Nhật ký** -> [Nhật ký webhooks](https://my.sepay.vn/webhookslog) để xem danh sách các webhooks đã bắn.

Ngoài ra, bạn có thể xem tin nhắn webhooks đã gửi theo từng giao dịch tại menu [ Giao dịch](https://my.sepay.vn/transactions) -> cột Tự động -> chọn vào **Pay**

### Nhận diện webhooks thành công

Khi nhận webhooks gọi từ SePay, website của bạn cần phản hồi (response) theo quy ước sau để SePay biết được kết quả là thành công:

* Với chứng thực OAuth 2.0
  * Nội dung trả về là json có  **success: true** : `{"success": true, ....}`
  * HTTP Status Code phải là **201**
* Với chứng thực API Key
  * Nội dung trả về là json có  **success: true** : `{"success": true, ....}`
  * HTTP Status Code phải là **201** hoặc **200**
* Với không chứng thực
  * Nội dung trả về là json có  **success: true** : `{"success": true, ....}`
  * HTTP Status Code phải là **201** hoặc **200**

Nếu kết quả trả về không thỏa mãn các điều kiện trên, SePay sẽ xem là webhook thất bại.

### Retry webhooks tự động

SePay sẽ gọi lại webhooks nếu trạng thái **kết nối mạng** đến webhook url thất bại. Ngoài ra, bạn có thể tùy chọn các điều kiện SePay hỗ trợ sẵn để có thể gọi lại webhooks. Thời gian gọi cách nhau bằng phút, tăng dần theo dãy số [Fibonacci](https://en.wikipedia.org/wiki/Fibonacci_sequence)

* Số lần gọi lại tối đa là 7 lần
* Tối đa là 5 giờ kể từ khi gọi lần đầu thất bại
* Network connect timeout của SePay là 5 giây
* Thời gian chờ phản hồi tối đa của SePay là 8 giây

Lưu ý: SePay sẽ KHÔNG gọi lại webhooks nếu trạng thái là thất bại nhưng kết nối mạng là thành công, trừ khi webhook đó được thiết lập điều kiện gọi lại và chỉ gọi lại khi thỏa mãn một trong số các điều kiện được thiết lập.

### Yêu cầu chống trùng lặp giao dịch

Để tránh trùng lặp giao dịch khi phát sinh các sự cố với kết nối webhook của phía người dùng tại cơ chế retry. SePay khuyến nghị người dùng xử lý chống trùng lặp giao dịch khi nhận thông báo biến động giao dịch từ SePay thông qua webhook của mình.

Người dùng cần kiểm tra tính duy nhất của trường `id`, hoặc kết hợp thêm các trường khác như `referenceCode`, `transferType`, `transferAmount` từ dữ liệu SePay gửi qua webhook để đảm bảo tính duy nhất của giao dịch.

### Retry webhooks bằng tay

Bạn có thể thao tác gọi lại webhooks bằng tay bằng cách vào Chi tiết một giao dịch -> Chọn Xem tại Webhooks đã bắn -> Gọi lại. Hoặc vào phần Nhật ký Webhooks, chọn vào Gọi lại

![](https://docs.sepay.vn/assets/img/others/webhook-log-show.png)

Đọc tiếp: [Lập trình WebHooks đơn giản](https://docs.sepay.vn/lap-trinh-webhooks.html)


# Hướng dẫn lập trình webhooks đơn giản

Lập trình một webhooks url đơn giản để nhận và lưu thông tin giao dịch từ SePay.

Bài viết này sẽ hướng dẫn bạn lập trình một website đơn giản để nhận và lưu giao dịch từ SePay gọi đến. Ngôn ngữ lập trình sử dụng là [PHP](https://www.php.net/), CSDL là [MySQL](https://en.wikipedia.org/wiki/MySQL).

Nếu bạn đang sử dụng Laravel. Hãy sử dụng package được đóng gói sẵn cho SePay [tại đây](https://github.com/sepayvn/laravel-sepay)

**Bước 1:** Tạo database và phân quyền.

Tạo database tên  **webhooks_receiver** , user mysql **webhooks_receiver** tên và mật khẩu **EL2vKpfpDLsz**

Vào giao diện MySQL Command line, thực hiện các lệnh:

```
create database webhooks_receiver;
create user 'webhooks_receiver'@'localhost' identified by 'EL2vKpfpDLsz';
grant all privileges on webhooks_receiver.* to  'webhooks_receiver'@'localhost' identified by 'EL2vKpfpDLsz';
        
```

Để bảo mật, bạn nên đổi **EL2vKpfpDLsz** thành mật khẩu khác nhé.

**Bước 2:** Tạo table để lưu thông tin giao dịch.

```
use webhooks_receiver;
CREATE TABLE `tb_transactions` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `gateway` varchar(100) NOT NULL,
    `transaction_date` timestamp NOT NULL DEFAULT '0000-00-00 00:00:00',
    `account_number` varchar(100) DEFAULT NULL,
    `sub_account` varchar(250) DEFAULT NULL,
    `amount_in` decimal(20,2) NOT NULL DEFAULT 0.00,
    `amount_out` decimal(20,2) NOT NULL DEFAULT 0.00,
    `accumulated` decimal(20,2) NOT NULL DEFAULT 0.00,
    `code` varchar(250) DEFAULT NULL,
    `transaction_content` text DEFAULT NULL,
    `reference_number` varchar(255) DEFAULT NULL,
    `body` text DEFAULT NULL,
    `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;
        
```

 **Bước 3:** Tạo file `receiver.php` SePay gọi tới. Nội dung file như sau

```
 
<?php
    $servername = "localhost";
    $username = "webhooks_receiver";
    $password = "EL2vKpfpDLsz";
    $dbname = "webhooks_receiver";


    // Ket noi den MySQL
    $conn = new mysqli($servername, $username, $password, $dbname);
    // Kiem tra ket noi
    if ($conn->connect_error) {
        echo json_encode(['success'=>FALSE, 'message' => 'MySQL connection failed: '. $conn->connect_error]);
        die();
    }

    // Lay du lieu tu webhooks, xem cac truong du lieu tai https://docs.sepay.vn/tich-hop-webhooks.html#du-lieu
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

    // Kiem tra giao dich tien vao hay tien ra
    if($transfer_type == "in")
        $amount_in = $transfer_amount;
    else if($transfer_type == "out")
        $amount_out = $transfer_amount;

    // Tao query SQL
    $sql = "INSERT INTO tb_transactions (gateway, transaction_date, account_number, sub_account, amount_in, amount_out, accumulated, code, transaction_content, reference_number, body) VALUES ('{$gateway}', '{$transaction_date}', '{$account_number}', '{$sub_account}', '{$amount_in}', '{$amount_out}', '{$accumulated}', '{$code}', '{$transaction_content}', '{$reference_number}', '{$body}')";

    // Chay query de luu giao dich vao CSDL
    if ($conn->query($sql) === TRUE) {
        echo json_encode(['success'=>TRUE]);
    } else {
        echo json_encode(['success'=>FALSE, 'message' => 'Can not insert record to mysql: ' . $conn->error]);
    }

?>

```

**Bước 4:** [Thêm mới một WebHooks](https://docs.sepay.vn/tich-hop-webhooks.html) tại menu  **WebHooks** . Lưu ý các tham số:

* Gọi đến URL: `https://web-site-cua-ban.tld/receiver.php`
* Kiểu chứng thực: **Không cần chứng thực**

**Bước 5:** Tạo một giao dịch giả lập bằng cách đăng nhập vào tài khoản Demo, tại menu **Giao dịch** ->  **Giả lập giao dịch** . Chọn đúng Tài khoản ngân hàng tương ứng với webhooks bạn đã tạo.

**Bước 6:** Sau khi tạo giả lập giao dịch xong, bạn có thể vào phần **Giao dịch** -> Chọn vào biểu tượng **Pay** tại cột **Tự động** để xem kết quả bắn WebHooks. Hoặc vào phần [Nhật ký WebHooks](https://my.sepay.vn/webhookslog).

**Bước 7:** Kiểm tra xem dữ liệu đã được lưu tại database chưa bằng cách sử dụng các truy vấn sau:

```
use webhooks_receiver;
select * from tb_transactions \G
```

Ví dụ trên không chứng thực nguồn gọi đến. Để an toàn bạn cần whitelist IP của SePay hoặc chọn một kiểu chứng thực.
Với API Key, bạn cần kiểm tra xem SePay có gửi API Key đúng trong header hay không.IP bắn webhook của SePay:

* `172.236.138.20`
* `172.233.83.68`
* `171.244.35.2`
* `151.158.108.68`
* `151.158.109.79`
* `103.255.238.139`

Chúc bạn thành công!

Đọc tiếp: [Giả lập giao dịch](https://docs.sepay.vn/gia-lap-giao-dich.html)


# Hướng dẫn giả lập giao dịch

Tính năng giúp bạn thêm một giao dịch ngân hàng với mục đích thử nghiệm.

Chỉ có tài khoản Demo mới có tính năng Giả lập giao dịch. Để được cấp tài khoản demo, vui lòng [liên hệ](https://sepay.vn/lien-he.html) với SePay.

**Bước 1:** Truy cập vào menu [Giao dịch](https://my.sepay.vn/bankaccount)

**Bước 2:** Chọn vào button  ở phía trên, bên phải

**Bước 3:** Chọn  **Ngân hàng** , điền  **Số tiền** ,  **Nội dung chuyển khoản** , sau đó chọn **Thêm**

Các tính năng tích hợp như Webhook, Telegram vẫn hoạt động bình thường khi bạn thêm giao dịch.

Tính năng giả lập giao dịch hữu ích để bạn thử nghiệm việc tích hợp Webhooks hoặc Telegram.

Đọc tiếp: [Tạo người dùng và phân quyền](https://docs.sepay.vn/nguoi-dung-va-phan-quyen.html)
