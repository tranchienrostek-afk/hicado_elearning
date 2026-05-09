Đánh giá — 2 vấn đề riêng biệt

  Vấn đề 1: Bug dedupe sai tháng

  Root cause nằm ở backend buildSentAtSql (zalo.ts line 454–459):

  const buildSentAtSql = (from, to) => {                                                                                                                             if (from && to) return Prisma.sql `AND "sentAt" BETWEEN ${from} AND ${to}`;
    // ...
    return Prisma.empty; // ← khi không có fromDate/toDate                                                                                                         };

  Query dedupe filter theo sentAt (ngày GỬI tin) — không phải tháng mà tin đó đại diện. Kết quả:

  ┌─────────────────────────────────────────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────────┐
  │                              Scenario                               │                                      Kết quả                                       │
  ├─────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
  │ Gửi HP tháng 5 ngày 25/4 → Gửi HP tháng 6 ngày 25/5                 │ sentAt của tin tháng 5 là Apr25, không nằm trong Jun1–Jun30 → dedupe không trigger │
  │ (fromDate=Jun1..Jun30)                                              │  (đúng)                                                                            │
  ├─────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
  │ Gửi HP tháng 5 (custom, không có fromDate) → Gửi HP tháng 6 (cũng   │ sentAtFilter = Prisma.empty → query tìm bất kỳ log nào cùng studentId + classId →  │
  │ không có fromDate)                                                  │ false positive ← đây là bug                                                        │
  ├─────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
  │ Thu trước tháng 6 ngày 20/5, fromDate=Jun1 → Gửi lại tháng 6 ngày   │ sentAt của tin đầu là May20 ≠ Jun1–Jun30 → lại không trigger (sẽ gửi trùng)        │
  │ 5/6, fromDate=Jun1                                                  │                                                                                    │
  └─────────────────────────────────────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────────┘

  Tóm lại: Hệ thống dùng sentAt (ngày gửi) để phân biệt kỳ thu — sai hoàn toàn. Cần thêm field billingMonth (e.g. "2026-06") để đánh nhãn kỳ thu cho từng log, và
   dedupe check theo field này.

  Vấn đề 2: UX block thay vì warn

  UI line 322: failedCount: data.failedCount + (data.skippedCount ?? 0) — SKIPPED bị cộng vào thất bại. Admin không thấy rõ ai bị skip và tại sao. Cơ chế
  forceResend đã có nhưng phải biết ai bị skip mới dùng được — hiện tại không hiển thị.

---

  Kế hoạch fix

  File thay đổi:

- backend/prisma/schema.prisma — thêm billingMonth String? vào ZaloMessageLog và TuitionBill
- backend/prisma/migrations/20260510100000_add_billing_month/migration.sql
- backend/src/routes/zalo.ts — sửa dedupe query + nhận billingMonth từ body
- ui_components/src/views/pages/zalo-campaign/zalo-campaign.tsx — thêm month picker, hiển thị SKIPPED như warning

  Sửa 1 — Schema + Migration

  // ZaloMessageLog — thêm:
  billingMonth  String?   // "2026-06" — kỳ thu tin này đại diện

  // TuitionBill — thêm:
  billingMonth  String?   // "2026-06"

  ALTER TABLE "ZaloMessageLog" ADD COLUMN IF NOT EXISTS "billingMonth" TEXT;
  ALTER TABLE "TuitionBill" ADD COLUMN IF NOT EXISTS "billingMonth" TEXT;

  Sửa 2 — Dedupe logic backend (zalo.ts)

  Thay buildSentAtSql bằng logic dùng billingMonth:

  // Nhận billingMonth từ body (VD: "2026-06")
  const { ..., billingMonth } = req.body;

  // Dedupe query
  if (billingMonth) {
    // Chính xác: check cùng tháng + cùng lớp
    const existing = await prisma.zaloMessageLog.findFirst({
      where: {
        studentId: student.id,
        status: 'SENT',
        billingMonth,
        coveredClassIds: { hasSome: coveredClassIds }
      }
    });
    if (existing && !forceSet.has(student.id)) { skip... }
  } else {
    // Không có billingMonth → KHÔNG dedupe (cho phép gửi tự do)
    // Bỏ hẳn block này — không nên đoán
  }

  // Khi tạo log, lưu billingMonth
  await prisma.zaloMessageLog.create({
    data: { ..., billingMonth: billingMonth ?? null }
  });

  Sửa 3 — UI: Month picker + hiển thị warning

  Step 2 wizard — thêm month picker:

  // State mới
  const [wizardBillingMonth, setWizardBillingMonth] = useState(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  );

  // UI
  `<label>`Kỳ thu học phí`</label>`
  <input type="month" value={wizardBillingMonth}
    onChange={e => setWizardBillingMonth(e.target.value)}
    className="..." />

<p className="text-xs text-hicado-navy/40">
    Dùng để phân biệt "thu tháng 5" với "thu tháng 6" cho cùng 1 lớp
  </p>

  Truyền vào API: billingMonth: wizardBillingMonth

  Step 3 preview — hiển thị SKIPPED như warning thay vì fail:

  Sau khi send, results[] từ API có status: 'SKIPPED'. Hiển thị riêng:

  // Tách riêng thay vì cộng vào failedCount
  const skippedStudents = results.filter(r => r.status === 'SKIPPED');
  // ...
  {skippedStudents.length > 0 && (
    `<div className="bg-amber-50 border border-amber-200 rounded-xl p-4">`
      `<p className="font-black text-amber-700 text-sm">`
        ⚠️ {skippedStudents.length} học sinh đã được gửi kỳ này trước đó
      `</p>`
      `<p className="text-xs text-amber-600 mt-1">`
        Kiểm tra lại hoặc tick "Gửi lại" nếu muốn gửi thêm lần nữa.
      `</p>`
      `<ul className="mt-2 space-y-1">`
        {skippedStudents.map(s => (
          <li key={s.studentId} className="text-xs text-amber-700 flex items-center gap-2">
            `<span>`{s.studentName}
            `<span className="text-amber-400">`—
            `<span>`đã gửi {billingMonth}
          `</li>`
        ))}
      `</ul>`
    `</div>`
  )}

  Bắt đầu implement luôn.
