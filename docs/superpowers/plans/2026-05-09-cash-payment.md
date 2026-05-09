# Cash Payment Recording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to record a student's cash payment in one action — creating a fully-traced TuitionBill (PAID) + BillPayment (CASH) — and automatically skip that student in future Zalo tuition reminders for the same billing period.

**Architecture:** One new backend endpoint (`POST /api/finance/cash-payment`) creates a TuitionBill snapshot marked PAID plus a BillPayment record and a legacy PaymentAdjustment in a single DB transaction. The Zalo custom-tuition dedup check is extended to query `TuitionBill` (status PAID/PARTIAL) in addition to `ZaloMessageLog`, so cash-payers are skipped with a distinct reason. A new modal in the Finance > Hóa đơn tab drives the whole flow.

**Tech Stack:** Node.js + Express + Prisma (PostgreSQL), React + TypeScript + Tailwind, existing `prisma.tuitionBill`, `prisma.billPayment`, `prisma.paymentAdjustment` models.

---

## Files Changed

| File | Change |
|---|---|
| `backend/src/routes/finance.ts` | Add `POST /api/finance/cash-payment` after line 531 |
| `backend/src/routes/zalo.ts` | Extend dedup block (lines 560–584) to also check TuitionBill.status |
| `ui_components/src/views/pages/finance/finance.tsx` | Add cash payment modal state, handler, and JSX in Hóa đơn tab |

---

## Task 1: Backend — `POST /api/finance/cash-payment`

**Files:**
- Modify: `backend/src/routes/finance.ts` — insert after the `/bills/preview` route (after line 531)

This endpoint creates a TuitionBill (status=PAID), BillPayment (source=CASH), and PaymentAdjustment (legacy) atomically. It reuses the same session-calculation logic as `/bills/preview`.

- [ ] **Step 1: Insert the endpoint into `finance.ts` after line 531 (after the closing `});` of `/bills/preview`)**

```typescript
// Record cash payment — creates TuitionBill(PAID) + BillPayment(CASH) + PaymentAdjustment in one TX
router.post('/cash-payment', authenticateToken, authorizeRoles('ADMIN', 'MANAGER'), async (req, res) => {
  const user = (req as any).user;
  const { studentId, coveredClassIds, fromDate, toDate, billingMonth, totalAmountOverride, note, date } = req.body as {
    studentId: string;
    coveredClassIds: string[];
    fromDate: string;
    toDate: string;
    billingMonth?: string;
    totalAmountOverride?: number;
    note?: string;
    date?: string;
  };

  if (!studentId || !coveredClassIds?.length || !fromDate || !toDate) {
    return res.status(400).json({ message: 'Thiếu studentId, coveredClassIds, fromDate hoặc toDate' });
  }

  try {
    const from = new Date(fromDate); from.setHours(0, 0, 0, 0);
    const to = new Date(toDate); to.setHours(23, 59, 59, 999);
    const paidAt = date ? new Date(date) : new Date();

    const classes = await prisma.class.findMany({ where: { id: { in: coveredClassIds } } });

    const sessionsDetail = await Promise.all(classes.map(async (cls) => {
      const agg = await prisma.attendance.aggregate({
        _sum: { sessionUnits: true },
        where: { studentId, classId: cls.id, status: 'PRESENT', date: { gte: from, lte: to } }
      });
      const sessions = agg._sum.sessionUnits || 0;
      return { classId: cls.id, className: cls.name, sessions, pricePerSession: cls.tuitionPerSession, subtotal: sessions * cls.tuitionPerSession };
    }));

    const calculatedAmount = sessionsDetail.reduce((sum, it) => sum + it.subtotal, 0);
    const amount = totalAmountOverride ?? calculatedAmount;

    if (amount <= 0) {
      return res.status(400).json({ message: 'Số tiền phải lớn hơn 0' });
    }

    const referenceCode = generateBillCode();

    const result = await prisma.$transaction(async (tx) => {
      const bill = await tx.tuitionBill.create({
        data: {
          studentId,
          coveredClassIds,
          fromDate: from,
          toDate: to,
          amount,
          paidAmount: amount,
          status: 'PAID',
          sessionsDetail: JSON.stringify(sessionsDetail),
          referenceCode,
          billingMonth: billingMonth || null,
          notes: note || null,
          createdByName: user.name || user.username || 'System',
          sentAt: null,
        }
      });

      const payment = await tx.billPayment.create({
        data: { billId: bill.id, amount, source: 'CASH', paidAt, note: note || null }
      });

      await tx.paymentAdjustment.create({
        data: {
          studentId,
          amount,
          source: 'CASH',
          note: `Tiền mặt HĐ ${referenceCode}${note ? '. ' + note : ''}`,
          effectiveDate: paidAt,
          createdByUserId: user.id,
          createdByName: user.name || user.username || 'System',
          createdByRole: user.role,
        }
      });

      await tx.student.update({ where: { id: studentId }, data: { tuitionStatus: 'PAID' } });

      return { bill, payment };
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('[Cash Payment]', error);
    res.status(500).json({ message: 'Lỗi ghi nhận tiền mặt' });
  }
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```powershell
cd backend; npx tsc --noEmit
```

Expected: no output (zero errors).

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/finance.ts
git commit -m "feat(finance): add POST /cash-payment endpoint"
```

---

## Task 2: Backend — Extend Zalo dedup to skip cash-paid students

**Files:**
- Modify: `backend/src/routes/zalo.ts` — the dedup block starting at line 560

Currently the dedup only checks `ZaloMessageLog` (status=SENT). Extend it to also check `TuitionBill` with status PAID or PARTIAL for the same billingMonth + class overlap.

- [ ] **Step 1: Replace the dedup block in `zalo.ts` (lines 560–584)**

Find this exact block:

```typescript
      if (billingMonth && coveredClassIds.length > 0 && !forceSet.has(student.id)) {
        const existing = await prisma.zaloMessageLog.findFirst({
          where: {
            studentId: student.id,
            status: 'SENT',
            billingMonth,
            coveredClassIds: { hasSome: coveredClassIds }
          }
        });

        if (existing) {
          skippedCount++;
          results.push({ studentId: student.id, studentName: student.name, status: 'SKIPPED', total, channel: 'NONE', error: `Đã gửi học phí tháng ${billingMonth}`, coveredClassIds });
          await prisma.zaloMessageLog.create({
            data: {
              phone: student.parentPhone || student.studentPhone || '', zaloUserId: student.zaloUserId,
              templateId: 'CUSTOM_TUITION', trackingId, status: 'SKIPPED', errorReason: 'DEDUP_ALREADY_SENT',
              studentId: student.id, campaignId: campaign.id, classId: item.classId, coveredClassIds,
              billingMonth,
              messageType: 'CUSTOM_TUITION', customPayload: JSON.stringify(payload),
            }
          });
          continue;
        }
      }
```

Replace with:

```typescript
      if (billingMonth && coveredClassIds.length > 0 && !forceSet.has(student.id)) {
        // Check 1: already sent a Zalo message this billing period
        const sentLog = await prisma.zaloMessageLog.findFirst({
          where: { studentId: student.id, status: 'SENT', billingMonth, coveredClassIds: { hasSome: coveredClassIds } }
        });

        // Check 2: student already has a paid/partial TuitionBill for this period (e.g. cash payment)
        const paidBill = !sentLog ? await prisma.tuitionBill.findFirst({
          where: {
            studentId: student.id,
            billingMonth,
            status: { in: ['PAID', 'PARTIAL'] },
            coveredClassIds: { hasSome: coveredClassIds }
          },
          select: { referenceCode: true }
        }) : null;

        const skipReason = sentLog
          ? `Đã gửi thông báo tháng ${billingMonth}`
          : paidBill
            ? `Đã đóng tiền mặt (${paidBill.referenceCode})`
            : null;

        if (skipReason) {
          skippedCount++;
          results.push({ studentId: student.id, studentName: student.name, status: 'SKIPPED', total, channel: 'NONE', error: skipReason, coveredClassIds });
          await prisma.zaloMessageLog.create({
            data: {
              phone: student.parentPhone || student.studentPhone || '', zaloUserId: student.zaloUserId,
              templateId: 'CUSTOM_TUITION', trackingId, status: 'SKIPPED',
              errorReason: sentLog ? 'DEDUP_ALREADY_SENT' : 'DEDUP_CASH_PAID',
              studentId: student.id, campaignId: campaign.id, classId: item.classId, coveredClassIds,
              billingMonth,
              messageType: 'CUSTOM_TUITION', customPayload: JSON.stringify(payload),
            }
          });
          continue;
        }
      }
```

- [ ] **Step 2: Verify TypeScript compiles**

```powershell
cd backend; npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/zalo.ts
git commit -m "feat(zalo): skip cash-paid students in tuition dedup"
```

---

## Task 3: Frontend — Cash payment modal in Finance > Hóa đơn tab

**Files:**
- Modify: `ui_components/src/views/pages/finance/finance.tsx`

Add state, a handler that calls `POST /api/finance/cash-payment`, and a modal triggered by a new "Ghi nhận tiền mặt" button next to "Tạo hóa đơn".

### 3a — Add state variables

- [ ] **Step 1: Find the Manual Payment Modal state block (around line 163) and add cash payment state after it**

Find:
```typescript
  // Manual Payment Modal
  const [isBillPayOpen, setIsBillPayOpen] = useState(false);
  const [billPayAmount, setBillPayAmount] = useState('');
  const [billPayNote, setBillPayNote] = useState('');
  const [billPayDate, setBillPayDate] = useState(new Date().toISOString().slice(0, 10));
```

Replace with:
```typescript
  // Manual Payment Modal
  const [isBillPayOpen, setIsBillPayOpen] = useState(false);
  const [billPayAmount, setBillPayAmount] = useState('');
  const [billPayNote, setBillPayNote] = useState('');
  const [billPayDate, setBillPayDate] = useState(new Date().toISOString().slice(0, 10));

  // Cash Payment Modal
  const [isCashPayOpen, setIsCashPayOpen] = useState(false);
  const [cashStudentId, setCashStudentId] = useState('');
  const [cashClassIds, setCashClassIds] = useState<string[]>([]);
  const [cashBillingMonth, setCashBillingMonth] = useState(getCurrentMonth());
  const [cashFromDate, setCashFromDate] = useState('');
  const [cashToDate, setCashToDate] = useState('');
  const [cashPreview, setCashPreview] = useState<{ sessionsDetail: Array<{ classId: string; className: string; sessions: number; pricePerSession: number; subtotal: number }>; amount: number } | null>(null);
  const [cashAmountOverride, setCashAmountOverride] = useState('');
  const [cashNote, setCashNote] = useState('');
  const [cashDate, setCashDate] = useState(new Date().toISOString().slice(0, 10));
  const [cashLoading, setCashLoading] = useState(false);
```

### 3b — Add fetchCashPreview and handleCashPayment handlers

- [ ] **Step 2: Find `handleCancelBill` (around line 282) and insert two new handlers before it**

Find:
```typescript
  const handleCancelBill = async (id: string) => {
```

Insert before it:
```typescript
  const fetchCashPreview = async () => {
    if (!cashStudentId || !cashClassIds.length || !cashFromDate || !cashToDate) return;
    try {
      const r = await fetch('/api/finance/bills/preview', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${auth?.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: cashStudentId, coveredClassIds: cashClassIds, fromDate: cashFromDate, toDate: cashToDate })
      });
      if (r.ok) {
        const data = await r.json();
        setCashPreview(data);
        setCashAmountOverride(String(data.amount));
      }
    } catch { toast.error('Lỗi tính học phí'); }
  };

  const handleCashPayment = async () => {
    if (!cashStudentId || !cashClassIds.length || !cashFromDate || !cashToDate) {
      toast.error('Vui lòng điền đầy đủ thông tin');
      return;
    }
    const amount = parseInt(cashAmountOverride.replace(/\D/g, '') || '0');
    if (!amount) { toast.error('Số tiền không hợp lệ'); return; }
    setCashLoading(true);
    try {
      const r = await fetch('/api/finance/cash-payment', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${auth?.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: cashStudentId,
          coveredClassIds: cashClassIds,
          fromDate: cashFromDate,
          toDate: cashToDate,
          billingMonth: cashBillingMonth || undefined,
          totalAmountOverride: amount,
          note: cashNote || undefined,
          date: cashDate,
        })
      });
      if (r.ok) {
        const data = await r.json();
        toast.success(`Đã ghi nhận tiền mặt — ${data.bill.referenceCode}`);
        setIsCashPayOpen(false);
        // Reset
        setCashStudentId(''); setCashClassIds([]); setCashPreview(null);
        setCashAmountOverride(''); setCashNote('');
        fetchBills();
      } else {
        const d = await r.json();
        toast.error(d.message || 'Lỗi ghi nhận');
      }
    } catch { toast.error('Lỗi kết nối'); }
    finally { setCashLoading(false); }
  };

  const handleCancelBill = async (id: string) => {
```

### 3c — Add "Ghi nhận tiền mặt" button next to "Tạo hóa đơn"

- [ ] **Step 3: Find the "Tạo hóa đơn" button in the Hóa đơn tab header and add the cash payment button next to it**

Find (in the bills tab JSX, roughly around line 1030):
```tsx
                  onClick={fetchBills}
                  disabled={billsLoading}
```

Search for the button labeled `Tạo hóa đơn` — it looks like:
```tsx
onClick={() => setIsCreateBillOpen(true)}
```

Add a sibling button right before or after the "Tạo hóa đơn" button:
```tsx
                <button
                  onClick={() => { setIsCashPayOpen(true); setCashDate(new Date().toISOString().slice(0, 10)); }}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors"
                >
                  <span>💵</span> Ghi nhận tiền mặt
                </button>
```

### 3d — Add the Cash Payment Modal JSX

- [ ] **Step 4: Find the closing area of the Create Bill Modal (search for `isCreateBillOpen &&`) and add the new modal after it**

Find the closing tag of the create-bill modal — it ends with something like:
```tsx
      {/* ── CREATE BILL MODAL ── */}
      {isCreateBillOpen && (
```

After the entire `isCreateBillOpen` block, add:

```tsx
      {/* ── CASH PAYMENT MODAL ── */}
      {isCashPayOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-800">💵 Ghi nhận tiền mặt</h2>
              <button onClick={() => setIsCashPayOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
            </div>

            {/* Student picker */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">HỌC SINH</label>
              <select
                value={cashStudentId}
                onChange={e => { setCashStudentId(e.target.value); setCashClassIds([]); setCashPreview(null); }}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              >
                <option value="">-- Chọn học sinh --</option>
                {students.filter(s => s.isActive !== false).sort((a, b) => a.name.localeCompare(b.name, 'vi')).map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.studentCode ? ` (${s.studentCode})` : ''}</option>
                ))}
              </select>
            </div>

            {/* Billing month */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">THÁNG HỌC PHÍ</label>
              <input
                type="month"
                value={cashBillingMonth}
                onChange={e => setCashBillingMonth(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">TỪ NGÀY</label>
                <input type="date" value={cashFromDate} onChange={e => { setCashFromDate(e.target.value); setCashPreview(null); }}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">ĐẾN NGÀY</label>
                <input type="date" value={cashToDate} onChange={e => { setCashToDate(e.target.value); setCashPreview(null); }}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
              </div>
            </div>

            {/* Class multi-select — filtered to student's enrolled classes */}
            {cashStudentId && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">LỚP HỌC</label>
                <div className="space-y-1 max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-2">
                  {classes
                    .filter(c => c.students?.some((cs: any) => cs.studentId === cashStudentId) || c.classStudents?.some((cs: any) => cs.studentId === cashStudentId))
                    .map(cls => (
                      <label key={cls.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5">
                        <input
                          type="checkbox"
                          checked={cashClassIds.includes(cls.id)}
                          onChange={e => {
                            setCashClassIds(prev => e.target.checked ? [...prev, cls.id] : prev.filter(id => id !== cls.id));
                            setCashPreview(null);
                          }}
                          className="rounded"
                        />
                        {cls.name}
                      </label>
                    ))}
                </div>
              </div>
            )}

            {/* Calculate button */}
            {cashStudentId && cashClassIds.length > 0 && cashFromDate && cashToDate && (
              <button onClick={fetchCashPreview} className="w-full py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold text-slate-700 transition-colors">
                🔢 Tính số buổi & học phí
              </button>
            )}

            {/* Preview table */}
            {cashPreview && (
              <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 font-bold">
                      <th className="text-left pb-1">Lớp</th>
                      <th className="text-right pb-1">Buổi</th>
                      <th className="text-right pb-1">Đơn giá</th>
                      <th className="text-right pb-1">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashPreview.sessionsDetail.map((row, i) => (
                      <tr key={i} className="border-t border-slate-200">
                        <td className="py-1 font-medium">{row.className}</td>
                        <td className="text-right py-1">{row.sessions}</td>
                        <td className="text-right py-1">{row.pricePerSession.toLocaleString('vi-VN')}đ</td>
                        <td className="text-right py-1 font-bold">{row.subtotal.toLocaleString('vi-VN')}đ</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-between pt-1 border-t border-slate-300 font-black text-sm">
                  <span>Tổng cộng</span>
                  <span className="text-emerald-600">{cashPreview.amount.toLocaleString('vi-VN')}đ</span>
                </div>
              </div>
            )}

            {/* Amount override */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">SỐ TIỀN THỰC THU (VNĐ)</label>
              <input
                type="text"
                value={cashAmountOverride ? parseInt(cashAmountOverride.replace(/\D/g, '') || '0').toLocaleString('vi-VN') : ''}
                onChange={e => setCashAmountOverride(e.target.value.replace(/\D/g, ''))}
                placeholder="Nhập số tiền..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold"
              />
            </div>

            {/* Date + note */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">NGÀY NỘP</label>
                <input type="date" value={cashDate} onChange={e => setCashDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">GHI CHÚ</label>
                <input type="text" value={cashNote} onChange={e => setCashNote(e.target.value)}
                  placeholder="VD: nộp cho cô Lan" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setIsCashPayOpen(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50">
                Hủy
              </button>
              <button
                onClick={handleCashPayment}
                disabled={cashLoading || !cashStudentId || !cashClassIds.length || !cashFromDate || !cashToDate || !cashAmountOverride}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-black hover:bg-emerald-700 disabled:opacity-40 transition-colors"
              >
                {cashLoading ? 'Đang lưu...' : '✓ Xác nhận ghi nhận'}
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Verify TypeScript compiles**

```powershell
cd ui_components; npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add ui_components/src/views/pages/finance/finance.tsx
git commit -m "feat(finance): add cash payment modal in Hóa đơn tab"
```

---

## Task 4: End-to-end verification

- [ ] **Step 1: Start backend and frontend**

```powershell
# Terminal 1
cd backend; npm run dev

# Terminal 2
cd ui_components; npm run dev
```

- [ ] **Step 2: Record a cash payment**

1. Open Finance > Hóa đơn tab
2. Click "💵 Ghi nhận tiền mặt"
3. Chọn học sinh → chọn tháng → chọn ngày từ/đến → chọn lớp
4. Click "Tính số buổi & học phí" → bảng sessionsDetail xuất hiện
5. Xác nhận số tiền → click "✓ Xác nhận ghi nhận"
6. Toast hiện "Đã ghi nhận tiền mặt — HD-XXXXXX" ✅
7. Bảng Hóa đơn refresh → bill mới xuất hiện với status **PAID** và badge **CASH** ✅

- [ ] **Step 3: Verify student skipped in Zalo wizard**

1. Mở wizard Zalo Campaign > Gửi học phí thủ công
2. Chọn cùng tháng (`billingMonth`) và cùng lớp của học sinh vừa ghi nhận
3. Học sinh đó phải xuất hiện trong amber box "Đã bỏ qua X học sinh"
4. Lý do: `Đã đóng tiền mặt (HD-XXXXXX)` ✅ (không phải "Đã gửi thông báo")

- [ ] **Step 4: Commit final if anything was adjusted**

```bash
git add -p
git commit -m "fix: cash payment e2e adjustments"
```
