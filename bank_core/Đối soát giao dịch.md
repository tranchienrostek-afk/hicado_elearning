# Đối soát giao dịch

## Hướng dẫn đối soát giao dịch giữa hệ thống của bạn và SePay để đảm bảo không bỏ sót giao dịch nào.

### Tại sao cần đối soát giao dịch?

Khi tích hợp SePay Webhooks, hệ thống của bạn sẽ nhận giao dịch **theo thời gian thực**. Tuy nhiên, trong một số trường hợp webhook có thể không đến được hệ thống của bạn:

* Server của bạn tạm thời **không hoạt động** (downtime, deploy, restart)
* **Lỗi mạng** giữa SePay và server của bạn
* Webhook bị **timeout** (server xử lý quá lâu)
* Đã **vượt quá số lần retry** tối đa (7 lần)

Để đảm bảo **không bỏ sót giao dịch nào**, bạn cần thực hiện đối soát định kỳ bằng cách gọi **[API Giao dịch](/vi/sepay-api/api-giao-dich)** và so khớp với dữ liệu trong database của bạn.

---

### Quy trình đối soát

#### 1. Lấy danh sách giao dịch từ SePay

Gọi API lấy danh sách giao dịch trong khoảng thời gian cần đối soát:

<Endpoint method="GET" path="https://my.sepay.vn/userapi/transactions/list" />

<ParamsTable
  rows={[
{ "name": "transaction_date_min", "type": "string", "description": "Thời gian bắt đầu, định dạng `<code>`YYYY-MM-DD HH:mm:ss`</code>`" },
{ "name": "transaction_date_max", "type": "string", "description": "Thời gian kết thúc, định dạng `<code>`YYYY-MM-DD HH:mm:ss`</code>`" },
{ "name": "account_number", "type": "string", "description": "Lọc theo số tài khoản ngân hàng (không bắt buộc)" },
{ "name": "limit", "type": "integer", "description": "Số lượng giao dịch tối đa trả về (mặc định: 5000)" }
]}
/>

* Ví dụ: Lấy tất cả giao dịch trong ngày 01/03/2026

<Node title="cURL">
```js
curl -X GET "https://my.sepay.vn/userapi/transactions/list?transaction_date_min=2026-03-01%2000:00:00&transaction_date_max=2026-03-01%2023:59:59" \\
-H "Content-Type: application/json" \\
-H "Authorization: Bearer YOUR_API_TOKEN"
```
</Node>

#### 2. So khớp với database của bạn

So sánh danh sách giao dịch từ SePay với các giao dịch đã lưu trong database. Sử dụng trường **`id`** (ID giao dịch trên SePay) để xác định giao dịch nào bị thiếu.

#### 3. Bổ sung giao dịch thiếu

Với những giao dịch có trên SePay nhưng không có trong database, tiến hành lưu bổ sung và xử lý logic nghiệp vụ tương ứng (ví dụ: cập nhật trạng thái đơn hàng).

---

### Code mẫu đối soát

<CodeTabs>
  <Code label="PHP">
    ```php
    <?php
    $sepayToken = 'YOUR_API_TOKEN';

`    // Ket noi database
    $conn = new mysqli('localhost', 'webhooks_receiver', 'EL2vKpfpDLsz', 'webhooks_receiver');
    if ($conn->connect_error) {
        die('MySQL connection failed: ' . $conn->connect_error);
    }`

`    // Lay giao dich tu SePay trong 24h qua
    $dateMin = date('Y-m-d H:i:s', strtotime('-24 hours'));
    $dateMax = date('Y-m-d H:i:s');`

`    $url = 'https://my.sepay.vn/userapi/transactions/list?'
        . http_build_query([
            'transaction_date_min' => $dateMin,
            'transaction_date_max' => $dateMax
        ]);`

`    `

`    `

`    // Lay danh sach reference_number da luu
    `

`    // Tim va bo sung giao dich thieu
    $missingCount = 0;
    foreach (`

`            `

`    echo "Doi soat xong. Bo sung {$missingCount} giao dich.\n";
    $conn->close();
    ?>
    `

`    const SEPAY_TOKEN = 'YOUR_API_TOKEN';`

`    async function reconcile() {
      const db = await mysql.createConnection({
        host: 'localhost',
        user: 'webhooks_receiver',
        password: 'EL2vKpfpDLsz',
        database: 'webhooks_receiver'
      });`

`      // Lay giao dich tu SePay trong 24h qua
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const dateMin = yesterday.toISOString().slice(0, 19).replace('T', ' ');
      const dateMax = now.toISOString().slice(0, 19).replace('T', ' ');`

`      const response = await axios.get(
        'https://my.sepay.vn/userapi/transactions/list',
        {
          params: { transaction_date_min: dateMin, transaction_date_max: dateMax },
          headers: {
            'Authorization': `

`      const sepayTxs = response.data.transactions || [];
      console.log(`

`      const [rows] = await db.query(
        'SELECT reference_number FROM tb_transactions WHERE created_at >= ?',
        [dateMin]
      );
      const existingRefs = new Set(rows.map(r => r.reference_number));`

`      let missingCount = 0;
      for (const tx of sepayTxs) {
        if (!existingRefs.has(tx.reference_number)) {
          console.log(`

`      console.log(`

`    reconcile().catch(console.error);
    `

`    SEPAY_TOKEN = 'YOUR_API_TOKEN'`

`    def reconcile():
        db = mysql.connector.connect(
            host='localhost',
            user='webhooks_receiver',
            password='EL2vKpfpDLsz',
            database='webhooks_receiver'
        )
        cursor = db.cursor(dictionary=True)`

`        # Lay giao dich tu SePay trong 24h qua
        now = datetime.now()
        yesterday = now - timedelta(hours=24)
        date_min = yesterday.strftime('%Y-%m-%d %H:%M:%S')
        date_max = now.strftime('%Y-%m-%d %H:%M:%S')`

`        res = requests.get(
            'https://my.sepay.vn/userapi/transactions/list',
            params={'transaction_date_min': date_min, 'transaction_date_max': date_max},
            headers={
                'Authorization': f'Bearer {SEPAY_TOKEN}',
                'Content-Type': 'application/json'
            }
        )
        transactions = res.json().get('transactions', [])
        print(f'SePay tra ve {len(transactions)} giao dich')`

`        cursor.execute(
            'SELECT reference_number FROM tb_transactions WHERE created_at >= %s',
            (date_min,)
        )
        existing_refs = {row['reference_number'] for row in cursor.fetchall()}`

`        missing = 0
        for tx in transactions:
            if tx['reference_number'] not in existing_refs:
                print(f"Thieu: ID={tx['id']}, so tien={tx['amount_in']}, ref={tx['reference_number']}")
                cursor.execute(
                    '''INSERT INTO tb_transactions
                        (gateway, transaction_date, account_number, sub_account,
                         amount_in, amount_out, accumulated, code,
                         transaction_content, reference_number, body)
                     VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)''',
                    (
                        tx['bank_brand_name'], tx['transaction_date'],
                        tx['bank_account_id'], tx['bank_sub_acc_id'],
                        tx.get('amount_in', 0), tx.get('amount_out', 0),
                        tx.get('accumulated', 0), tx['code'],
                        tx['transaction_content'], tx['reference_number'],
                        tx['description']
                    )
                )
                missing += 1`

`        db.commit()
        print(f'Doi soat xong. Bo sung {missing} giao dich.')
        cursor.close()
        db.close()`

`    reconcile()
    `

`    SEPAY_TOKEN = 'YOUR_API_TOKEN'`

`    db = Mysql2::Client.new(
      host: 'localhost',
      username: 'webhooks_receiver',
      password: 'EL2vKpfpDLsz',
      database: 'webhooks_receiver'
    )`

`    # Lay giao dich tu SePay trong 24h qua
    date_min = (Time.now - 86400).strftime('%Y-%m-%d %H:%M:%S')
    date_max = Time.now.strftime('%Y-%m-%d %H:%M:%S')`

`    uri = URI('https://my.sepay.vn/userapi/transactions/list')
    uri.query = URI.encode_www_form(
      transaction_date_min: date_min,
      transaction_date_max: date_max
    )`

`    req = Net::HTTP::Get.new(uri)
    req['Content-Type'] = 'application/json'
    req['Authorization'] = "Bearer #{SEPAY_TOKEN}"`

`    res = Net::HTTP.start(uri.host, uri.port, use_ssl: true) { |http| http.request(req) }
    transactions = JSON.parse(res.body)['transactions'] || []
    puts "SePay tra ve #{transactions.length} giao dich"`

`    existing = db.query(
      "SELECT reference_number FROM tb_transactions WHERE created_at >= '#{date_min}'"
    ).map { |r| r['reference_number'] }.to_set`

`    missing = 0
    transactions.each do |tx|
      unless existing.include?(tx['reference_number'])
        puts "Thieu: ID=#{tx['id']}, so tien=#{tx['amount_in']}, ref=#{tx['reference_number']}"
        stmt = db.prepare(
          'INSERT INTO tb_transactions (gateway, transaction_date, account_number, ' `

`    puts "Doi soat xong. Bo sung #{missing} giao dich."
    db.close
    `

`    public class Reconcile {
      static final String SEPAY_TOKEN = "YOUR_API_TOKEN";`

`      public static void main(String[] args) throws Exception {
        Connection db = DriverManager.getConnection(
          "jdbc:mysql://localhost/webhooks_receiver",
          "webhooks_receiver", "EL2vKpfpDLsz"
        );`

`        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        String dateMax = LocalDateTime.now().format(fmt);
        String dateMin = LocalDateTime.now().minusHours(24).format(fmt);`

`        // Lay giao dich tu SePay trong 24h qua
        String url = "https://my.sepay.vn/userapi/transactions/list"
          + "?transaction_date_min=" + URLEncoder.encode(dateMin, "UTF-8")
          + "&transaction_date_max=" + URLEncoder.encode(dateMax, "UTF-8");`

`        HttpRequest request = HttpRequest.newBuilder()
          .uri(URI.create(url))
          .header("Content-Type", "application/json")
          .header("Authorization", "Bearer " + SEPAY_TOKEN)
          .GET().build();`

`        HttpResponse`

`        JSONArray transactions = new JSONObject(response.body())
          .optJSONArray("transactions");
        if (transactions == null) transactions = new JSONArray();
        System.out.println("SePay tra ve " + transactions.length() + " giao dich");`

`        HashSet`

`        int missing = 0;
        PreparedStatement insert = db.prepareStatement(
          "INSERT INTO tb_transactions (gateway, transaction_date, account_number, " +
          "sub_account, amount_in, amount_out, accumulated, code, " +
          "transaction_content, reference_number, body) VALUES (?,?,?,?,?,?,?,?,?,?,?)");`

`        for (int i = 0; i < transactions.length(); i++) {
          JSONObject tx = transactions.getJSONObject(i);
          String ref = tx.optString("reference_number");
          if (!existingRefs.contains(ref)) {
            System.out.println("Thieu: ID=" + tx.opt("id") + ", ref=" + ref);
            insert.setString(1, tx.optString("bank_brand_name"));
            insert.setString(2, tx.optString("transaction_date"));
            insert.setString(3, tx.optString("bank_account_id"));
            insert.setString(4, tx.optString("bank_sub_acc_id"));
            insert.setDouble(5, tx.optDouble("amount_in", 0));
            insert.setDouble(6, tx.optDouble("amount_out", 0));
            insert.setDouble(7, tx.optDouble("accumulated", 0));
            insert.setString(8, tx.optString("code"));
            insert.setString(9, tx.optString("transaction_content"));
            insert.setString(10, ref);
            insert.setString(11, tx.optString("description"));
            insert.executeUpdate();
            missing++;
          }
        }
        System.out.println("Doi soat xong. Bo sung " + missing + " giao dich.");
        db.close();
      }
    }
    `

`    import (
      "database/sql"
      "encoding/json"
      "fmt"
      "io"
      "net/http"
      "net/url"
      "time"
      _ "github.com/go-sql-driver/mysql"
    )`

`    const sepayToken = "YOUR_API_TOKEN"`

`    func main() {
      db, err := sql.Open("mysql",
        "webhooks_receiver:EL2vKpfpDLsz@tcp(localhost)/webhooks_receiver?parseTime=true")
      if err != nil { panic(err) }
      defer db.Close()`

`      // Lay giao dich tu SePay trong 24h qua
      now := time.Now()
      dateMin := now.Add(-24 * time.Hour).Format("2006-01-02 15:04:05")
      dateMax := now.Format("2006-01-02 15:04:05")`

`      apiURL := "https://my.sepay.vn/userapi/transactions/list?" + url.Values{
        "transaction_date_min": {dateMin},
        "transaction_date_max": {dateMax},
      }.Encode()`

`      req, _ := http.NewRequest("GET", apiURL, nil)
      req.Header.Set("Content-Type", "application/json")
      req.Header.Set("Authorization", "Bearer "+sepayToken)`

`      resp, err := http.DefaultClient.Do(req)
      if err != nil { panic(err) }
      defer resp.Body.Close()
      body, _ := io.ReadAll(resp.Body)`

`      var data struct {
        Transactions []map[string]interface{} `

`      rows, _ := db.Query(
        "SELECT reference_number FROM tb_transactions WHERE created_at >= ?", dateMin)
      existing := map[string]bool{}
      for rows.Next() {
        var ref string
        rows.Scan(&ref)
        existing[ref] = true
      }`

`      missing := 0
      for _, tx := range data.Transactions {
        ref, _ := tx["reference_number"].(string)
        if !existing[ref] {
          fmt.Printf("Thieu: ID=%v, so tien=%v, ref=%s\n", tx["id"], tx["amount_in"], ref)
          db.Exec(
            `

`    class Program {
      const string SepayToken = "YOUR_API_TOKEN";`

`      static async Task Main() {
        await using var db = new MySqlConnection(
          "Server=localhost;Database=webhooks_receiver;" +
          "User=webhooks_receiver;Password=EL2vKpfpDLsz;");
        await db.OpenAsync();`

`        // Lay giao dich tu SePay trong 24h qua
        var dateMin = DateTime.Now.AddHours(-24).ToString("yyyy-MM-dd HH:mm:ss");
        var dateMax = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");`

`        var client = new HttpClient();
        client.DefaultRequestHeaders.Add("Authorization", $"Bearer {SepayToken}");
        var url = "https://my.sepay.vn/userapi/transactions/list" +
          $"?transaction_date_min={Uri.EscapeDataString(dateMin)}" +
          $"&transaction_date_max={Uri.EscapeDataString(dateMax)}";`

`        var json = await client.GetStringAsync(url);
        var data = JsonDocument.Parse(json);
        var transactions = data.RootElement.GetProperty("transactions");
        Console.WriteLine($"SePay tra ve {transactions.GetArrayLength()} giao dich");`

`        var existingRefs = new HashSet`

`        var missing = 0;
        foreach (var tx in transactions.EnumerateArray()) {
          var refNum = tx.GetProperty("reference_number").GetString() ?? "";
          if (!existingRefs.Contains(refNum)) {
            Console.WriteLine($"Thieu: ID={tx.GetProperty("id")}, ref={refNum}");
            await using var cmd = new MySqlCommand(
              @"INSERT INTO tb_transactions
                  (gateway, transaction_date, account_number, sub_account,
                   amount_in, amount_out, accumulated, code,
                   transaction_content, reference_number, body)
                VALUES (@1,@2,@3,@4,@5,@6,@7,@8,@9,@10,@11)", db);
            cmd.Parameters.AddWithValue("@1", tx.GetProperty("bank_brand_name").GetString());
            cmd.Parameters.AddWithValue("@2", tx.GetProperty("transaction_date").GetString());
            cmd.Parameters.AddWithValue("@3", tx.GetProperty("bank_account_id").GetString());
            cmd.Parameters.AddWithValue("@4", tx.GetProperty("bank_sub_acc_id").GetString());
            cmd.Parameters.AddWithValue("@5", tx.TryGetProperty("amount_in", out var ai) ? ai.GetDouble() : 0);
            cmd.Parameters.AddWithValue("@6", tx.TryGetProperty("amount_out", out var ao) ? ao.GetDouble() : 0);
            cmd.Parameters.AddWithValue("@7", tx.TryGetProperty("accumulated", out var ac) ? ac.GetDouble() : 0);
            cmd.Parameters.AddWithValue("@8", tx.GetProperty("code").GetString());
            cmd.Parameters.AddWithValue("@9", tx.GetProperty("transaction_content").GetString());
            cmd.Parameters.AddWithValue("@10", refNum);
            cmd.Parameters.AddWithValue("@11", tx.GetProperty("description").GetString());
            await cmd.ExecuteNonQueryAsync();
            missing++;
          }
        }
        Console.WriteLine($"Doi soat xong. Bo sung {missing} giao dich.");
      }
    }
    ```
  `

code

---

### `Chiến lược đối soát`

#### `Đối soát theo khoảng thời gian`

`Phù hợp cho đối soát định kỳ (mỗi giờ, mỗi ngày). Sử dụng `

#### `Đối soát theo `

`Phù hợp cho đối soát liên tục. Lưu lại `

code

code
