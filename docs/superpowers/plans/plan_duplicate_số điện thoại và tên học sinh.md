I'm using the writing-plans skill to create the implementation plan.

# Student Duplicate Detection & Merge Plan

**Goal:** Khi import/add học sinh mới, hệ thống phải nhận diện học sinh đã tồn tại bằng tên + số điện thoại + thông tin phụ, tránh tạo 2 hồ sơ khác nhau cho cùng một học sinh, và có công cụ merge an toàn cho dữ liệu đã trùng.

**Architecture:** Không merge tự động bừa. Hệ thống cần 2 lớp: duplicate detection khi import/add mới, và duplicate resolution để gộp các hồ sơ đã trùng. Mọi merge phải chạy transaction, có audit log, và giữ nguyên điểm danh, học phí, lớp, Zalo, tài khoản.

**Tech Stack:** Prisma/PostgreSQL, Express API, React UI, existing `Student`, `ClassStudent`, `Attendance`, `PaymentAdjustment`, `Transaction`, `User`, `ZaloMessageLog`.

---

## 1. Root Cause

Trường hợp này xảy ra vì hệ thống hiện đang xem mỗi dòng import là một học sinh mới nếu không trùng `studentCode` hoặc `id`.

Nhưng thực tế vận hành:

- Một học sinh có thể học nhiều lớp: Toán, Lý, Hóa.
- Khi import lớp Toán, nếu em đó đã có trong lớp Lý, hệ thống phải gắn học sinh cũ vào lớp Toán.
- Nếu không detect, sẽ tạo `Student A - Lý` và `Student A - Toán` thành 2 học sinh khác nhau.
- Sau này học phí, điểm danh, Zalo mapping, tài khoản phụ huynh sẽ bị tách đôi.

## 2. Nguyên Tắc Thiết Kế

Không dùng tên đơn thuần để merge. Tên học sinh Việt Nam trùng rất nhiều.

Ưu tiên match theo độ tin cậy:

1. `cccd` trùng: gần như chắc chắn.
2. `studentCode` trùng: chắc chắn nếu mã chuẩn.
3. `parentPhone` hoặc `studentPhone` trùng + tên gần giống: rất mạnh.
4. Tên normalized + năm sinh + số phụ huynh trùng: rất mạnh.
5. Tên normalized + trường/lớp phổ thông + năm sinh: trung bình, cần review.
6. Chỉ tên giống: không auto merge, chỉ cảnh báo.

## 3. Database Plan

### Modify `Student`

Thêm các field phục vụ dedupe và merge:

```prisma
model Student {
  phoneNorm          String?
  parentPhoneNorm    String?
  nameNorm           String?
  mergedIntoId       String?
  mergedAt           DateTime?
  mergeReason        String?
}
```

Ý nghĩa:

- `phoneNorm`: số điện thoại học sinh đã chuẩn hóa.
- `parentPhoneNorm`: số phụ huynh đã chuẩn hóa.
- `nameNorm`: tên bỏ dấu, lowercase, trim spacing.
- `mergedIntoId`: nếu hồ sơ này đã bị gộp vào hồ sơ khác.
- `mergedAt`: thời điểm merge.
- `mergeReason`: lý do merge.

### Create `StudentMergeAudit`

```prisma
model StudentMergeAudit {
  id              String   @id @default(cuid())
  sourceStudentId String
  targetStudentId String
  sourceSnapshot  String   @db.Text
  targetSnapshot  String   @db.Text
  movedRelations  String   @db.Text
  reason          String?
  performedById   String?
  performedByName String?
  performedAt     DateTime @default(now())
}
```

Không chỉ log “đã merge”; phải lưu snapshot trước merge để có thể truy vết nếu merge nhầm.

## 4. Backend Duplicate Matching

### Create `backend/src/lib/studentIdentity.ts`

Chứa các hàm thuần, dễ test:

```ts
normalizePhone(phone?: string | null): string | null
normalizeVietnameseName(name: string): string
calculateStudentMatchScore(input, existing): MatchResult
findDuplicateCandidates(input): Candidate[]
```

Scoring đề xuất:

```ts
CCCD exact: 100
studentCode exact: 100
parentPhone exact + name similarity >= 80: 95
studentPhone exact + name similarity >= 80: 90
phone exact only: 75
name + birthYear + schoolName similar: 65
name only: 30
```

Rule:

- `score >= 90`: auto-link existing student.
- `70 <= score < 90`: require admin review.
- `< 70`: create new.

## 5. Import Flow Plan

Khi import danh sách học sinh lớp Toán:

### Step 1: Preview import

Backend không tạo học sinh ngay. Trả về preview:

```ts
{
  rowIndex: 3,
  incoming: {
    name: "Nguyễn Văn A",
    parentPhone: "0912345678",
    birthYear: 2010
  },
  decision: "MATCH_EXISTING" | "REVIEW" | "CREATE_NEW",
  candidates: [
    {
      studentId: "abc",
      name: "Nguyễn Văn A",
      classes: ["Lý 2010"],
      parentPhone: "0912345678",
      score: 95,
      reasons: ["Trùng số phụ huynh", "Tên giống 92%"]
    }
  ]
}
```

### Step 2: Admin confirm

UI hiển thị:

- “Đã tìm thấy học sinh giống trong lớp Lý”
- Option mặc định: “Dùng học sinh cũ và thêm vào lớp Toán”
- Option phụ: “Vẫn tạo học sinh mới”

### Step 3: Commit import

Backend xử lý:

- Nếu `MATCH_EXISTING`: tạo `ClassStudent` cho lớp mới, không tạo `Student`.
- Nếu `CREATE_NEW`: tạo student mới.
- Nếu class link đã tồn tại: bỏ qua, báo “đã ở lớp này”.

## 6. Manual Duplicate Review UI

Thêm một tab hoặc section trong trang học sinh:

**Tên:** `Trùng học sinh`

Chức năng:

- Quét toàn bộ học sinh nghi trùng.
- Group theo phone/name/year.
- Hiển thị 2 hồ sơ cạnh nhau:
  - Tên
  - SĐT phụ huynh
  - SĐT học sinh
  - Năm sinh
  - Trường
  - Các lớp đang học
  - Zalo UID
  - Tài khoản user
  - Điểm danh
  - Giao dịch/học phí

Admin chọn:

- `Giữ hồ sơ A`
- `Giữ hồ sơ B`
- `Không phải trùng`

## 7. Merge Transaction Plan

Endpoint:

```http
POST /api/students/:sourceId/merge-into/:targetId
```

Payload:

```json
{
  "reason": "Trùng khi import lớp Toán 2010, cùng tên và SĐT phụ huynh"
}
```

Transaction phải làm:

1. Validate source và target khác nhau.
2. Validate cả hai chưa bị merge.
3. Move `ClassStudent` từ source sang target.
4. Nếu target đã có class đó rồi thì skip duplicate class link.
5. Move `Attendance` từ source sang target.
6. Move `PaymentAdjustment` từ source sang target.
7. Move `Transaction` từ source sang target.
8. Move `ZaloMessageLog` từ source sang target.
9. Move `User.studentId` nếu target chưa có user.
10. Nếu cả hai đều có user, giữ target user, source user bị deactivate hoặc unlink tùy role.
11. Move `zaloUserId` nếu target chưa có.
12. Nếu cả hai có `zaloUserId` khác nhau, bắt admin chọn trước, không auto.
13. Mark source:

- `isActive = false`
- `mergedIntoId = targetId`
- `mergedAt = now`

14. Create `StudentMergeAudit`.

Không hard delete source ngay. Soft merge an toàn hơn vì còn audit.

## 8. API Plan

### `POST /api/students/duplicate-preview`

Dùng cho import hoặc form add student.

Input:

```json
{
  "name": "Nguyễn Văn A",
  "birthYear": 2010,
  "parentPhone": "0912345678",
  "studentPhone": ""
}
```

Output:

```json
{
  "decision": "MATCH_EXISTING",
  "candidates": [...]
}
```

### `GET /api/students/duplicates`

Quét toàn bộ database.

Query options:

```http
/api/students/duplicates?minScore=70&includeInactive=false
```

### `POST /api/students/:sourceId/merge-into/:targetId`

Merge thủ công.

### `POST /api/import/students/preview`

Nếu hiện đã có import endpoint, sửa endpoint hiện tại thành 2 phase:

- preview
- commit

## 9. Frontend Plan

### Add Student Form

Khi nhập tên + số điện thoại:

- Debounce 500ms.
- Gọi duplicate preview.
- Nếu match mạnh, hiện warning:

```text
Có thể học sinh này đã tồn tại:
Nguyễn Văn A - đang học Lý 2010 - SĐT PH: 0912345678

[Thêm học sinh này vào lớp mới] [Vẫn tạo hồ sơ mới]
```

### Import Excel Flow

Sau khi upload file:

- Không import ngay.
- Hiển thị bảng preview:
  - Dòng Excel
  - Học sinh nhập vào
  - Match tìm thấy
  - Quyết định
  - Action override

Màu trạng thái:

- Xanh: auto dùng học sinh cũ.
- Vàng: cần review.
- Xám: tạo mới.
- Đỏ: dữ liệu thiếu/sai.

### Duplicate Management Page

Thêm button:

```text
Quét học sinh trùng
```

Bảng group:

```text
Nguyễn Văn A / 0912345678
- Hồ sơ 1: Lớp Lý 2010
- Hồ sơ 2: Lớp Toán 2010
Score: 95
[Merge vào hồ sơ 1] [Merge vào hồ sơ 2] [Không trùng]
```

## 10. Testing Plan

### Unit Tests

Test `normalizePhone`:

- `0912 345 678` -> `0912345678`
- `+84912345678` -> `0912345678`
- `84912345678` -> `0912345678`

Test `normalizeVietnameseName`:

- `Nguyễn Văn A` -> `nguyen van a`
- extra spaces collapse.

Test match scoring:

- same parent phone + same name -> score >= 90.
- same name only -> score < 70.
- same phone but different name -> review, not auto merge.
- same CCCD -> 100.

### Integration Tests

Import list Toán có học sinh đã học Lý:

- Existing student remains 1 row in `Student`.
- New `ClassStudent` added.
- No duplicate created.

Merge duplicate:

- Attendance moved.
- Payment adjustments moved.
- Transactions moved.
- Zalo logs moved.
- Source student inactive.
- Audit created.

### Regression Tests

- Two siblings dùng cùng SĐT phụ huynh nhưng tên khác không bị auto merge.
- Hai học sinh cùng tên nhưng khác phone không bị auto merge.
- Student đã ở lớp Toán rồi import lại không tạo duplicate class link.

## 11. Rollout Plan

### Phase 1: Detection Only

Triển khai preview duplicate khi add/import, chưa có merge.

Mục tiêu:

- Ngăn duplicate mới phát sinh.

### Phase 2: Manual Merge

Thêm UI merge để xử lý dữ liệu đã trùng.

Mục tiêu:

- Dọn các case hiện có như Toán/Lý 2010.

### Phase 3: Import Hardening

Chuyển toàn bộ import Excel sang 2 bước preview -> confirm.

Mục tiêu:

- Không còn import thẳng tạo dữ liệu bẩn.

## 12. Data Cleanup Plan Cho Case Hiện Tại

Làm riêng một màn/manual script sau khi có merge endpoint:

1. Tìm học sinh 2010 có cùng `parentPhone` hoặc `studentPhone`.
2. Group theo `nameNorm + phoneNorm`.
3. Kiểm tra group có lớp Toán và Lý.
4. Admin chọn canonical student.
5. Merge duplicate vào canonical.
6. Verify:
   - 1 học sinh còn active.
   - Học sinh đó có cả lớp Toán và Lý.
   - Điểm danh/học phí không mất.
   - Zalo UID không bị mất.

## 13. Acceptance Criteria

Feature được coi là xong khi:

1. Import danh sách Toán có học sinh trùng Lý không tạo student mới.
2. UI báo rõ “học sinh đã tồn tại ở lớp Lý”.
3. Admin có thể chọn dùng học sinh cũ hoặc tạo mới.
4. Có màn quét học sinh trùng hiện có.
5. Merge không mất điểm danh, học phí, lớp, transaction, Zalo log.
6. Có audit log cho mọi merge.
7. Có test chống merge nhầm anh/chị/em dùng chung số phụ huynh.

**Khuyến nghị:** làm theo 3 phase, không làm merge tự động ngay từ đầu. Việc nguy hiểm nhất là merge nhầm học sinh, vì sẽ ảnh hưởng học phí và điểm danh.
