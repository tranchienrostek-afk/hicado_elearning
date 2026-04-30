import { useState, useMemo } from 'react';
import { useAuthStore, useCenterStore } from '@/store';
import { toast } from 'react-hot-toast';
import { SkeletonTable, SkeletonCard } from '@/views/components/skeleton';
import clsx from 'clsx';

interface FinanceRow {
  classId: string;
  className: string;
  teacherName: string;
  roomName: string;
  scheduleLabel: string;
  studentCount: number;
  salaryRate: number;
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

export const FinancialPage = () => {
  const { teachers, students, classes, rooms, attendance, updateTuitionStatus, isLoading } = useCenterStore();

  const { role, auth } = useAuthStore();
  const teacherId = auth?.teacherId;
  const isTeacher = role === 'TEACHER';

  const [targetStudentId, setTargetStudentId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());

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

        const allSessionCount = countUniqueDates(presentRecords.map((item) => item.date));
        const monthSessionCount = countUniqueDates(monthPresentRecords.map((item) => item.date));

        const expectedRevenue = cls.tuitionPerSession * cls.totalSessions * classStudents.length;
        const paidRevenue =
          classStudents.filter((item) => item.tuitionStatus === 'PAID').length *
          cls.tuitionPerSession *
          cls.totalSessions;

        const salaryAllTime =
          cls.tuitionPerSession * classStudents.length * allSessionCount * salaryRate;
        const centerProfit = paidRevenue - salaryAllTime;

        const monthBaseSalary =
          cls.tuitionPerSession * classStudents.length * monthSessionCount * salaryRate;
        const expectedMonthAttendance = monthSessionCount * classStudents.length;
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
    [attendance, rooms, scopedClasses, selectedMonth, students, teachers]
  );

  const totalExpectedAll = financeData.reduce((acc, row) => acc + row.expectedRevenue, 0);
  const totalPaidAll = financeData.reduce((acc, row) => acc + row.paidRevenue, 0);
  const totalSalaryAll = financeData.reduce((acc, row) => acc + row.salaryAllTime, 0);
  const totalProfitAll = totalPaidAll - totalSalaryAll;

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

      {/* Revenue Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
        <div className="relative rounded-[2.5rem] overflow-hidden shadow-xl border border-hicado-slate">
          <div className="premium-gradient p-8">
            <div className="absolute top-0 right-0 w-32 h-32 bg-hicado-emerald/15 rounded-full -mr-16 -mt-16 blur-2xl" />
            <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-3 relative z-10">Đã thu</p>
            <div className="flex items-baseline gap-2 relative z-10">
              <span className="text-4xl md:text-5xl font-black text-white">{(totalPaidAll / 1_000_000).toFixed(1)}</span>
              <span className="text-lg font-bold text-white/40 font-mono">Triệu đ</span>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-[2.5rem] p-8 border border-hicado-slate">
          <p className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-[0.4em] mb-3">Chi lương GV</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl md:text-5xl font-black text-hicado-navy">{(totalSalaryAll / 1_000_000).toFixed(1)}</span>
            <span className="text-lg font-bold text-hicado-navy/30 font-mono">Triệu đ</span>
          </div>
        </div>

        <div className="glass-card rounded-[2.5rem] p-8 border border-hicado-slate">
          <p className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-[0.4em] mb-3">Lợi nhuận gộp</p>
          <div className="flex items-baseline gap-2">
            <span className={`text-4xl md:text-5xl font-black ${totalProfitAll >= 0 ? 'text-hicado-emerald text-glow' : 'text-rose-500'}`}>
              {(totalProfitAll / 1_000_000).toFixed(1)}
            </span>
            <span className="text-lg font-bold text-hicado-navy/30 font-mono">Triệu đ</span>
          </div>
          <p className="text-[10px] text-hicado-navy/30 font-bold mt-3">
            Tổng cần thu: {(totalExpectedAll / 1_000_000).toFixed(1)}M đ
          </p>
        </div>
      </div>

      {/* Webhook Simulator */}
      <div className="relative group overflow-hidden rounded-[3rem] border border-white/5 shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-r from-hicado-emerald/20 via-hicado-navy to-indigo-900/50"></div>
        <div className="relative bg-[#020617]/95 p-8 md:p-12 flex flex-col lg:flex-row gap-10 items-center rounded-[3rem]">
          <div className="absolute top-0 right-0 w-64 h-64 bg-hicado-emerald/10 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none" />

          <div className="flex-1 space-y-4 relative z-10">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-hicado-emerald animate-pulse shadow-[0_0_10px_#10b981]"></span>
              <p className="text-hicado-emerald text-[10px] font-black uppercase tracking-[0.4em]">Bank Core Node v4.0</p>
            </div>
            <h3 className="text-3xl font-serif font-black text-white tracking-tight">Simulator Gạch Nợ Tự Động</h3>
            <p className="text-white/40 text-sm font-medium leading-relaxed max-w-xl">
              Giả lập tín hiệu từ cổng thanh toán Napas/VietQR. Hệ thống tự động đối soát mã học sinh và cập nhật trạng thái "Đã thanh toán" tức thì.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto relative z-10">
            <div className="relative">
              <input
                type="text"
                placeholder="Nhập ID (VD: S1) hoặc Tên học sinh"
                value={targetStudentId}
                onChange={(event) => setTargetStudentId(event.target.value)}
                className="bg-white/5 border border-white/10 px-8 py-5 rounded-2xl text-sm font-bold text-white placeholder:text-white/20 outline-none focus:bg-white/10 focus:border-hicado-emerald/50 focus:ring-4 focus:ring-hicado-emerald/5 transition-all w-full lg:w-[360px] font-mono"
              />
              <div className="absolute right-5 top-1/2 -translate-y-1/2 text-white/20">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
            <button
              disabled={isProcessing}
              onClick={handleSimulateWebhook}
              className={clsx(
                'px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-[0.3em] transition-all',
                isProcessing
                  ? 'bg-white/5 text-white/20 cursor-not-allowed'
                  : 'bg-hicado-emerald text-hicado-navy hover:bg-white hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_30px_rgba(16,185,129,0.25)]'
              )}
            >
              {isProcessing ? 'Đang xử lý...' : 'Bắn Webhook'}
            </button>
          </div>
        </div>
      </div>

      {/* Detail Table */}
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
                {['Lớp / Giáo viên', 'Cần thu / Đã nộp', 'Tỷ lệ %', 'Lương GV', 'Lợi nhuận TT', 'HP TB/Buổi'].map((h) => (
                  <th key={h} className="px-6 py-4 text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hicado-slate/50">
              {financeData.map((row) => {
                const paidPercent = row.expectedRevenue > 0 ? (row.paidRevenue / row.expectedRevenue) * 100 : 0;
                const safePaidPercent = Math.max(0, Math.min(100, paidPercent));
                const avgPerSession = row.totalSessions > 0 ? row.paidRevenue / row.totalSessions : 0;

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
                          <span className="text-hicado-emerald">{safePaidPercent.toFixed(0)}%</span>
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
                      {Math.round(row.salaryRate * 100)}%
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
                      {avgPerSession.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {financeData.length === 0 && (
          <div className="py-16 text-center space-y-3">
            <div className="text-4xl opacity-20">💰</div>
            <p className="text-sm font-black text-hicado-navy/30 uppercase tracking-widest italic">
              Chưa có dữ liệu tài chính.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
