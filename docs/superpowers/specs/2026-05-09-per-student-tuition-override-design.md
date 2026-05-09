# Per-Student Tuition Override — Design Spec

## Context

Hicado Center cần cho phép một số học sinh đóng học phí thấp hơn mức chung của lớp (ví dụ: học online, gia đình khó khăn). Giảm giá áp dụng trong một khoảng thời gian xác định (từ ngày → đến ngày); ngoài khoảng đó học sinh trở về giá lớp mặc định. Admin cấu hình một lần, hệ thống tự áp dụng mọi nơi tính phí.

---

## Data Model

Thêm 4 field vào `ClassStudent` (junction table):

```prisma
model ClassStudent {
  classId                String
  studentId              String
  customTuitionPerSession Int?      // giá giảm (VNĐ/buổi); null = không có giảm giá
  discountFrom           DateTime? // bắt đầu áp dụng giá giảm
  discountTo             DateTime? // kết thúc (null = không giới hạn thời gian trên)
  discountReason         String?   // "Học online" | "Gia đình khó khăn" | free text
  class                  Class     @relation(...)
  student                Student   @relation(...)
  @@id([classId, studentId])
}
```

**Migration:** `ALTER TABLE "ClassStudent" ADD COLUMN IF NOT EXISTS "customTuitionPerSession" INTEGER; ADD COLUMN IF NOT EXISTS "discountFrom" TIMESTAMP(3); ADD COLUMN IF NOT EXISTS "discountTo" TIMESTAMP(3); ADD COLUMN IF NOT EXISTS "discountReason" TEXT;`

---

## Logic Tính Phí (Date-Ranged Split)

Khi tính học phí cho `(studentId, classId)` trong khoảng `[fromDate, toDate]`:

1. Đọc `ClassStudent` để lấy `{ customTuitionPerSession, discountFrom, discountTo }`
2. Nếu không có override → toàn bộ buổi × `class.tuitionPerSession`
3. Nếu có override:
   - Buổi có `date` nằm trong `[discountFrom, discountTo]` → × `customTuitionPerSession`
   - Buổi ngoài khoảng đó → × `class.tuitionPerSession`
4. Tổng = sum cả 2 nhóm

```
Ví dụ:
  Lớp: 200k/buổi
  Override: 150k từ 01/04 đến 30/06
  Attendance tháng 4: 8 buổi → 8 × 150k = 1.200.000đ
  Attendance tháng 7: 6 buổi → 6 × 200k = 1.200.000đ (tự trở lại giá thường)
```

**Áp dụng tại:**
- `backend/src/lib/financeMath.ts` — hàm `expectedForStudentClass()`
- `backend/src/routes/finance.ts` — `POST /bills/preview` và `POST /cash-payment`
- `backend/src/routes/zalo.ts` — `POST /send/custom-tuition` (tự populate `pricePerSession` per student)
- `ui_components/src/utils/center-operations.ts` — `calculateStudentTuitionDue()`

---

## API Changes

### `PUT /api/classes/:classId/students/:studentId/tuition-override`
Tạo hoặc cập nhật giá đặc biệt cho 1 HS trong 1 lớp.

**Request body:**
```json
{
  "customTuitionPerSession": 150000,
  "discountFrom": "2026-04-01",
  "discountTo": "2026-06-30",
  "discountReason": "Học online"
}
```
Để xóa override: gửi `{ "customTuitionPerSession": null }`.

**Response:** Updated `ClassStudent` record.

### `GET /api/classes/:classId/students` (đã có, cần mở rộng)
Include thêm `customTuitionPerSession`, `discountFrom`, `discountTo`, `discountReason` trong response.

---

## UI/UX

### 1. Danh sách học sinh trong lớp (classes.tsx)

Mỗi row học sinh hiển thị badge học phí:
- **Badge xám** `200k/buổi` — giá mặc định lớp
- **Badge amber** `150k ↓ 01/04–30/06` — đang có giá giảm (kèm tooltip lý do)
- **Badge xanh** `150k (hết hạn)` — override đã hết hạn (quá `discountTo`)

Nút **⚙ Cấu hình** mở modal.

### 2. Modal cấu hình giá đặc biệt

```
Giá lớp mặc định: 200.000đ/buổi
────────────────────────────────
☑ Áp dụng học phí đặc biệt
  Giá riêng:  [150.000] đ/buổi
  Từ ngày:    [2026-04-01]
  Đến ngày:   [2026-06-30]  (để trống = không giới hạn)
  Lý do:      [Học online ▼]
              options: Học online | Gia đình khó khăn | Khác
────────────────────────────────
[Xóa giảm giá]          [Lưu]
```

### 3. Enrollment modal (khi thêm HS mới vào lớp)

Sau khi chọn học sinh, mỗi HS trong danh sách selected có thêm row collapsible:
```
☑ Nguyễn Văn A                          [Giá đặc biệt? ▼]
   → Giá: [    ] đ/buổi  Từ: [    ] Đến: [    ] Lý do: [    ]
```
Toggle ẩn/hiện bằng click. Mặc định ẩn (không làm phức tạp flow thông thường).

### 4. Zalo Wizard (zalo-campaign.tsx)

Khi load danh sách HS trong wizard, tự populate `pricePerSession` từ DB:
- Nếu ngày hiện tại trong `[discountFrom, discountTo]` → dùng `customTuitionPerSession`
- Ngược lại → dùng `class.tuitionPerSession`
- Vẫn cho phép admin override thêm một lần nữa trong wizard nếu muốn

---

## Files Thay Đổi

| File | Thay đổi |
|------|----------|
| `backend/prisma/schema.prisma` | Thêm 4 field vào `ClassStudent` |
| `backend/prisma/migrations/20260510000002_add_classstudent_override/migration.sql` | ALTER TABLE migration |
| `backend/src/routes/classes.ts` | Thêm `PUT /:classId/students/:studentId/tuition-override`; trả về override fields trong GET students |
| `backend/src/lib/financeMath.ts` | Cập nhật `expectedForStudentClass()` để split buổi theo ngày |
| `backend/src/routes/finance.ts` | `bills/preview` và `cash-payment` đọc override từ `ClassStudent` |
| `backend/src/routes/zalo.ts` | `custom-tuition` tự populate `pricePerSession` từ override khi build items |
| `ui_components/src/utils/center-operations.ts` | `calculateStudentTuitionDue()` đọc override |
| `ui_components/src/views/pages/classes/classes.tsx` | Badge giá + modal cấu hình + enrollment collapsible |

---

## Verification

1. **Thêm override:** Mở lớp → click ⚙ bên cạnh HS → nhập 150k từ 01/04 đến 30/06 → Lưu → badge amber xuất hiện
2. **Tính phí đúng:** Tạo bill preview cho HS đó tháng 4 → `pricePerSession = 150.000` ✅; tháng 7 → `pricePerSession = 200.000` ✅
3. **Wizard tự populate:** Mở wizard Zalo → HS đó có `pricePerSession = 150.000` tự điền (trong khoảng override) ✅
4. **Hết hạn:** Sau 30/06, wizard và bill preview dùng lại 200k ✅
5. **Xóa override:** Click "Xóa giảm giá" → badge trở về xám ✅
