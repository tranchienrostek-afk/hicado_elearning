import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useAuthStore, useCenterStore } from '@/store';
import { SkeletonTable } from '@/views/components/skeleton';
import { attendanceSameDay } from '@/utils/attendance-date';
import { buildBulkAttendancePlan } from '@/utils/center-operations';

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LEAVE_REQUEST';
type AttendanceSlot = 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM';
type PeriodType = 'month' | 'multiMonth' | 'dateRange';

interface SessionCol {
  date: string;
  slot: string;
}
interface SessionRecord {
  date: string;
  slot: string;
  status: string | null;
}
interface OverviewStudent {
  studentId: string;
  studentName: string;
  studentCode: string;
  sessionCount: number;
  presentCount: number;
  absentCount: number;
  amount: number;
  sessionRecords: SessionRecord[];
}
interface OverviewResponse {
  classId: string;
  className: string;
  tuitionPerSession: number;
  fromDate: string;
  toDate: string;
  totalClassSessions: number;
  sessions: SessionCol[];
  summary: { studentCount: number; totalPresent: number; totalAbsent: number; totalAmount: number };
  students: OverviewStudent[];
}

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'Đi học',
  ABSENT: 'Vắng mặt',
  LEAVE_REQUEST: 'Xin nghỉ',
};

const SLOT_LABEL: Record<AttendanceSlot, string> = {
  MORNING: 'Sáng',
  AFTERNOON: 'Chiều',
  EVENING: 'Tối',
  CUSTOM: 'Ca khác',
};

const SLOT_SHORT: Record<string, string> = {
  MORNING: 'Sáng',
  AFTERNOON: 'Chiều',
  EVENING: 'Tối',
  CUSTOM: 'Khác',
};

const formatDateTime = (value?: string) => {
  if (!value) return '--';
  return new Date(value).toLocaleString('vi-VN');
};

const formatVND = (amount: number) => amount.toLocaleString('vi-VN') + 'đ';

export const AttendancePage = () => {
  const { classes, students, teachers, addAttendance, updateAttendance, deleteAttendance, fetchAttendance, attendance, isLoading } = useCenterStore();
  const { auth } = useAuthStore();

  const isTeacher = auth?.role === 'TEACHER';
  const isObserver = auth?.role === 'ADMIN' || auth?.role === 'MANAGER';

  const accessibleClasses = useMemo(() => {
    if (isTeacher) {
      if (!auth?.teacherId) return [];
      return classes.filter((item) => item.teacherId === auth.teacherId);
    }
    if (isObserver) return classes;
    return [];
  }, [auth?.teacherId, classes, isObserver, isTeacher]);

  const [pageTab, setPageTab] = useState<'attendance' | 'overview'>('attendance');

  const [selectedClassId, setSelectedClassId] = useState(accessibleClasses[0]?.id || '');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [slot, setSlot] = useState<AttendanceSlot>('MORNING');
  const [sessionUnits, setSessionUnits] = useState<number>(1);

  // Overview tab — seed class from the active attendance class
  const [overviewClassId,  setOverviewClassId]  = useState(accessibleClasses[0]?.id || '');
  const [periodType,       setPeriodType]        = useState<PeriodType>('month');
  const [singleMonth,      setSingleMonth]       = useState(() => new Date().toISOString().slice(0, 7));
  const [fromMonth,        setFromMonth]         = useState('');
  const [toMonth,          setToMonth]           = useState('');
  const [fromDate,         setFromDate]          = useState('');
  const [toDate,           setToDate]            = useState('');
  const [overviewData,     setOverviewData]      = useState<OverviewResponse | null>(null);
  const [overviewLoading,  setOverviewLoading]   = useState(false);
  const [overviewError,    setOverviewError]     = useState('');

  useEffect(() => {
    if (!selectedClassId && accessibleClasses.length > 0) {
      setSelectedClassId(accessibleClasses[0].id);
      return;
    }
    if (selectedClassId && !accessibleClasses.some((item) => item.id === selectedClassId)) {
      setSelectedClassId(accessibleClasses[0]?.id || '');
    }
  }, [accessibleClasses, selectedClassId]);

  // Keep overview class in sync with accessible classes (initial load)
  useEffect(() => {
    if (!overviewClassId && accessibleClasses.length > 0) {
      setOverviewClassId(accessibleClasses[0].id);
    }
  }, [accessibleClasses, overviewClassId]);

  const selectedClass = accessibleClasses.find((item) => item.id === selectedClassId);

  useEffect(() => {
    if (selectedClassId) void fetchAttendance(selectedClassId, date);
  }, [date, fetchAttendance, selectedClassId]);

  const classStudentIds = useMemo(
    () => Array.from(new Set(selectedClass?.studentIds || [])),
    [selectedClass?.studentIds]
  );
  const classStudents = students.filter((item) => classStudentIds.includes(item.id));
  const selectedTeacherName = teachers.find((item) => item.id === selectedClass?.teacherId)?.name || 'N/A';

  const classRecords = useMemo(
    () => attendance.filter((item) => item.classId === selectedClassId && attendanceSameDay(item.date, date) && (item.slot || 'MORNING') === slot),
    [attendance, date, selectedClassId, slot]
  );

  const slotCards = useMemo(() => {
    const slots: AttendanceSlot[] = ['MORNING', 'AFTERNOON', 'EVENING', 'CUSTOM'];
    return slots.map((slotKey) => {
      const records = attendance.filter(
        (item) => item.classId === selectedClassId && attendanceSameDay(item.date, date) && (item.slot || 'MORNING') === slotKey
      );
      const presentCount = records.filter((item) => item.status === 'PRESENT').length;
      const units = Number(records.filter((item) => item.status === 'PRESENT').reduce((sum, item) => sum + (item.sessionUnits || 1), 0).toFixed(2));
      return { slot: slotKey, count: records.length, presentCount, units };
    });
  }, [attendance, date, selectedClassId]);

  const recordMap = useMemo(() => {
    const map = new Map<string, (typeof classRecords)[number]>();
    classRecords.forEach((item) => map.set(item.studentId, item));
    return map;
  }, [classRecords]);

  const presentCount = classRecords.filter((item) => item.status === 'PRESENT').length;
  const absentCount = classRecords.filter((item) => item.status === 'ABSENT').length;
  const leaveCount = classRecords.filter((item) => item.status === 'LEAVE_REQUEST').length;
  const completionCount = classRecords.length;

  const lastRecord = [...classRecords].sort((a, b) =>
    new Date(b.markedAt || 0).getTime() - new Date(a.markedAt || 0).getTime()
  )[0];

  const isTeacherMarked =
    classRecords.length > 0 &&
    classRecords.every((item) => !item.markedByRole || item.markedByRole === 'TEACHER');

  const handleToggle = (studentId: string, status: AttendanceStatus) => {
    if (!isTeacher || !selectedClassId) return;
    const existed = recordMap.get(studentId);
    if (existed) {
      if (existed.status === status) {
        // Bấm lại cùng trạng thái → bỏ chọn
        void deleteAttendance(existed.id, 'teacher-toggle-off');
        return;
      }
      void updateAttendance(existed.id, { status, sessionUnits, slot, reason: 'teacher-update' });
      return;
    }
    void addAttendance({
      id: `ATT-${selectedClassId}-${studentId}-${date}-${slot}`,
      classId: selectedClassId,
      studentId,
      date,
      slot,
      sessionUnits,
      status,
      markedByUserId: auth?.id,
      markedByName: auth?.name,
      markedByRole: auth?.role,
      markedAt: new Date().toISOString(),
    });
  };

  const handleBulkMark = async (status: AttendanceStatus, allowOverwrite = false) => {
    if (!isTeacher || !selectedClassId || classStudentIds.length === 0) return;
    const plan = buildBulkAttendancePlan({
      classId: selectedClassId,
      studentIds: classStudentIds,
      date,
      slot,
      status,
      sessionUnits,
      existingRecords: attendance,
      allowOverwrite,
    });

    if (plan.blocked.length > 0 && !allowOverwrite) {
      const shouldOverwrite = window.confirm(
        `${plan.blocked.length} hoc sinh da co trang thai khac trong ca nay. Ban co muon ghi de khong?`
      );
      if (shouldOverwrite) await handleBulkMark(status, true);
      return;
    }

    await Promise.all([
      ...plan.creates.map((item) =>
        addAttendance({
          id: `ATT-${selectedClassId}-${item.studentId}-${date}-${slot}`,
          classId: selectedClassId,
          studentId: item.studentId,
          date,
          slot,
          sessionUnits: item.sessionUnits,
          status: item.status,
          markedByUserId: auth?.id,
          markedByName: auth?.name,
          markedByRole: auth?.role,
          markedAt: new Date().toISOString(),
        })
      ),
      ...plan.updates.map((item) =>
        updateAttendance(item.id, {
          status: item.status,
          sessionUnits: item.sessionUnits,
          slot,
          markedByUserId: auth?.id,
          markedByName: auth?.name,
          markedByRole: auth?.role,
          markedAt: new Date().toISOString(),
          reason: allowOverwrite ? 'teacher-bulk-overwrite' : 'teacher-bulk-update',
        })
      ),
    ]);
  };

  const handleClearSlot = async () => {
    if (!isTeacher || classRecords.length === 0) return;
    const shouldDelete = window.confirm(`Xoa ${classRecords.length} ban ghi diem danh trong ca ${SLOT_LABEL[slot]} ngay ${date}?`);
    if (!shouldDelete) return;
    await Promise.all(classRecords.map((record) => deleteAttendance(record.id, 'teacher-clear-slot')));
  };

  const resolveDateRange = (): { from: string; to: string } | null => {
    if (periodType === 'month' && singleMonth) {
      const [y, m] = singleMonth.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      return { from: `${singleMonth}-01`, to: `${singleMonth}-${String(lastDay).padStart(2, '0')}` };
    }
    if (periodType === 'multiMonth' && fromMonth && toMonth) {
      const [y2, m2] = toMonth.split('-').map(Number);
      const lastDay = new Date(y2, m2, 0).getDate();
      return { from: `${fromMonth}-01`, to: `${toMonth}-${String(lastDay).padStart(2, '0')}` };
    }
    if (periodType === 'dateRange' && fromDate && toDate) {
      return { from: fromDate, to: toDate };
    }
    return null;
  };

  const fetchOverview = async () => {
    const range = resolveDateRange();
    if (!overviewClassId || !range) return;
    setOverviewLoading(true);
    setOverviewError('');
    setOverviewData(null);
    try {
      const r = await fetch(
        `/api/attendance/overview?classId=${encodeURIComponent(overviewClassId)}&fromDate=${range.from}&toDate=${range.to}`,
        { headers: { Authorization: `Bearer ${auth?.token}` } }
      );
      const json = await r.json();
      if (!r.ok) throw new Error(json.message || 'Lỗi tải dữ liệu');
      setOverviewData(json as OverviewResponse);
    } catch (e: unknown) {
      setOverviewError(e instanceof Error ? e.message : 'Lỗi tải dữ liệu');
    } finally {
      setOverviewLoading(false);
    }
  };

  if (isLoading) {
    return <div className="space-y-10"><SkeletonTable rows={10} /></div>;
  }

  return (
    <div className="space-y-8 pb-24 md:pb-8 animate-in fade-in duration-700">
      <div className="relative rounded-[2.5rem] overflow-hidden border border-hicado-slate shadow-premium">
        <div className="premium-gradient p-8 md:p-10">
          <div className="absolute top-0 right-0 w-48 h-48 bg-hicado-emerald/10 rounded-full -mr-24 -mt-24 blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-2">Attendance</p>
              <h2 className="text-2xl font-serif font-black text-white tracking-tight">Điểm danh lớp học</h2>
              <p className="text-sm text-white/40 font-bold mt-1">
                {isTeacher ? 'Cập nhật điểm danh theo từng ca và hệ số ca.' : 'Giám sát lịch sử điểm danh và chỉnh sửa.'}
              </p>
            </div>

            {pageTab === 'attendance' && (
              <div className="flex flex-wrap gap-3">
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  disabled={accessibleClasses.length === 0}
                  className="bg-white/10 border border-white/20 text-white rounded-2xl px-5 py-3 outline-none focus:border-hicado-emerald/50 transition-all font-bold text-sm"
                >
                  {accessibleClasses.map((item) => (
                    <option key={item.id} value={item.id} className="text-hicado-navy bg-white">
                      {item.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-white/10 border border-white/20 text-white rounded-2xl px-5 py-3 outline-none focus:border-hicado-emerald/50 transition-all font-bold text-sm"
                />
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={sessionUnits}
                  onChange={(e) => setSessionUnits(Math.max(0.1, Number(e.target.value || 1)))}
                  className="w-28 bg-white/10 border border-white/20 text-white rounded-2xl px-4 py-3 outline-none focus:border-hicado-emerald/50 transition-all font-bold text-sm"
                  title="Số ca có thể là số lẻ (ví dụ 1.5)"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2">
        {(['attendance', 'overview'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setPageTab(tab)}
            className={clsx(
              'px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all border',
              pageTab === tab
                ? 'bg-hicado-navy text-white border-hicado-navy shadow-lg'
                : 'bg-white text-hicado-navy/50 border-slate-200 hover:border-hicado-navy/30'
            )}
          >
            {tab === 'attendance' ? 'Điểm danh' : 'Tổng quan'}
          </button>
        ))}
      </div>

      {/* ─── OVERVIEW TAB ─── */}
      {pageTab === 'overview' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
            <p className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">Bộ lọc tổng quan</p>

            <div className="flex flex-wrap gap-4 items-end">
              {/* Class selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Lớp học</label>
                <select
                  value={overviewClassId}
                  onChange={(e) => { setOverviewClassId(e.target.value); setOverviewData(null); }}
                  className="border border-slate-300 bg-white rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-hicado-navy transition-all"
                >
                  <option value="">-- Chọn lớp --</option>
                  {accessibleClasses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Period type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Kiểu thời gian</label>
                <div className="flex gap-2">
                  {([
                    { key: 'month', label: 'Tháng' },
                    { key: 'multiMonth', label: 'Nhiều tháng' },
                    { key: 'dateRange', label: 'Khoảng ngày' },
                  ] as { key: PeriodType; label: string }[]).map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPeriodType(key)}
                      className={clsx(
                        'px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all',
                        periodType === key
                          ? 'bg-hicado-navy text-white border-hicado-navy'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {periodType === 'month' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tháng/Năm</label>
                  <input
                    type="month"
                    value={singleMonth}
                    onChange={(e) => setSingleMonth(e.target.value)}
                    className="border border-slate-300 bg-white rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-hicado-navy transition-all"
                  />
                </div>
              )}

              {periodType === 'multiMonth' && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Từ tháng</label>
                    <input
                      type="month"
                      value={fromMonth}
                      onChange={(e) => setFromMonth(e.target.value)}
                      className="border border-slate-300 bg-white rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-hicado-navy transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Đến tháng</label>
                    <input
                      type="month"
                      value={toMonth}
                      onChange={(e) => setToMonth(e.target.value)}
                      className="border border-slate-300 bg-white rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-hicado-navy transition-all"
                    />
                  </div>
                </>
              )}

              {periodType === 'dateRange' && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Từ ngày</label>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="border border-slate-300 bg-white rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-hicado-navy transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Đến ngày</label>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="border border-slate-300 bg-white rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-hicado-navy transition-all"
                    />
                  </div>
                </>
              )}

              <button
                onClick={() => void fetchOverview()}
                disabled={!overviewClassId || overviewLoading}
                className="px-5 py-2.5 bg-hicado-navy text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-hicado-navy/90 transition-all disabled:opacity-40 self-end"
              >
                {overviewLoading ? 'Đang tải...' : 'Xem tổng quan'}
              </button>
            </div>
          </div>

          {overviewError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl px-6 py-4 text-sm font-bold">
              {overviewError}
            </div>
          )}

          {overviewLoading && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm animate-pulse">
              <div className="h-12 bg-slate-100 border-b border-slate-200" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 border-b border-slate-100 flex items-center px-6 gap-4">
                  <div className="h-3 w-32 bg-slate-200 rounded-full" />
                  <div className="h-3 w-12 bg-slate-100 rounded-full ml-auto" />
                  <div className="h-3 w-12 bg-slate-100 rounded-full" />
                  <div className="h-3 w-12 bg-slate-100 rounded-full" />
                  <div className="h-3 w-20 bg-slate-100 rounded-full" />
                </div>
              ))}
            </div>
          )}

          {overviewData && !overviewLoading && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-slate-800">{overviewData.className}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                    {overviewData.totalClassSessions} buổi đã diễn ra · {overviewData.fromDate} → {overviewData.toDate}
                  </p>
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {overviewData.summary.studentCount} học sinh
                </p>
              </div>

              {overviewData.students.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-sm font-bold text-slate-400 italic">
                    Chưa có buổi học đã diễn ra trong khoảng thời gian này.
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto relative scrollbar-thin scrollbar-thumb-slate-200">
                    <table className="w-full text-sm border-separate border-spacing-0">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="sticky left-0 bg-slate-50 z-20 text-left px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-r border-slate-200 min-w-[180px]">
                            Học sinh
                          </th>
                          {overviewData.sessions.map((sess, idx) => {
                            const d = new Date(sess.date);
                            return (
                              <th key={idx} className="text-center px-2 py-3 border-b border-r border-slate-200 min-w-[64px]">
                                <p className="text-[10px] font-black text-slate-700">{d.getDate()}/{d.getMonth() + 1}</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{SLOT_SHORT[sess.slot] || sess.slot}</p>
                              </th>
                            );
                          })}
                          <th className="text-center px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-r border-slate-200 min-w-[80px]">Có mặt</th>
                          <th className="text-center px-4 py-3 border-b border-r border-slate-200 min-w-[80px]">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Vắng</p>
                            <p className="text-[9px] font-bold text-slate-400 normal-case tracking-normal">ghi nhận</p>
                          </th>
                          <th className="text-right px-6 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 min-w-[120px]">Số tiền</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {overviewData.students.map((s) => (
                          <tr key={s.studentId} className="hover:bg-slate-50 transition-colors group">
                            <td className="sticky left-0 bg-white group-hover:bg-slate-50 z-10 px-6 py-4 border-r border-slate-100 transition-colors">
                              <p className="font-bold text-slate-800 truncate max-w-[150px]">{s.studentName}</p>
                              {s.studentCode && <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{s.studentCode}</p>}
                            </td>
                            {s.sessionRecords.map((rec, idx) => (
                              <td key={idx} className="text-center px-2 py-4 border-r border-slate-50">
                                {rec.status === 'PRESENT' ? (
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-hicado-emerald/10 text-hicado-emerald font-black text-xs">✓</span>
                                ) : rec.status === 'ABSENT' || rec.status === 'LEAVE_REQUEST' ? (
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-rose-50 text-rose-500 font-black text-xs">✗</span>
                                ) : (
                                  <span className="text-slate-300 font-bold">—</span>
                                )}
                              </td>
                            ))}
                            <td className="text-center px-4 py-4 font-bold text-hicado-emerald border-r border-slate-50">{s.presentCount}</td>
                            <td className="text-center px-4 py-4 font-bold text-rose-500 border-r border-slate-50">{s.absentCount}</td>
                            <td className="text-right px-6 py-4 font-black text-hicado-emerald">{formatVND(s.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 font-black">
                          <td className="sticky left-0 bg-slate-50 z-10 px-6 py-5 text-[11px] text-slate-700 uppercase tracking-widest border-t-2 border-r border-slate-200">
                            Tổng ({overviewData.summary.studentCount} hs)
                          </td>
                          {overviewData.sessions.map((_, idx) => (
                            <td key={idx} className="border-t-2 border-r border-slate-200" />
                          ))}
                          <td className="text-center px-4 py-5 text-hicado-emerald border-t-2 border-r border-slate-200">{overviewData.summary.totalPresent}</td>
                          <td className="text-center px-4 py-5 text-rose-500 border-t-2 border-r border-slate-200">{overviewData.summary.totalAbsent}</td>
                          <td className="text-right px-6 py-5 text-hicado-emerald border-t-2 border-slate-200">{formatVND(overviewData.summary.totalAmount)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {overviewData.sessions.length > 15 && (
                    <div className="px-6 py-3 bg-slate-50/50 border-t border-slate-100 flex items-center justify-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-slate-300" />
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cuộn ngang để xem thêm tất cả các buổi học</p>
                      <div className="w-1 h-1 rounded-full bg-slate-300" />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── ATTENDANCE TAB ─── */}
      {pageTab === 'attendance' && selectedClass && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {slotCards.map((card) => (
            <button
              key={card.slot}
              onClick={() => setSlot(card.slot)}
              className={clsx(
                'glass-card rounded-2xl p-4 border text-left transition-all',
                slot === card.slot ? 'border-hicado-emerald bg-hicado-emerald/10' : 'border-hicado-slate'
              )}
            >
              <p className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">{SLOT_LABEL[card.slot]}</p>
              <p className="text-sm font-black text-hicado-navy mt-1">{card.count} học sinh</p>
              <p className="text-[10px] text-hicado-emerald font-black mt-1">{card.presentCount} có mặt · {card.units} ca</p>
            </button>
          ))}
        </div>
      )}

      {pageTab === 'attendance' && selectedClass && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-4">
          {[
            { label: 'Giáo viên', value: selectedTeacherName, color: 'text-hicado-navy' },
            { label: 'Tiến độ', value: `${completionCount}/${classStudents.length}`, color: 'text-hicado-navy' },
            { label: 'Có mặt', value: presentCount, color: 'text-hicado-emerald' },
            { label: 'Vắng / Xin nghỉ', value: `${absentCount} / ${leaveCount}`, color: 'text-rose-500' },
            {
              label: 'Cập nhật cuối',
              value: lastRecord?.markedByName || 'Chưa có',
              sub: formatDateTime(lastRecord?.markedAt),
              color: 'text-hicado-navy',
            },
          ].map((stat) => (
            <div key={stat.label} className="glass-card rounded-[1.5rem] p-4 border border-hicado-slate">
              <p className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest mb-1">{stat.label}</p>
              <p className={`text-sm font-black ${stat.color} uppercase tracking-tight truncate`}>{stat.value}</p>
              {stat.sub && <p className="text-[10px] text-hicado-navy/30 font-bold mt-0.5">{stat.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {pageTab === 'attendance' && isObserver && classRecords.length > 0 && (
        <div className="glass-card rounded-2xl px-6 py-4 border border-hicado-emerald/20 bg-hicado-emerald/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-xs font-bold text-hicado-navy">
            Trạng thái giám sát:{' '}
            <span className="text-hicado-emerald">{isTeacherMarked ? 'Điểm danh do giáo viên cập nhật' : 'Cần kiểm tra người cập nhật'}</span>
          </p>
          <p className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">
            Lớp {selectedClass?.name} · {date} · {SLOT_LABEL[slot]}
          </p>
        </div>
      )}

      {pageTab === 'attendance' && (
        <div className="glass-card rounded-[2.5rem] overflow-hidden border border-hicado-slate">
          <div className="px-8 py-6 border-b border-hicado-slate flex flex-col md:flex-row md:justify-between md:items-center gap-4">
            <div>
              <p className="text-[10px] font-black text-hicado-navy/30 uppercase tracking-widest">
                Học viên ({classStudents.length})
              </p>
              <p className="text-[10px] font-bold text-hicado-navy/30 mt-1">
                {isTeacher ? 'Điểm danh theo ca' : 'Trạng thái & nhật ký'}
              </p>
            </div>
            {isTeacher && (
              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  onClick={() => void handleBulkMark('PRESENT')}
                  disabled={classStudents.length === 0}
                  className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-hicado-emerald text-hicado-navy hover:scale-105 transition-all disabled:opacity-40"
                >
                  Tất cả đi học
                </button>
                <button
                  onClick={() => void handleBulkMark('ABSENT')}
                  disabled={classStudents.length === 0}
                  className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-rose-500 text-white hover:scale-105 transition-all disabled:opacity-40"
                >
                  Tất cả vắng
                </button>
                <button
                  onClick={() => void handleClearSlot()}
                  disabled={classRecords.length === 0}
                  className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white border border-rose-200 text-rose-500 hover:bg-rose-50 transition-all disabled:opacity-40"
                >
                  Xóa ca này
                </button>
              </div>
            )}
          </div>

          <div className="divide-y divide-hicado-slate/50">
            {classStudents.map((student) => {
              const record = recordMap.get(student.id);
              const currentStatus = record?.status;

              return (
                <div
                  key={student.id}
                  className="px-8 py-5 flex flex-col md:flex-row md:justify-between md:items-center gap-4 hover:bg-hicado-slate/20 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={clsx(
                      'w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm flex-shrink-0 transition-all',
                      currentStatus === 'PRESENT' && 'bg-hicado-emerald text-hicado-navy shadow-lg shadow-hicado-emerald/20',
                      currentStatus === 'ABSENT' && 'bg-rose-500 text-white shadow-lg shadow-rose-500/20',
                      currentStatus === 'LEAVE_REQUEST' && 'bg-amber-400 text-white shadow-lg shadow-amber-400/20',
                      !currentStatus && 'bg-hicado-slate text-hicado-navy/40',
                    )}>
                      {student.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-hicado-navy">{student.name}</h3>
                      <p className="text-[10px] text-hicado-navy/30 font-bold uppercase tracking-widest">ID: {student.id}</p>
                      {record?.sessionUnits ? (
                        <p className="text-[10px] text-hicado-emerald font-black uppercase tracking-widest">{record.sessionUnits} ca</p>
                      ) : null}
                    </div>
                  </div>

                  {isTeacher ? (
                    <div className="grid grid-cols-4 gap-2 w-full md:w-auto">
                      {([
                        { status: 'PRESENT' as AttendanceStatus, label: 'Đi học', active: 'bg-hicado-emerald border-hicado-emerald text-hicado-navy shadow-lg shadow-hicado-emerald/20' },
                        { status: 'ABSENT' as AttendanceStatus, label: 'Vắng', active: 'bg-rose-500 border-rose-500 text-white shadow-lg shadow-rose-500/20' },
                        { status: 'LEAVE_REQUEST' as AttendanceStatus, label: 'Xin nghỉ', active: 'bg-amber-400 border-amber-400 text-white shadow-lg shadow-amber-400/20' },
                      ]).map(({ status, label, active }) => (
                        <button
                          key={status}
                          onClick={() => handleToggle(student.id, status)}
                          className={clsx(
                            'px-3 py-2.5 rounded-xl text-[10px] font-black transition-all border outline-none whitespace-nowrap',
                            currentStatus === status
                              ? active
                              : 'bg-white border-hicado-slate text-hicado-navy/40 hover:border-hicado-navy/30 hover:text-hicado-navy'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                      <button
                        onClick={() => { if (record) void deleteAttendance(record.id, 'teacher-delete-wrong'); }}
                        className="px-3 py-2.5 rounded-xl text-[10px] font-black transition-all border outline-none whitespace-nowrap bg-white border-rose-200 text-rose-500 hover:bg-rose-50"
                      >
                        Xóa
                      </button>
                    </div>
                  ) : (
                    <div className="text-right">
                      <span className={clsx(
                        'px-3 py-1.5 text-[10px] font-black rounded-xl border uppercase tracking-widest',
                        currentStatus === 'PRESENT' && 'bg-hicado-emerald/10 text-hicado-emerald border-hicado-emerald/20',
                        currentStatus === 'ABSENT' && 'bg-rose-50 text-rose-600 border-rose-100',
                        currentStatus === 'LEAVE_REQUEST' && 'bg-amber-50 text-amber-600 border-amber-100',
                        !currentStatus && 'bg-hicado-slate text-hicado-navy/30 border-hicado-slate',
                      )}>
                        {currentStatus ? STATUS_LABEL[currentStatus] : 'Chưa điểm danh'}
                      </span>
                      <p className="mt-1.5 text-[10px] text-hicado-navy/40 font-black uppercase tracking-widest">
                        {record?.markedByName || 'Chưa cập nhật'}
                      </p>
                      <p className="text-[10px] text-hicado-navy/30 font-bold">{formatDateTime(record?.markedAt)}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {classStudents.length === 0 && (
            <div className="py-16 text-center space-y-3">
              <p className="text-sm font-black text-hicado-navy/30 uppercase tracking-widest italic">
                Không có dữ liệu học viên cho lớp này.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
