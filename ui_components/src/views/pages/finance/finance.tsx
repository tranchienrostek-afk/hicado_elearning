import { useMemo, useState } from 'react';
import { useAuthStore, useCenterStore } from '@/store';
import { toast } from 'react-hot-toast';

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
  const { teachers, students, classes, rooms, attendance, updateTuitionStatus } = useCenterStore();
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
        const classStudents = students.filter((item) => cls.studentIds.includes(item.id));
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
          roomName: room ? `${room.name} (${room.center})` : 'Chua xep phong',
          scheduleLabel: `${cls.schedule?.days?.join(', ') || 'Chua xep lich'} | ${
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

  if (isTeacher) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
              Lương thưởng giáo viên
            </h2>
            <p className="text-sm text-slate-400 font-medium">
              Tổng hợp theo các lớp bạn đang dạy và số buổi điểm danh trong tháng.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-sm">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tháng</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="bg-transparent text-sm font-bold text-slate-700 outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm border-t-4 border-t-management-blue">
            <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
              Lớp đang dạy
            </p>
            <p className="text-2xl md:text-3xl font-black text-slate-900">{financeData.length}</p>
          </div>
          <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm border-t-4 border-t-indigo-500">
            <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 truncate">
              Buổi đã dạy
            </p>
            <p className="text-2xl md:text-3xl font-black text-slate-900">{teacherMonthSessions}</p>
          </div>
          <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm border-t-4 border-t-management-blue">
            <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 truncate">
              Lương tạm tính
            </p>
            <p className="text-xl md:text-3xl font-black text-slate-900 truncate" title={formatMoney(teacherBaseTotal)}>{formatMoney(teacherBaseTotal)}</p>
          </div>
          <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm border-t-4 border-t-emerald-500">
            <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 truncate">
              Thưởng CC
            </p>
            <p className="text-xl md:text-3xl font-black text-emerald-600 truncate" title={formatMoney(teacherBonusTotal)}>{formatMoney(teacherBonusTotal)}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                Bảng lương theo lớp
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                Tổng thu nhập dự kiến tháng này:{' '}
                <span className="font-black text-slate-900">{formatMoney(teacherPayoutTotal)}đ</span>
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    Lớp / Phòng
                  </th>
                  <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    Sĩ số
                  </th>
                  <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    Buổi dạy
                  </th>
                  <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    Tỷ lệ
                  </th>
                  <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    Lương
                  </th>
                  <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    Thưởng
                  </th>
                  <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    Tổng
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm font-medium">
                {financeData.map((row) => (
                  <tr key={row.classId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-5">
                      <p className="font-bold text-slate-900 uppercase tracking-tight">{row.className}</p>
                      <p className="text-[11px] text-slate-500 font-bold">{row.roomName}</p>
                      <p className="text-[10px] text-slate-400">{row.scheduleLabel}</p>
                    </td>
                    <td className="px-6 py-5 font-bold text-slate-700">{row.studentCount} học sinh</td>
                    <td className="px-6 py-5">
                      <p className="font-bold text-slate-900">
                        {row.monthSessionCount} / {row.totalSessions}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        Chuyên cần: {(row.monthAttendanceRate * 100).toFixed(0)}%
                      </p>
                    </td>
                    <td className="px-6 py-5 font-bold text-slate-900">
                      {Math.round(row.salaryRate * 100)}%
                    </td>
                    <td className="px-6 py-5 font-black text-management-blue">
                      {formatMoney(row.monthBaseSalary)}
                    </td>
                    <td className="px-6 py-5 font-black text-emerald-600">
                      {formatMoney(row.monthBonus)}
                    </td>
                    <td className="px-6 py-5 font-black text-slate-900">
                      {formatMoney(row.monthPayout)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {financeData.length === 0 && (
            <div className="text-center py-12 text-slate-400 italic">
              Bạn chưa được gán lớp nào để tính lương.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-white p-5 md:p-8 rounded-2xl border border-slate-200 shadow-sm border-t-4 border-t-emerald-500">
          <p className="text-[10px] md:text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">
            Tổng học phí đã thu
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl md:text-4xl font-black text-slate-900">
              {(totalPaidAll / 1000000).toFixed(1)}
            </span>
            <span className="text-lg md:text-xl font-bold text-slate-400 italic font-mono">Triệu</span>
          </div>
        </div>
        <div className="bg-white p-5 md:p-8 rounded-2xl border border-slate-200 shadow-sm border-t-4 border-t-management-blue">
          <p className="text-[10px] md:text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">
            Dự kiến chi lương
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl md:text-4xl font-black text-slate-900">
              {(totalSalaryAll / 1000000).toFixed(1)}
            </span>
            <span className="text-lg md:text-xl font-bold text-slate-400 italic font-mono">Triệu</span>
          </div>
        </div>
        <div className="bg-white p-5 md:p-8 rounded-2xl border border-slate-200 shadow-sm border-t-4 border-t-slate-800">
          <p className="text-[10px] md:text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">
            Lợi nhuận gộp
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl md:text-4xl font-black text-slate-900">
              {(totalProfitAll / 1000000).toFixed(1)}
            </span>
            <span className="text-lg md:text-xl font-bold text-slate-400 italic font-mono">Triệu</span>
          </div>
          <p className="text-[10px] md:text-[11px] mt-1 md:mt-2 text-slate-400 font-bold">
            Tổng cần thu: {(totalExpectedAll / 1000000).toFixed(1)} Triệu
          </p>
        </div>
      </div>

      <div className="bg-slate-900 p-8 rounded-2xl text-white flex flex-col md:flex-row gap-8 items-center border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"></path>
          </svg>
        </div>
        <div className="flex-1 space-y-2 relative z-10">
          <h4 className="text-emerald-400 text-xs font-black uppercase tracking-[0.2em]">
            Bank Webhook Simulator
          </h4>
          <h3 className="text-xl font-bold">Mô phỏng gạch nợ tự động</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Nhập mã HS hoặc tên để giả lập webhook ngân hàng cập nhật học phí đã nộp.
          </p>
        </div>
        <div className="flex gap-3 w-full md:w-auto relative z-10">
          <input
            type="text"
            placeholder="Mã HS hoặc tên (VD: S1)"
            value={targetStudentId}
            onChange={(event) => setTargetStudentId(event.target.value)}
            className="bg-slate-800 border border-slate-700 px-6 py-4 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 w-full md:w-[300px] font-mono"
          />
          <button
            disabled={isProcessing}
            onClick={handleSimulateWebhook}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 active:scale-95 whitespace-nowrap"
          >
            {isProcessing ? 'Đang xử lý...' : 'BẮN WEBHOOK'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="text-lg font-bold text-slate-900 uppercase tracking-tight">
            Báo cáo tài chính chi tiết
          </h3>
          <button className="bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-slate-700 transition-all">
            Xuất Excel
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                  Mã lớp / Giáo viên
                </th>
                <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                  Cần thu / Đã nộp
                </th>
                <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                  Tỷ lệ %
                </th>
                <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                  Lương GV
                </th>
                <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                  Lợi nhuận TT
                </th>
                <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                  HP TB/Buổi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm font-medium">
              {financeData.map((row) => {
                const paidPercent =
                  row.expectedRevenue > 0 ? (row.paidRevenue / row.expectedRevenue) * 100 : 0;
                const safePaidPercent = Math.max(0, Math.min(100, paidPercent));
                const avgPerSession = row.totalSessions > 0 ? row.paidRevenue / row.totalSessions : 0;

                return (
                  <tr key={row.classId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-5">
                      <p className="font-bold text-slate-900 uppercase tracking-tight">{row.className}</p>
                      <p className="text-[11px] text-slate-400 font-bold">{row.teacherName}</p>
                    </td>
                    <td className="px-6 py-5">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-black uppercase">
                          <span className="text-slate-400">Đã nộp</span>
                          <span className="text-emerald-600">{safePaidPercent.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 w-32 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${safePaidPercent}%` }}
                          ></div>
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono italic">
                          {row.paidRevenue.toLocaleString()} / {row.expectedRevenue.toLocaleString()}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-5 font-bold text-slate-900">
                      {Math.round(row.salaryRate * 100)}%
                    </td>
                    <td className="px-6 py-5 font-black text-management-blue">
                      {row.salaryAllTime.toLocaleString()}
                    </td>
                    <td className="px-6 py-5 font-black text-emerald-600">
                      {row.centerProfit.toLocaleString()}
                    </td>
                    <td className="px-6 py-5 text-slate-400 font-mono">
                      {avgPerSession.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
