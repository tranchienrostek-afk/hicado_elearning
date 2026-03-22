import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCenterStore } from '@/store';

type CenterFilter = 'ALL' | 'Hicado' | 'Van Xuan';

const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const formatMoney = (value: number) => value.toLocaleString('vi-VN');

export const Home = () => {
  const navigate = useNavigate();
  const { teachers, classes, rooms, attendance, transactions } = useCenterStore();

  const [monthFilter, setMonthFilter] = useState(getCurrentMonth());
  const [centerFilter, setCenterFilter] = useState<CenterFilter>('ALL');

  const roomMap = useMemo(
    () => new Map(rooms.map((room) => [room.id, room])),
    [rooms]
  );

  const classTeacherMap = useMemo(
    () => new Map(teachers.map((teacher) => [teacher.id, teacher.name])),
    [teachers]
  );

  const scopedClasses = useMemo(() => {
    if (centerFilter === 'ALL') return classes;
    const centerName = centerFilter === 'Hicado' ? 'Hicado' : 'Vạn Xuân';
    return classes.filter((item) => {
      const room = roomMap.get(item.roomId || '');
      return room?.center === centerName;
    });
  }, [centerFilter, classes, roomMap]);

  const scopedClassIds = useMemo(
    () => new Set(scopedClasses.map((item) => item.id)),
    [scopedClasses]
  );

  const scopedRoomIds = useMemo(
    () => new Set(scopedClasses.map((item) => item.roomId).filter(Boolean) as string[]),
    [scopedClasses]
  );

  const scopedStudentIds = useMemo(
    () => new Set(scopedClasses.flatMap((item) => item.studentIds)),
    [scopedClasses]
  );

  const scopedTeacherIds = useMemo(
    () => new Set(scopedClasses.map((item) => item.teacherId)),
    [scopedClasses]
  );

  const monthAttendance = useMemo(
    () =>
      attendance.filter(
        (item) => scopedClassIds.has(item.classId) && item.date.startsWith(monthFilter)
      ),
    [attendance, monthFilter, scopedClassIds]
  );

  const classSessionsByMonth = useMemo(() => {
    const tracker = new Map<string, Set<string>>();
    monthAttendance.forEach((record) => {
      if (!tracker.has(record.classId)) {
        tracker.set(record.classId, new Set<string>());
      }
      tracker.get(record.classId)?.add(record.date);
    });

    const sessions = new Map<string, number>();
    tracker.forEach((dateSet, classId) => {
      sessions.set(classId, dateSet.size);
    });
    return sessions;
  }, [monthAttendance]);

  const financeSummary = useMemo(() => {
    const expected = scopedClasses.reduce((sum, item) => {
      const sessions = classSessionsByMonth.get(item.id) || 0;
      const uniqueStudents = new Set(item.studentIds).size;
      return sum + sessions * item.tuitionPerSession * uniqueStudents;
    }, 0);

    const paid = transactions
      .filter((item) => item.status === 'SUCCESS' && item.date.startsWith(monthFilter))
      .filter((item) => scopedStudentIds.has(item.studentId))
      .reduce((sum, item) => sum + item.amount, 0);

    return {
      expected,
      paid,
      debt: Math.max(expected - paid, 0),
    };
  }, [classSessionsByMonth, monthFilter, scopedClasses, scopedStudentIds, transactions]);

  const attendanceSummary = useMemo(() => {
    const present = monthAttendance.filter((item) => item.status === 'PRESENT').length;
    const absent = monthAttendance.filter((item) => item.status === 'ABSENT').length;
    const leave = monthAttendance.filter((item) => item.status === 'LEAVE_REQUEST').length;
    const total = monthAttendance.length;
    const attendanceRate = total > 0 ? (present / total) * 100 : 0;
    return { present, absent, leave, total, attendanceRate };
  }, [monthAttendance]);

  const roomRiskRows = useMemo(() => {
    return scopedClasses
      .map((item) => {
        const room = roomMap.get(item.roomId || '');
        if (!room) {
          return {
            classId: item.id,
            className: item.name,
            roomName: 'Chưa xếp phòng',
            occupancy: 0,
            ratio: 0,
            teacherName: classTeacherMap.get(item.teacherId) || 'N/A',
          };
        }
        const uniqueStudents = new Set(item.studentIds).size;
        const ratio = room.capacity > 0 ? uniqueStudents / room.capacity : 0;
        return {
          classId: item.id,
          className: item.name,
          roomName: `${room.name} (${room.center})`,
          occupancy: uniqueStudents,
          ratio,
          teacherName: classTeacherMap.get(item.teacherId) || 'N/A',
        };
      })
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 5);
  }, [classTeacherMap, roomMap, scopedClasses]);

  const teacherWorkloadRows = useMemo(() => {
    const summary = new Map<
      string,
      {
        teacherName: string;
        classes: number;
        sessions: number;
        students: number;
      }
    >();

    scopedClasses.forEach((item) => {
      const key = item.teacherId;
      const base = summary.get(key) || {
        teacherName: classTeacherMap.get(key) || 'N/A',
        classes: 0,
        sessions: 0,
        students: 0,
      };
      base.classes += 1;
      base.sessions += classSessionsByMonth.get(item.id) || 0;
      base.students += new Set(item.studentIds).size;
      summary.set(key, base);
    });

    return Array.from(summary.values())
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 5);
  }, [classSessionsByMonth, classTeacherMap, scopedClasses]);

  const quickActions = [
    {
      id: 'users',
      label: 'Hồ sơ GV / HS',
      description: 'Quản lý nhân sự và học sinh',
      to: '/users',
    },
    {
      id: 'classes',
      label: 'Quản lý lớp',
      description: 'Sĩ số, lịch học, giáo viên',
      to: '/classes',
    },
    {
      id: 'rooms',
      label: 'Quản lý phòng',
      description: 'Ma trận lịch phòng trong tuần',
      to: '/rooms',
    },
    {
      id: 'attendance',
      label: 'Điểm danh',
      description: 'Theo dõi chuyên cần theo lớp',
      to: '/attendance',
    },
    {
      id: 'finance',
      label: 'Lương thưởng',
      description: 'Học phí, lương GV, lợi nhuận',
      to: '/finance',
    },
  ];

  return (
    <div className="space-y-6 md:space-y-12 pb-10">
      <div className="bg-white rounded-container border border-slate-100 shadow-premium p-6 md:p-12 space-y-6 md:space-y-10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 md:gap-8">
          <div>
            <p className="text-[12px] font-black text-accent uppercase tracking-[0.4em] mb-3 px-1 border-l-4 border-accent pl-4">
              Management Dashboard
            </p>
            <h2 className="text-3xl md:text-4xl font-black text-heading uppercase tracking-tight italic leading-none">
              Tổng quan vận hành
            </h2>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 md:gap-6">
            <div className="flex justify-center bg-slate-50 p-2 rounded-2xl border border-slate-100 shadow-inner">
              {(['ALL', 'Hicado', 'Van Xuan'] as const).map((center) => (
                <button
                  key={center}
                  onClick={() => setCenterFilter(center)}
                  className={`px-4 sm:px-6 md:px-8 py-2 md:py-3 rounded-xl text-[10px] md:text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${
                    centerFilter === center
                      ? 'bg-white text-accent shadow-soft'
                      : 'text-slate-400 hover:text-heading hover:bg-white/50'
                  }`}
                >
                  {center === 'ALL' ? 'Tất cả' : center}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-center gap-4 bg-white border border-slate-100 rounded-2xl px-6 py-3 shadow-soft">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tháng</span>
              <input
                type="month"
                value={monthFilter}
                onChange={(event) => setMonthFilter(event.target.value)}
                className="bg-transparent text-sm font-black text-heading outline-none cursor-pointer focus:text-accent transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-8">
          {[
            { label: 'Học sinh', value: scopedStudentIds.size, color: 'text-heading' },
            { label: 'Giáo viên', value: scopedTeacherIds.size, color: 'text-heading' },
            { label: 'Lớp học', value: scopedClasses.length, color: 'text-heading' },
            { label: 'Phòng học', value: scopedRoomIds.size, color: 'text-heading' },
            { label: 'Chuyên cần', value: `${attendanceSummary.attendanceRate.toFixed(0)}%`, color: 'text-accent' },
            { label: 'Nợ học phí', value: formatMoney(financeSummary.debt), color: 'text-rose-500' },
          ].map((stat, idx) => (
            <div key={idx} className="bg-white border border-slate-100 rounded-card p-5 md:p-8 shadow-soft hover:shadow-premium hover:-translate-y-2 transition-all duration-300 group">
              <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] md:tracking-[0.25em] mb-2 md:mb-4 group-hover:text-accent transition-colors">{stat.label}</p>
              <p className={`text-xl md:text-2xl font-black tracking-tighter ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-12">
        <div className="lg:col-span-2 bg-white rounded-container border border-slate-100 shadow-premium p-6 md:p-12 space-y-6 md:space-y-10">
          <div className="flex items-center justify-between border-b border-slate-50 pb-8">
            <h3 className="text-xl font-black text-heading uppercase tracking-[0.05em] italic">
               <span className="text-accent mr-3">#</span> Truy cập nhanh
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
            {quickActions.map((action) => (
              <button
                key={action.id}
                onClick={() => navigate(action.to)}
                className="group relative overflow-hidden text-left bg-slate-50/50 border border-slate-100 rounded-card p-6 md:p-10 transition-all duration-500 hover:bg-white hover:shadow-premium hover:border-accent/20"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full -mr-16 -mt-16 transition-all duration-700 group-hover:scale-[2] group-hover:bg-accent/10"></div>
                <p className="text-[11px] md:text-[12px] font-black text-heading uppercase tracking-[0.2em] mb-2 md:mb-3 relative z-10 group-hover:text-accent transition-colors">{action.label}</p>
                <p className="text-xs md:text-sm text-slate-500 font-medium relative z-10 leading-relaxed">{action.description}</p>
                <div className="mt-4 md:mt-8 flex items-center text-[9px] md:text-[10px] font-black text-accent uppercase tracking-[0.3em] opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-500 transform md:translate-x-[-10px] md:group-hover:translate-x-0 relative z-10">
                  Khám phá thêm
                  <svg className="w-3 h-3 md:w-4 md:h-4 ml-2 md:ml-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-container border border-slate-100 shadow-premium p-6 md:p-12 space-y-6 md:space-y-10 flex flex-col">
          <h3 className="text-xl font-black text-heading uppercase tracking-[0.05em] italic border-b border-slate-50 pb-8">
            Tài chính tháng
          </h3>
          <div className="space-y-6 flex-1">
            <div className="bg-slate-50/80 rounded-card p-8 border border-slate-100 border-l-[6px] border-l-emerald-600 shadow-soft transition-all hover:bg-white">
              <p className="text-[11px] font-black text-emerald-600 uppercase tracking-[0.3em] mb-3">Cần thu hệ thống</p>
              <p className="text-3xl font-black text-heading tracking-tighter">{formatMoney(financeSummary.expected)}đ</p>
            </div>
            <div className="bg-slate-50/80 rounded-card p-8 border border-slate-100 border-l-[6px] border-l-accent shadow-soft transition-all hover:bg-white">
              <p className="text-[11px] font-black text-accent uppercase tracking-[0.3em] mb-3">Thực thu (Đã nộp)</p>
              <p className="text-3xl font-black text-heading tracking-tighter">{formatMoney(financeSummary.paid)}đ</p>
            </div>
            <div className="bg-slate-50/80 rounded-card p-8 border border-slate-100 border-l-[6px] border-l-rose-500 shadow-soft transition-all hover:bg-white">
              <p className="text-[11px] font-black text-rose-500 uppercase tracking-[0.3em] mb-3">Dư nợ học phí</p>
              <p className="text-3xl font-black text-rose-500 tracking-tighter">{formatMoney(financeSummary.debt)}đ</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/finance')}
            className="w-full bg-heading text-white px-8 py-6 rounded-button text-[12px] font-black uppercase tracking-[0.3em] shadow-xl shadow-heading/20 hover:scale-[1.02] active:scale-95 transition-all mt-10"
          >
            Chi tiết tài chính
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-12">
        <div className="bg-white rounded-container border border-slate-100 shadow-premium overflow-hidden">
          <div className="p-6 md:p-12 border-b border-slate-50 bg-slate-50/30">
            <h3 className="text-lg md:text-xl font-black text-heading uppercase tracking-[0.05em] italic">
              <span className="text-accent mr-2 md:mr-3">!</span> Cảnh báo sử dụng phòng
            </h3>
            <p className="text-[10px] md:text-[11px] text-slate-400 font-black mt-2 md:mt-3 uppercase tracking-widest pl-4 md:pl-6">
              Lớp có mật độ sĩ số cao nhất hệ thống
            </p>
          </div>
          <div className="p-4 md:p-8 space-y-3 md:space-y-4">
            {roomRiskRows.map((row) => {
              const ratio = row.ratio * 100;
              const ratioLabel = ratio >= 100 ? 'Quá tải' : ratio >= 85 ? 'Cảnh báo' : 'Ổn định';
              const ratioClass =
                ratio >= 100
                  ? 'text-rose-500 bg-rose-50 border-rose-100 shadow-rose-100'
                  : ratio >= 85
                    ? 'text-amber-500 bg-amber-50 border-amber-100 shadow-amber-100'
                    : 'text-emerald-500 bg-emerald-50 border-emerald-100 shadow-emerald-100';

              return (
                <div key={row.classId} className="p-4 md:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 md:gap-8 bg-white rounded-card hover:bg-slate-50 hover:shadow-soft transition-all border border-slate-50 hover:border-accent/10 group">
                  <div className="flex flex-col gap-1 md:gap-2">
                    <p className="text-xs md:text-sm font-black text-heading uppercase tracking-widest group-hover:text-accent transition-colors">{row.className}</p>
                    <p className="text-[9px] md:text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
                      {row.roomName} <span className="mx-1 md:mx-2 text-slate-200">/</span> {row.teacherName}
                    </p>
                  </div>
                  <div className="text-left sm:text-right mt-2 sm:mt-0">
                    <p className="text-xs md:text-sm font-black text-heading mb-2 md:mb-3">{row.occupancy} học sinh</p>
                    <span className={`px-3 md:px-5 py-1.5 md:py-2 rounded-full border text-[8px] md:text-[9px] font-black uppercase tracking-widest shadow-sm inline-block ${ratioClass}`}>
                      {ratioLabel} {ratio.toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })}
            {roomRiskRows.length === 0 && (
              <div className="p-10 md:p-20 text-center text-xs md:text-sm text-slate-400 font-black italic uppercase tracking-widest">
                Chưa có dữ liệu lớp học
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-container border border-slate-100 shadow-premium overflow-hidden">
          <div className="p-6 md:p-12 border-b border-slate-50 bg-slate-50/30">
            <h3 className="text-lg md:text-xl font-black text-heading uppercase tracking-[0.05em] italic">
              <span className="text-accent mr-2 md:mr-3">#</span> Khối lượng giáo viên
            </h3>
            <p className="text-[10px] md:text-[11px] text-slate-400 font-black mt-2 md:mt-3 uppercase tracking-widest pl-4 md:pl-6">
              Phân bổ nhân sự và hiệu suất giảng dạy
            </p>
          </div>
          <div className="p-4 md:p-8 space-y-3 md:space-y-4">
            {teacherWorkloadRows.map((row) => (
              <div key={row.teacherName} className="p-4 md:p-8 flex items-center justify-between gap-4 md:gap-8 bg-white rounded-card hover:bg-slate-50 hover:shadow-soft transition-all border border-slate-50 hover:border-accent/10 group">
                <div className="flex flex-col gap-1 md:gap-2">
                  <p className="text-xs md:text-sm font-black text-heading uppercase tracking-widest group-hover:text-accent transition-colors">{row.teacherName}</p>
                  <p className="text-[9px] md:text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
                    {row.classes} lớp <span className="mx-1 md:mx-2 text-slate-200">/</span> {row.students} học sinh
                  </p>
                  <div className="md:hidden mt-2 px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-[9px] font-black uppercase tracking-[0.2em] inline-block w-fit">
                    {row.sessions} buổi dạy
                  </div>
                </div>
                <div className="hidden md:block px-6 py-4 rounded-xl bg-accent text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-accent/20 whitespace-nowrap">
                  {row.sessions} buổi dạy
                </div>
              </div>
            ))}
            {teacherWorkloadRows.length === 0 && (
              <div className="p-20 text-center text-sm text-slate-400 font-black italic uppercase tracking-widest">
                Chưa có dữ liệu giáo viên
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
