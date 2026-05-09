# PRD-04 — Kế hoạch Triển khai: Thu học phí linh hoạt & Quản lý HP đa lớp

**Dự án:** Hicado E-Learning Platform  
**Phiên bản:** 1.0  
**Ngày:** 09/05/2026  
**Tech stack:** React 18 + TypeScript (Vite) · Node.js + Express + Prisma · PostgreSQL · Zalo OA API

---

## Mục lục

1. [Tổng quan yêu cầu](#1-tổng-quan-yêu-cầu)
2. [Database Migration](#2-database-migration)
3. [Task 9 — Backend: Thu học phí thủ công](#3-task-9--backend-thu-học-phí-thủ-công)
4. [Task 10 — Backend: Quản lý HP đa lớp](#4-task-10--backend-quản-lý-hp-đa-lớp)
5. [Task 9 — Frontend: Wizard CUSTOM_TUITION](#5-task-9--frontend-wizard-custom_tuition)
6. [Task 10 — Frontend: Luồng đa lớp trong wizard](#6-task-10--frontend-luồng-đa-lớp-trong-wizard)
7. [Thứ tự triển khai](#7-thứ-tự-triển-khai)
8. [Rủi ro & Edge Cases](#8-rủi-ro--edge-cases)

---

## 1. Tổng quan yêu cầu

### Task #9 — Thu học phí trước / Tùy chỉnh thủ công

**Vấn đề hiện tại:** Endpoint `POST /api/zalo/send/tuition` gửi nội dung cứng `"học phí cần thanh toán"` mà không có chi tiết số buổi, đơn giá, tổng tiền. Admin không thể điều chỉnh trước khi gửi.

**Mục tiêu:** Tạo luồng gửi HP mới cho phép admin nhập thủ công số buổi + đơn giá + ghi chú cho từng học sinh, hệ thống tính tổng tự động và gửi tin Zalo có nội dung itemized. Phù hợp khi thu HP đầu tháng trước khi điểm danh thực tế.

### Task #10 — Học sinh nhiều lớp → Quản lý gửi HP chặt chẽ

**Vấn đề hiện tại:** `ZaloMessageLog.classId` chỉ lưu được **một** lớp. Khi học sinh học nhiều lớp và admin muốn gộp HP nhiều lớp vào một tin, không có cách theo dõi lớp nào đã được "cover" trong lần gửi đó. Dẫn đến gửi trùng.

**Mục tiêu:** Bổ sung `coveredClassIds String[]` vào log, xây dựng API kiểm tra trùng, UI cảnh báo và tùy chọn gộp lớp khi gửi.

**Ví dụ cụ thể:**
- Học sinh 1 học lớp A và lớp B
- Admin gửi HP lớp A → chọn gộp thêm lớp B → log `coveredClassIds: ['A', 'B']`
- Sau đó admin gửi HP lớp B → hệ thống cảnh báo "Đã gửi HP lớp B cho học sinh 1 (cùng lớp A, ngày X)"
- Admin gửi lớp C (học sinh 1 cũng học) → bình thường, C chưa có log

---

## 2. Database Migration

### 2.1 Thay đổi schema Prisma

**File:** `backend/prisma/schema.prisma` — bổ sung 3 trường vào `ZaloMessageLog`:

```prisma
model ZaloMessageLog {
  id              String    @id @default(uuid())
  phone           String
  zaloUserId      String?
  templateId      String
  trackingId      String    @unique
  status          String
  errorReason     String?
  sentAt          DateTime  @default(now())
  readAt          DateTime?
  studentId       String?
  campaignId      String?
  classId         String?
  deliveredAt     DateTime?
  zaloMsgId       String?
  // ── MỚI (Task 9) ──────────────────────────────────────────────
  messageType     String?          // 'CUSTOM_TUITION' | 'TUITION_REMINDER' | 'GENERAL'
  customPayload   String?  @db.Text // JSON: { sessions, pricePerSession, total, note }
  // ── MỚI (Task 10) ─────────────────────────────────────────────
  coveredClassIds String[] @default([])
  campaign        Campaign? @relation(fields: [campaignId], references: [id])
  student         Student?  @relation(fields: [studentId],  references: [id])
}
```

### 2.2 Migration SQL

Chạy `npx prisma migrate dev --name add_custom_tuition_multiclass` hoặc thực thi SQL thủ công:

```sql
ALTER TABLE "ZaloMessageLog"
  ADD COLUMN IF NOT EXISTS "messageType"     TEXT,
  ADD COLUMN IF NOT EXISTS "customPayload"   TEXT,
  ADD COLUMN IF NOT EXISTS "coveredClassIds" TEXT[] NOT NULL DEFAULT '{}';

-- GIN index bắt buộc cho toán tử @> (array contains) chạy hiệu quả
CREATE INDEX IF NOT EXISTS idx_zml_covered_class_ids
  ON "ZaloMessageLog" USING GIN ("coveredClassIds");

CREATE INDEX IF NOT EXISTS idx_zml_student_status
  ON "ZaloMessageLog" ("studentId", "status");
```

> **Quan trọng:** GIN index là bắt buộc. Nếu thiếu, query `coveredClassIds @> ARRAY[...]` sẽ full-scan khi bảng log lớn.

---

## 3. Task 9 — Backend: Thu học phí thủ công

### 3.1 Helper: `buildCustomTuitionMessage`

Tạo file mới `backend/src/lib/zaloMessage.ts`:

```typescript
export interface CustomTuitionPayload {
  sessions:        number;
  pricePerSession: number;
  total:           number;
  note?:           string;
}

export function buildCustomTuitionMessage(studentName: string, p: CustomTuitionPayload): string {
  return [
    `Kính gửi phụ huynh em ${studentName}!`,
    ``,
    `Trung tâm Hicado xin thông báo học phí${p.note ? ` (${p.note})` : ''}:`,
    ``,
    `  📚 Số buổi học : ${p.sessions} buổi`,
    `  💵 Đơn giá/buổi: ${p.pricePerSession.toLocaleString('vi-VN')}đ`,
    `  ─────────────────────────────`,
    `  💰 Tổng cộng   : ${p.total.toLocaleString('vi-VN')}đ`,
    ``,
    `Quý phụ huynh vui lòng thanh toán đúng hạn.`,
    `Trân trọng - Hicado Center 🌱`,
  ].join('\n');
}
```

### 3.2 Endpoint mới: `POST /api/zalo/send/custom-tuition`

**File:** `backend/src/routes/zalo.ts`

#### Request

```typescript
interface CustomTuitionItem {
  studentId:       string;
  sessions:        number;   // >= 1
  pricePerSession: number;   // >= 0, VNĐ
  totalOverride?:  number;   // nếu set, dùng thay vì sessions × price
  note?:           string;   // "Tháng 6/2026"
  classId?:        string;   // để log classId
}

interface CustomTuitionRequest {
  items:       CustomTuitionItem[];
  campaignId?: string;
  sendVia:     'AUTO' | 'CS' | 'ZNS';  // AUTO = ưu tiên CS nếu có zaloUserId
  templateId?: string;                  // cần nếu sendVia = 'ZNS'
}
```

#### Response

```typescript
interface CustomTuitionResponse {
  message:     string;
  sentCount:   number;
  failedCount: number;
  results: Array<{
    studentId:   string;
    studentName: string;
    status:      'SENT' | 'FAILED' | 'SKIPPED';
    total:       number;
    channel:     'CS' | 'ZNS' | 'NONE';
    error?:      string;
  }>;
}
```

#### Implementation tóm tắt

```typescript
router.post('/send/custom-tuition', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { items, campaignId, sendVia = 'AUTO', templateId } = req.body;

  // 1. Validate: items non-empty, sessions >= 1, pricePerSession >= 0
  // 2. Load students by IDs
  // 3. For each item:
  //    a. Tính total = totalOverride ?? sessions * pricePerSession
  //    b. Build messageText = buildCustomTuitionMessage(student.name, payload)
  //    c. Gửi qua CS (nếu zaloUserId) hoặc ZNS (nếu phone + templateId)
  //    d. Tạo ZaloMessageLog với:
  //       - messageType: 'CUSTOM_TUITION'
  //       - customPayload: JSON.stringify({ sessions, pricePerSession, total, note })
  //       - coveredClassIds: item.classId ? [item.classId] : []
  // 4. Return results array + sentCount/failedCount
});
```

### 3.3 Cập nhật `POST /send/tuition` (endpoint hiện có)

Bổ sung nhận `coveredClassIds` để tương thích Task 10:

```typescript
// Khi tạo ZaloMessageLog, thay classId standalone bằng:
await prisma.zaloMessageLog.create({
  data: {
    ...existingFields,
    classId: req.body.primaryClassId || null,
    coveredClassIds: (req.body.coveredClassIds as string[]) ?? (primaryClassId ? [primaryClassId] : []),
    messageType: 'TUITION_REMINDER',
  }
});
```

---

## 4. Task 10 — Backend: Quản lý HP đa lớp

### 4.1 `GET /api/zalo/tuition/check-sent`

Kiểm tra một học sinh đã được gửi HP cho một lớp cụ thể chưa (bất kể lớp đó được gửi riêng hay gộp chung).

```typescript
// GET /api/zalo/tuition/check-sent?studentId=XXX&classId=YYY
router.get('/tuition/check-sent', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { studentId, classId } = req.query as { studentId: string; classId: string };

  // Dùng Postgres array contains: coveredClassIds @> ARRAY['classId']
  const logs = await prisma.$queryRaw<Array<{
    id: string; sentAt: Date; coveredClassIds: string[]; messageType: string | null;
  }>>`
    SELECT id, "sentAt", "coveredClassIds", "messageType"
    FROM "ZaloMessageLog"
    WHERE "studentId" = ${studentId}
      AND status = 'SENT'
      AND "coveredClassIds" @> ARRAY[${classId}]::text[]
    ORDER BY "sentAt" DESC
    LIMIT 5
  `;

  if (logs.length === 0) return res.json({ alreadySent: false });

  // Resolve tên lớp
  const allClassIds = [...new Set(logs.flatMap(l => l.coveredClassIds))];
  const classes = await prisma.class.findMany({ where: { id: { in: allClassIds } }, select: { id: true, name: true } });
  const classMap = new Map(classes.map(c => [c.id, c.name]));

  res.json({
    alreadySent: true,
    logs: logs.map(l => ({
      logId: l.id,
      sentAt: l.sentAt,
      messageType: l.messageType,
      coveredClassIds: l.coveredClassIds,
      coveredClassNames: l.coveredClassIds.map(id => classMap.get(id) ?? id),
    }))
  });
});
```

**Response mẫu:**
```json
{
  "alreadySent": true,
  "logs": [{
    "logId": "uuid...",
    "sentAt": "2026-05-01T08:30:00.000Z",
    "messageType": "TUITION_REMINDER",
    "coveredClassIds": ["class-a-id", "class-b-id"],
    "coveredClassNames": ["Toán Nâng Cao", "Anh Văn"]
  }]
}
```

### 4.2 `GET /api/zalo/tuition/preview-multiclass`

Dùng trong wizard step 2: với một lớp đang xét, trả về danh sách học sinh + lớp khác đang học + điểm danh + trạng thái đã gửi.

```typescript
// GET /api/zalo/tuition/preview-multiclass?classId=XXX&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
router.get('/tuition/preview-multiclass', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { classId, fromDate, toDate } = req.query as Record<string, string>;

  const from = fromDate ? new Date(fromDate) : null;
  const to   = toDate   ? new Date(toDate)   : null;
  if (from) from.setHours(0,0,0,0);
  if (to)   to.setHours(23,59,59,999);

  // Load học sinh trong lớp + các lớp khác + điểm danh trong kỳ
  const classStudents = await prisma.classStudent.findMany({
    where: { classId },
    include: {
      student: {
        include: {
          classes: { include: { class: { select: { id: true, name: true, classCode: true, tuitionPerSession: true } } } },
          attendances: {
            where: { status: 'PRESENT', ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
            select: { classId: true, sessionUnits: true }
          }
        }
      }
    }
  });

  const results = await Promise.all(classStudents.map(async cs => {
    const s = cs.student;
    const mainAttended = s.attendances.filter(a => a.classId === classId).reduce((sum, a) => sum + (a.sessionUnits ?? 1), 0);
    const mainClass = s.classes.find(c => c.classId === classId);

    const otherClasses = s.classes
      .filter(c => c.classId !== classId)
      .map(c => {
        const attended = s.attendances.filter(a => a.classId === c.classId).reduce((sum, a) => sum + (a.sessionUnits ?? 1), 0);
        return { classId: c.classId, className: c.class.name, classCode: c.class.classCode, attended, tuitionPerSession: c.class.tuitionPerSession, subtotal: attended * c.class.tuitionPerSession };
      });

    // Check sent
    const sentLogs = await prisma.$queryRaw<Array<{ sentAt: Date; coveredClassIds: string[] }>>`
      SELECT "sentAt", "coveredClassIds"
      FROM "ZaloMessageLog"
      WHERE "studentId" = ${s.id} AND status = 'SENT'
        AND "coveredClassIds" @> ARRAY[${classId}]::text[]
      ORDER BY "sentAt" DESC LIMIT 3
    `;

    return {
      studentId: s.id, studentName: s.name, studentCode: s.studentCode,
      hasZalo: !!s.zaloUserId,
      mainClass: { classId, attended: mainAttended, tuitionPerSession: mainClass?.class.tuitionPerSession ?? 0 },
      otherClasses,
      alreadySent: sentLogs.length > 0,
      sentLogs: sentLogs.map(l => ({ sentAt: l.sentAt, coveredClassIds: l.coveredClassIds }))
    };
  }));

  res.json(results);
});
```

### 4.3 `POST /api/zalo/tuition/batch-check-sent`

Load trạng thái đã gửi cho toàn bộ danh sách học sinh cùng lúc (hiệu quả hơn gọi check-sent từng em):

```typescript
// POST body: { studentIds: string[], classId: string }
router.post('/tuition/batch-check-sent', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { studentIds, classId } = req.body;

  const logs = await prisma.$queryRaw<Array<{ studentId: string; sentAt: Date; coveredClassIds: string[] }>>`
    SELECT DISTINCT ON ("studentId") "studentId", "sentAt", "coveredClassIds"
    FROM "ZaloMessageLog"
    WHERE "studentId" = ANY(${studentIds}::text[])
      AND status = 'SENT'
      AND "coveredClassIds" @> ARRAY[${classId}]::text[]
    ORDER BY "studentId", "sentAt" DESC
  `;

  const result: Record<string, { alreadySent: boolean; sentAt?: Date; coveredClassIds?: string[] }> = {};
  for (const sid of studentIds) result[sid] = { alreadySent: false };
  for (const log of logs) result[log.studentId] = { alreadySent: true, sentAt: log.sentAt, coveredClassIds: log.coveredClassIds };

  res.json(result);
});
```

### 4.4 Cập nhật `POST /api/campaigns` (campaigns.ts)

Nhận `studentCoveredClasses` per-student từ frontend khi tạo campaign:

```typescript
// Trong body: filters.studentCoveredClasses = { [studentId]: classId[] }
// Khi tạo log cho mỗi học sinh:
const covered = filters?.studentCoveredClasses?.[student.id] ?? (primaryClassId ? [primaryClassId] : []);
await prisma.zaloMessageLog.create({
  data: { ...existingFields, classId: primaryClassId, coveredClassIds: covered, messageType: 'TUITION_REMINDER' }
});
```

---

## 5. Task 9 — Frontend: Wizard CUSTOM_TUITION

### 5.1 Types mới

```typescript
type CampaignType = 'TUITION_REMINDER' | 'GENERAL' | 'CUSTOM_TUITION';

interface CustomTuitionItem {
  studentId:        string;
  sessions:         number;
  pricePerSession:  number;
  totalOverride?:   number;  // undefined = dùng sessions × price
  note:             string;
  classId?:         string;
}
```

### 5.2 State cần thêm

```typescript
const [customItems, setCustomItems] = useState<CustomTuitionItem[]>([]);
const [customSendVia, setCustomSendVia] = useState<'AUTO' | 'CS' | 'ZNS'>('AUTO');
const [customResult, setCustomResult] = useState<any>(null);

const getEffectiveTotal = (item: CustomTuitionItem) =>
  item.totalOverride ?? (item.sessions * item.pricePerSession);

const updateItem = (studentId: string, field: keyof CustomTuitionItem, value: any) =>
  setCustomItems(prev => prev.map(i =>
    i.studentId === studentId ? { ...i, [field]: value, ...(field !== 'totalOverride' ? { totalOverride: undefined } : {}) } : i
  ));

const grandTotal = customItems.reduce((sum, i) => sum + getEffectiveTotal(i), 0);
```

### 5.3 Bước chọn loại wizard (bước 1 — thêm card mới)

```tsx
// Trong bước 1, thêm card thứ 3:
<button onClick={() => setWizardType('CUSTOM_TUITION')}
  className={wizardType === 'CUSTOM_TUITION' ? 'ring-2 ring-hicado-emerald ...' : '...'}>
  <span>💰 Thu HP thủ công</span>
  <p className="text-xs">Tự nhập số buổi & đơn giá. Dùng để thu trước đầu tháng.</p>
</button>
```

### 5.4 Bước 3 — Bảng nhập liệu (chỉ cho CUSTOM_TUITION)

Đây là bước trọng tâm. Hiển thị bảng 1 hàng/học sinh:

```
┌──────────────────┬──────────┬──────────────────┬──────────────────┬──────────────────┬──────────────────────┐
│ Họ tên HS        │ Lớp      │ Số buổi          │ Đơn giá/buổi    │ Tổng cộng        │ Ghi chú              │
├──────────────────┼──────────┼──────────────────┼──────────────────┼──────────────────┼──────────────────────┤
│ Nguyễn Văn A    │ Toán     │ [  8  ] ▲▼       │ [150,000] ▲▼   │ 1.200.000đ ✏️   │ [Tháng 5/2026]       │
│ Trần Thị B      │ Anh      │ [  6  ] ▲▼       │ [120,000] ▲▼   │  720.000đ ✏️   │ [Tháng 5/2026]       │
├──────────────────┴──────────┴──────────────────┴──────────────────┼──────────────────┴──────────────────────┤
│                                                   Tổng tất cả:    │ 1.920.000đ                               │
└──────────────────────────────────────────────────────────────────┴──────────────────────────────────────────┘
```

**Quy tắc UX:**
- Cột Tổng cộng: tự động = sessions × price. Icon ✏️ để override thủ công.
- Khi `totalOverride` được set: ô đổi màu vàng kèm tooltip "Giá trị thủ công".
- Nút phía trên bảng: "Đặt số buổi chung" và "Đặt đơn giá chung" → áp cho tất cả.
- Cột Ghi chú: mặc định `Tháng M/YYYY`, có thể sửa từng em.

### 5.5 Bước 4 — Preview tin nhắn

```typescript
const buildPreviewText = (studentName: string, item: CustomTuitionItem) => {
  const total = getEffectiveTotal(item);
  return [
    `Kính gửi phụ huynh em ${studentName}!`,
    ``,
    `Trung tâm Hicado xin thông báo học phí${item.note ? ` (${item.note})` : ''}:`,
    ``,
    `  📚 Số buổi: ${item.sessions} buổi`,
    `  💵 Đơn giá: ${item.pricePerSession.toLocaleString('vi-VN')}đ/buổi`,
    `  ─────────────────────`,
    `  💰 Tổng:    ${total.toLocaleString('vi-VN')}đ`,
    ``,
    `Vui lòng thanh toán đúng hạn. Trân trọng - Hicado 🌱`,
  ].join('\n');
};
```

Hiển thị dạng accordion: mỗi học sinh 1 panel, click để expand xem preview text. Badge "📱 CS" / "📨 ZNS" / "❌ Không gửi được" cho từng em.

### 5.6 Bước 5 — Gửi

```typescript
const sendCustomTuition = async () => {
  const res = await fetch('/api/zalo/send/custom-tuition', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      items: customItems.map(i => ({
        studentId: i.studentId, sessions: i.sessions,
        pricePerSession: i.pricePerSession,
        totalOverride: i.totalOverride,
        note: i.note, classId: i.classId,
      })),
      sendVia: customSendVia,
    })
  });
  setCustomResult(await res.json());
};
```

---

## 6. Task 10 — Frontend: Luồng đa lớp trong wizard

### 6.1 State mới

```typescript
interface MulticlassStudentData {
  otherClasses: Array<{
    classId: string; className: string; classCode?: string;
    attended: number; tuitionPerSession: number; subtotal: number;
  }>;
  alreadySent: boolean;
  sentLogs: Array<{ sentAt: string; coveredClassIds: string[] }>;
}

interface StudentMergeOption {
  mode: 'SINGLE' | 'MERGE';
  extraClassIds: string[];
}

const [multiclassData, setMulticlassData] = useState<Record<string, MulticlassStudentData>>({});
const [mergeOptions, setMergeOptions] = useState<Record<string, StudentMergeOption>>({});

const getMerge = (sid: string): StudentMergeOption =>
  mergeOptions[sid] ?? { mode: 'SINGLE', extraClassIds: [] };
```

### 6.2 Load data đa lớp khi vào bước 2

```typescript
useEffect(() => {
  if (wizardType === 'TUITION_REMINDER' && step === 2 && wizardClassIds[0]) {
    fetch(`/api/zalo/tuition/preview-multiclass?classId=${wizardClassIds[0]}&fromDate=${wizardFromDate}&toDate=${wizardToDate}`, { headers: authHeaders })
      .then(r => r.json())
      .then((data: any[]) => {
        const map: Record<string, MulticlassStudentData> = {};
        for (const item of data) map[item.studentId] = item;
        setMulticlassData(map);
      });
  }
}, [step, wizardClassIds, wizardFromDate, wizardToDate]);
```

### 6.3 Expandable row cho học sinh đa lớp

Trong bảng chọn học sinh, mỗi hàng có badge và expandable section:

**3 mức badge:**
```
✓ Bình thường (1 lớp, chưa gửi)    → không badge
🏫 Học X lớp (đa lớp, chưa gửi)   → badge xanh
⚠️ Đã gửi HP lớp khác             → badge vàng
🚫 Đã gửi HP lớp này              → badge đỏ + strikethrough option
```

**Expanded panel (khi click badge 🏫 hoặc ⚠️):**

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Học sinh này đang học thêm 1 lớp khác. Lần này gửi như thế nào?         │
│                                                                          │
│   ◉ Chỉ gửi lớp Toán (8 buổi × 150.000đ = 1.200.000đ)                  │
│                                                                          │
│   ○ Gộp thêm lớp Anh Văn                                                │
│       Anh Văn: 6 buổi × 120.000đ = 720.000đ                             │
│       Tổng gộp: 1.920.000đ                                              │
└──────────────────────────────────────────────────────────────────────────┘
```

**Warning khi đã gửi:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ⚠️  Học sinh này đã được gửi HP lớp Toán ngày 01/05/2026                │
│     (batch gồm: Toán + Anh Văn)                                         │
│                                                                          │
│     [Bỏ qua học sinh này]   [Vẫn gửi lại]                              │
└──────────────────────────────────────────────────────────────────────────┘
```

### 6.4 Bảng Preview (bước 4) — cột coveredClassIds

```
┌──────────────────┬────────────────────────────┬────────────┬──────────────┐
│ Học sinh          │ Lớp sẽ được cover           │ Tổng HP    │ Trạng thái   │
├──────────────────┼────────────────────────────┼────────────┼──────────────┤
│ Nguyễn Văn A    │ Toán + Anh Văn (gộp)       │ 1.920.000đ │ ✓ Sẵn gửi   │
│ Trần Thị B      │ Toán                        │ 1.200.000đ │ ✓ Sẵn gửi   │
│ Lê Văn C        │ Toán (ghi đè)               │ 800.000đ   │ ⚠️ Đã gửi   │
└──────────────────┴────────────────────────────┴────────────┴──────────────┘
```

### 6.5 Build coveredClassIds khi submit

```typescript
const buildStudentCoveredClasses = () => {
  const result: Record<string, string[]> = {};
  for (const sid of selectedStudentIds) {
    const opt = getMerge(sid);
    result[sid] = opt.mode === 'MERGE'
      ? [wizardClassIds[0], ...opt.extraClassIds]
      : [wizardClassIds[0]];
  }
  return result;
};

// Trong body của POST /api/campaigns:
filters: { ...existingFilters, studentCoveredClasses: buildStudentCoveredClasses() }
```

---

## 7. Thứ tự triển khai

### Phase 1 — Database (Ngày 1)

```
1. Thêm 3 trường vào schema.prisma (messageType, customPayload, coveredClassIds)
2. npx prisma migrate dev --name add_custom_tuition_multiclass
3. Verify GIN index được tạo: \d "ZaloMessageLog" trong psql
4. Test thủ công: INSERT với coveredClassIds='{"A","B"}' → SELECT WHERE coveredClassIds @> ARRAY['B']
```

### Phase 2 — Backend Task #9 (Ngày 1–2)

```
5. Tạo backend/src/lib/zaloMessage.ts với buildCustomTuitionMessage
6. Thêm POST /api/zalo/send/custom-tuition
7. Update POST /send/tuition: nhận + lưu coveredClassIds
8. Test curl: gửi 2 items (1 có zaloUserId, 1 chỉ có phone) → verify log DB
```

### Phase 3 — Backend Task #10 (Ngày 2–3)

```
9.  GET /api/zalo/tuition/check-sent
10. GET /api/zalo/tuition/preview-multiclass
11. POST /api/zalo/tuition/batch-check-sent
12. Cập nhật POST /api/campaigns nhận studentCoveredClasses
13. Test: tạo log giả coveredClassIds=['A','B'] → check-sent với classId='B' → alreadySent=true
14. Test: check-sent với classId='C' → alreadySent=false
```

### Phase 4 — Frontend Task #9 (Ngày 3–4)

```
15. Thêm CampaignType 'CUSTOM_TUITION'
16. Thêm state customItems, updateItem, getEffectiveTotal
17. Thêm card chọn loại trong wizard step 1
18. Build step 3: bảng nhập liệu (sessions, price, total, note)
19. Build preview text function + step 4 accordion preview
20. Step 5: gọi POST /api/zalo/send/custom-tuition + hiện kết quả
```

### Phase 5 — Frontend Task #10 (Ngày 4–5)

```
21. Thêm state multiclassData, mergeOptions
22. Load preview-multiclass khi vào step 2
23. Render badge 3 mức trên mỗi hàng học sinh
24. Expandable panel: radio SINGLE/MERGE + breakdown
25. Warning panel khi alreadySent=true
26. Cập nhật bảng preview step 4 thêm cột coveredClassIds
27. buildStudentCoveredClasses + tích hợp vào handleSendCampaign
```

### Phase 6 — QA (Ngày 5–6)

```
28. Scenario đầy đủ Task 10:
    a. HS học lớp A+B → gửi A+B → log coveredClassIds=['A','B']
    b. Gửi lớp B → badge đỏ cho HS đó
    c. Gửi lớp C → bình thường (không cảnh báo)
29. Scenario Task 9: gửi với totalOverride → verify tin nhắn dùng override
30. Test edge cases (xem mục 8)
```

---

## 8. Rủi ro & Edge Cases

| # | Tình huống | Rủi ro | Giải pháp |
|---|---|---|---|
| 1 | Click gửi 2 lần nhanh | Tạo 2 log trùng | `trackingId UNIQUE` đã có. Frontend: disable nút ngay sau click đầu |
| 2 | HS không có Zalo UID và phone | Không gửi được | Badge "❌" trong preview, loại khỏi sentCount, không crash |
| 3 | HS học 3+ lớp, gộp tất cả | Message dài quá 4000 ký tự Zalo | Cap message: nếu > 3 lớp, gộp tóm tắt "X lớp, tổng Y buổi" |
| 4 | Admin gửi A+B, sau đó gửi B+C cùng HS | HS đã có log cover B | check-sent trả alreadySent=true. Admin xác nhận ghi đè mới gửi |
| 5 | totalOverride = 0 (miễn học phí) | Gửi tin "0đ" gây nhầm | Warning "Tổng = 0đ, xác nhận?" trong step 5 trước khi send |
| 6 | GIN index không được tạo tự động | Query @> chậm | Thêm CREATE INDEX vào migration SQL, không chỉ schema.prisma |
| 7 | Access token Zalo hết hạn giữa batch | Một số HS gửi được, số khác không | Log từng item riêng, retry sau: `POST /retry-failed?logIds=[]` (Phase 2 sau) |
| 8 | customPayload JSON corrupt | Crash khi parse lại | `try { JSON.parse } catch { return {} }` ở mọi nơi đọc customPayload |
| 9 | Campaign dùng nhiều classIds | preview-multiclass chỉ nhận 1 classId | Gọi parallel nhiều classId, merge kết quả client-side |
| 10 | HS rời lớp giữa kỳ | preview-multiclass trả lớp cũ | ClassStudent query là real-time — nếu đã unlink thì không hiện |

---

## Tóm tắt files cần thay đổi

| File | Thay đổi |
|---|---|
| `backend/prisma/schema.prisma` | Thêm `messageType`, `customPayload`, `coveredClassIds` vào ZaloMessageLog |
| `backend/prisma/migrations/xxx/migration.sql` | SQL thêm 3 cột + GIN index |
| `backend/src/lib/zaloMessage.ts` | **Tạo mới** — `buildCustomTuitionMessage` |
| `backend/src/routes/zalo.ts` | Thêm 3 endpoint mới + update `/send/tuition` |
| `backend/src/routes/campaigns.ts` | Nhận `studentCoveredClasses`, lưu `coveredClassIds` per log |
| `ui_components/src/views/pages/zalo-campaign/zalo-campaign.tsx` | Toàn bộ wizard CUSTOM_TUITION + đa lớp logic |
