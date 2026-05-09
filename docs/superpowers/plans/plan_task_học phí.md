Ready to code?
    Here is Claude's plan:
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 Hệ thống Hóa đơn Học phí (TuitionBill) — Kế hoạch triển khai Context
    Vấn đề hiện tại: Hệ thống chỉ tracking "đã gửi tin Zalo chưa" và "đã nhận tiền chưa" theo kiểu rời rạc. Khi phụ huynh chuyển khoản, hệ thống match theo
 studentCode trong nội dung CK — không biết tiền này trả cho buổi học nào, tháng nào, lớp nào. Ví dụ cụ thể:

- HS1 học lớp A (150k/buổi): tháng 3 = 7 buổi, tháng 4 = 8 buổi
- HS1 học lớp B (200k/buổi): tháng 3 = 6 buổi, tháng 4 = 8 buổi, tháng 5 = 9 buổi
- Admin gửi tin "học phí tháng 4 lớp A" → có 8 buổi × 150k = 1.200.000đ
- Phụ huynh CK 1.200.000đ → hệ thống biết đây là đang trả đúng bill nào

 Giải pháp: Mỗi lần admin filter (lớp + khoảng ngày) để tính HP, hệ thống tạo ra 1 TuitionBill — một snapshot bất biến gồm sessions, amount, và mã tham chiếu
 duy nhất (referenceCode) được nhúng vào nội dung QR. Khi SePay nhận CK chứa mã đó → match chính xác bill, cập nhật trạng thái thanh toán.

---

 Kiến trúc tổng quan

 Admin filter (class + dateRange)
         │
         ▼
   TuitionBill created
   ┌─────────────────────────────────┐
   │ referenceCode: "HD-K9X2Y1"     │
   │ studentId, coveredClassIds      │
   │ fromDate, toDate                │
   │ sessions: 8.0                   │
   │ amount: 1.200.000đ              │
   │ status: UNPAID                  │
   └─────────────────────────────────┘
         │
         ├──► ZaloMessageLog.billId (liên kết)
         │
         ├──► QR memo: "HD-K9X2Y1 HS001 NGUYEN VAN A"
         │
         ▼
   SePay webhook nhận CK
   → tìm "HD-XXXXXX" trong content
   → match TuitionBill
   → tạo BillPayment
   → bill.paidAmount += amount
   → bill.status = PAID | PARTIAL

---

 Phase 1 — Schema & Migration

 Model mới: TuitionBill

 File: backend/prisma/schema.prisma

 enum BillStatus {
   UNPAID
   PARTIAL
   PAID
   CANCELLED
 }

 model TuitionBill {
   id              String       @id @default(cuid())
   studentId       String
   coveredClassIds String[]
   fromDate        DateTime
   toDate          DateTime
   sessionsDetail  String       @db.Text  // JSON: [{classId, sessions, pricePerSession, subtotal}]
   amount          Int                    // Tổng tiền phải trả (VND)
   paidAmount      Int          @default(0)
   referenceCode   String       @unique   // "HD-XXXXXX" nhúng vào QR memo
   status          BillStatus   @default(UNPAID)
   dueDate         DateTime?
   notes           String?      @db.Text
   createdByName   String
   sentAt          DateTime?
   createdAt       DateTime     @default(now())
   updatedAt       DateTime     @updatedAt
   student         Student      @relation(fields: [studentId], references: [id])
   payments        BillPayment[]
   messageLog      ZaloMessageLog[]
 }

 model BillPayment {
   id            String       @id @default(cuid())
   billId        String
   amount        Int
   paidAt        DateTime     @default(now())
   source        String       // "SEPAY" | "CASH" | "ADJUSTMENT"
   transactionId String?      // → Transaction.id nếu là SePay
   adjustmentId  String?      // → PaymentAdjustment.id nếu là cash
   note          String?
   bill          TuitionBill  @relation(fields: [billId], references: [id])
 }

 Thêm vào ZaloMessageLog:
 billId  String?
 bill    TuitionBill? @relation(...)

 Thêm vào Student:
 tuitionBills  TuitionBill[]

 Migration file thủ công (pattern đã dùng trước): backend/prisma/migrations/20260510000000_add_tuition_bill/migration.sql

---

 Phase 2 — Backend: Bill CRUD

 File: backend/src/routes/finance.ts (thêm vào cuối)

 2a. POST /api/finance/bills — Tạo bill thủ công

 Input:
 {
   "studentId": "...",
   "coveredClassIds": ["classA", "classB"],
   "fromDate": "2026-04-01",
   "toDate": "2026-04-30",
   "dueDate": "2026-05-05",
   "notes": "Học phí tháng 4"
 }

 Logic:

1. Với mỗi classId: query Attendance (PRESENT, trong khoảng ngày) → sessions = SUM(sessionUnits)
2. subtotal = sessions × class.tuitionPerSession
3. amount = SUM(subtotals)
4. referenceCode = generateBillCode() → "HD-" + nanoid(6).toUpperCase()
5. sessionsDetail = JSON.stringify([{classId, className, sessions, pricePerSession, subtotal}])
6. prisma.tuitionBill.create(...)

 Helper: backend/src/lib/billCode.ts
 import { customAlphabet } from 'nanoid';
 const gen = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
 export const generateBillCode = () => 'HD-' + gen();
 (nanoid đã có trong dependencies qua các lib khác; nếu chưa thì dùng Math.random().toString(36).slice(2,8).toUpperCase())

 2b. GET /api/finance/bills — Danh sách bills

 Query params: studentId?, status? (UNPAID|PARTIAL|PAID|CANCELLED), from?, to?

 Include: student { name, studentCode }, payments { amount, paidAt, source }

 2c. GET /api/finance/bills/:id — Chi tiết bill

 Include full payment history + sessionsDetail parsed as JSON.

 2d. PATCH /api/finance/bills/:id — Update status/notes

 Chỉ cho phép update: status (cancel), notes, dueDate.

---

 Phase 3 — Backend: Tích hợp vào luồng gửi Zalo

 File: backend/src/routes/zalo.ts — endpoint POST /send/custom-tuition (line ~460)

 Hiện tại endpoint này đã tính sessions, pricePerSession, total cho từng student. Thêm:

 // Sau khi send thành công, tạo bill nếu chưa có
 const bill = await prisma.tuitionBill.create({
   data: {
     studentId,
     coveredClassIds: item.classIds ?? [item.classId],
     fromDate: new Date(dateRange.from),
     toDate: new Date(dateRange.to),
     amount: item.total,
     sessionsDetail: JSON.stringify([...]),
     referenceCode: generateBillCode(),
     createdByName: user.name,
     sentAt: new Date(),
     notes: item.note,
   }
 });

 // Link ZaloMessageLog → bill
 await prisma.zaloMessageLog.update({
   where: { id: logId },
   data: { billId: bill.id }
 });

 Update QR memo trong backend/src/routes/finance.ts, endpoint GET /qr/:studentId/:classId:

- Nếu có billId query param → fetch bill, dùng bill.referenceCode làm prefix của memo
- Memo mới: ${bill.referenceCode} ${studentCode} ${className} (vẫn ≤ 50 chars)
- Nếu không có billId → memo cũ (backward compatible)

---

 Phase 4 — Backend: SePay matching nâng cấp

 File: backend/src/lib/sepayMatch.ts

 Thêm hàm findBillByPaymentContent(content: string):
 export async function findBillByPaymentContent(content: string) {
   const match = content.match(/HD-[A-Z0-9]{6}/i);
   if (!match) return null;
   const referenceCode = match[0].toUpperCase();
   return prisma.tuitionBill.findUnique({
     where: { referenceCode },
     include: { student: true }
   });
 }

 File: backend/src/routes/webhook.ts — processSepayTransaction() (line ~166)

 Sau khi tạo Transaction, thêm:
 // Try to match a TuitionBill
 const bill = await findBillByPaymentContent(payload.content ?? '');
 if (bill && bill.status !== 'CANCELLED') {
   await prisma.$transaction([
     prisma.billPayment.create({
       data: {
         billId: bill.id,
         amount: payload.transferAmount,
         source: 'SEPAY',
         transactionId: transaction.id,
       }
     }),
     prisma.tuitionBill.update({
       where: { id: bill.id },
       data: {
         paidAmount: { increment: payload.transferAmount },
         status: computeBillStatus(bill.paidAmount + payload.transferAmount, bill.amount),
       }
     })
   ]);
 }

 Helper: computeBillStatus(paid, total) → paid >= total ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID'

---

 Phase 5 — UI: Tab "Hóa đơn" trong Finance

 File: ui_components/src/views/pages/finance/finance.tsx

 Thêm tab mới "Hóa đơn" (sau tab Tracking):

 Layout:
 Filters: [Lọc HS] [Lọc trạng thái] [Từ ngày] [Đến ngày] [Tạo HĐ thủ công]

 Table:
 Mã HĐ | Học sinh | Lớp | Kỳ | Số buổi | Phải thu | Đã thu | Còn lại | Trạng thái | Ngày tạo
 HD-K9X2 | Nguyễn A | Toán | 1/4-30/4 | 8 buổi | 1.200.000 | 1.200.000 | 0 | ✅ PAID
 HD-X8P1 | Nguyễn A | Văn | 1/4-30/4 | 7 buổi | 700.000 | 300.000 | 400.000 | 🟡 PARTIAL

 Click vào bill → slide-over detail:

- Bảng chi tiết từng lớp (sessionsDetail parsed)
- Lịch sử thanh toán (payments[])
- Nút "Hủy hóa đơn" (set CANCELLED)
- Nút "Ghi nhận thanh toán thủ công" → tạo BillPayment + PaymentAdjustment

 Tạo HĐ thủ công (modal):

- Chọn học sinh → load danh sách lớp
- Chọn 1+ lớp
- Chọn khoảng ngày → system tính sessions + amount tự động (fetch POST /api/finance/bills/preview)
- Preview: bảng [lớp | buổi | đơn giá | thành tiền]
- Confirm → tạo bill

 API mới phục vụ UI:

- POST /api/finance/bills/preview — tính tiền trước khi tạo (không lưu)
- POST /api/finance/bills/:id/manual-payment — ghi nhận CK thủ công

---

 Files sẽ thay đổi

 ┌─────────────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────┐
 │                                  File                                   │                                    Thay đổi                                     │
 ├─────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ backend/prisma/schema.prisma                                            │ Thêm enum BillStatus, model TuitionBill, BillPayment; thêm billId vào           │
 │                                                                         │ ZaloMessageLog                                                                  │
 ├─────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ backend/prisma/migrations/20260510000000_add_tuition_bill/migration.sql │ CREATE TABLE tuition_bills, bill_payments; ALTER TABLE zalo_message_logs ADD    │
 │                                                                         │ COLUMN bill_id                                                                  │
 ├─────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ backend/src/lib/billCode.ts                                             │ Hàm generateBillCode() — FILE MỚI                                               │
 ├─────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ backend/src/routes/finance.ts                                           │ Thêm CRUD /bills, /bills/preview, /bills/:id/manual-payment                     │
 ├─────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ backend/src/lib/sepayMatch.ts                                           │ Thêm findBillByPaymentContent()                                                 │
 ├─────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ backend/src/routes/webhook.ts                                           │ Link TuitionBill khi SePay match referenceCode                                  │
 ├─────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ backend/src/routes/zalo.ts                                              │ Auto-create bill sau khi send custom-tuition; update QR memo                    │
 ├─────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ ui_components/src/views/pages/finance/finance.tsx                       │ Thêm tab "Hóa đơn" với table + slide-over + create modal                        │
 └─────────────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────┘

---

 Verification

1. Tạo bill thủ công: POST /finance/bills → bill xuất hiện trong tab Hóa đơn, referenceCode format HD-XXXXXX.
2. QR memo: GET /finance/qr/:studentId/:classId?billId=... → memo chứa referenceCode.
3. Gửi Zalo + auto-bill: Send custom-tuition → ZaloMessageLog.billId được populate.
4. SePay match: Webhook payload với content chứa HD-XXXXXX → bill.paidAmount tăng, status cập nhật.
5. Manual payment: POST /finance/bills/:id/manual-payment → BillPayment tạo, bill.status thay đổi.
6. UI: Tab Hóa đơn hiển thị đúng trạng thái UNPAID/PARTIAL/PAID với màu phân biệt.
