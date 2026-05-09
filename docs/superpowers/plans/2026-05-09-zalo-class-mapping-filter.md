# Zalo Class Mapping Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm context lớp học vào quy trình ghép Zalo UID: sidebar lớp học với tỉ lệ đã ghép, filter candidates theo lớp + trạng thái, và badge cảnh báo trên wizard step 2.

**Architecture:**
- Endpoint mới `GET /api/zalo/mapping/class-stats` trả per-class stats (totalStudents, mappedStudents, mappedPercent).
- `GET /mapping/candidates` nhận thêm 2 params: `classId` (filter theo lớp) và `status` (ALL/LINKED/UNLINKED).
- Tab Mapping đổi thành **two-panel layout**: sidebar trái (danh sách lớp + stats) + panel phải (candidates grid — đã có, chỉ cần nối state).
- Wizard step 2: mỗi checkbox lớp hiển thị badge "X/Y" + icon cảnh báo nếu `mappedPercent < 100`.

**Tech Stack:** Node.js + Prisma · React + TypeScript · Tailwind CSS

---

## File Map

| File | Thay đổi |
|------|---------|
| `backend/src/routes/zalo.ts` | Thêm `GET /mapping/class-stats`; mở rộng `GET /mapping/candidates` để nhận `classId` và `status` |
| `ui_components/src/views/pages/zalo-campaign/zalo-campaign.tsx` | Thêm state `classStats`, `selectedMappingClass`, `mappingStatusFilter`; sửa `fetchCandidates`; đổi layout mapping tab; thêm badges wizard step 2 |

---

## Task 1 — Backend: `GET /mapping/class-stats`

**Files:**
- Modify: `backend/src/routes/zalo.ts` — thêm ngay sau route `/mapping/candidates` (dòng ~165)

- [ ] **Bước 1: Thêm route `/mapping/class-stats`**

```typescript
// GET /mapping/class-stats — per-class zalo mapping stats (students only)
router.get('/mapping/class-stats', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const classes = await prisma.class.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        classCode: true,
        students: {
          where: { student: { isActive: true } },
          select: { student: { select: { zaloUserId: true } } },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const stats = classes.map(cls => {
      const total = cls.students.length;
      const mapped = cls.students.filter(s => !!s.student.zaloUserId).length;
      return {
        classId: cls.id,
        className: cls.name,
        classCode: cls.classCode,
        totalStudents: total,
        mappedStudents: mapped,
        mappedPercent: total === 0 ? 100 : Math.round((mapped / total) * 100),
      };
    });

    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ message: 'Lỗi lấy class stats: ' + err.message });
  }
});
```

- [ ] **Bước 2: Verify compile**

```bash
cd backend && npx tsc --noEmit
```

Expected: không có lỗi TypeScript.

---

## Task 2 — Backend: Mở rộng `GET /mapping/candidates`

**Files:**
- Modify: `backend/src/routes/zalo.ts` — route `/mapping/candidates` (dòng ~127)

- [ ] **Bước 1: Thêm params `classId` và `status` vào destructure**

Tìm dòng:
```typescript
const { type = 'STUDENTS', search = '', page = '1' } = req.query as Record<string, string>;
```

Sửa thành:
```typescript
const { type = 'STUDENTS', search = '', page = '1', classId = '', status = 'ALL' } = req.query as Record<string, string>;
```

- [ ] **Bước 2: Thêm logic filter vào `where` object**

Tìm khối build `where` của STUDENTS (dòng ~132):
```typescript
const where = search
  ? { name: { contains: search, mode: 'insensitive' as const }, isActive: true }
  : { isActive: true };
```

Sửa thành:
```typescript
const where: any = { isActive: true };
if (search) where.name = { contains: search, mode: 'insensitive' as const };
if (status === 'LINKED') where.zaloUserId = { not: null };
if (status === 'UNLINKED') where.zaloUserId = null;
if (classId && type === 'STUDENTS') {
  where.classes = { some: { classId } };
}
```

- [ ] **Bước 3: Verify compile**

```bash
cd backend && npx tsc --noEmit
```

---

## Task 3 — Frontend: State mới + `fetchCandidates` nhận classId/status

**Files:**
- Modify: `ui_components/src/views/pages/zalo-campaign/zalo-campaign.tsx`

- [ ] **Bước 1: Thêm state variables**

Tìm khu vực state declarations (quanh dòng ~100–200), thêm:
```typescript
const [classStats, setClassStats] = useState<Array<{
  classId: string; className: string; classCode?: string;
  totalStudents: number; mappedStudents: number; mappedPercent: number;
}>>([]);
const [classStatsLoading, setClassStatsLoading] = useState(false);
const [selectedMappingClass, setSelectedMappingClass] = useState<string>('ALL');
const [mappingStatusFilter, setMappingStatusFilter] = useState<'ALL' | 'LINKED' | 'UNLINKED'>('ALL');
```

- [ ] **Bước 2: Thêm `fetchClassStats` callback**

Ngay sau hàm `fetchMappingAudits` (dòng ~388):
```typescript
const fetchClassStats = useCallback(async () => {
  if (!token) return;
  setClassStatsLoading(true);
  try {
    const r = await fetch('/api/zalo/mapping/class-stats', { headers: { 'Authorization': `Bearer ${token}` } });
    if (r.ok) setClassStats(await r.json());
  } catch {} finally { setClassStatsLoading(false); }
}, [token]);
```

- [ ] **Bước 3: Cập nhật `fetchCandidates` nhận thêm params**

Tìm hàm `fetchCandidates` (dòng ~375), sửa signature và URL:
```typescript
const fetchCandidates = useCallback(async (type: string, search: string, page: number, classId = 'ALL', status = 'ALL') => {
  if (!token) return;
  setCandidatesLoading(true);
  try {
    const params = new URLSearchParams({ type, search, page: String(page) });
    if (classId && classId !== 'ALL') params.set('classId', classId);
    if (status && status !== 'ALL') params.set('status', status);
    const r = await fetch(`/api/zalo/mapping/candidates?${params}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const d = await r.json();
    if (r.ok) { setCandidates(d.items); setCandidateTotal(d.total); }
  } catch {} finally { setCandidatesLoading(false); }
}, [token]);
```

- [ ] **Bước 4: Cập nhật `useEffect` gọi fetchCandidates**

Tìm useEffect gọi `fetchCandidates` (dòng ~403):
```typescript
useEffect(() => {
  if (activeTab === 'mapping') {
    fetchCandidates(candidateType, debouncedSearch, candidatePage, selectedMappingClass, mappingStatusFilter);
  }
}, [activeTab, candidateType, debouncedSearch, candidatePage, selectedMappingClass, mappingStatusFilter, fetchCandidates]);
```

- [ ] **Bước 5: Thêm useEffect fetch class stats + auto-refresh sau link/unlink**

```typescript
useEffect(() => {
  if (activeTab === 'mapping') fetchClassStats();
}, [activeTab, fetchClassStats]);
```

Trong `handleLinkManual` và `handleUnlinkManual`, thêm `fetchClassStats()` sau khi `fetchCandidates(...)` được gọi để refresh stats ngay lập tức.

---

## Task 4 — Frontend: Two-panel layout cho Tab Mapping

**Files:**
- Modify: `ui_components/src/views/pages/zalo-campaign/zalo-campaign.tsx`

Mục tiêu: đổi layout mapping tab từ "full-width candidates grid" thành "sidebar lớp | candidates panel".

- [ ] **Bước 1: Wrap toàn bộ nội dung mapping tab bằng flex container**

Tìm opening tag của mapping tab content (tìm `{activeTab === 'mapping' && (`), wrap nội dung bên trong bằng:
```tsx
<div className="flex gap-6 items-start">
  {/* === LEFT SIDEBAR: Class List === */}
  {/* ... Task 4 Step 2 ... */}

  {/* === RIGHT PANEL: Existing candidates grid (đã có) === */}
  <div className="flex-1 min-w-0">
    {/* toàn bộ nội dung mapping tab hiện tại */}
  </div>
</div>
```

- [ ] **Bước 2: Viết sidebar lớp học**

```tsx
{/* LEFT SIDEBAR */}
<div className="w-64 flex-shrink-0 space-y-2">
  <p className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest px-1 mb-3">Lọc theo lớp</p>

  {/* All classes button */}
  <button
    onClick={() => { setSelectedMappingClass('ALL'); setCandidatePage(1); }}
    className={`w-full text-left px-4 py-3 rounded-xl transition-all text-sm font-bold flex justify-between items-center ${selectedMappingClass === 'ALL' ? 'bg-hicado-navy text-white shadow-lg' : 'bg-white border border-hicado-slate hover:border-hicado-navy/30 text-hicado-navy'}`}
  >
    <span>Tất cả</span>
  </button>

  {classStatsLoading && <div className="h-4 bg-hicado-slate/20 rounded animate-pulse mx-1" />}

  {classStats.map(cs => (
    <button
      key={cs.classId}
      onClick={() => { setSelectedMappingClass(cs.classId); setCandidatePage(1); }}
      className={`w-full text-left px-4 py-3 rounded-xl transition-all flex flex-col gap-1 ${selectedMappingClass === cs.classId ? 'bg-hicado-navy text-white shadow-lg' : 'bg-white border border-hicado-slate hover:border-hicado-navy/30 text-hicado-navy'}`}
    >
      <span className="text-sm font-black truncate">{cs.className}</span>
      <div className="flex items-center justify-between gap-2">
        <div className={`h-1 rounded-full flex-1 ${selectedMappingClass === cs.classId ? 'bg-white/20' : 'bg-hicado-slate/30'}`}>
          <div
            className={`h-1 rounded-full transition-all ${cs.mappedPercent === 100 ? 'bg-emerald-400' : cs.mappedPercent >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`}
            style={{ width: `${cs.mappedPercent}%` }}
          />
        </div>
        <span className={`text-[10px] font-black ${selectedMappingClass === cs.classId ? 'text-white/70' : cs.mappedPercent === 100 ? 'text-emerald-500' : 'text-amber-500'}`}>
          {cs.mappedStudents}/{cs.totalStudents}
        </span>
        {cs.mappedPercent < 100 && (
          <svg className={`w-3 h-3 flex-shrink-0 ${selectedMappingClass === cs.classId ? 'text-amber-300' : 'text-amber-400'}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        )}
      </div>
    </button>
  ))}
</div>
```

- [ ] **Bước 3: Thêm filter LINKED/UNLINKED vào toolbar của right panel**

Trong right panel, tìm toolbar hiện có (thanh search + type switcher, dòng ~1430). Thêm button group ngay sau:

```tsx
{/* Status filter */}
<div className="flex bg-hicado-slate/30 rounded-xl p-1 gap-1">
  {(['ALL', 'LINKED', 'UNLINKED'] as const).map(f => (
    <button key={f} onClick={() => { setMappingStatusFilter(f); setCandidatePage(1); }}
      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${mappingStatusFilter === f ? 'bg-hicado-navy text-white shadow' : 'text-hicado-navy/40 hover:bg-hicado-navy/10'}`}>
      {f === 'ALL' ? 'Tất cả' : f === 'LINKED' ? 'Đã ghép' : 'Chưa ghép'}
    </button>
  ))}
</div>
```

---

## Task 5 — Frontend: Badges trên Wizard Step 2

**Files:**
- Modify: `ui_components/src/views/pages/zalo-campaign/zalo-campaign.tsx`

- [ ] **Bước 1: Fetch class stats khi mở wizard**

Tìm nơi wizard được mở (nút "Tạo chiến dịch mới" hoặc `setActiveTab('create')`), thêm `fetchClassStats()` nếu `classStats` còn rỗng.

Hoặc đơn giản hơn: thêm vào useEffect hiện có:
```typescript
useEffect(() => {
  if (activeTab === 'create' || activeTab === 'mapping') fetchClassStats();
}, [activeTab, fetchClassStats]);
```

- [ ] **Bước 2: Thêm badge vào mỗi checkbox lớp trong step 2**

Tìm class checkbox grid (dòng ~730–738):
```tsx
{classes.map(cls => (
  <label key={cls.id} className={`flex items-center gap-2 p-3 border rounded-xl cursor-pointer transition-all text-sm ${wizardClassIds.includes(cls.id) ? 'border-hicado-navy bg-hicado-navy/5 font-black' : 'border-hicado-slate hover:border-hicado-navy/30'}`}>
    <input type="checkbox" className="accent-hicado-navy" checked={wizardClassIds.includes(cls.id)}
      onChange={() => setWizardClassIds(prev => prev.includes(cls.id) ? prev.filter(x => x !== cls.id) : [...prev, cls.id])} />
    <span className="text-hicado-navy font-bold truncate">{cls.name}</span>
  </label>
))}
```

Sửa thành:
```tsx
{classes.map(cls => {
  const stat = classStats.find(s => s.classId === cls.id);
  const isIncomplete = stat && stat.mappedPercent < 100;
  return (
    <label key={cls.id} className={`flex items-center gap-2 p-3 border rounded-xl cursor-pointer transition-all text-sm ${wizardClassIds.includes(cls.id) ? 'border-hicado-navy bg-hicado-navy/5 font-black' : 'border-hicado-slate hover:border-hicado-navy/30'}`}>
      <input type="checkbox" className="accent-hicado-navy" checked={wizardClassIds.includes(cls.id)}
        onChange={() => setWizardClassIds(prev => prev.includes(cls.id) ? prev.filter(x => x !== cls.id) : [...prev, cls.id])} />
      <span className="text-hicado-navy font-bold truncate flex-1">{cls.name}</span>
      {stat && (
        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-1 ${stat.mappedPercent === 100 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
          {isIncomplete && (
            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )}
          {stat.mappedStudents}/{stat.totalStudents}
        </span>
      )}
    </label>
  );
})}
```

- [ ] **Bước 3: Thêm warning banner khi có lớp được chọn mà chưa ghép đủ**

Ngay dưới grid checkboxes:
```tsx
{wizardClassIds.length > 0 && classStats.some(s => wizardClassIds.includes(s.classId) && s.mappedPercent < 100) && (
  <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
    <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
    <span>
      Một số lớp được chọn có học sinh <strong>chưa ghép Zalo</strong>. Tin nhắn sẽ không được gửi đến những học sinh này.{' '}
      <button onClick={() => setActiveTab('mapping')} className="underline font-bold">Ghép ngay →</button>
    </span>
  </div>
)}
```

---

## Verification Checklist

- [ ] **Tab Mapping — sidebar**: Mở tab Mapping → thấy sidebar trái liệt kê các lớp với thanh progress (xanh/vàng/đỏ) và số "X/Y". Lớp chưa ghép đủ có icon cảnh báo.
- [ ] **Tab Mapping — filter theo lớp**: Click vào một lớp trong sidebar → candidates grid chỉ hiển thị học sinh của lớp đó.
- [ ] **Tab Mapping — filter LINKED/UNLINKED**: Chọn "Chưa ghép" → chỉ hiện học sinh chưa có UID. Phân trang vẫn đúng.
- [ ] **Tab Mapping — tổ hợp filter**: Chọn lớp A + "Chưa ghép" + search "An" → chỉ hiện học sinh lớp A, tên chứa "An", chưa có Zalo.
- [ ] **Tab Mapping — auto-refresh**: Sau khi ghép UID cho 1 học sinh → badge lớp trong sidebar tự cập nhật từ "4/5" thành "5/5".
- [ ] **Wizard step 2 — badges**: Khi tạo chiến dịch, ở step 2 checkbox lớp hiển thị badge "X/Y". Lớp chưa đủ 100% hiện icon cảnh báo màu amber.
- [ ] **Wizard step 2 — warning banner**: Tick chọn một lớp chưa ghép đủ → banner vàng xuất hiện bên dưới với link "Ghép ngay →". Click link → chuyển sang tab Mapping.
- [ ] **TypeScript compile**: `npx tsc --noEmit` ở cả backend và frontend không có lỗi.
