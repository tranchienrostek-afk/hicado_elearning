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

const countUniqueDates = (dates: string[]) => new Set(dates).size;

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
  const [statsLoading, setStatsLoading] = useState(false);

  // ── Payment Tracking state ────────────────────────────────────────────────
  const [trackingData, setTrackingData] = useState<{ students: TrackingStudent[]; summary: TrackingSummary } | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackClassId, setTrackClassId] = useState('');
  const [trackDateFrom, setTrackDateFrom] = useState('');
  const [trackDateTo, setTrackDateTo] = useState('');
  const [trackStatus, setTrackStatus] = useState('ALL');
  const [trackSearch, setTrackSearch] = useState('');
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);

  const [activeFinanceTab, setActiveFinanceTab] = useState<'dashboard' | 'tracking' | 'operations'>('dashboard');

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
    setStatsLoading(true);
    fetch('/api/finance/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setFinanceStats(data); })
      .finally(() => setStatsLoading(false));
    fetchTracking();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token, isTeacher]);

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

        const salaryRate = cls.teacherShare ?? teacher?.salaryRate ?? 0;

        const presentRecords = attendance.filter(
          (item) => item.classId === cls.id && item.status === 'PRESENT'
        );
        const monthPresentRecords = presentRecords.filter((item) =>
          item.date.startsWith(selectedMonth)
        );

        const allSessionCount = sumPresentSessionUnits(presentRecords);
        const monthSessionCount = sumPresentSessionUnits(monthPresentRecords);

        const statsRow = financeStats?.collectionByClass.find((item) => item.classId === cls.id);
        const expectedRevenue = statsRow?.expected ?? cls.tuitionPerSession * cls.totalSessions * classStudents.length;
        const paidRevenue = statsRow?.collected ?? 0;

        const salaryAllTime = paidRevenue * salaryRate;
        const centerProfit = paidRevenue - salaryAllTime;

        const monthBaseSalary = cls.tuitionPerSession * monthSessionCount * salaryRate;
        const expectedMonthAttendance = countUniqueDates(monthPresentRecords.map((item) => item.date)) * classStudents.length;
        const monthAttendanceRate =
          expectedMonthAttendance > 0
            ? monthPresentRecords.length / expectedMonthAttendance
            : 0;
        const bonusRate = monthAttendanceRate >= 0.95 ? 0.05 : monthAttendanceRate >= 0.85 ? 0.03 : 0;
        const monthBonus = monthBaseSalary * bonusRate;
        const monthPayout = monthBaseSalary + monthBonus;

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
    [attendance, financeStats?.collectionByClass, rooms, scopedClasses, selectedMonth, students, teachers]
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
            const trackingRate = summary.totalExpected > 0 ? (summary.totalCollected / summary.totalExpected) * 100 : 0;
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
                                    <p className="text-[10px] font-black text-hicado-navy/30 uppercase mb-2">Lịch sử giao dịch</p>
                                    <div className="space-y-2">
                                      {s.transactions.map(tx => (
                                        <div key={tx.id} className="flex gap-4 text-sm bg-white p-2 rounded-lg border">
                                          <span className="font-black text-emerald-600">{formatMoney(tx.amount)}đ</span>
                                          <span className="text-gray-400">{new Date(tx.date).toLocaleDateString()}</span>
                                          <span>{tx.content}</span>
                                        </div>
                                      ))}
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

      {/* ── TAB 3: OPERATIONS ──────────────────────────────────────────── */}
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
    </div>
  );
};
