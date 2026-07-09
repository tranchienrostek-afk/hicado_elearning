import { useState, useMemo, useEffect } from 'react';
import { useAuthStore, useCenterStore } from '@/store';
import { toast } from 'react-hot-toast';
import { SkeletonTable, SkeletonCard } from '@/views/components/skeleton';
import clsx from 'clsx';
import { sumPresentSessionUnits } from '@/utils/center-operations';

interface FinanceStats {
  totalCollected: number;
  totalExpected: number;
  collectionRate: number;
  monthlyRevenue: { month: string; amount: number }[];
  collectionByClass: {
    classId: string; className: string;
    expected: number; collected: number; gap: number; rate: number;
    studentCount: number; paidCount: number; partialCount?: number;
  }[];
  pendingStudents: {
    id: string; name: string; studentCode: string | null; tuitionStatus: string;
    paymentStatus?: 'PAID_FULL' | 'PAID_PARTIAL' | 'NOT_PAID';
    totalDebt: number; totalPaid?: number; classes: { id: string; name: string }[];
  }[];
  recentTransactions: {
    id: string; amount: number; date: string; status: string; content: string;
    studentName: string; studentCode: string; classes: string;
  }[];
}

interface TrackingStudent {
  id: string; name: string; studentCode: string | null; tuitionStatus: string;
  classes: { classId: string; className: string; classCode: string | null; expected: number }[];
  totalExpected: number; totalPaid: number; totalBalance: number;
  paymentStatus: 'PAID_FULL' | 'PAID_PARTIAL' | 'NOT_PAID';
  transactions: { id: string; amount: number; date: string; content: string | null; classId: string | null }[];
  lastPaymentDate: string | null;
  lastZaloNotification: { sentAt: string; status: string; campaignName: string | null } | null;
}
interface TrackingSummary {
  total: number; paidFull: number; paidPartial: number; notPaid: number;
  totalExpected: number; totalCollected: number;
}

interface BillPayment {
  id: string;
  billId: string;
  amount: number;
  paidAt: string;
  source: string;
  transactionId?: string;
  adjustmentId?: string;
  note?: string;
}

interface TuitionBill {
  id: string;
  studentId: string;
  referenceCode: string;
  amount: number;
  paidAmount: number;
  status: 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
  fromDate: string;
  toDate: string;
  dueDate?: string;
  sessionsDetail: string; // JSON string
  notes?: string;
  createdByName: string;
  sentAt?: string;
  createdAt: string;
  student: { name: string; studentCode: string | null };
  payments?: BillPayment[];
}

interface TeacherPayoutClassRow {
  classId: string;
  className: string;
  studentCount: number;
  sessionCount: number;
  totalTuition: number;
  shareRate: number;
  attendanceRate: number; // percent, e.g. 96.5
  baseSalary: number;
  bonusRate: number;
  bonus: number;
  total: number;
}
interface TeacherPayoutResponse {
  month: string;
  teachers: {
    teacherId: string;
    teacherName: string;
    salaryType: string;
    classes: TeacherPayoutClassRow[];
    totalBaseSalary: number;
    totalBonus: number;
    totalPayout: number;
  }[];
}

interface FinanceRow {
  classId: string;
  className: string;
  teacherName: string;
  roomName: string;
  scheduleLabel: string;
  studentCount: number;
  salaryRate: number;
  tuitionPerSession: number;
  totalSessions: number;
  expectedRevenue: number;
  paidRevenue: number;
  salaryAllTime: number;
  centerProfit: number;
  allSessionCount: number;
  monthSessionCount: number;
  monthAttendanceRate: number;
  monthBaseSalary: number;
  monthBonus: number;
  monthPayout: number;
}

const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const formatMoney = (value: number) => value.toLocaleString('vi-VN');
const formatPercent = (value: number) => {
  if (value > 0 && value < 1) return `${value.toFixed(1)}%`;
  return `${Math.round(value)}%`;
};
const formatDashboardMoney = (value: number) => {
  if (Math.abs(value) < 100_000) return { value: formatMoney(value), unit: 'đ' };
  return { value: (value / 1_000_000).toFixed(1), unit: 'Triệu đ' };
};

export const FinancialPage = () => {
  const { teachers, students, classes, rooms, attendance, updateTuitionStatus, isLoading } = useCenterStore();

  const { role, auth } = useAuthStore();
  const teacherId = auth?.teacherId;
  const isTeacher = role === 'TEACHER';

  const [targetStudentId, setTargetStudentId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [financeStats, setFinanceStats] = useState<FinanceStats | null>(null);
  const [teacherPayout, setTeacherPayout] = useState<TeacherPayoutResponse | null>(null);

  // ── Payment Tracking state ────────────────────────────────────────────────
  const [trackingData, setTrackingData] = useState<{ students: TrackingStudent[]; summary: TrackingSummary } | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackClassId, setTrackClassId] = useState('');
  const [trackDateFrom, setTrackDateFrom] = useState('');
  const [trackDateTo, setTrackDateTo] = useState('');
  const [trackStatus, setTrackStatus] = useState('ALL');
  const [trackSearch, setTrackSearch] = useState('');
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  
  // Adjustment Modal
  const [isAdjModalOpen, setIsAdjModalOpen] = useState(false);
  const [adjStudent, setAdjStudent] = useState<TrackingStudent | null>(null);
  const [adjType, setAdjType] = useState<'CASH' | 'ADJUSTMENT'>('CASH');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjNote, setAdjNote] = useState('');
  const [adjDate, setAdjDate] = useState(new Date().toISOString().slice(0, 10));

  const [activeFinanceTab, setActiveFinanceTab] = useState<'dashboard' | 'tracking' | 'bills' | 'operations'>('dashboard');

  // ── Tuition Bill state ──────────────────────────────────────────────────
  const [bills, setBills] = useState<TuitionBill[]>([]);
  const [billsLoading, setBillsLoading] = useState(false);
  const [billFilterStatus, setBillFilterStatus] = useState('ALL');
  const [billFilterFrom, setBillFilterFrom] = useState('');
  const [billFilterTo, setBillFilterTo] = useState('');
  const [selectedBill, setSelectedBill] = useState<TuitionBill | null>(null);
  const [isBillDetailOpen, setIsBillDetailOpen] = useState(false);
  
  // Create Bill Modal state
  const [isCreateBillOpen, setIsCreateBillOpen] = useState(false);
  const [newBillStudentId, setNewBillStudentId] = useState('');
  const [newBillClassIds, setNewBillClassIds] = useState<string[]>([]);
  const [newBillFrom, setNewBillFrom] = useState('');
  const [newBillTo, setNewBillTo] = useState('');
  const [newBillDue, setNewBillDue] = useState('');
  const [newBillNotes, setNewBillNotes] = useState('');
  const [billPreview, setBillPreview] = useState<{ sessionsDetail: any[], amount: number } | null>(null);
  
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


  const fetchTracking = () => {
    const token = auth?.token;
    if (!token) return;
    setTrackingLoading(true);
    const params = new URLSearchParams();
    if (trackClassId) params.set('classId', trackClassId);
    if (trackDateFrom) params.set('dateFrom', trackDateFrom);
    if (trackDateTo) params.set('dateTo', trackDateTo);
    if (trackStatus !== 'ALL') params.set('status', trackStatus);
    fetch(`/api/finance/payment-tracking?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setTrackingData(data); })
      .catch(() => toast.error('Lỗi tải dữ liệu theo dõi'))
      .finally(() => setTrackingLoading(false));
  };

  useEffect(() => {
    if (isTeacher) return;
    const token = auth?.token;
    if (!token) return;
    fetch('/api/finance/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setFinanceStats(data); });
    fetchTracking();
    fetchBills();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token, isTeacher]);

  // Backend is the single source of truth for teacher salary — attendance-driven,
  // override-aware base salary plus the attendance-rate bonus, all computed once
  // server-side instead of being reimplemented (and drifting) here.
  useEffect(() => {
    if (isTeacher) return;
    const token = auth?.token;
    if (!token) return;
    fetch(`/api/finance/teacher-payout?month=${selectedMonth}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setTeacherPayout(data); })
      .catch(() => toast.error('Lỗi tải dữ liệu lương giáo viên'));
  }, [auth?.token, isTeacher, selectedMonth]);

  const payoutByClassId = useMemo(() => {
    const map = new Map<string, TeacherPayoutClassRow>();
    for (const teacher of teacherPayout?.teachers ?? []) {
      for (const cls of teacher.classes) map.set(cls.classId, cls);
    }
    return map;
  }, [teacherPayout]);

  const fetchBills = () => {
    const token = auth?.token;
    if (!token) return;
    setBillsLoading(true);
    const params = new URLSearchParams();
    if (billFilterStatus !== 'ALL') params.set('status', billFilterStatus);
    if (billFilterFrom) params.set('from', billFilterFrom);
    if (billFilterTo) params.set('to', billFilterTo);
    
    fetch(`/api/finance/bills?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => setBills(data))
      .catch(() => toast.error('Lỗi tải danh sách hóa đơn'))
      .finally(() => setBillsLoading(false));
  };

  const fetchBillPreview = async () => {
    if (!newBillStudentId || !newBillClassIds.length || !newBillFrom || !newBillTo) return;
    try {
      const r = await fetch('/api/finance/bills/preview', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${auth?.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: newBillStudentId, coveredClassIds: newBillClassIds, fromDate: newBillFrom, toDate: newBillTo })
      });
      if (r.ok) setBillPreview(await r.json());
    } catch {}
  };

  const handleCreateBill = async () => {
    if (!newBillStudentId || !newBillClassIds.length || !newBillFrom || !newBillTo) return;
    setIsProcessing(true);
    try {
      const r = await fetch('/api/finance/bills', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${auth?.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          studentId: newBillStudentId, coveredClassIds: newBillClassIds, 
          fromDate: newBillFrom, toDate: newBillTo, dueDate: newBillDue, notes: newBillNotes 
        })
      });
      if (r.ok) {
        toast.success('Đã tạo hóa đơn');
        setIsCreateBillOpen(false);
        fetchBills();
        // Reset form
        setNewBillClassIds([]); setNewBillNotes(''); setBillPreview(null);
      } else {
        const d = await r.json();
        toast.error(d.message || 'Lỗi tạo hóa đơn');
      }
    } catch {
      toast.error('Lỗi kết nối');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualBillPayment = async () => {
    if (!selectedBill || !billPayAmount) return;
    setIsProcessing(true);
    try {
      const r = await fetch(`/api/finance/bills/${selectedBill.id}/manual-payment`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${auth?.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount: parseInt(billPayAmount.replace(/\D/g, '')), 
          source: 'CASH', note: billPayNote, date: billPayDate 
        })
      });
      if (r.ok) {
        toast.success('Đã ghi nhận thanh toán');
        setIsBillPayOpen(false);
        setBillPayAmount(''); setBillPayNote('');
        // Refresh bill detail and list
        fetchBills();
        const updated = await fetch(`/api/finance/bills/${selectedBill.id}`, { headers: { 'Authorization': `Bearer ${auth?.token}` } }).then(r => r.json());
        setSelectedBill(updated);
      }
    } catch {
      toast.error('Lỗi kết nối');
    } finally {
      setIsProcessing(false);
    }
  };

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

    if (!window.confirm('Bạn có chắc muốn hủy hóa đơn này?')) return;
    try {
      const r = await fetch(`/api/finance/bills/${id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${auth?.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' })
      });
      if (r.ok) {
        toast.success('Đã hủy hóa đơn');
        fetchBills();
        setIsBillDetailOpen(false);
      }
    } catch {}
  };

  const scopedClasses = useMemo(
    () =>
      isTeacher
        ? classes.filter((item) => teacherId && item.teacherId === teacherId)
        : classes,
    [classes, isTeacher, teacherId]
  );

  const financeData = useMemo<FinanceRow[]>(
    () =>
      scopedClasses.map((cls) => {
        const teacher = teachers.find((item) => item.id === cls.teacherId);
        const room = rooms.find((item) => item.id === cls.roomId);
        const classStudents = students.filter((item) => cls.studentIds?.includes(item.id));

        const presentRecords = attendance.filter(
          (item) => item.classId === cls.id && item.status === 'PRESENT'
        );
        const allSessionCount = sumPresentSessionUnits(presentRecords);

        const statsRow = financeStats?.collectionByClass.find((item) => item.classId === cls.id);
        const expectedRevenue = statsRow?.expected ?? cls.tuitionPerSession * cls.totalSessions * classStudents.length;
        const paidRevenue = statsRow?.collected ?? 0;

        // Salary — backend (GET /finance/teacher-payout) is the single source of
        // truth: attendance-driven, override-aware base salary, the class-override
        // -> teacher-default -> 0.8 share rate, and the attendance bonus, all
        // computed once server-side. Nothing here recomputes any of that.
        const payout = payoutByClassId.get(cls.id);
        const salaryRate = payout?.shareRate ?? 0;
        const monthSessionCount = payout?.sessionCount ?? 0;
        const monthAttendanceRate = (payout?.attendanceRate ?? 0) / 100;
        const monthBaseSalary = payout?.baseSalary ?? 0;
        const monthBonus = payout?.bonus ?? 0;
        const monthPayout = payout?.total ?? 0;

        const salaryAllTime = paidRevenue * salaryRate;
        const centerProfit = paidRevenue - salaryAllTime;

        return {
          classId: cls.id,
          className: cls.name,
          teacherName: teacher?.name || 'N/A',
          roomName: room ? `${room.name} (${room.center})` : 'Chưa xếp phòng',
          scheduleLabel: `${cls.schedule?.days?.join(', ') || 'Chưa xếp lịch'} | ${
            cls.schedule?.time || '--:--'
          }`,
          studentCount: classStudents.length,
          salaryRate,
          tuitionPerSession: cls.tuitionPerSession,
          totalSessions: cls.totalSessions,
          expectedRevenue,
          paidRevenue,
          salaryAllTime,
          centerProfit,
          allSessionCount,
          monthSessionCount,
          monthAttendanceRate,
          monthBaseSalary,
          monthBonus,
          monthPayout,
        };
      }),
    [attendance, financeStats?.collectionByClass, payoutByClassId, rooms, scopedClasses, students, teachers]
  );

  const totalExpectedAll = financeStats?.totalExpected ?? financeData.reduce((acc, row) => acc + row.expectedRevenue, 0);
  const totalPaidAll = financeStats?.totalCollected ?? financeData.reduce((acc, row) => acc + row.paidRevenue, 0);
  const totalSalaryAll = financeData.reduce((acc, row) => acc + row.salaryAllTime, 0);
  const totalProfitAll = totalPaidAll - totalSalaryAll;
  const paidCard = formatDashboardMoney(totalPaidAll);
  const salaryCard = formatDashboardMoney(totalSalaryAll);
  const profitCard = formatDashboardMoney(totalProfitAll);

  const teacherBaseTotal = financeData.reduce((acc, row) => acc + row.monthBaseSalary, 0);
  const teacherBonusTotal = financeData.reduce((acc, row) => acc + row.monthBonus, 0);
  const teacherPayoutTotal = financeData.reduce((acc, row) => acc + row.monthPayout, 0);
  const teacherMonthSessions = financeData.reduce((acc, row) => acc + row.monthSessionCount, 0);

  const handleSimulateWebhook = () => {
    const student = students.find(
      (item) => item.id === targetStudentId || item.name.includes(targetStudentId)
    );
    if (!student) {
      toast.error('Không tìm thấy học sinh với ID hoặc tên này');
      return;
    }

    setIsProcessing(true);
    setTimeout(() => {
      updateTuitionStatus(student.id, 'PAID');
      setIsProcessing(false);
      setTargetStudentId('');
      toast.success(`[Webhook] Đã khớp lệnh học phí cho ${student.name.toUpperCase()}`);
    }, 1200);
  };

  const handleAddAdjustment = async () => {
    if (!adjStudent || !adjAmount) return;
    const amount = parseInt(adjAmount.replace(/\D/g, '')) * (adjType === 'ADJUSTMENT' ? -1 : 1);
    if (isNaN(amount) || amount === 0) return toast.error('Số tiền không hợp lệ');

    setIsProcessing(true);
    try {
      const r = await fetch('/api/finance/payment-adjustments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth?.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          studentId: adjStudent.id,
          amount,
          source: adjType,
          note: adjNote,
          effectiveDate: adjDate
        })
      });
      if (r.ok) {
        toast.success('Đã lưu điều chỉnh');
        setIsAdjModalOpen(false);
        setAdjAmount(''); setAdjNote('');
        fetchTracking();
      } else {
        const d = await r.json();
        toast.error(d.message || 'Lỗi khi lưu');
      }
    } catch {
      toast.error('Lỗi kết nối');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={10} />
      </div>
    );
  }

  if (isTeacher) {
    return (
      <div className="space-y-8 pb-24 md:pb-8 animate-in fade-in duration-700">

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <p className="text-[10px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-1">Salary</p>
            <h2 className="text-3xl font-serif font-black text-hicado-navy tracking-tight">
              Lương thưởng của tôi
            </h2>
            <p className="text-sm text-hicado-navy/40 font-bold mt-1">
              Tổng hợp theo lớp bạn đang dạy và buổi điểm danh trong tháng.
            </p>
          </div>
          <div className="flex items-center gap-3 glass-card rounded-2xl px-5 py-3 border border-hicado-slate self-start">
            <span className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest">Tháng</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="bg-transparent text-sm font-black text-hicado-navy outline-none"
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {[
            { label: 'Lớp đang dạy', value: financeData.length, unit: 'lớp', color: 'text-hicado-navy' },
            { label: 'Buổi đã dạy', value: teacherMonthSessions, unit: 'buổi', color: 'text-hicado-navy' },
            { label: 'Lương tạm tính', value: formatMoney(teacherBaseTotal), unit: 'đ', color: 'text-hicado-navy' },
            { label: 'Thưởng chuyên cần', value: formatMoney(teacherBonusTotal), unit: 'đ', color: 'text-hicado-emerald' },
          ].map((stat) => (
            <div key={stat.label} className="glass-card rounded-[2rem] p-5 md:p-6 border border-hicado-slate">
              <p className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest mb-3">{stat.label}</p>
              <p className={`text-xl md:text-2xl font-black ${stat.color} truncate`} title={String(stat.value)}>
                {stat.value}<span className="text-xs ml-1 opacity-50">{stat.unit}</span>
              </p>
            </div>
          ))}
        </div>

        {/* Salary Table */}
        <div className="glass-card rounded-[2.5rem] overflow-hidden border border-hicado-slate">
          <div className="premium-gradient p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-hicado-emerald/10 rounded-full -mr-24 -mt-24 blur-3xl" />
            <div className="relative z-10 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-1">Salary Breakdown</p>
                <h3 className="text-xl font-black text-white tracking-tight">Bảng lương theo lớp</h3>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Thu nhập tháng này</p>
                <p className="text-2xl font-black text-hicado-emerald text-glow">{formatMoney(teacherPayoutTotal)}đ</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left min-w-[900px]">
              <thead>
                <tr className="border-b border-hicado-slate bg-hicado-slate/20">
                  {['Lớp / Phòng', 'Sĩ số', 'Buổi dạy', 'Tỷ lệ %', 'Lương', 'Thưởng CC', 'Tổng nhận'].map((h) => (
                    <th key={h} className="px-6 py-4 text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-hicado-slate/50">
                {financeData.map((row) => (
                  <tr key={row.classId} className="hover:bg-hicado-slate/20 transition-colors">
                    <td className="px-6 py-5">
                      <p className="font-black text-hicado-navy uppercase tracking-tight text-sm">{row.className}</p>
                      <p className="text-[11px] text-hicado-navy/40 font-bold mt-0.5">{row.roomName}</p>
                      <p className="text-[10px] text-hicado-navy/30 mt-0.5">{row.scheduleLabel}</p>
                    </td>
                    <td className="px-6 py-5 font-bold text-hicado-navy/70 text-sm">{row.studentCount} hs</td>
                    <td className="px-6 py-5">
                      <p className="font-black text-hicado-navy text-sm">{row.monthSessionCount} / {row.totalSessions}</p>
                      <p className="text-[10px] text-hicado-navy/30 mt-0.5">Chuyên cần: {(row.monthAttendanceRate * 100).toFixed(0)}%</p>
                    </td>
                    <td className="px-6 py-5 font-black text-hicado-navy/70 text-sm">{Math.round(row.salaryRate * 100)}%</td>
                    <td className="px-6 py-5 font-black text-hicado-navy text-sm">{formatMoney(row.monthBaseSalary)}</td>
                    <td className="px-6 py-5 font-black text-hicado-emerald text-sm">{formatMoney(row.monthBonus)}</td>
                    <td className="px-6 py-5">
                      <span className="font-black text-hicado-navy text-sm bg-hicado-emerald/10 text-hicado-emerald px-3 py-1 rounded-xl">
                        {formatMoney(row.monthPayout)}đ
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {financeData.length === 0 && (
            <div className="py-16 text-center space-y-3">
              <div className="text-4xl opacity-20">📊</div>
              <p className="text-sm font-black text-hicado-navy/30 uppercase tracking-widest italic">
                Bạn chưa được gán lớp nào để tính lương.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-24 md:pb-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div>
          <p className="text-[10px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-1">Financial Center</p>
          <h2 className="text-3xl font-serif font-black text-hicado-navy tracking-tight">
            Quản trị Tài chính
          </h2>
          <p className="text-sm text-hicado-navy/40 font-bold mt-1">
            Tổng quan doanh thu, lợi nhuận và theo dõi công nợ học phí.
          </p>
        </div>
        <div className="flex items-center gap-3 glass-card rounded-2xl px-5 py-3 border border-hicado-slate self-start">
          <span className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest">Tháng</span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="bg-transparent text-sm font-black text-hicado-navy outline-none"
          />
        </div>
      </div>

      {/* Tab Navigation */}
      {!isTeacher && (
        <div className="flex gap-1 bg-white border border-hicado-slate rounded-2xl p-1.5 mb-6 self-start">
          {([
            ['dashboard',  'Tổng quan Lợi nhuận'],
            ['tracking',   'Tracking & Công nợ'],
            ['bills',      'Hóa đơn'],
            ['operations', 'Logs & Vận hành'],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setActiveFinanceTab(key)}
              className={`px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${
                activeFinanceTab === key
                  ? 'bg-hicado-navy text-white shadow'
                  : 'text-hicado-navy/40 hover:text-hicado-navy hover:bg-hicado-slate/30'
              }`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── TAB 1: DASHBOARD ────────────────────────────────────────────── */}
      {activeFinanceTab === 'dashboard' && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Revenue Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
            <div className="relative rounded-[2.5rem] overflow-hidden shadow-xl bg-hicado-navy text-white p-8">
              <div className="absolute top-0 right-0 w-32 h-32 bg-hicado-emerald/10 rounded-full -mr-16 -mt-16 blur-2xl" />
              <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-3 relative z-10">Đã thu</p>
              <div className="flex items-baseline gap-2 relative z-10">
                <span className="text-4xl md:text-5xl font-black">{paidCard.value}</span>
                <span className="text-lg font-bold opacity-40 font-mono">{paidCard.unit}</span>
              </div>
            </div>

            <div className="bg-white border border-hicado-slate rounded-[2.5rem] p-8">
              <p className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-[0.4em] mb-3">Chi lương GV</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl md:text-5xl font-black text-hicado-navy">{salaryCard.value}</span>
                <span className="text-lg font-bold text-hicado-navy/30 font-mono">{salaryCard.unit}</span>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-100 rounded-[2.5rem] p-8">
              <p className="text-[9px] font-black text-emerald-700/50 uppercase tracking-[0.4em] mb-3">Lợi nhuận gộp</p>
              <div className="flex items-baseline gap-2">
                <span className={`text-4xl md:text-5xl font-black ${totalProfitAll >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {profitCard.value}
                </span>
                <span className="text-lg font-bold text-emerald-700/30 font-mono">{profitCard.unit}</span>
              </div>
              <p className="text-[10px] text-emerald-700/40 font-bold mt-3">
                Tổng cần thu: {(totalExpectedAll / 1_000_000).toFixed(1)}M đ
              </p>
            </div>
          </div>

          {/* Detailed Table */}
          <div className="glass-card rounded-[2.5rem] overflow-hidden border border-hicado-slate">
            <div className="p-8 border-b border-hicado-slate flex justify-between items-center">
              <div>
                <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-1">Finance Report</p>
                <h3 className="text-xl font-black text-hicado-navy tracking-tight">Báo cáo tài chính chi tiết</h3>
              </div>
              <button className="px-5 py-3 bg-hicado-navy text-hicado-emerald rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-hicado-emerald hover:text-hicado-navy transition-all">
                Xuất Excel
              </button>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left min-w-[1000px]">
                <thead>
                  <tr className="border-b border-hicado-slate bg-hicado-slate/20">
                    {['Lớp / Giáo viên', 'Cần thu / Đã nộp', 'Tỷ lệ GV', 'Lương GV', 'Lợi nhuận TT', 'HP/Buổi'].map((h) => (
                      <th key={h} className="px-6 py-4 text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-hicado-slate/50">
                  {financeData.map((row) => {
                    const paidPercent = row.expectedRevenue > 0 ? (row.paidRevenue / row.expectedRevenue) * 100 : 0;
                    const safePaidPercent = Math.max(0, Math.min(100, paidPercent));
                    return (
                      <tr key={row.classId} className="hover:bg-hicado-slate/20 transition-colors">
                        <td className="px-6 py-5">
                          <p className="font-black text-hicado-navy uppercase tracking-tight text-sm">{row.className}</p>
                          <p className="text-[11px] text-hicado-navy/40 font-bold mt-0.5">{row.teacherName}</p>
                        </td>
                        <td className="px-6 py-5">
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-[10px] font-black uppercase">
                              <span className="text-hicado-navy/30">Đã nộp</span>
                              <span className="text-hicado-emerald">{formatPercent(safePaidPercent)}</span>
                            </div>
                            <div className="h-1.5 w-32 bg-hicado-slate rounded-full overflow-hidden">
                              <div
                                className="h-full bg-hicado-emerald rounded-full transition-all duration-700"
                                style={{ width: `${safePaidPercent}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-hicado-navy/30 font-mono">
                              {row.paidRevenue.toLocaleString()} / {row.expectedRevenue.toLocaleString()}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-5 font-black text-hicado-navy/70 text-sm">
                          {formatPercent(row.salaryRate * 100)}
                        </td>
                        <td className="px-6 py-5 font-black text-hicado-navy text-sm">
                          {row.salaryAllTime.toLocaleString()}
                        </td>
                        <td className="px-6 py-5">
                          <span className={`font-black text-sm ${row.centerProfit >= 0 ? 'text-hicado-emerald' : 'text-rose-500'}`}>
                            {row.centerProfit.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-hicado-navy/40 font-mono text-sm">
                          {row.tuitionPerSession.toLocaleString('vi-VN')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 12-Month Chart + Gauge + Debt Widget */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Monthly Bar Chart (2/3) */}
            <div className="lg:col-span-2 glass-card rounded-[2.5rem] p-8 border border-hicado-slate">
              <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-1">Doanh thu</p>
              <h3 className="text-xl font-black text-hicado-navy mb-6">12 tháng gần nhất</h3>
              {financeStats && financeStats.monthlyRevenue.length > 0 ? (() => {
                const maxAmt = Math.max(...financeStats.monthlyRevenue.map(m => m.amount), 1);
                return (
                  <div className="flex items-end gap-2 h-40">
                    {financeStats.monthlyRevenue.map(m => {
                      const pct = Math.round((m.amount / maxAmt) * 100);
                      return (
                        <div key={m.month} className="flex flex-col items-center gap-1 flex-1 min-w-0" title={`${m.month}: ${m.amount.toLocaleString('vi-VN')}đ`}>
                          <div className="w-full rounded-t-lg bg-hicado-emerald/20 relative" style={{ height: `${Math.max(pct, 4)}%` }}>
                            <div className="absolute bottom-0 w-full rounded-t-lg bg-hicado-emerald transition-all" style={{ height: `${pct}%` }} />
                          </div>
                          <span className="text-[8px] font-black text-hicado-navy/30 truncate w-full text-center">
                            {m.month.slice(5)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })() : <p className="text-sm text-hicado-navy/30 italic text-center py-8">Chưa có dữ liệu biểu đồ</p>}
            </div>

            {/* Gauge + Debt Widget (1/3) */}
            <div className="lg:col-span-1 space-y-6">
              {/* Collection Gauge */}
              <div className="glass-card rounded-[2.5rem] p-6 border border-hicado-slate flex flex-col items-center gap-4">
                <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-[0.4em] text-center">Tỷ lệ thu học phí</p>
                <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
                  <div
                    className="rounded-full"
                    style={{
                      width: 120, height: 120,
                      background: `conic-gradient(#10b981 ${financeStats?.collectionRate || 0}%, #e2e8f0 0%)`,
                    }}
                  />
                  <div className="absolute inset-[12px] rounded-full bg-white flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-hicado-emerald">{formatPercent(financeStats?.collectionRate || 0)}</span>
                  </div>
                </div>
                <div className="flex justify-between w-full text-[10px] font-black text-hicado-navy/40 uppercase">
                  <span>Đã thu: {paidCard.value}{paidCard.unit}</span>
                </div>
              </div>

              {/* Compact Debt Widget */}
              {financeStats && (
                <div className="bg-rose-50 border border-rose-200 rounded-[2rem] p-6 shadow-sm">
                  <div className="flex justify-between items-center mb-3">
                    <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">⚠ Cần theo dõi</p>
                    <span className="bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-lg">
                      {financeStats.pendingStudents.length} HS
                    </span>
                  </div>
                  <p className="text-sm font-bold text-hicado-navy mb-4">
                    Có {financeStats.pendingStudents.length} học sinh nợ tổng {formatMoney(financeStats.pendingStudents.reduce((sum, s) => sum + s.totalDebt, 0))}đ
                  </p>
                  <button 
                    onClick={() => setActiveFinanceTab('tracking')}
                    className="w-full py-2.5 bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 transition-all flex items-center justify-center gap-2"
                  >
                    Xử lý công nợ ngay 
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Per-class Collection Table */}
          {financeStats && (
            <div className="glass-card rounded-[2.5rem] overflow-hidden border border-hicado-slate">
              <div className="p-8 border-b border-hicado-slate">
                <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-1">Theo lớp học</p>
                <h3 className="text-xl font-black text-hicado-navy">Thu học phí theo lớp</h3>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left min-w-[700px]">
                  <thead>
                    <tr className="border-b border-hicado-slate bg-hicado-slate/20">
                      {['Lớp', 'Cần thu', 'Đã thu', 'Còn thiếu', 'Tiến độ', 'Học sinh'].map(h => (
                        <th key={h} className="px-6 py-4 text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hicado-slate/50">
                    {financeStats.collectionByClass.map(row => (
                      <tr key={row.classId} className="hover:bg-hicado-slate/20 transition-colors">
                        <td className="px-6 py-4 font-black text-hicado-navy text-sm">{row.className}</td>
                        <td className="px-6 py-4 font-mono text-hicado-navy/60 text-sm">{row.expected.toLocaleString('vi-VN')}</td>
                        <td className="px-6 py-4 font-mono text-hicado-emerald text-sm font-black">{row.collected.toLocaleString('vi-VN')}</td>
                        <td className="px-6 py-4 font-mono text-rose-500 text-sm">{row.gap.toLocaleString('vi-VN')}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 bg-hicado-slate rounded-full overflow-hidden">
                              <div className="h-full bg-hicado-emerald rounded-full" style={{ width: `${row.rate}%` }} />
                            </div>
                            <span className="text-[10px] font-black text-hicado-navy/50">{formatPercent(row.rate)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-hicado-navy/50 font-bold">
                          {row.paidCount} đủ / {row.partialCount ?? 0} thiếu / {row.studentCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: TRACKING & DEBT ──────────────────────────────────────── */}
      {activeFinanceTab === 'tracking' && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Filters */}
          <div className="glass-card rounded-[2.5rem] p-8 border border-hicado-slate space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-1">Payment Tracking</p>
                <h3 className="text-xl font-black text-hicado-navy">Theo dõi thu học phí & Công nợ</h3>
              </div>
              <button
                onClick={fetchTracking}
                disabled={trackingLoading}
                className="px-5 py-2.5 bg-hicado-navy text-hicado-emerald rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-hicado-emerald hover:text-hicado-navy transition-all disabled:opacity-40"
              >
                {trackingLoading ? 'Đang tải...' : '↻ Làm mới'}
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1 col-span-2 md:col-span-1">
                <label className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest">Tìm học sinh</label>
                <input
                  type="text" value={trackSearch} onChange={e => setTrackSearch(e.target.value)}
                  placeholder="Tên hoặc mã HS..."
                  className="w-full bg-hicado-slate/30 border border-hicado-slate px-3 py-2 rounded-xl text-sm font-bold text-hicado-navy outline-none focus:border-hicado-emerald/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest">Lớp học</label>
                <select value={trackClassId} onChange={e => setTrackClassId(e.target.value)}
                  className="w-full bg-hicado-slate/30 border border-hicado-slate px-3 py-2 rounded-xl text-sm font-bold text-hicado-navy outline-none focus:border-hicado-emerald/50">
                  <option value="">Tất cả lớp</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest">Trạng thái</label>
                <select value={trackStatus} onChange={e => setTrackStatus(e.target.value)}
                  className="w-full bg-hicado-slate/30 border border-hicado-slate px-3 py-2 rounded-xl text-sm font-bold text-hicado-navy outline-none focus:border-hicado-emerald/50">
                  <option value="ALL">Tất cả</option>
                  <option value="PAID_FULL">✅ Đã chuyển đủ</option>
                  <option value="PAID_PARTIAL">⚠️ Chuyển thiếu</option>
                  <option value="NOT_PAID">❌ Chưa chuyển</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest">Từ ngày</label>
                <input type="date" value={trackDateFrom} onChange={e => setTrackDateFrom(e.target.value)}
                  className="w-full bg-hicado-slate/30 border border-hicado-slate px-3 py-2 rounded-xl text-sm font-bold text-hicado-navy outline-none focus:border-hicado-emerald/50" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1 md:col-start-4">
                <label className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest">Đến ngày</label>
                <input type="date" value={trackDateTo} onChange={e => setTrackDateTo(e.target.value)}
                  className="w-full bg-hicado-slate/30 border border-hicado-slate px-3 py-2 rounded-xl text-sm font-bold text-hicado-navy outline-none focus:border-hicado-emerald/50" />
              </div>
            </div>
            <button onClick={fetchTracking} disabled={trackingLoading}
              className="w-full py-3 bg-hicado-navy/5 border border-hicado-navy/10 rounded-2xl text-sm font-black text-hicado-navy/50 hover:bg-hicado-navy hover:text-white transition-all">
              Áp dụng bộ lọc
            </button>
          </div>

          {trackingLoading ? <SkeletonTable rows={10} /> : trackingData && (() => {
            const { summary } = trackingData;
            const displayStudents = trackingData.students.filter(s =>
              !trackSearch || s.name.toLowerCase().includes(trackSearch.toLowerCase()) ||
              (s.studentCode || '').toLowerCase().includes(trackSearch.toLowerCase())
            );
            return (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Tổng học sinh', value: summary.total, color: 'text-hicado-navy', bg: '' },
                    { label: 'Đã chuyển đủ', value: summary.paidFull, color: 'text-hicado-emerald', bg: 'bg-emerald-50 border-emerald-200' },
                    { label: 'Chuyển thiếu', value: summary.paidPartial, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
                    { label: 'Chưa chuyển', value: summary.notPaid, color: 'text-rose-500', bg: 'bg-rose-50 border-rose-200' },
                  ].map(card => (
                    <div key={card.label} className={clsx('glass-card rounded-[2rem] p-5 border', card.bg || 'border-hicado-slate')}>
                      <p className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest mb-2">{card.label}</p>
                      <p className={`text-3xl font-black ${card.color}`}>{card.value}</p>
                    </div>
                  ))}
                </div>

                <div className="glass-card rounded-[2.5rem] overflow-hidden border border-hicado-slate">
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left min-w-[900px]">
                      <thead className="sticky top-0 z-10">
                        <tr className="border-b border-hicado-slate bg-white/90 backdrop-blur-sm">
                          {['Học sinh', 'Lớp', 'Cần nộp', 'Đã nộp', 'Còn thiếu', 'Nộp lần cuối', 'Zalo', 'Trạng thái'].map(h => (
                            <th key={h} className="px-5 py-4 text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hicado-slate/50">
                        {displayStudents.map(s => {
                          const isExpanded = expandedStudentId === s.id;
                          const statusCfg = {
                            PAID_FULL: { label: '✅ Đủ', cls: 'bg-emerald-100 text-emerald-700' },
                            PAID_PARTIAL: { label: '⚠️ Thiếu', cls: 'bg-amber-100 text-amber-700' },
                            NOT_PAID: { label: '❌ Chưa nộp', cls: 'bg-rose-100 text-rose-600' },
                          }[s.paymentStatus];

                          return (
                            <>
                              <tr key={s.id}
                                className="hover:bg-hicado-slate/20 transition-colors cursor-pointer"
                                onClick={() => setExpandedStudentId(isExpanded ? null : s.id)}>
                                <td className="px-5 py-4">
                                  <p className="font-black text-hicado-navy text-sm">{s.name}</p>
                                  <p className="text-[10px] font-mono text-hicado-navy/40">{s.studentCode || '—'}</p>
                                </td>
                                <td className="px-5 py-4 text-sm text-hicado-navy/60">
                                  {s.classes.map(c => c.className).join(', ') || '—'}
                                </td>
                                <td className="px-5 py-4 font-mono text-sm text-hicado-navy/70">{formatMoney(s.totalExpected)}đ</td>
                                <td className="px-5 py-4 font-black text-sm text-hicado-emerald">{formatMoney(s.totalPaid)}đ</td>
                                <td className="px-5 py-4 font-mono text-sm text-rose-500">{s.totalBalance > 0 ? formatMoney(s.totalBalance) + 'đ' : '—'}</td>
                                <td className="px-5 py-4 text-[11px] text-hicado-navy/40">
                                  {s.lastPaymentDate ? new Date(s.lastPaymentDate).toLocaleDateString('vi-VN') : '—'}
                                </td>
                                <td className="px-5 py-4">
                                  {s.lastZaloNotification ? '✓ Đã gửi' : '—'}
                                </td>
                                <td className="px-5 py-4">
                                  <span className={clsx('px-3 py-1.5 rounded-xl text-[10px] font-black', statusCfg.cls)}>
                                    {statusCfg.label}
                                  </span>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr key={`${s.id}-expand`} className="bg-hicado-slate/10">
                                  <td colSpan={8} className="px-8 py-4">
                                    <div className="flex justify-between items-center mb-3">
                                      <p className="text-[10px] font-black text-hicado-navy/30 uppercase">Lịch sử giao dịch & Điều chỉnh</p>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setAdjStudent(s); setIsAdjModalOpen(true); }}
                                        className="px-4 py-1.5 bg-hicado-navy text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all"
                                      >
                                        + Thêm phiếu thu/Giảm trừ
                                      </button>
                                    </div>
                                    <div className="space-y-2">
                                      {/* Combine transactions and adjustments */}
                                      {[
                                        ...s.transactions.map(t => ({ ...t, type: 'TX' })),
                                        ...((s as any).adjustments || []).map((a: any) => ({ ...a, type: 'ADJ' }))
                                      ]
                                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                      .map((item: any) => (
                                        <div key={item.id} className="flex items-center gap-4 text-sm bg-white p-3 rounded-xl border border-hicado-slate shadow-sm">
                                          <div className={clsx(
                                            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-black",
                                            item.type === 'TX' ? "bg-emerald-100 text-emerald-700" : (item.amount > 0 ? "bg-blue-100 text-blue-700" : "bg-rose-100 text-rose-700")
                                          )}>
                                            {item.type === 'TX' ? 'BANK' : (item.amount > 0 ? 'CASH' : 'DISC')}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="flex justify-between">
                                              <span className="font-black text-hicado-navy truncate">
                                                {item.type === 'TX' ? 'Chuyển khoản' : (item.amount > 0 ? 'Nộp tiền mặt' : 'Giảm trừ/Chiết khấu')}
                                              </span>
                                              <span className={clsx("font-black ml-2", item.amount >= 0 ? "text-emerald-600" : "text-rose-500")}>
                                                {item.amount > 0 ? '+' : ''}{formatMoney(item.amount)}đ
                                              </span>
                                            </div>
                                            <div className="flex gap-3 text-[10px] text-hicado-navy/30 font-bold mt-1">
                                              <span>{new Date(item.date).toLocaleDateString('vi-VN')}</span>
                                              <span className="truncate italic">{item.content || item.note || '—'}</span>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                      {s.transactions.length === 0 && (!((s as any).adjustments) || (s as any).adjustments.length === 0) && (
                                        <p className="text-center py-4 text-xs font-bold text-hicado-navy/20 italic">Chưa có lịch sử giao dịch</p>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* ── TAB 3: BILLS ────────────────────────────────────────────────── */}
      {activeFinanceTab === 'bills' && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Filters & Actions */}
          <div className="glass-card rounded-[2.5rem] p-8 border border-hicado-slate space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-1">Invoice Management</p>
                <h3 className="text-xl font-black text-hicado-navy">Danh sách Hóa đơn học phí</h3>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={fetchBills}
                  disabled={billsLoading}
                  className="px-5 py-2.5 bg-hicado-slate/50 text-hicado-navy rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-hicado-slate transition-all disabled:opacity-40"
                >
                  {billsLoading ? 'Đang tải...' : '↻ Làm mới'}
                </button>
                <button
                  onClick={() => { setIsCashPayOpen(true); setCashDate(new Date().toISOString().slice(0, 10)); }}
                  className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg flex items-center gap-2"
                >
                  <span className="text-sm">💵</span> Ghi nhận tiền mặt
                </button>
                <button
                  onClick={() => setIsCreateBillOpen(true)}
                  className="px-6 py-2.5 bg-hicado-navy text-hicado-emerald rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg"
                >
                  + Tạo hóa đơn mới
                </button>

              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest">Trạng thái</label>
                <select value={billFilterStatus} onChange={e => setBillFilterStatus(e.target.value)}
                  className="w-full bg-hicado-slate/30 border border-hicado-slate px-3 py-2 rounded-xl text-sm font-bold text-hicado-navy outline-none focus:border-hicado-emerald/50">
                  <option value="ALL">Tất cả</option>
                  <option value="UNPAID">🔴 Chưa nộp</option>
                  <option value="PARTIAL">🟡 Nộp một phần</option>
                  <option value="PAID">🟢 Đã nộp đủ</option>
                  <option value="CANCELLED">⚪ Đã hủy</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest">Từ ngày</label>
                <input type="date" value={billFilterFrom} onChange={e => setBillFilterFrom(e.target.value)}
                  className="w-full bg-hicado-slate/30 border border-hicado-slate px-3 py-2 rounded-xl text-sm font-bold text-hicado-navy outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest">Đến ngày</label>
                <input type="date" value={billFilterTo} onChange={e => setBillFilterTo(e.target.value)}
                  className="w-full bg-hicado-slate/30 border border-hicado-slate px-3 py-2 rounded-xl text-sm font-bold text-hicado-navy outline-none" />
              </div>
              <div className="flex items-end">
                <button onClick={fetchBills}
                  className="w-full py-2.5 bg-hicado-navy text-white rounded-xl text-[10px] font-black uppercase tracking-widest">
                  Lọc
                </button>
              </div>
            </div>
          </div>

          {/* Bills List */}
          <div className="glass-card rounded-[2.5rem] overflow-hidden border border-hicado-slate">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left min-w-[900px]">
                <thead>
                  <tr className="border-b border-hicado-slate bg-hicado-slate/20">
                    {['Mã HĐ', 'Học sinh', 'Số tiền', 'Đã nộp', 'Thời kỳ', 'Ngày tạo', 'Trạng thái'].map(h => (
                      <th key={h} className="px-6 py-4 text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-hicado-slate/50">
                  {bills.map(bill => (
                    <tr key={bill.id} 
                      onClick={() => { setSelectedBill(bill); setIsBillDetailOpen(true); }}
                      className="hover:bg-hicado-slate/20 transition-colors cursor-pointer group">
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs font-black text-hicado-navy group-hover:text-hicado-emerald transition-colors">
                          {bill.referenceCode}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-black text-hicado-navy text-sm">{bill.student.name}</p>
                        <p className="text-[10px] text-hicado-navy/40 font-mono">{bill.student.studentCode || '—'}</p>
                      </td>
                      <td className="px-6 py-4 font-mono font-black text-hicado-navy text-sm">{formatMoney(bill.amount)}đ</td>
                      <td className="px-6 py-4">
                        <p className="font-mono text-hicado-emerald text-sm font-black">{formatMoney(bill.paidAmount)}đ</p>
                        {bill.amount > bill.paidAmount && bill.status !== 'PAID' && (
                          <p className="text-[10px] text-rose-500 font-bold mt-0.5">Thiếu: {formatMoney(bill.amount - bill.paidAmount)}đ</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-[10px] text-hicado-navy/60 font-bold uppercase">
                        {new Date(bill.fromDate).toLocaleDateString('vi-VN')} - {new Date(bill.toDate).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[11px] text-hicado-navy/40">{new Date(bill.createdAt).toLocaleDateString('vi-VN')}</p>
                        <p className="text-[9px] text-hicado-navy/30 font-bold">{bill.createdByName}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={clsx(
                          'px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest',
                          {
                            UNPAID: 'bg-rose-100 text-rose-600',
                            PARTIAL: 'bg-amber-100 text-amber-700',
                            PAID: 'bg-emerald-100 text-emerald-700',
                            CANCELLED: 'bg-hicado-slate text-hicado-navy/40'
                          }[bill.status]
                        )}>
                          {bill.status === 'UNPAID' ? 'Chưa nộp' : bill.status === 'PARTIAL' ? 'Nộp một phần' : bill.status === 'PAID' ? 'Đã nộp đủ' : 'Đã hủy'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {bills.length === 0 && !billsLoading && (
              <div className="py-20 text-center space-y-4">
                <div className="text-5xl opacity-20">🧾</div>
                <p className="text-sm font-black text-hicado-navy/30 uppercase tracking-widest italic">
                  Chưa có hóa đơn nào được tạo.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 4: OPERATIONS ──────────────────────────────────────────── */}
      {activeFinanceTab === 'operations' && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Simulator */}
          <div className="relative group overflow-hidden rounded-[3rem] border border-white/5 shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-r from-hicado-emerald/20 via-hicado-navy to-indigo-900/50"></div>
            <div className="relative bg-[#020617]/95 p-8 md:p-12 flex flex-col lg:flex-row gap-10 items-center rounded-[3rem]">
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-hicado-emerald animate-pulse"></span>
                  <p className="text-hicado-emerald text-[10px] font-black uppercase tracking-[0.4em]">Simulator Node v4.0</p>
                </div>
                <h3 className="text-3xl font-serif font-black text-white tracking-tight">Gạch Nợ Simulator</h3>
                <p className="text-white/40 text-sm max-w-xl">
                  Giả lập tín hiệu từ VietQR/Napas để kiểm tra logic đối soát tự động.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
                <input
                  type="text"
                  placeholder="ID hoặc Tên học sinh"
                  value={targetStudentId}
                  onChange={(event) => setTargetStudentId(event.target.value)}
                  className="bg-white/5 border border-white/10 px-8 py-5 rounded-2xl text-sm font-bold text-white outline-none focus:border-hicado-emerald/50"
                />
                <button
                  disabled={isProcessing}
                  onClick={handleSimulateWebhook}
                  className="px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-widest bg-hicado-emerald text-hicado-navy"
                >
                  {isProcessing ? 'Đang bắn...' : 'Bắn Webhook'}
                </button>
              </div>
            </div>
          </div>

          {/* Webhook Logs */}
          {financeStats && (
            <div className="glass-card rounded-[2.5rem] overflow-hidden border border-hicado-slate">
              <div className="p-8 border-b border-hicado-slate">
                <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-1">Bank Webhook</p>
                <h3 className="text-xl font-black text-hicado-navy">Giao dịch gần nhất</h3>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-hicado-slate bg-hicado-slate/20">
                      {['Thời gian', 'Học sinh', 'Số tiền', 'Nội dung'].map(h => (
                        <th key={h} className="px-6 py-4 text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hicado-slate/50">
                    {financeStats.recentTransactions.map(tx => (
                      <tr key={tx.id}>
                        <td className="px-6 py-4 text-[11px] font-mono text-hicado-navy/40">{new Date(tx.date).toLocaleString()}</td>
                        <td className="px-6 py-4 font-black text-hicado-navy text-sm">{tx.studentName}</td>
                        <td className="px-6 py-4 font-black text-hicado-emerald text-sm">{tx.amount.toLocaleString()}đ</td>
                        <td className="px-6 py-4 text-[11px] text-hicado-navy/40">{tx.content}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Adjustment Modal */}
      {isAdjModalOpen && adjStudent && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-hicado-navy/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden border border-hicado-slate animate-in zoom-in-95 duration-300">
            <div className="premium-gradient p-6 text-white">
              <p className="text-[10px] font-black text-hicado-emerald uppercase tracking-widest mb-1">Manual Entry</p>
              <h3 className="text-xl font-black">Thêm phiếu thu / Giảm trừ</h3>
              <p className="text-white/60 text-xs font-bold mt-1">Học sinh: {adjStudent.name.toUpperCase()}</p>
            </div>
            
            <div className="p-8 space-y-5">
              <div className="grid grid-cols-2 gap-2 bg-hicado-slate/20 p-1.5 rounded-2xl">
                <button 
                  onClick={() => setAdjType('CASH')}
                  className={clsx("py-2.5 rounded-xl text-xs font-black transition-all", adjType === 'CASH' ? "bg-white shadow text-hicado-navy" : "text-hicado-navy/40")}>
                  TIỀN MẶT
                </button>
                <button 
                  onClick={() => setAdjType('ADJUSTMENT')}
                  className={clsx("py-2.5 rounded-xl text-xs font-black transition-all", adjType === 'ADJUSTMENT' ? "bg-white shadow text-hicado-navy" : "text-hicado-navy/40")}>
                  GIẢM TRỪ / LỖI
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest ml-1">Số tiền (VNĐ)</label>
                <input 
                  type="text"
                  value={adjAmount}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setAdjAmount(val ? parseInt(val).toLocaleString('vi-VN') : '');
                  }}
                  placeholder="VD: 500,000"
                  className="w-full bg-hicado-slate/20 border-2 border-transparent focus:border-hicado-navy/10 focus:bg-white rounded-2xl px-5 py-4 text-lg font-black text-hicado-navy outline-none transition-all"
                />
                <p className="text-[10px] text-hicado-navy/30 font-bold ml-1">
                  {adjType === 'ADJUSTMENT' ? '⚠️ Sẽ trừ vào số tiền học sinh cần nộp' : '✓ Sẽ cộng vào số tiền học sinh đã nộp'}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest ml-1">Ngày áp dụng</label>
                <input 
                  type="date"
                  value={adjDate}
                  onChange={(e) => setAdjDate(e.target.value)}
                  className="w-full bg-hicado-slate/20 border-2 border-transparent focus:border-hicado-navy/10 focus:bg-white rounded-2xl px-5 py-3 text-sm font-black text-hicado-navy outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest ml-1">Ghi chú</label>
                <textarea 
                  value={adjNote}
                  onChange={(e) => setAdjNote(e.target.value)}
                  rows={2}
                  placeholder="Lý do giảm trừ hoặc nguồn tiền..."
                  className="w-full bg-hicado-slate/20 border-2 border-transparent focus:border-hicado-navy/10 focus:bg-white rounded-2xl px-5 py-3 text-sm font-bold text-hicado-navy outline-none resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setIsAdjModalOpen(false)}
                  className="flex-1 py-4 rounded-2xl border border-hicado-slate text-sm font-black text-hicado-navy/40 hover:bg-hicado-slate transition-all"
                >
                  HỦY
                </button>
                <button 
                  onClick={handleAddAdjustment}
                  disabled={isProcessing || !adjAmount}
                  className="flex-1 py-4 bg-hicado-navy text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-40"
                >
                  {isProcessing ? 'ĐANG LƯU...' : 'XÁC NHẬN'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Bill Modal */}
      {isCreateBillOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-hicado-navy/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden border border-hicado-slate animate-in zoom-in-95 duration-300">
            <div className="premium-gradient p-6 text-white flex justify-between items-center">
              <div>
                <p className="text-[10px] font-black text-hicado-emerald uppercase tracking-widest mb-1">New Invoice</p>
                <h3 className="text-xl font-black">Tạo hóa đơn học phí mới</h3>
              </div>
              <button onClick={() => setIsCreateBillOpen(false)} className="text-white/60 hover:text-white">✕</button>
            </div>
            
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">Học sinh</label>
                  <select value={newBillStudentId} onChange={e => { setNewBillStudentId(e.target.value); setBillPreview(null); }}
                    className="w-full bg-hicado-slate/20 border-2 border-transparent focus:border-hicado-navy/10 focus:bg-white rounded-xl px-4 py-3 text-sm font-bold text-hicado-navy outline-none">
                    <option value="">Chọn học sinh...</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.studentCode || 'N/A'})</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">Lớp áp dụng (chọn nhiều)</label>
                  <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto p-2 bg-hicado-slate/10 rounded-xl">
                    {classes.filter(c => !newBillStudentId || c.studentIds?.includes(newBillStudentId)).map(c => (
                      <label key={c.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1 rounded-lg">
                        <input type="checkbox" checked={newBillClassIds.includes(c.id)}
                          onChange={e => {
                            const ids = e.target.checked ? [...newBillClassIds, c.id] : newBillClassIds.filter(id => id !== c.id);
                            setNewBillClassIds(ids); setBillPreview(null);
                          }}
                          className="rounded text-hicado-emerald focus:ring-hicado-emerald" />
                        <span className="text-xs font-bold text-hicado-navy">{c.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">Từ ngày</label>
                    <input type="date" value={newBillFrom} onChange={e => { setNewBillFrom(e.target.value); setBillPreview(null); }}
                      className="w-full bg-hicado-slate/20 border-2 border-transparent rounded-xl px-3 py-2 text-xs font-bold text-hicado-navy" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">Đến ngày</label>
                    <input type="date" value={newBillTo} onChange={e => { setNewBillTo(e.target.value); setBillPreview(null); }}
                      className="w-full bg-hicado-slate/20 border-2 border-transparent rounded-xl px-3 py-2 text-xs font-bold text-hicado-navy" />
                  </div>
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">Hạn nộp (tùy chọn)</label>
                  <input type="date" value={newBillDue} onChange={e => setNewBillDue(e.target.value)}
                    className="w-full bg-hicado-slate/20 border-2 border-transparent rounded-xl px-3 py-2 text-xs font-bold text-hicado-navy" />
                </div>
              </div>

              <div className="bg-hicado-slate/20 rounded-2xl p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] font-black text-hicado-navy/40 uppercase">Xem trước số tiền</p>
                  <button onClick={fetchBillPreview} disabled={!newBillStudentId || !newBillClassIds.length}
                    className="text-[10px] font-black text-hicado-emerald hover:underline disabled:opacity-30">Tính toán</button>
                </div>
                
                {billPreview ? (
                  <div className="space-y-3">
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {billPreview.sessionsDetail.map((d, i) => (
                        <div key={i} className="flex justify-between text-xs border-b border-hicado-navy/5 pb-1">
                          <span className="font-bold text-hicado-navy/60">{d.className} ({d.sessions}b)</span>
                          <span className="font-mono text-hicado-navy">{formatMoney(d.subtotal)}đ</span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-3 border-t border-hicado-navy/10 flex justify-between items-baseline">
                      <span className="text-[10px] font-black text-hicado-navy/40 uppercase">Tổng cộng</span>
                      <span className="text-xl font-black text-hicado-navy">{formatMoney(billPreview.amount)}đ</span>
                    </div>
                  </div>
                ) : (
                  <div className="h-40 flex items-center justify-center text-xs text-hicado-navy/30 italic text-center">
                    Chọn học sinh, lớp và thời kỳ<br/>để tính toán học phí dự kiến.
                  </div>
                )}
                
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">Ghi chú</label>
                  <textarea value={newBillNotes} onChange={e => setNewBillNotes(e.target.value)}
                    rows={2} placeholder="Vd: Học phí tháng 5..."
                    className="w-full bg-white/50 border-2 border-transparent rounded-xl px-3 py-2 text-xs font-bold text-hicado-navy outline-none resize-none" />
                </div>
              </div>
            </div>

            <div className="p-8 pt-0 flex gap-3">
              <button onClick={() => setIsCreateBillOpen(false)}
                className="flex-1 py-4 rounded-2xl border border-hicado-slate text-sm font-black text-hicado-navy/40 hover:bg-hicado-slate transition-all">HỦY</button>
              <button onClick={handleCreateBill} disabled={isProcessing || !billPreview}
                className="flex-[2] py-4 bg-hicado-navy text-hicado-emerald rounded-2xl text-sm font-black uppercase tracking-widest shadow-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-40">
                {isProcessing ? 'ĐANG TẠO...' : 'TẠO & LƯU HÓA ĐƠN'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CASH PAYMENT MODAL ── */}
      {isCashPayOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-hicado-navy/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden border border-hicado-slate animate-in zoom-in-95 duration-300">
            <div className="bg-emerald-600 p-6 text-white">
              <p className="text-[10px] font-black uppercase tracking-widest mb-1">Cash Payment</p>
              <h3 className="text-xl font-black">Ghi nhận tiền mặt</h3>
              <p className="text-white/60 text-xs font-bold mt-1">Tạo hóa đơn PAID + Ghi nhận BillPayment</p>
            </div>

            <div className="p-8 space-y-5 overflow-y-auto max-h-[70vh] custom-scrollbar">
              {/* Student picker */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest ml-1">Học sinh</label>
                <select
                  value={cashStudentId}
                  onChange={e => { setCashStudentId(e.target.value); setCashClassIds([]); setCashPreview(null); }}
                  className="w-full bg-hicado-slate/20 border-2 border-transparent focus:border-hicado-navy/10 focus:bg-white rounded-xl px-4 py-3 text-sm font-bold text-hicado-navy outline-none"
                >
                  <option value="">-- Chọn học sinh --</option>
                  {students.filter(s => s.isActive !== false).sort((a, b) => a.name.localeCompare(b.name, 'vi')).map(s => (
                    <option key={s.id} value={s.id}>{s.name}{s.studentCode ? ` (${s.studentCode})` : ''}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Billing month */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest ml-1">Tháng học phí</label>
                  <input
                    type="month"
                    value={cashBillingMonth}
                    onChange={e => setCashBillingMonth(e.target.value)}
                    className="w-full bg-hicado-slate/20 border-2 border-transparent rounded-xl px-4 py-2.5 text-sm font-bold text-hicado-navy outline-none"
                  />
                </div>
                {/* Date of payment */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest ml-1">Ngày nộp</label>
                  <input type="date" value={cashDate} onChange={e => setCashDate(e.target.value)}
                    className="w-full bg-hicado-slate/20 border-2 border-transparent rounded-xl px-4 py-2.5 text-sm font-bold text-hicado-navy outline-none" />
                </div>
              </div>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest ml-1">Từ ngày (tính buổi)</label>
                  <input type="date" value={cashFromDate} onChange={e => { setCashFromDate(e.target.value); setCashPreview(null); }}
                    className="w-full bg-hicado-slate/20 border-2 border-transparent rounded-xl px-4 py-2.5 text-xs font-bold text-hicado-navy outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest ml-1">Đến ngày</label>
                  <input type="date" value={cashToDate} onChange={e => { setCashToDate(e.target.value); setCashPreview(null); }}
                    className="w-full bg-hicado-slate/20 border-2 border-transparent rounded-xl px-4 py-2.5 text-xs font-bold text-hicado-navy outline-none" />
                </div>
              </div>

              {/* Class multi-select */}
              {cashStudentId && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest ml-1">Lớp học áp dụng</label>
                  <div className="space-y-1 max-h-36 overflow-y-auto bg-hicado-slate/10 rounded-xl p-3 border border-hicado-slate">
                    {classes
                      .filter(c => c.studentIds?.includes(cashStudentId))
                      .map(cls => (
                        <label key={cls.id} className="flex items-center gap-2 text-xs font-bold text-hicado-navy cursor-pointer hover:bg-white/50 rounded px-1 py-1">
                          <input
                            type="checkbox"
                            checked={cashClassIds.includes(cls.id)}
                            onChange={e => {
                              setCashClassIds(prev => e.target.checked ? [...prev, cls.id] : prev.filter(id => id !== cls.id));
                              setCashPreview(null);
                            }}
                            className="rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          {cls.name}
                        </label>
                      ))}
                  </div>
                </div>
              )}

              {/* Calculate button */}
              {cashStudentId && cashClassIds.length > 0 && cashFromDate && cashToDate && (
                <button onClick={fetchCashPreview} className="w-full py-3 bg-hicado-navy text-hicado-emerald rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-lg">
                  🔢 Tính số buổi & học phí
                </button>
              )}

              {/* Preview table */}
              {cashPreview && (
                <div className="bg-hicado-slate/20 rounded-2xl p-4 space-y-3">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="text-hicado-navy/40 font-black uppercase tracking-widest text-left">
                        <th className="pb-2">Lớp</th>
                        <th className="pb-2 text-right">Buổi</th>
                        <th className="pb-2 text-right">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hicado-navy/5">
                      {cashPreview.sessionsDetail.map((row, i) => (
                        <tr key={i}>
                          <td className="py-2 font-black text-hicado-navy">{row.className}</td>
                          <td className="py-2 text-right font-mono font-bold">{row.sessions}</td>
                          <td className="py-2 text-right font-mono font-black">{row.subtotal.toLocaleString('vi-VN')}đ</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex justify-between pt-3 border-t-2 border-dashed border-hicado-navy/10 font-black text-sm">
                    <span className="uppercase text-[10px] text-hicado-navy/40">Tổng cộng</span>
                    <span className="text-emerald-600">{cashPreview.amount.toLocaleString('vi-VN')}đ</span>
                  </div>
                </div>
              )}

              {/* Amount override */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest ml-1">Số tiền thực thu (VNĐ)</label>
                <input
                  type="text"
                  value={cashAmountOverride ? parseInt(cashAmountOverride.replace(/\D/g, '') || '0').toLocaleString('vi-VN') : ''}
                  onChange={e => setCashAmountOverride(e.target.value.replace(/\D/g, ''))}
                  placeholder="Nhập số tiền..."
                  className="w-full bg-hicado-slate/20 border-2 border-transparent focus:border-hicado-navy/10 focus:bg-white rounded-xl px-5 py-4 text-xl font-black text-hicado-navy outline-none transition-all"
                />
              </div>

              {/* Note */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest ml-1">Ghi chú</label>
                <input type="text" value={cashNote} onChange={e => setCashNote(e.target.value)}
                  placeholder="VD: Nộp trực tiếp cho quản lý" className="w-full bg-hicado-slate/20 border-2 border-transparent rounded-xl px-4 py-3 text-sm font-bold text-hicado-navy outline-none" />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button onClick={() => setIsCashPayOpen(false)}
                  className="flex-1 py-4 text-sm font-black text-hicado-navy/40">
                  HỦY
                </button>
                <button
                  onClick={handleCashPayment}
                  disabled={cashLoading || !cashStudentId || !cashClassIds.length || !cashFromDate || !cashToDate || !cashAmountOverride}
                  className="flex-[2] py-4 bg-hicado-navy text-hicado-emerald rounded-2xl text-sm font-black uppercase tracking-widest shadow-xl disabled:opacity-40 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  {cashLoading ? 'Đang lưu...' : '✓ Xác nhận thu tiền'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}



      {/* Bill Detail Slide-over */}
      {isBillDetailOpen && selectedBill && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-hicado-navy/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl animate-in slide-in-from-right duration-500 overflow-y-auto">
            <div className="premium-gradient p-8 text-white relative">
              <button onClick={() => setIsBillDetailOpen(false)} className="absolute top-6 right-6 text-white/60 hover:text-white text-xl">✕</button>
              <p className="text-[10px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-2">Invoice Detail</p>
              <h3 className="text-3xl font-serif font-black tracking-tight">{selectedBill.referenceCode}</h3>
              <div className="mt-6 flex items-center gap-4">
                <div className={clsx('px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest', {
                  UNPAID: 'bg-rose-500 text-white',
                  PARTIAL: 'bg-amber-500 text-white',
                  PAID: 'bg-emerald-500 text-white',
                  CANCELLED: 'bg-hicado-slate text-hicado-navy/60'
                }[selectedBill.status])}>
                  {selectedBill.status}
                </div>
                <p className="text-white/60 text-xs font-bold italic">Ngày tạo: {new Date(selectedBill.createdAt).toLocaleDateString('vi-VN')}</p>
              </div>
            </div>

            <div className="p-8 space-y-10">
              {/* Student Info */}
              <div className="space-y-4">
                <p className="text-[10px] font-black text-hicado-navy/30 uppercase tracking-[0.4em]">Học sinh</p>
                <div className="flex items-center gap-4 bg-hicado-slate/20 p-4 rounded-2xl">
                  <div className="w-12 h-12 rounded-full bg-hicado-navy text-hicado-emerald flex items-center justify-center font-black text-xl">
                    {selectedBill.student.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-black text-hicado-navy uppercase tracking-tight">{selectedBill.student.name}</p>
                    <p className="text-xs text-hicado-navy/40 font-mono">{selectedBill.student.studentCode || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Amount Breakdown */}
              <div className="space-y-4">
                <p className="text-[10px] font-black text-hicado-navy/30 uppercase tracking-[0.4em]">Chi tiết buổi học</p>
                <div className="space-y-2">
                  {JSON.parse(selectedBill.sessionsDetail).map((d: any, i: number) => (
                    <div key={i} className="flex justify-between items-center p-4 bg-white border border-hicado-slate rounded-2xl shadow-sm">
                      <div>
                        <p className="font-black text-hicado-navy text-xs uppercase">{d.className}</p>
                        <p className="text-[10px] text-hicado-navy/40 font-bold">{d.sessions} buổi x {formatMoney(d.pricePerSession)}đ</p>
                      </div>
                      <p className="font-mono font-black text-hicado-navy text-sm">{formatMoney(d.subtotal)}đ</p>
                    </div>
                  ))}
                </div>
                <div className="pt-4 border-t-2 border-dashed border-hicado-slate flex justify-between items-baseline">
                  <p className="text-sm font-black text-hicado-navy uppercase">Tổng số tiền</p>
                  <p className="text-3xl font-black text-hicado-navy">{formatMoney(selectedBill.amount)}đ</p>
                </div>
              </div>

              {/* Payment Progress */}
              <div className="space-y-4">
                <p className="text-[10px] font-black text-hicado-navy/30 uppercase tracking-[0.4em]">Tiến độ nộp học phí</p>
                <div className="relative h-4 bg-hicado-slate rounded-full overflow-hidden">
                  <div className="h-full bg-hicado-emerald transition-all duration-1000" 
                    style={{ width: `${Math.min(100, (selectedBill.paidAmount / selectedBill.amount) * 100)}%` }} />
                </div>
                <div className="flex justify-between text-sm font-black">
                  <span className="text-hicado-emerald">Đã nộp: {formatMoney(selectedBill.paidAmount)}đ</span>
                  <span className="text-rose-500">Còn lại: {formatMoney(Math.max(0, selectedBill.amount - selectedBill.paidAmount))}đ</span>
                </div>
              </div>

              {/* Payment History */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] font-black text-hicado-navy/30 uppercase tracking-[0.4em]">Lịch sử nộp tiền</p>
                  {selectedBill.status !== 'PAID' && selectedBill.status !== 'CANCELLED' && (
                    <button onClick={() => setIsBillPayOpen(true)} className="text-[10px] font-black text-hicado-emerald hover:underline">+ Nộp thủ công</button>
                  )}
                </div>
                <div className="space-y-3">
                  {selectedBill.payments?.map(p => (
                    <div key={p.id} className="flex items-center gap-4 text-xs bg-hicado-slate/20 p-4 rounded-2xl border border-hicado-slate">
                      <div className={clsx("w-8 h-8 rounded-full flex items-center justify-center font-black", 
                        p.source === 'SEPAY' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700')}>
                        {p.source === 'SEPAY' ? 'QR' : '💵'}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between">
                          <span className="font-black text-hicado-navy">{p.source === 'SEPAY' ? 'Chuyển khoản VietQR' : 'Tiền mặt/Khác'}</span>
                          <span className="font-black text-hicado-emerald">+{formatMoney(p.amount)}đ</span>
                        </div>
                        <p className="text-[10px] text-hicado-navy/40 mt-0.5">{new Date(p.paidAt).toLocaleString('vi-VN')} • {p.note || 'Không ghi chú'}</p>
                      </div>
                    </div>
                  ))}
                  {(!selectedBill.payments || selectedBill.payments.length === 0) && (
                    <p className="text-center py-6 text-xs font-bold text-hicado-navy/20 italic">Chưa có giao dịch nào</p>
                  )}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="pt-10 flex flex-col gap-3">
                {selectedBill.status !== 'CANCELLED' && selectedBill.paidAmount === 0 && (
                  <button onClick={() => handleCancelBill(selectedBill.id)}
                    className="w-full py-4 rounded-2xl border border-rose-200 text-rose-500 text-sm font-black uppercase tracking-widest hover:bg-rose-50 transition-all">
                    HỦY HÓA ĐƠN
                  </button>
                )}
                <button onClick={() => setIsBillDetailOpen(false)}
                  className="w-full py-4 rounded-2xl bg-hicado-navy text-white text-sm font-black uppercase tracking-widest">ĐÓNG</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Payment Modal */}
      {isBillPayOpen && selectedBill && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-hicado-navy/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden border border-hicado-slate animate-in zoom-in-95 duration-300">
            <div className="bg-hicado-emerald p-6 text-hicado-navy">
              <p className="text-[10px] font-black uppercase tracking-widest mb-1">Manual Payment</p>
              <h3 className="text-xl font-black">Xác nhận nộp học phí</h3>
              <p className="text-hicado-navy/60 text-xs font-bold mt-1">Hóa đơn: {selectedBill.referenceCode}</p>
            </div>
            <div className="p-8 space-y-5">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest ml-1">Số tiền thu (VNĐ)</label>
                <input type="text" value={billPayAmount} 
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '');
                    setBillPayAmount(val ? parseInt(val).toLocaleString('vi-VN') : '');
                  }}
                  className="w-full bg-hicado-slate/20 border-2 border-transparent focus:border-hicado-navy/10 focus:bg-white rounded-2xl px-5 py-4 text-xl font-black text-hicado-navy outline-none" />
                <p className="text-[10px] text-hicado-navy/40 font-bold ml-1">Gợi ý: {formatMoney(selectedBill.amount - selectedBill.paidAmount)}đ (còn thiếu)</p>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest ml-1">Ngày nộp</label>
                <input type="date" value={billPayDate} onChange={e => setBillPayDate(e.target.value)}
                  className="w-full bg-hicado-slate/20 border-2 border-transparent rounded-2xl px-5 py-3 text-sm font-black text-hicado-navy outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest ml-1">Ghi chú</label>
                <textarea value={billPayNote} onChange={e => setBillPayNote(e.target.value)} rows={2}
                  className="w-full bg-hicado-slate/20 border-2 border-transparent rounded-2xl px-5 py-3 text-sm font-bold text-hicado-navy outline-none resize-none" />
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setIsBillPayOpen(false)} className="flex-1 py-4 text-sm font-black text-hicado-navy/40">HỦY</button>
                <button onClick={handleManualBillPayment} disabled={isProcessing || !billPayAmount}
                  className="flex-[2] py-4 bg-hicado-navy text-hicado-emerald rounded-2xl text-sm font-black shadow-xl disabled:opacity-40">
                  XÁC NHẬN THU TIỀN
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
