# Zalo Manual User Mapping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép admin/manager tự tay gán `zalo_user_id` cho học sinh hoặc giáo viên, với phát hiện conflict 1-1, override có xác nhận, và audit log bắt buộc.

**Architecture:** Nâng cấp endpoint `/api/zalo/link` + `/api/zalo/link` DELETE hiện có để thêm conflict detection và audit log. Thêm endpoint candidates search mới. Thêm tab "Ghép danh tính" vào `zalo-campaign.tsx`.

**Tech Stack:** Node.js + Express + Prisma (PostgreSQL) · React + TypeScript + Tailwind · express-rate-limit

---

## File Map

| File | Thay đổi |
|------|---------|
| `backend/prisma/schema.prisma` | Thêm `@unique` trên `zaloUserId` (Student + Teacher) + model `ZaloMappingAudit` |
| `backend/src/routes/zalo.ts` | Thêm `GET /mapping/candidates`, nâng cấp `POST /link`, `DELETE /link` |
| `backend/src/middleware/rateLimit.ts` | **Tạo mới** — rate limiter cho candidates search |
| `backend/src/index.ts` | Mount rate limiter |
| `ui_components/src/views/pages/zalo-campaign/zalo-campaign.tsx` | Thêm tab `'mapping'`, state + fetch candidates, link/unlink flow |

---

## Task 1 — Schema: unique constraint + ZaloMappingAudit

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Run: `npx prisma migrate dev`

- [ ] **Bước 1: Thêm `@unique` vào zaloUserId trên Student và Teacher**

Tìm model `Student` trong `backend/prisma/schema.prisma`. Đổi dòng:
```prisma
zaloUserId    String?
```
thành:
```prisma
zaloUserId    String?   @unique
```

Làm tương tự cho model `Teacher`.

- [ ] **Bước 2: Thêm model ZaloMappingAudit**

Thêm vào cuối `schema.prisma` (trước dòng cuối nếu có):

```prisma
model ZaloMappingAudit {
  id                 String   @id @default(cuid())
  action             String   // "LINK" | "UNLINK" | "OVERRIDE"
  zaloUserId         String
  targetType         String   // "STUDENT" | "TEACHER"
  targetId           String
  targetName         String
  previousTargetId   String?  // khi OVERRIDE: id của target cũ đang giữ zaloUserId này
  previousTargetName String?
  performedBy        String   // userId của admin/manager
  performedByName    String
  performedAt        DateTime @default(now())

  @@index([zaloUserId])
  @@index([targetId])
  @@index([performedAt])
}
```

- [ ] **Bước 3: Chạy migration**

```bash
cd backend
npx prisma migrate dev --name add_zalo_mapping_unique_and_audit
```

Expected output: `✔ Generated Prisma Client`

Nếu có lỗi unique violation do dữ liệu cũ bị trùng `zaloUserId`, chạy script cleanup trước:
```sql
-- Chạy trong prisma studio hoặc psql
UPDATE "Student" SET "zaloUserId" = NULL WHERE "zaloUserId" IN (
  SELECT "zaloUserId" FROM "Student" WHERE "zaloUserId" IS NOT NULL
  GROUP BY "zaloUserId" HAVING COUNT(*) > 1
);
UPDATE "Teacher" SET "zaloUserId" = NULL WHERE "zaloUserId" IN (
  SELECT "zaloUserId" FROM "Teacher" WHERE "zaloUserId" IS NOT NULL
  GROUP BY "zaloUserId" HAVING COUNT(*) > 1
);
```

- [ ] **Bước 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(db): unique zaloUserId + ZaloMappingAudit table"
```

---

## Task 2 — Backend: Rate Limit middleware

**Files:**
- Create: `backend/src/middleware/rateLimit.ts`
- Modify: `backend/src/index.ts`

- [ ] **Bước 1: Cài package**

```bash
cd backend
npm install express-rate-limit
```

- [ ] **Bước 2: Tạo file middleware**

Tạo `backend/src/middleware/rateLimit.ts`:

```typescript
import rateLimit from 'express-rate-limit';

export const zaloSearchLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 phút
  max: 30,                    // tối đa 30 request/phút/IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Quá nhiều yêu cầu tìm kiếm, thử lại sau 1 phút.' },
});
```

- [ ] **Bước 3: Mount trong index.ts**

Trong `backend/src/index.ts`, tìm chỗ import routes và thêm:
```typescript
import { zaloSearchLimiter } from './middleware/rateLimit';
```

Ngay trước hoặc sau dòng mount route Zalo, thêm:
```typescript
app.use('/api/zalo/mapping/candidates', zaloSearchLimiter);
```

- [ ] **Bước 4: Commit**

```bash
git add backend/src/middleware/rateLimit.ts backend/src/index.ts backend/package.json backend/package-lock.json
git commit -m "feat(api): rate limit 30rpm for Zalo candidate search"
```

---

## Task 3 — Backend: GET /mapping/candidates

**Files:**
- Modify: `backend/src/routes/zalo.ts`

Endpoint này trả danh sách học sinh hoặc giáo viên, kèm trạng thái ghép Zalo và thông tin conflict.

- [ ] **Bước 1: Thêm route vào `backend/src/routes/zalo.ts`**

Thêm đoạn sau vào trước `// 4. Link a Zalo user_id`:

```typescript
// 3b. Candidates for manual mapping
router.get('/mapping/candidates', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { type = 'STUDENTS', search = '', page = '1' } = req.query as Record<string, string>;
    const PAGE = 20;
    const skip = (Math.max(1, Number(page)) - 1) * PAGE;
    const where = search
      ? { name: { contains: search, mode: 'insensitive' as const } }
      : {};

    if (type === 'TEACHERS') {
      const [items, total] = await Promise.all([
        prisma.teacher.findMany({
          where,
          skip,
          take: PAGE,
          select: { id: true, name: true, phone: true, zaloUserId: true },
          orderBy: { name: 'asc' },
        }),
        prisma.teacher.count({ where }),
      ]);
      return res.json({ type: 'TEACHERS', items, total, page: Number(page), pageSize: PAGE });
    }

    // STUDENTS
    const [items, total] = await Promise.all([
      prisma.student.findMany({
        where,
        skip,
        take: PAGE,
        select: { id: true, name: true, parentPhone: true, schoolClass: true, zaloUserId: true },
        orderBy: { name: 'asc' },
      }),
      prisma.student.count({ where }),
    ]);
    res.json({ type: 'STUDENTS', items, total, page: Number(page), pageSize: PAGE });
  } catch (err: any) {
    res.status(500).json({ message: 'Lỗi lấy danh sách candidates: ' + err.message });
  }
});
```

- [ ] **Bước 2: Verify TypeScript compile**

```bash
cd backend && npx tsc --noEmit
```

Expected: no output (no errors).

- [ ] **Bước 3: Commit**

```bash
git add backend/src/routes/zalo.ts
git commit -m "feat(api): GET /zalo/mapping/candidates with search + pagination"
```

---

## Task 4 — Backend: Nâng cấp POST /link (conflict + audit)

**Files:**
- Modify: `backend/src/routes/zalo.ts`

Logic mới của `POST /link`:
1. Chuẩn hóa `zaloUserId` (trim + lowercase).
2. Kiểm tra conflict: có student/teacher nào khác đang dùng `zaloUserId` này chưa?
3. Nếu conflict và `force !== true`: trả 409 với thông tin conflict.
4. Nếu `force === true` hoặc không có conflict: thực hiện mapping + ghi `ZaloMappingAudit`.

- [ ] **Bước 1: Thay thế route `POST /link` hiện tại**

Tìm và thay toàn bộ block `router.post('/link', ...)` (lines ~124-141) bằng:

```typescript
// 4. Link a Zalo user_id to a teacher or student (with conflict detection + audit)
router.post('/link', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { zaloUserId: rawId, teacherId, studentId, force = false } = req.body;
  if (!rawId || (!teacherId && !studentId)) {
    return res.status(400).json({ message: 'Cần zaloUserId và teacherId hoặc studentId' });
  }

  const zaloUserId = String(rawId).trim().toLowerCase();
  const user = (req as any).user as { userId: string; name: string; role: string };

  try {
    // Conflict check: is this zaloUserId already used by someone else?
    const [existingStudent, existingTeacher] = await Promise.all([
      prisma.student.findUnique({ where: { zaloUserId }, select: { id: true, name: true } }),
      prisma.teacher.findUnique({ where: { zaloUserId }, select: { id: true, name: true } }),
    ]);

    const conflictTarget = existingStudent ?? existingTeacher;
    const conflictType = existingStudent ? 'STUDENT' : existingTeacher ? 'TEACHER' : null;

    // Conflict exists and is NOT the same target being re-linked
    const isSameTarget =
      (studentId && existingStudent?.id === studentId) ||
      (teacherId && existingTeacher?.id === teacherId);

    if (conflictTarget && !isSameTarget && !force) {
      return res.status(409).json({
        conflict: true,
        message: `zalo_user_id này đang được ghép với ${conflictType === 'STUDENT' ? 'học sinh' : 'giáo viên'} "${conflictTarget.name}". Xác nhận override?`,
        conflictType,
        conflictId: conflictTarget.id,
        conflictName: conflictTarget.name,
      });
    }

    // Resolve target details for audit
    let targetName = '';
    let targetId = '';
    let targetType = '';
    let previousTargetId: string | undefined;
    let previousTargetName: string | undefined;

    if (teacherId) {
      const teacher = await prisma.teacher.findUnique({ where: { id: teacherId }, select: { name: true } });
      if (!teacher) return res.status(404).json({ message: 'Không tìm thấy giáo viên' });
      targetName = teacher.name;
      targetId = teacherId;
      targetType = 'TEACHER';
      if (conflictTarget && !isSameTarget) {
        previousTargetId = conflictTarget.id;
        previousTargetName = conflictTarget.name;
      }
      await prisma.teacher.update({ where: { id: teacherId }, data: { zaloUserId } });
    } else {
      const student = await prisma.student.findUnique({ where: { id: studentId }, select: { name: true } });
      if (!student) return res.status(404).json({ message: 'Không tìm thấy học sinh' });
      targetName = student.name;
      targetId = studentId;
      targetType = 'STUDENT';
      if (conflictTarget && !isSameTarget) {
        previousTargetId = conflictTarget.id;
        previousTargetName = conflictTarget.name;
      }
      await prisma.student.update({ where: { id: studentId }, data: { zaloUserId } });
    }

    // If override: clear old target's zaloUserId
    if (conflictTarget && !isSameTarget && force) {
      if (conflictType === 'STUDENT') {
        await prisma.student.update({ where: { id: conflictTarget.id }, data: { zaloUserId: null } });
      } else {
        await prisma.teacher.update({ where: { id: conflictTarget.id }, data: { zaloUserId: null } });
      }
    }

    // Audit log
    await prisma.zaloMappingAudit.create({
      data: {
        action: conflictTarget && !isSameTarget ? 'OVERRIDE' : 'LINK',
        zaloUserId,
        targetType,
        targetId,
        targetName,
        previousTargetId,
        previousTargetName,
        performedBy: user.userId,
        performedByName: user.name ?? user.userId,
      },
    });

    res.json({ message: 'Liên kết thành công!', zaloUserId, targetId, targetType });
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'zalo_user_id này đã được dùng bởi người khác (unique constraint).' });
    }
    res.status(500).json({ message: 'Lỗi liên kết: ' + err.message });
  }
});
```

- [ ] **Bước 2: Verify TypeScript compile**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Bước 3: Commit**

```bash
git add backend/src/routes/zalo.ts
git commit -m "feat(api): POST /zalo/link with 1-1 conflict detection, override + audit log"
```

---

## Task 5 — Backend: Nâng cấp DELETE /link (audit log)

**Files:**
- Modify: `backend/src/routes/zalo.ts`

- [ ] **Bước 1: Thay thế route `DELETE /link` hiện tại**

Tìm và thay block `router.delete('/link', ...)` bằng:

```typescript
// 4b. Unlink: remove zaloUserId with audit log
router.delete('/link', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const { studentId, teacherId } = req.body;
  if (!studentId && !teacherId) return res.status(400).json({ message: 'Cần studentId hoặc teacherId' });

  const user = (req as any).user as { userId: string; name: string };

  try {
    let targetName = '';
    let targetId = '';
    let targetType = '';
    let zaloUserId = '';

    if (studentId) {
      const student = await prisma.student.findUnique({ where: { id: studentId }, select: { name: true, zaloUserId: true } });
      if (!student) return res.status(404).json({ message: 'Không tìm thấy học sinh' });
      targetName = student.name;
      targetId = studentId;
      targetType = 'STUDENT';
      zaloUserId = student.zaloUserId ?? '';
      await prisma.student.update({ where: { id: studentId }, data: { zaloUserId: null } });
    } else {
      const teacher = await prisma.teacher.findUnique({ where: { id: teacherId }, select: { name: true, zaloUserId: true } });
      if (!teacher) return res.status(404).json({ message: 'Không tìm thấy giáo viên' });
      targetName = teacher.name;
      targetId = teacherId;
      targetType = 'TEACHER';
      zaloUserId = teacher.zaloUserId ?? '';
      await prisma.teacher.update({ where: { id: teacherId }, data: { zaloUserId: null } });
    }

    await prisma.zaloMappingAudit.create({
      data: {
        action: 'UNLINK',
        zaloUserId,
        targetType,
        targetId,
        targetName,
        performedBy: user.userId,
        performedByName: user.name ?? user.userId,
      },
    });

    res.json({ message: 'Đã hủy liên kết' });
  } catch (err: any) {
    res.status(500).json({ message: 'Lỗi hủy liên kết: ' + err.message });
  }
});
```

- [ ] **Bước 2: Verify + commit**

```bash
cd backend && npx tsc --noEmit
git add backend/src/routes/zalo.ts
git commit -m "feat(api): DELETE /zalo/link with audit log"
```

---

## Task 6 — UI: Tab "Ghép danh tính" trong Zalo Campaign

**Files:**
- Modify: `ui_components/src/views/pages/zalo-campaign/zalo-campaign.tsx`

Thêm tab `'mapping'` với:
- Toggle STUDENTS / TEACHERS
- Search input (debounce 300ms)
- Bảng candidates: tên, thông tin phụ, trạng thái Zalo, nút Ghép/Hủy
- Modal xác nhận khi override (conflict 409)

- [ ] **Bước 1: Thêm kiểu và state**

Tìm `type MainTab = ...` và thêm `'mapping'`:
```typescript
type MainTab = 'campaigns' | 'create' | 'tracking' | 'followers' | 'config' | 'mapping';
```

Tìm phần khai báo state trong component (sau các useState hiện có), thêm:
```typescript
// Mapping tab state
const [mappingType, setMappingType] = useState<'STUDENTS' | 'TEACHERS'>('STUDENTS');
const [mappingSearch, setMappingSearch] = useState('');
const [mappingPage, setMappingPage] = useState(1);
const [mappingItems, setMappingItems] = useState<any[]>([]);
const [mappingTotal, setMappingTotal] = useState(0);
const [mappingLoading, setMappingLoading] = useState(false);
const [linkingId, setLinkingId] = useState<string | null>(null);
const [overrideConfirm, setOverrideConfirm] = useState<{
  zaloUserId: string;
  targetId: string;
  targetType: 'STUDENT' | 'TEACHER';
  conflictName: string;
  conflictId: string;
} | null>(null);
```

- [ ] **Bước 2: Thêm hàm fetchCandidates và debounce**

Thêm vào phần logic (sau fetchFollowers hoặc tương tự):
```typescript
const fetchCandidates = useCallback(async (type: string, search: string, page: number) => {
  if (!token) return;
  setMappingLoading(true);
  try {
    const params = new URLSearchParams({ type, search, page: String(page) });
    const r = await fetch(`/api/zalo/mapping/candidates?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) { setMappingItems([]); return; }
    const d = await r.json();
    setMappingItems(d.items);
    setMappingTotal(d.total);
  } catch {
    setMappingItems([]);
  } finally {
    setMappingLoading(false);
  }
}, [token]);

useEffect(() => {
  if (activeTab !== 'mapping') return;
  const t = setTimeout(() => fetchCandidates(mappingType, mappingSearch, mappingPage), 300);
  return () => clearTimeout(t);
}, [activeTab, mappingType, mappingSearch, mappingPage, fetchCandidates]);
```

- [ ] **Bước 3: Thêm hàm handleLink và handleUnlink**

```typescript
const handleLink = async (zaloUserId: string, targetId: string, targetType: 'STUDENTS' | 'TEACHERS', force = false) => {
  if (!token) return;
  setLinkingId(targetId);
  try {
    const body: Record<string, any> = { zaloUserId, force };
    if (targetType === 'STUDENTS') body.studentId = targetId;
    else body.teacherId = targetId;

    const r = await fetch('/api/zalo/link', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json();

    if (r.status === 409 && d.conflict) {
      setOverrideConfirm({
        zaloUserId,
        targetId,
        targetType: targetType === 'STUDENTS' ? 'STUDENT' : 'TEACHER',
        conflictName: d.conflictName,
        conflictId: d.conflictId,
      });
      return;
    }
    if (!r.ok) { alert(d.message || 'Lỗi liên kết'); return; }
    fetchCandidates(mappingType, mappingSearch, mappingPage);
  } finally {
    setLinkingId(null);
  }
};

const handleUnlink = async (targetId: string, targetType: 'STUDENTS' | 'TEACHERS') => {
  if (!token) return;
  setLinkingId(targetId);
  try {
    const body: Record<string, any> = {};
    if (targetType === 'STUDENTS') body.studentId = targetId;
    else body.teacherId = targetId;

    const r = await fetch('/api/zalo/link', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) { const d = await r.json(); alert(d.message || 'Lỗi hủy liên kết'); return; }
    fetchCandidates(mappingType, mappingSearch, mappingPage);
  } finally {
    setLinkingId(null);
  }
};
```

- [ ] **Bước 4: Thêm nút tab trong tab bar**

Tìm phần render các tab buttons (nơi có `campaigns`, `create`, `tracking`, `followers`, `config`) và thêm:
```tsx
<button
  onClick={() => setActiveTab('mapping')}
  className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${activeTab === 'mapping' ? 'bg-hicado-navy text-white shadow' : 'text-gray-500 hover:text-hicado-navy hover:bg-gray-100'}`}
>
  Ghép danh tính
</button>
```

- [ ] **Bước 5: Thêm JSX cho tab mapping**

Tìm phần `{activeTab === 'config' && ...}` và thêm sau nó:

```tsx
{activeTab === 'mapping' && (
  <div className="space-y-5">
    {/* Override confirm modal */}
    {overrideConfirm && (
      <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
          <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">⚠ Xung đột ghép danh tính</p>
          <p className="text-sm text-slate-700">
            Zalo ID này đang được ghép với <strong>{overrideConfirm.conflictName}</strong>.
            Bạn có muốn gỡ ghép đó và ghép lại không?
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setOverrideConfirm(null)}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              onClick={() => {
                const oc = overrideConfirm;
                setOverrideConfirm(null);
                handleLink(oc.zaloUserId, oc.targetId, mappingType, true);
              }}
              className="flex-1 py-2.5 bg-rose-500 text-white rounded-xl text-sm font-black hover:bg-rose-600"
            >
              Xác nhận Override
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Header + toggle */}
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
      <div>
        <p className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">Ghép danh tính thủ công</p>
        <h2 className="text-lg font-black text-hicado-navy mt-0.5">Liên kết Zalo → Hồ sơ</h2>
      </div>
      <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
        {(['STUDENTS', 'TEACHERS'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setMappingType(t); setMappingPage(1); setMappingSearch(''); }}
            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${mappingType === t ? 'bg-hicado-navy text-white shadow' : 'text-slate-500 hover:text-hicado-navy'}`}
          >
            {t === 'STUDENTS' ? 'Học sinh' : 'Giáo viên'}
          </button>
        ))}
      </div>
    </div>

    {/* Search */}
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <input
        type="text"
        value={mappingSearch}
        onChange={e => { setMappingSearch(e.target.value); setMappingPage(1); }}
        placeholder="Tìm theo tên..."
        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-hicado-emerald"
      />
    </div>

    {/* Table */}
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {mappingLoading ? (
        <div className="py-16 text-center text-slate-400 text-sm">Đang tải...</div>
      ) : mappingItems.length === 0 ? (
        <div className="py-16 text-center text-slate-400 text-sm">Không có kết quả</div>
      ) : (
        <table className="w-full text-left min-w-[600px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tên</th>
              <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Thông tin</th>
              <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Zalo ID</th>
              <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {mappingItems.map((item: any) => (
              <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-5 py-4 font-bold text-slate-800 text-sm">{item.name}</td>
                <td className="px-5 py-4 text-xs text-slate-500">
                  {mappingType === 'STUDENTS'
                    ? item.schoolClass || item.parentPhone || '—'
                    : item.phone || '—'}
                </td>
                <td className="px-5 py-4">
                  {item.zaloUserId ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-hicado-emerald/10 text-hicado-emerald text-[10px] font-black rounded-full border border-hicado-emerald/20 uppercase tracking-widest">
                      <span className="w-1.5 h-1.5 bg-hicado-emerald rounded-full"></span>
                      {item.zaloUserId.slice(0, 8)}…
                    </span>
                  ) : (
                    <span className="text-xs text-slate-300 italic">Chưa ghép</span>
                  )}
                </td>
                <td className="px-5 py-4 text-right">
                  {item.zaloUserId ? (
                    <button
                      disabled={linkingId === item.id}
                      onClick={() => handleUnlink(item.id, mappingType)}
                      className="px-3 py-1.5 border border-rose-200 text-rose-500 hover:bg-rose-50 rounded-lg text-xs font-bold transition-colors disabled:opacity-40"
                    >
                      {linkingId === item.id ? '...' : 'Hủy ghép'}
                    </button>
                  ) : (
                    <button
                      disabled={linkingId === item.id}
                      onClick={() => {
                        const zId = prompt('Nhập Zalo User ID:');
                        if (zId?.trim()) handleLink(zId.trim(), item.id, mappingType);
                      }}
                      className="px-3 py-1.5 bg-hicado-navy text-white hover:bg-hicado-navy/90 rounded-lg text-xs font-bold transition-colors disabled:opacity-40"
                    >
                      {linkingId === item.id ? '...' : 'Ghép'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Pagination */}
      {mappingTotal > 20 && (
        <div className="px-5 py-4 border-t border-slate-100 flex justify-between items-center">
          <p className="text-xs text-slate-400">{mappingTotal} kết quả</p>
          <div className="flex gap-2">
            <button disabled={mappingPage === 1} onClick={() => setMappingPage(p => p - 1)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs disabled:opacity-30">‹ Trước</button>
            <button disabled={mappingPage * 20 >= mappingTotal} onClick={() => setMappingPage(p => p + 1)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs disabled:opacity-30">Sau ›</button>
          </div>
        </div>
      )}
    </div>
  </div>
)}
```

- [ ] **Bước 6: TypeScript check + commit**

```bash
cd ui_components && npx tsc --noEmit
git add ui_components/src/views/pages/zalo-campaign/zalo-campaign.tsx
git commit -m "feat(ui): Zalo manual mapping tab — candidates search, link/unlink, override confirm"
```

---

## Task 7 — Backend: GET /mapping/audit-log (tuỳ chọn)

**Files:**
- Modify: `backend/src/routes/zalo.ts`

Cho phép admin xem lịch sử mapping changes.

- [ ] **Bước 1: Thêm route**

```typescript
// Audit log for mapping changes
router.get('/mapping/audit', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (_req, res) => {
  try {
    const logs = await prisma.zaloMappingAudit.findMany({
      orderBy: { performedAt: 'desc' },
      take: 50,
    });
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ message: 'Lỗi lấy audit log: ' + err.message });
  }
});
```

- [ ] **Bước 2: Commit**

```bash
git add backend/src/routes/zalo.ts
git commit -m "feat(api): GET /zalo/mapping/audit — 50 most recent mapping changes"
```

---

## Verification checklist

Sau khi deploy, test thủ công:

| Test case | Expected |
|-----------|----------|
| Ghép zaloUserId X → student A | Student A có zaloUserId X, audit log 1 dòng action=LINK |
| Ghép lại zaloUserId X → student B (force=false) | HTTP 409, modal conflict xuất hiện |
| Xác nhận Override | Student A mất X, student B được X, audit log action=OVERRIDE |
| Hủy ghép student B | Student B.zaloUserId = null, audit log action=UNLINK |
| Search "Nguyen" → TEACHERS | Chỉ trả giáo viên tên chứa "Nguyen" |
| Gọi candidates > 30 lần/phút | HTTP 429 "Quá nhiều yêu cầu" |
| STUDENT role gọi POST /link | HTTP 403 |
